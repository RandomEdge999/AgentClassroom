import path from 'node:path';

import type {
  CaptureOutput,
  DesignOutput,
  DistillOutput,
  PlaceholderEntry,
  SnapshotNode,
} from '../types.js';
import { writeJson, writeText } from '../utils/fs.js';
import { normalizeColor, parsePx, selectorToClassName, truncate } from '../utils/values.js';

const PREFERRED_PROPERTIES = [
  'display',
  'position',
  'justifyContent',
  'alignItems',
  'flexDirection',
  'gridTemplateColumns',
  'gridTemplateRows',
  'gap',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'maxWidth',
  'minHeight',
  'width',
  'height',
  'backgroundColor',
  'color',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'textTransform',
  'textAlign',
  'borderTopWidth',
  'borderTopColor',
  'borderRadius',
  'boxShadow',
];

export async function distillCapture(
  capture: CaptureOutput,
  design: DesignOutput,
  outputDir: string,
  safeMode: boolean
): Promise<DistillOutput> {
  const distillDir = path.join(outputDir, 'distill');
  const componentDir = path.join(distillDir, 'components');
  const desktopSnapshot = capture.viewports.find((entry) => entry.viewport.id === 'desktop')?.snapshot || capture.viewports[0]?.snapshot;

  if (!desktopSnapshot) {
    throw new Error('No desktop snapshot available for distillation.');
  }

  const placeholders: PlaceholderEntry[] = [];
  let keptNodeCount = 0;

  const keepSet = new Set<string>([
    ...design.layout.regions.map((region) => region.pathKey),
    ...design.components.map((component) => component.pathKey),
  ]);

  const skeletonMarkup = renderNode(desktopSnapshot.root, {
    safeMode,
    keepSet,
    placeholders,
    onKeep: () => {
      keptNodeCount += 1;
    },
  });

  const nodeClasses = new Map<string, string>();
  const skeletonCss = [buildRootCss(design), buildNodeCss(desktopSnapshot.root, nodeClasses, keepSet), buildResponsiveCss(design.layout.responsiveDifferences, nodeClasses)]
    .filter(Boolean)
    .join('\n\n');

  const skeletonHtmlPath = path.join(distillDir, 'skeleton.html');
  const skeletonCssPath = path.join(distillDir, 'skeleton.css');
  const placeholdersPath = path.join(distillDir, 'placeholders.json');
  const componentIndexPath = path.join(componentDir, 'index.json');

  await writeText(
    skeletonHtmlPath,
    [
      '<!doctype html>',
      '<html lang="en">',
      '<head>',
      '  <meta charset="UTF-8" />',
      '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
      '  <title>AgentClassroom Skeleton</title>',
      '  <link rel="stylesheet" href="./skeleton.css" />',
      '</head>',
      '<body>',
      skeletonMarkup,
      '</body>',
      '</html>',
    ].join('\n')
  );
  await writeText(skeletonCssPath, skeletonCss);
  await writeJson(placeholdersPath, placeholders);

  const componentPaths: string[] = [];
  const componentSummaries: Array<Record<string, unknown>> = [];

  for (const component of design.components) {
    const componentPath = path.join(componentDir, component.id);
    const fragmentHtmlPath = path.join(componentPath, 'fragment.html');
    const fragmentCssPath = path.join(componentPath, 'fragment.css');
    const componentJsonPath = path.join(componentPath, 'component.json');
    const previewPath = path.join(componentPath, 'preview.png');

    const fragmentHtml = renderNode(component.node, {
      safeMode,
      keepSet: new Set([component.pathKey]),
      placeholders: [],
      onKeep: () => undefined,
      isFragment: true,
    });
    const fragmentCss = buildNodeCss(component.node, new Map(), new Set([component.pathKey]));

    await writeText(fragmentHtmlPath, fragmentHtml);
    await writeText(fragmentCssPath, fragmentCss);
    await writeJson(componentJsonPath, {
      id: component.id,
      label: component.label,
      type: component.type,
      selector: component.selector,
      pathKey: component.pathKey,
      occurrenceCount: component.occurrenceCount,
      notes: component.notes,
      files: {
        fragmentHtml: path.relative(outputDir, fragmentHtmlPath).replace(/\\/g, '/'),
        fragmentCss: path.relative(outputDir, fragmentCssPath).replace(/\\/g, '/'),
        preview: path.relative(outputDir, previewPath).replace(/\\/g, '/'),
      },
    });

    componentPaths.push(componentPath);
    componentSummaries.push({
      id: component.id,
      label: component.label,
      type: component.type,
      selector: component.selector,
      pathKey: component.pathKey,
      files: {
        fragmentHtml: path.relative(outputDir, fragmentHtmlPath).replace(/\\/g, '/'),
        fragmentCss: path.relative(outputDir, fragmentCssPath).replace(/\\/g, '/'),
        preview: path.relative(outputDir, previewPath).replace(/\\/g, '/'),
      },
    });
  }

  await writeJson(componentIndexPath, componentSummaries);

  return {
    skeletonHtmlPath,
    skeletonCssPath,
    placeholdersPath,
    componentIndexPath,
    placeholders,
    keptNodeCount,
    componentOutputPaths: componentPaths,
  };
}

