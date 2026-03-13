import fs from 'node:fs/promises';
import path from 'node:path';

import { STORAGE_DIR } from '../config.js';
import type {
  ExtractionOptions,
  JobLog,
  JobRecord,
  JobStatus,
  KeyFiles,
  SummaryStats,
} from '../types.js';
import { ensureDir, fileExists, readJson, writeJson } from '../utils/fs.js';
import { createJobId, nowIso } from '../utils/values.js';

interface StoredManifest {
  jobId: string;
  inputUrl: string;
  status: JobStatus;
  artifactsCreated?: string[];
  timestamps: {
    createdAt: string;
    updatedAt: string;
    completedAt?: string;
  };
  extractionOptions: ExtractionOptions;
  viewportsUsed: JobRecord['viewportsUsed'];
  summaryStats?: SummaryStats;
  keyFiles?: KeyFiles;
  pageTitle?: string;
  finalUrl?: string;
  error?: string;
}

export class JobStore {
  private jobs = new Map<string, JobRecord>();

  async init() {
    await ensureDir(STORAGE_DIR);
    const entries = await fs.readdir(STORAGE_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const outputDir = path.join(STORAGE_DIR, entry.name);
      const manifestPath = path.join(outputDir, 'manifest.json');
      if (!(await fileExists(manifestPath))) continue;

      try {
        const manifest = await readJson<StoredManifest>(manifestPath);
        this.jobs.set(manifest.jobId, {
          id: manifest.jobId,
          url: manifest.inputUrl,
          status: manifest.status,
          createdAt: manifest.timestamps.createdAt,
          updatedAt: manifest.timestamps.updatedAt,
          completedAt: manifest.timestamps.completedAt,
          progress: manifest.status === 'complete' || manifest.status === 'failed' ? 1 : 0,
          options: manifest.extractionOptions,
          outputDir,
          logs: [],
          error: manifest.error,
          pageTitle: manifest.pageTitle,
          finalUrl: manifest.finalUrl,
          viewportsUsed: manifest.viewportsUsed || [],
          summaryStats: manifest.summaryStats,
          keyFiles: manifest.keyFiles,
        });
      } catch {
        // Ignore malformed historical jobs.
      }
    }
  }

  list() {
    return [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  get(id: string) {
    return this.jobs.get(id);
  }

  async create(url: string, options: ExtractionOptions) {
    const id = createJobId();
    const outputDir = path.join(STORAGE_DIR, id);
    const timestamp = nowIso();

    const record: JobRecord = {
      id,
      url,
      status: 'queued',
      createdAt: timestamp,
      updatedAt: timestamp,
      progress: 0,
      options,
      outputDir,
      logs: [],
      viewportsUsed: [],
    };

    await ensureDir(outputDir);
    this.jobs.set(id, record);
    await this.persist(record);
    return record;
  }

  async updateStatus(id: string, status: JobStatus, progress: number, message: string, level: JobLog['level'] = 'info') {
    const job = this.mustGet(id);
    job.status = status;
    job.progress = progress;
    job.updatedAt = nowIso();
    job.logs.push({
      at: job.updatedAt,
      stage: status,
      level,
      message,
    });
    await this.persist(job);
    return job;
  }

  async setCaptureMetadata(id: string, patch: Partial<JobRecord>) {
    const job = this.mustGet(id);
    Object.assign(job, patch);
    job.updatedAt = nowIso();
    await this.persist(job);
    return job;
  }

  async complete(id: string, payload: { summaryStats: SummaryStats; keyFiles: KeyFiles; pageTitle?: string; finalUrl?: string; viewportsUsed: JobRecord['viewportsUsed'] }) {
    const job = this.mustGet(id);
    job.status = 'complete';
    job.progress = 1;
    job.updatedAt = nowIso();
    job.completedAt = job.updatedAt;
    job.summaryStats = payload.summaryStats;
    job.keyFiles = payload.keyFiles;
    job.pageTitle = payload.pageTitle;
    job.finalUrl = payload.finalUrl;
    job.viewportsUsed = payload.viewportsUsed;
    job.logs.push({
      at: job.updatedAt,
      stage: 'complete',
      level: 'success',
      message: 'Skillpack packaged and ready for download.',
    });
    await this.persist(job);
    return job;
  }

  async fail(id: string, error: unknown) {
    const job = this.mustGet(id);
    const message = error instanceof Error ? error.message : String(error);
    job.status = 'failed';
    job.progress = 1;
    job.updatedAt = nowIso();
    job.error = message;
    job.logs.push({
      at: job.updatedAt,
      stage: 'failed',
      level: 'error',
      message,
    });
    await this.persist(job);
    return job;
  }

  async cancel(id: string) {
    const job = this.mustGet(id);
    if (job.status === 'complete' || job.status === 'failed') {
      throw new Error('Cannot cancel a completed or failed job.');
    }
    job.status = 'failed';
    job.progress = 1;
    job.updatedAt = nowIso();
    job.error = 'Job was cancelled by user.';
    job.logs.push({
      at: job.updatedAt,
      stage: 'failed',
      level: 'warn',
      message: 'Job cancelled by user.',
    });
    await this.persist(job);
    return job;
  }

  async delete(id: string) {
    const job = this.mustGet(id);
    if (job.status !== 'complete' && job.status !== 'failed') {
      throw new Error('Cannot delete a running job. Cancel it first.');
    }
    
    // Remove from memory
    this.jobs.delete(id);
    
    // Remove from disk
    try {
      await fs.rm(job.outputDir, { recursive: true, force: true });
    } catch {
      // Ignore errors if directory doesn't exist
    }
  }

  async cleanup(keepCount: number): Promise<number> {
    const jobs = this.list();
    const completedJobs = jobs.filter(j => j.status === 'complete' || j.status === 'failed');
    
    if (completedJobs.length <= keepCount) {
      return 0;
    }

    // Sort by completion date (oldest first)
    const sortedJobs = [...completedJobs].sort((a, b) => {
      const aTime = a.completedAt || a.updatedAt;
      const bTime = b.completedAt || b.updatedAt;
      return aTime.localeCompare(bTime);
    });

    const toDelete = sortedJobs.slice(0, sortedJobs.length - keepCount);
    let deletedCount = 0;

    for (const job of toDelete) {
      try {
        await this.delete(job.id);
        deletedCount++;
      } catch {
        // Continue with other deletions
      }
    }

    return deletedCount;
  }

  private mustGet(id: string) {
    const job = this.jobs.get(id);
    if (!job) {
      throw new Error(`Job not found: ${id}`);
    }
    return job;
  }

  private async persist(job: JobRecord) {
    const manifestPath = path.join(job.outputDir, 'manifest.json');
    const manifest: StoredManifest = {
      jobId: job.id,
      inputUrl: job.url,
      status: job.status,
      artifactsCreated: job.keyFiles ? Object.values(job.keyFiles) : [],
      timestamps: {
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        completedAt: job.completedAt,
      },
      extractionOptions: job.options,
      viewportsUsed: job.viewportsUsed,
      summaryStats: job.summaryStats,
      keyFiles: job.keyFiles,
      pageTitle: job.pageTitle,
      finalUrl: job.finalUrl,
      error: job.error,
    };

    await writeJson(manifestPath, manifest);
  }
}
