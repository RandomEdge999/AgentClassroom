import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';

import archiver from 'archiver';
import { chromium } from 'playwright';

import { VIEWPORTS } from '../config.js';
import type { ComponentCandidate, JobRecord } from '../types.js';
import { ensureDir } from '../utils/fs.js';

export async function captureComponentPreviews(url: string, outputDir: string, components: ComponentCandidate[]) {
  if (!components.length) return;

  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      viewport: {
        width: VIEWPORTS.desktop.width,
        height: VIEWPORTS.desktop.height,
      },
    });
    const page = await context.newPage();
    
    // Use more reliable wait strategy
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    } catch {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }
    
    // Wait for network to settle (best effort)
    try {
      await page.waitForLoadState('networkidle', { timeout: 10000 });
    } catch {
      // Continue anyway
    }
    
    await page.waitForTimeout(1000);

    for (const component of components.slice(0, 10)) {
      const previewPath = path.join(outputDir, 'distill', 'components', component.id, 'preview.png');
      try {
        await ensureDir(path.dirname(previewPath));
        const locator = page.locator(component.selector).first();
        if ((await locator.count()) === 0) continue;
        await locator.screenshot({ path: previewPath });
      } catch {
        // Best-effort preview capture only.
      }
    }

    await context.close();
  } finally {
    await browser.close();
  }
}

export async function createSkillpackArchive(job: JobRecord) {
  const packageDir = path.join(job.outputDir, 'package');
  const zipPath = path.join(packageDir, 'agentclassroom-skillpack.zip');

  await ensureDir(packageDir);
  await fsPromises.rm(zipPath, { force: true });

  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve());
    output.on('error', reject);
    archive.on('error', reject);

    archive.pipe(output);
    archive.glob('**/*', {
      cwd: job.outputDir,
      ignore: ['package/agentclassroom-skillpack.zip'],
    });
    archive.finalize();
  });

  return zipPath;
}