function renderNode(
  node: SnapshotNode,
  {
    safeMode,
    keepSet,
    placeholders,
    onKeep,
    isFragment = false,
  }: {
    safeMode: boolean;
    keepSet: Set<string>;
    placeholders: PlaceholderEntry[];
    onKeep: () => void;
    isFragment?: boolean;
  }
): string {
  const shouldKeep = keepSet.has(node.pathKey) || keepSet.has(node.selector) || isStructurallyUseful(node);
  if (!shouldKeep && !node.children.some((child) => keepSet.has(child.pathKey) || isStructurallyUseful(child))) {
    return '';
  }

  onKeep();

  const tag = sanitizeTag(node.tag);
  const className = selectorToClassName(node.pathKey);
  const attributes: string[] = [`class="${className}"`, `data-selector="${escapeAttribute(node.selector)}"`];
  if (node.role) attributes.push(`role="${escapeAttribute(node.role)}"`);
  if (node.ariaLabel) attributes.push(`aria-label="${escapeAttribute(node.ariaLabel)}"`);

  let content = '';
  if (node.imageLike) {
    const placeholder = `{{image-${placeholders.filter((entry) => entry.kind === 'image').length + 1}}}`;
    placeholders.push({
      placeholder,
      kind: 'image',
      selector: node.selector,
      pathKey: node.pathKey,
      replacement: 'Image placeholder preserving layout slot',
      originalAlt: node.attributes.alt,
      dimensions: {
        width: node.rect.width,
        height: node.rect.height,
      },
    });
    content = `<div class="ac-image-slot" data-placeholder="${placeholder}" data-alt="${escapeAttribute(node.attributes.alt || '')}"></div>`;
  } else {
    content = chooseNodeText(node, safeMode, placeholders);
  }

  const childMarkup = node.children
    .map((child) =>
      renderNode(child, {
        safeMode,
        keepSet,
        placeholders,
        onKeep,
        isFragment,
      })
    )
    .filter(Boolean)
    .join('\n');

  const body = [content, childMarkup].filter(Boolean).join('\n');
  return `<${tag} ${attributes.join(' ')}>${body}</${tag}>`;
}

function chooseNodeText(node: SnapshotNode, safeMode: boolean, placeholders: PlaceholderEntry[]) {
  const text = node.text.trim();
  if (!text) return '';

  if (node.interactive || node.headingLevel || node.tag === 'label' || node.tag === 'legend') {
    return escapeHtml(truncate(text, 80));
  }

  if (!safeMode && text.length <= 180) {
    return escapeHtml(truncate(text, 180));
  }

  if (text.length <= 48) {
    return escapeHtml(truncate(text, 48));
  }

  const placeholder = `{{text-${placeholders.filter((entry) => entry.kind === 'text').length + 1}}}`;
  placeholders.push({
    placeholder,
    kind: 'text',
    selector: node.selector,
    pathKey: node.pathKey,
    replacement: 'Content-heavy text collapsed into a placeholder',
    originalPreview: truncate(text, 120),
  });
  return placeholder;
}

function isStructurallyUseful(node: SnapshotNode) {
  if (!node.visible) return false;
  if (node.interactive) return true;
  if (['header', 'nav', 'main', 'section', 'footer', 'aside', 'form', 'ul', 'ol', 'li', 'button', 'a'].includes(node.tag)) return true;
  if (node.headingLevel) return true;
  if (node.rect.width > 300 && node.rect.height > 80 && node.children.length > 0) return true;
  return false;
}

