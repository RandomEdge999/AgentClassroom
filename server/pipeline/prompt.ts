import path from 'node:path';

import type { CaptureOutput, DesignOutput, DistillOutput, JobRecord } from '../types.js';
import { writeText } from '../utils/fs.js';

interface TokenEntry {
  value: string;
  count: number;
}

interface PaletteData {
  backgrounds?: TokenEntry[];
  text?: TokenEntry[];
  borders?: TokenEntry[];
}

interface TypographyData {
  fontFamilies?: TokenEntry[];
  fontSizes?: TokenEntry[];
  fontWeights?: TokenEntry[];
  lineHeights?: TokenEntry[];
}

interface SpacingData {
  padding?: TokenEntry[];
  margin?: TokenEntry[];
  gap?: TokenEntry[];
  radius?: TokenEntry[];
  shadow?: TokenEntry[];
}

export async function generatePrompt(job: JobRecord, capture: CaptureOutput, design: DesignOutput, _distill: DistillOutput) {
  const regions = design.layout.regions
    .slice(0, 8)
    .map((region) => `- ${region.label}: ${region.notes.join(' ') || region.selector}`)
    .join('\n');
  const components = design.components
    .slice(0, 10)
    .map((component) => `- ${component.label} (${component.type}) x${component.occurrenceCount}: ${component.notes.join(' ')}`)
    .join('\n');
  const paletteData = design.palette as PaletteData;
  const typographyData = design.typography as TypographyData;
  const spacingData = design.spacing as SpacingData;
  const palette = [...(paletteData.backgrounds || []).slice(0, 4), ...(paletteData.text || []).slice(0, 4)]
    .map((entry: TokenEntry) => `${entry.value} (${entry.count})`)
    .join(', ');
  const typography = (typographyData.fontFamilies || [])
    .slice(0, 3)
    .map((entry: TokenEntry) => `${entry.value} (${entry.count})`)
    .join(', ');
  const spacing = (spacingData.padding || [])
    .slice(0, 4)
    .map((entry: TokenEntry) => `${entry.value} (${entry.count})`)
    .join(', ');
  const responsive = design.layout.responsiveDifferences
    .slice(0, 6)
    .map((difference) => `- ${difference.selector}: ${difference.changes.join('; ')}`)
    .join('\n');

  const content = [
    '# AgentClassroom Briefing',
    '',
    '## Page',
    `- Source URL: ${job.url}`,
    `- Final URL: ${capture.finalUrl}`,
    `- Page title: ${capture.pageTitle || 'Untitled page'}`,
    `- Captured viewports: ${capture.viewports.map((entry) => `${entry.viewport.id} (${entry.viewport.width}x${entry.viewport.height})`).join(', ')}`,
    `- Safe mode: ${job.options.safeMode ? 'enabled' : 'disabled'}`,
    '',
    '## What Was Captured',
    '- Rendered HTML from a live Chromium session',
    '- Full-page screenshots for each selected viewport',
    '- Accessibility structure snapshot',
    '- DOM/layout snapshot with computed styles',
    '- CSS rule usage coverage and network/resource log',
    '',
    '## Major Layout Regions',
    regions || '- No major regions were detected beyond the base page wrapper.',
    '',
    '## Reusable Components',
    components || '- No repeated components passed the current heuristic thresholds.',
    '',
    '## Visual System',
    `- Palette signals: ${palette || 'No palette clusters extracted.'}`,
    `- Typography signals: ${typography || 'No typography clusters extracted.'}`,
    `- Spacing patterns: ${spacing || 'No spacing clusters extracted.'}`,
    '- Shadows and radii are recorded in `design/spacing.json`.',
    '',
    '## Design Rules Worth Preserving',
    '- Preserve the top-level layout hierarchy before filling in content.',
    '- Reuse repeated components as canonical templates rather than rebuilding each instance from scratch.',
    '- Use `distill/skeleton.css` as the structure-preserving baseline and refine with values from `design/tokens.json`.',
    '- Treat short labels, navigation items, buttons, and form copy as meaningful UI text; treat long prose as noise unless the product specifically needs it.',
    '',
    '## Intentional Abstractions',
    '- Content-heavy text was replaced with placeholders when it did not carry layout intent.',
    '- Unique imagery was converted to placeholders that preserve slot size and layout role.',
    '- Tracking/runtime scripts were excluded from the distilled output.',
    '',
    '## Responsive Differences',
    responsive || '- No major responsive diffs were detected from the captured mobile viewport.',
    '',
    '## File References',
    '- Manifest: `manifest.json`',
    '- Distilled brief: `PROMPT.md`',
    '- Raw rendered HTML: `capture/rendered.html`',
    '- ARIA snapshot: `capture/aria_snapshot.yaml`',
    '- DOM snapshot: `capture/dom_snapshot.json`',
    '- CSS coverage: `capture/css_usage.json`',
    '- Network log: `capture/network/requests.json`',
    '- Distilled skeleton: `distill/skeleton.html` and `distill/skeleton.css`',
    '- Placeholders map: `distill/placeholders.json`',
    '- Component index: `distill/components/index.json`',
    '- Design outputs: `design/tokens.json`, `design/palette.json`, `design/typography.json`, `design/spacing.json`, `design/layout.json`',
    '',
    '## Reconstruction Guidance',
    'Start with the manifest and this briefing, then review `design/layout.json` for page structure, `design/tokens.json` for system values, and the relevant entries in `distill/components/` for reusable UI blocks. Recreate the interaction shell and spacing system first. Only then layer back concise UI copy, not the original content-heavy text.',
  ].join('\n');

  const promptPath = path.join(job.outputDir, 'PROMPT.md');
  await writeText(promptPath, content);
  return promptPath;
}
