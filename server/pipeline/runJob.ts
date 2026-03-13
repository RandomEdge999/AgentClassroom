import path from 'node:path';

import { JobStore } from '../jobs/jobStore.js';
import type { CaptureOutput, DesignOutput, DistillOutput, JobRecord, KeyFiles } from '../types.js';
import { ensureDir } from '../utils/fs.js';
import { captureJob } from './capture.js';
import { analyzeDesign } from './design.js';
import { distillCapture } from './distill.js';
import { captureComponentPreviews, createSkillpackArchive } from './package.js';
import { generatePrompt } from './prompt.js';

export async function runJob(job: JobRecord, store: JobStore) {
  try {
    await store.updateStatus(job.id, 'validating', 0.08, 'Validating URL and initializing the output workspace.', 'system');
    validateUrl(job.url);
    await createJobFolders(job.outputDir);

    await store.updateStatus(job.id, 'capturing', 0.26, 'Launching Chromium and capturing rendered artifacts.');
    const capture = await captureJob(job.url, job.options, job.outputDir);
    await store.setCaptureMetadata(job.id, {
      pageTitle: capture.pageTitle,
      finalUrl: capture.finalUrl,
      viewportsUsed: capture.viewports.map((entry) => ({
        id: entry.viewport.id,
        width: entry.viewport.width,
        height: entry.viewport.height,
        screenshot: path.relative(job.outputDir, entry.screenshotPath).replace(/\\/g, '/'),
      })),
    });

    await store.updateStatus(job.id, 'analyzing', 0.54, 'Extracting regions, component candidates, tokens, and responsive differences.');
    const design = await analyzeDesign(capture, job.outputDir);

    await store.updateStatus(job.id, 'distilling', 0.76, 'Generating the skeleton files, placeholders map, and component fragments.');
    const distill = await distillCapture(capture, design, job.outputDir, job.options.safeMode);

    await store.updateStatus(job.id, 'packaging', 0.9, 'Writing the agent briefing, packaging files, and capturing component previews.');
    await captureComponentPreviews(capture.finalUrl, job.outputDir, design.components);
    const promptPath = await generatePrompt(job, capture, design, distill);
    const zipPath = await createSkillpackArchive(job);

    const summaryStats = {
      ...design.summary,
      keptNodes: distill.keptNodeCount,
      placeholders: distill.placeholders.length,
      components: design.components.length,
      layoutRegions: design.layout.regions.length,
      networkRequests: capture.networkLog.length,
    };

    const keyFiles = buildKeyFiles(job, capture, design, distill, promptPath, zipPath);

    await store.complete(job.id, {
      summaryStats,
      keyFiles,
      pageTitle: capture.pageTitle,
      finalUrl: capture.finalUrl,
      viewportsUsed: capture.viewports.map((entry) => ({
        id: entry.viewport.id,
        width: entry.viewport.width,
        height: entry.viewport.height,
        screenshot: path.relative(job.outputDir, entry.screenshotPath).replace(/\\/g, '/'),
      })),
    });
  } catch (error) {
    await store.fail(job.id, error);
  }
}

function validateUrl(value: string) {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Enter a valid absolute http or https URL.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http and https URLs are supported.');
  }
}

async function createJobFolders(outputDir: string) {
  await Promise.all([
    ensureDir(path.join(outputDir, 'capture', 'screenshots')),
    ensureDir(path.join(outputDir, 'capture', 'network')),
    ensureDir(path.join(outputDir, 'distill', 'components')),
    ensureDir(path.join(outputDir, 'design')),
    ensureDir(path.join(outputDir, 'package')),
  ]);
}

function buildKeyFiles(
  job: JobRecord,
  capture: CaptureOutput,
  _design: DesignOutput,
  distill: DistillOutput,
  promptPath: string,
  zipPath: string
): KeyFiles {
  return {
    manifest: 'manifest.json',
    prompt: path.relative(job.outputDir, promptPath).replace(/\\/g, '/'),
    renderedHtml: path.relative(job.outputDir, capture.renderedHtmlPath).replace(/\\/g, '/'),
    ariaSnapshot: path.relative(job.outputDir, capture.ariaSnapshotPath).replace(/\\/g, '/'),
    domSnapshot: path.relative(job.outputDir, capture.domSnapshotPath).replace(/\\/g, '/'),
    cssUsage: path.relative(job.outputDir, capture.cssUsagePath).replace(/\\/g, '/'),
    networkLog: path.relative(job.outputDir, capture.networkLogPath).replace(/\\/g, '/'),
    skeletonHtml: path.relative(job.outputDir, distill.skeletonHtmlPath).replace(/\\/g, '/'),
    skeletonCss: path.relative(job.outputDir, distill.skeletonCssPath).replace(/\\/g, '/'),
    placeholders: path.relative(job.outputDir, distill.placeholdersPath).replace(/\\/g, '/'),
    tokens: 'design/tokens.json',
    palette: 'design/palette.json',
    typography: 'design/typography.json',
    spacing: 'design/spacing.json',
    layout: 'design/layout.json',
    components: 'distill/components/index.json',
    download: path.relative(job.outputDir, zipPath).replace(/\\/g, '/'),
  };
}