function sanitizeTag(tag: string) {
  if (['html', 'body'].includes(tag)) return 'div';
  if (tag === 'img') return 'div';
  return tag;
}

function buildRootCss(design: DesignOutput) {
  const palette = design.palette as any;
  const typography = design.typography as any;
  const spacing = design.spacing as any;
  const bg = palette.backgrounds?.[0]?.value || '#faf9f6';
  const text = palette.text?.[0]?.value || '#1c1917';
  const border = palette.borders?.[0]?.value || '#e7e5e4';
  const fontFamily = typography.fontFamilies?.[0]?.value || 'Inter, system-ui, sans-serif';
  const fontSize = typography.fontSizes?.[0]?.value || '16px';
  const lineHeight = typography.lineHeights?.[0]?.value || '1.5';
  const radius = spacing.radius?.[0]?.value || '12px';
  const shadow = spacing.shadow?.[0]?.value || '0 8px 24px rgba(0, 0, 0, 0.08)';

  return [
    ':root {',
    `  --ac-bg: ${bg};`,
    `  --ac-text: ${text};`,
    `  --ac-border: ${border};`,
    `  --ac-font-family: ${fontFamily};`,
    `  --ac-font-size: ${fontSize};`,
    `  --ac-line-height: ${lineHeight};`,
    `  --ac-radius: ${radius};`,
    `  --ac-shadow: ${shadow};`,
    '}',
    'body {',
    '  margin: 0;',
    '  font-family: var(--ac-font-family);',
    '  font-size: var(--ac-font-size);',
    '  line-height: var(--ac-line-height);',
    '  color: var(--ac-text);',
    '  background: var(--ac-bg);',
    '}',
    '.ac-image-slot {',
    '  width: 100%;',
    '  min-height: 120px;',
    '  border: 1px dashed var(--ac-border);',
    '  border-radius: var(--ac-radius);',
    '  background: color-mix(in srgb, var(--ac-border) 35%, white);',
    '  box-shadow: inset 0 1px 0 rgba(255,255,255,0.7);',
    '}',
  ].join('\n');
}

function buildNodeCss(node: SnapshotNode, nodeClasses: Map<string, string>, keepSet: Set<string>) {
  const chunks: string[] = [];

  const walk = (entry: SnapshotNode) => {
    if (!(keepSet.has(entry.pathKey) || isStructurallyUseful(entry))) {
      entry.children.forEach(walk);
      return;
    }

    const className = selectorToClassName(entry.pathKey);
    nodeClasses.set(entry.pathKey, className);
    const declarations = PREFERRED_PROPERTIES.map((property) => {
      const value = entry.styles[property];
      if (!value || value === 'normal' || value === 'none') return '';
      if (property === 'backgroundColor' && !normalizeColor(value)) return '';
      if (property === 'color' && !normalizeColor(value)) return '';
      if (property === 'borderTopWidth' && parsePx(value) === 0) return '';
      if ((property === 'width' || property === 'height') && !value.endsWith('px')) return '';
      return `  ${camelToKebab(property)}: ${value};`;
    })
      .filter(Boolean)
      .join('\n');

    if (declarations) {
      chunks.push(`.${className} {\n${declarations}\n}`);
    }

    entry.children.forEach(walk);
  };

  walk(node);
  return chunks.join('\n\n');
}

function buildResponsiveCss(differences: DesignOutput['layout']['responsiveDifferences'], nodeClasses: Map<string, string>) {
  const rules = differences
    .slice(0, 8)
    .map((difference) => {
      const className = nodeClasses.get(difference.pathKey) || selectorToClassName(difference.pathKey);
      const declarations = difference.changes
        .map((change) => {
          const [propertyPart, valuePart] = change.split(':');
          if (!propertyPart || !valuePart) return '';
          const [, mobileValue] = valuePart.split('->').map((entry) => entry.trim());
          if (!mobileValue) return '';
          return `    ${propertyPart.trim()}: ${mobileValue};`;
        })
        .filter(Boolean)
        .join('\n');
      if (!declarations) return '';
      return `  .${className} {\n${declarations}\n  }`;
    })
    .filter(Boolean)
    .join('\n\n');

  if (!rules) return '';
  return `@media (max-width: 768px) {\n${rules}\n}`;
}

function camelToKebab(value: string) {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/"/g, '&quot;');
}
