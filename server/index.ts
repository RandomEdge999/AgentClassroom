import fs from 'node:fs/promises';
import path from 'node:path';

import cors from 'cors';
import express from 'express';

import { CLIENT_DIST_DIR, SERVER_PORT, STORAGE_DIR } from './config.js';
import { JobStore } from './jobs/jobStore.js';
import { runJob } from './pipeline/runJob.js';
import type { ExtractionOptions, JobRecord } from './types.js';
import { buildFileTree, fileExists, readJson, safeJoin } from './utils/fs.js';

const app = express();
const store = new JobStore();

await store.init();

// Rate limiting map (simple in-memory implementation)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30; // 30 requests per minute

function rateLimit(req: express.Request, res: express.Response, next: express.NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return next();
  }

  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({ 
      error: 'Too many requests. Please wait before trying again.',
      retryAfter: Math.ceil((record.resetTime - now) / 1000)
    });
  }

  record.count++;
  next();
}

// Clean up old rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitMap.entries()) {
    if (now > record.resetTime) {
      rateLimitMap.delete(ip);
    }
  }
}, RATE_LIMIT_WINDOW);

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use('/api', rateLimit);

app.get('/api/health', async (_req, res) => {
  let playwrightStatus = 'unknown';
  
  try {
    const { chromium } = await import('playwright');
    
    // Quick check if browser is available
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    playwrightStatus = 'ready';
  } catch {
    playwrightStatus = 'unavailable';
  }

  res.json({
    ok: true,
    name: 'AgentClassroom',
    timestamp: new Date().toISOString(),
    services: {
      playwright: {
        status: playwrightStatus,
      },
      storage: {
        status: 'ready',
        path: STORAGE_DIR,
      },
    },
  });
});

app.get('/api/jobs', (_req, res) => {
  res.json({
    jobs: store.list().map((job) => serializeJob(job)),
  });
});

app.post('/api/jobs', async (req, res) => {
  const url = String(req.body?.url || '').trim();
  const options = normalizeOptions(req.body?.options);

  if (!url) {
    res.status(400).json({ error: 'A URL is required.' });
    return;
  }

  // Validate URL safety (SSRF protection)
  const validation = validateUrlSafety(url);
  if (!validation.valid) {
    res.status(400).json({ error: validation.error });
    return;
  }

  // Check concurrent job limit
  const activeJobs = store.list().filter(j => 
    j.status !== 'complete' && j.status !== 'failed'
  );
  if (activeJobs.length >= 3) {
    res.status(429).json({ error: 'Too many active jobs. Please wait for existing jobs to complete.' });
    return;
  }

  try {
    const job = await store.create(url, options);
    void runJob(job, store);
    res.status(202).json({ job: serializeJob(job) });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create job.' });
  }
});

app.get('/api/jobs/:id', (req, res) => {
  const job = store.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Job not found.' });
    return;
  }

  res.json({ job: serializeJob(job) });
});

app.get('/api/jobs/:id/results', async (req, res) => {
  const job = store.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Job not found.' });
    return;
  }

  try {
    const fileTree = await buildFileTree(job.outputDir);
    const layout = await maybeReadJson(path.join(job.outputDir, 'design', 'layout.json'));
    const tokens = await maybeReadJson(path.join(job.outputDir, 'design', 'tokens.json'));
    const components = await maybeReadJson(path.join(job.outputDir, 'distill', 'components', 'index.json'));
    const placeholders = await maybeReadJson(path.join(job.outputDir, 'distill', 'placeholders.json'));
    const manifest = await maybeReadJson(path.join(job.outputDir, 'manifest.json'));
    const prompt = await maybeReadText(path.join(job.outputDir, 'PROMPT.md'));

    res.json({
      job: serializeJob(job),
      manifest,
      prompt,
      layout,
      tokens,
      components,
      placeholders,
      files: fileTree,
      downloadPath: `/api/jobs/${job.id}/download`,
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load job results.' });
  }
});

app.get('/api/jobs/:id/artifact-content', async (req, res) => {
  const job = store.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Job not found.' });
    return;
  }

  const relativePath = String(req.query.path || '').trim();
  if (!relativePath) {
    res.status(400).json({ error: 'Artifact path is required.' });
    return;
  }

  try {
    const absolutePath = safeJoin(job.outputDir, relativePath);
    const ext = path.extname(absolutePath).toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) {
      res.json({
        kind: 'image',
        path: relativePath,
        url: `/api/jobs/${job.id}/artifact?path=${encodeURIComponent(relativePath)}`,
      });
      return;
    }

    const content = await fs.readFile(absolutePath, 'utf8');
    if (ext === '.json') {
      res.json({
        kind: 'json',
        path: relativePath,
        raw: content,
        parsed: JSON.parse(content),
      });
      return;
    }

    res.json({
      kind: 'text',
      path: relativePath,
      content,
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to load artifact.' });
  }
});

app.get('/api/jobs/:id/artifact', async (req, res) => {
  const job = store.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Job not found.' });
    return;
  }

  const relativePath = String(req.query.path || '').trim();
  if (!relativePath) {
    res.status(400).json({ error: 'Artifact path is required.' });
    return;
  }

  try {
    const absolutePath = safeJoin(job.outputDir, relativePath);
    res.sendFile(absolutePath);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to stream artifact.' });
  }
});

app.get('/api/jobs/:id/download', async (req, res) => {
  const job = store.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Job not found.' });
    return;
  }

  const downloadPath = path.join(job.outputDir, 'package', 'agentclassroom-skillpack.zip');
  if (!(await fileExists(downloadPath))) {
    res.status(404).json({ error: 'Skillpack archive has not been generated yet.' });
    return;
  }

  res.download(downloadPath, `${job.id}-skillpack.zip`);
});

// Cancel a running job
app.post('/api/jobs/:id/cancel', async (req, res) => {
  const job = store.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Job not found.' });
    return;
  }

  if (job.status === 'complete' || job.status === 'failed') {
    res.status(400).json({ error: 'Cannot cancel a completed or failed job.' });
    return;
  }

  try {
    await store.cancel(job.id);
    res.json({ job: serializeJob(store.get(job.id)!) });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to cancel job.' });
  }
});

// Delete a job
app.delete('/api/jobs/:id', async (req, res) => {
  const job = store.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Job not found.' });
    return;
  }

  if (job.status !== 'complete' && job.status !== 'failed') {
    res.status(400).json({ error: 'Cannot delete a running job. Cancel it first.' });
    return;
  }

  try {
    await store.delete(job.id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to delete job.' });
  }
});

// Cleanup old jobs (keep last N jobs)
app.post('/api/cleanup', async (req, res) => {
  const keepCount = Math.max(1, Math.min(100, Number(req.body?.keepCount) || 10));
  
  try {
    const deletedCount = await store.cleanup(keepCount);
    res.json({ 
      message: `Cleaned up ${deletedCount} old jobs.`,
      deletedCount,
      remainingJobs: store.list().length
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to cleanup jobs.' });
  }
});

if (await fileExists(CLIENT_DIST_DIR)) {
  app.use(express.static(CLIENT_DIST_DIR));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(CLIENT_DIST_DIR, 'index.html'));
  });
}

app.listen(SERVER_PORT, () => {
  console.log(`AgentClassroom server running on http://localhost:${SERVER_PORT}`);
  console.log(`Job storage: ${STORAGE_DIR}`);
});

// SSRF protection - block private/internal IP ranges
const BLOCKED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '169.254.169.254', // AWS metadata
]);

const PRIVATE_IP_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^fc00:/,
  /^fe80:/,
];

function validateUrlSafety(url: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(url);
    
    // Check protocol
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, error: 'Only http and https URLs are supported.' };
    }

    // Check for blocked hosts
    const hostname = parsed.hostname.toLowerCase();
    if (BLOCKED_HOSTS.has(hostname)) {
      return { valid: false, error: 'This URL is not allowed for security reasons.' };
    }

    // Check for private IP ranges
    for (const range of PRIVATE_IP_RANGES) {
      if (range.test(hostname)) {
        return { valid: false, error: 'Private IP addresses are not allowed.' };
      }
    }

    // Check URL length
    if (url.length > 2048) {
      return { valid: false, error: 'URL is too long (max 2048 characters).' };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Enter a valid absolute http or https URL.' };
  }
}

function normalizeOptions(input: unknown): ExtractionOptions {
  if (!input || typeof input !== 'object') {
    return {
      desktop: true,
      mobile: true,
      safeMode: true,
    };
  }

  const candidate = input as Record<string, unknown>;
  return {
    desktop: candidate.desktop !== false,
    mobile: candidate.mobile !== false,
    safeMode: candidate.safeMode !== false,
  };
}

function serializeJob(job: JobRecord) {
  return {
    id: job.id,
    url: job.url,
    status: job.status,
    progress: job.progress,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt,
    options: job.options,
    logs: job.logs,
    error: job.error,
    pageTitle: job.pageTitle,
    finalUrl: job.finalUrl,
    viewportsUsed: job.viewportsUsed,
    summaryStats: job.summaryStats,
    keyFiles: job.keyFiles,
  };
}

async function maybeReadJson(filePath: string) {
  if (!(await fileExists(filePath))) return null;
  return readJson(filePath);
}

async function maybeReadText(filePath: string) {
  if (!(await fileExists(filePath))) return null;
  return fs.readFile(filePath, 'utf8');
}
