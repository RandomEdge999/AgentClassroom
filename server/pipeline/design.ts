import path from 'node:path';

import type {
  CaptureOutput,
  ComponentCandidate,
  DesignOutput,
  LayoutRegion,
  ResponsiveDifference,
  SnapshotDocument,
  SnapshotNode,
} from '../types.js';
import { writeJson } from '../utils/fs.js';
import {
  nodeArea,
  normalizeColor,
  parsePx,
  pushCount,
  selectorToClassName,
  topCounts,
  truncate,
} from '../utils/values.js';

export async function analyzeDesign(capture: CaptureOutput, outputDir: string): Promise<DesignOutput> {
  const designDir = path.join(outputDir, 'design');
  const desktopSnapshot = capture.viewports.find((entry) => entry.viewport.id === 'desktop')?.snapshot || capture.viewports[0]?.snapshot;
  const mobileSnapshot = capture.viewports.find((entry) => entry.viewport.id === 'mobile')?.snapshot;

  if (!desktopSnapshot) {
    throw new Error('No captured viewport data available for analysis.');
  }

  const desktopNodes = flattenSnapshot(desktopSnapshot.root);
  const mobileNodes = mobileSnapshot ? flattenSnapshot(mobileSnapshot.root) : [];

  const paletteCounters = {
    backgrounds: new Map<string, number>(),
    text: new Map<string, number>(),
    borders: new Map<string, number>(),
  };
  const typographyCounters = {
    fontFamilies: new Map<string, number>(),
    fontSizes: new Map<string, number>(),
    fontWeights: new Map<string, number>(),
    lineHeights: new Map<string, number>(),
  };
  const spacingCounters = {
    padding: new Map<string, number>(),
    margin: new Map<string, number>(),
    gap: new Map<string, number>(),
    radius: new Map<string, number>(),
    shadow: new Map<string, number>(),
  };

  for (const node of desktopNodes) {
    if (!node.visible) continue;

    pushCount(paletteCounters.text, normalizeColor(node.styles.color));
    pushCount(paletteCounters.backgrounds, normalizeColor(node.styles.backgroundColor));
    pushCount(paletteCounters.borders, normalizeColor(node.styles.borderTopColor));

    if (node.textLength > 0 || node.interactive) {
      pushCount(typographyCounters.fontFamilies, node.styles.fontFamily);
      pushCount(typographyCounters.fontSizes, node.styles.fontSize);
      pushCount(typographyCounters.fontWeights, node.styles.fontWeight);
      pushCount(typographyCounters.lineHeights, node.styles.lineHeight);
    }

    const paddingSummary = summarizeBoxValues(node.styles.paddingTop, node.styles.paddingRight, node.styles.paddingBottom, node.styles.paddingLeft);
    const marginSummary = summarizeBoxValues(node.styles.marginTop, node.styles.marginRight, node.styles.marginBottom, node.styles.marginLeft);
    if (paddingSummary) pushCount(spacingCounters.padding, paddingSummary);
    if (marginSummary) pushCount(spacingCounters.margin, marginSummary);
    pushCount(spacingCounters.gap, node.styles.gap !== 'normal' ? node.styles.gap : '');
    pushCount(spacingCounters.radius, node.styles.borderRadius);
    if (node.styles.boxShadow && node.styles.boxShadow !== 'none') {
      pushCount(spacingCounters.shadow, node.styles.boxShadow);
    }
  }

  const components = detectRepeatedComponents(desktopSnapshot);
  const regions = detectLayoutRegions(desktopSnapshot, components);
  const responsiveDifferences = detectResponsiveDifferences(desktopNodes, mobileNodes);

  const palette = {
    backgrounds: topCounts(paletteCounters.backgrounds),
    text: topCounts(paletteCounters.text),
    borders: topCounts(paletteCounters.borders),
  };

  const typography = {
    fontFamilies: topCounts(typographyCounters.fontFamilies),
    fontSizes: topCounts(typographyCounters.fontSizes),
    fontWeights: topCounts(typographyCounters.fontWeights),
    lineHeights: topCounts(typographyCounters.lineHeights),
  };

  const spacing = {
    padding: topCounts(spacingCounters.padding),
    margin: topCounts(spacingCounters.margin),
    gap: topCounts(spacingCounters.gap),
    radius: topCounts(spacingCounters.radius),
    shadow: topCounts(spacingCounters.shadow),
  };

  const tokens = {
    color: {
      background: palette.backgrounds.slice(0, 6),
      text: palette.text.slice(0, 6),
      border: palette.borders.slice(0, 6),
    },
    typography,
    spacing,
    breakpoints: {
      captured: capture.viewports.map((entry) => ({
        id: entry.viewport.id,
        width: entry.viewport.width,
        height: entry.viewport.height,
      })),
      responsiveDifferences,
    },
  };

  const summary = {
    totalNodes: desktopSnapshot.nodeCount,
    keptNodes: 0,
    placeholders: 0,
    components: components.length,
    layoutRegions: regions.length,
    paletteSwatches: palette.backgrounds.length + palette.text.length + palette.borders.length,
    responsiveDifferences: responsiveDifferences.length,
    networkRequests: capture.networkLog.length,
  };

  const output: DesignOutput = {
    tokens,
    palette,
    typography,
    spacing,
    layout: {
      page: {
        title: capture.pageTitle,
        finalUrl: capture.finalUrl,
        viewport: desktopSnapshot.page.viewport,
        scrollHeight: desktopSnapshot.page.scrollHeight,
      },
      regions,
      responsiveDifferences,
    },
    components,
    summary,
  };

  await Promise.all([
    writeJson(path.join(designDir, 'tokens.json'), output.tokens),
    writeJson(path.join(designDir, 'palette.json'), output.palette),
    writeJson(path.join(designDir, 'typography.json'), output.typography),
    writeJson(path.join(designDir, 'spacing.json'), output.spacing),
    writeJson(path.join(designDir, 'layout.json'), output.layout),
    writeJson(path.join(designDir, 'components.json'), components.map(stripNodeReference)),
  ]);

  return output;
}

export function flattenSnapshot(root: SnapshotNode): SnapshotNode[] {
  const nodes: SnapshotNode[] = [];

  const visit = (node: SnapshotNode) => {
    nodes.push(node);
    node.children.forEach(visit);
  };

  visit(root);
  return nodes;
}

function summarizeBoxValues(...values: Array<string | undefined>) {
  const parsed = values.map((value) => parsePx(value));
  if (!parsed.some((value) => value > 0)) return '';
  const unique = [...new Set(parsed)];
  if (unique.length === 1) return `${unique[0]}px`;
  return `${parsed.join(' / ')}px`;
}

function detectRepeatedComponents(snapshot: SnapshotDocument): ComponentCandidate[] {
  const components: ComponentCandidate[] = [];

  const walk = (node: SnapshotNode) => {
    const groups = new Map<string, SnapshotNode[]>();
    for (const child of node.children) {
      if (!child.visible) continue;
      if (nodeArea(child) < 4000) continue;
      const signature = signatureForNode(child, 2);
      if (!groups.has(signature)) groups.set(signature, []);
      groups.get(signature)?.push(child);
    }

    for (const [, group] of groups) {
      if (group.length < 2) continue;

      const sample = group[0];
      const label = inferComponentLabel(node, sample, group.length);
      components.push({
        id: selectorToClassName(`${sample.tag}-${sample.pathKey}`),
        label,
        type: inferComponentType(label),
        selector: sample.selector,
        pathKey: sample.pathKey,
        occurrenceCount: group.length,
        sourceViewport: snapshot.page.viewport.width >= 768 ? 'desktop' : 'mobile',
        area: nodeArea(sample),
        notes: buildComponentNotes(node, sample, group.length),
        node: sample,
        parentPathKey: node.pathKey,
      });
    }

    node.children.forEach(walk);
  };

  walk(snapshot.root);

  const specials = findSpecialComponents(snapshot.root);
  return dedupeComponents([...specials, ...components]).slice(0, 18);
}

function detectLayoutRegions(snapshot: SnapshotDocument, components: ComponentCandidate[]): LayoutRegion[] {
  const regions: LayoutRegion[] = [];
  const nodes = flattenSnapshot(snapshot.root);
  const seen = new Set<string>();

  const pushRegion = (node: SnapshotNode, type: LayoutRegion['type'], notes: string[]) => {
    if (seen.has(node.pathKey)) return;
    seen.add(node.pathKey);
    regions.push({
      id: selectorToClassName(`${type}-${node.pathKey}`),
      label: labelForRegion(type, node),
      type,
      selector: node.selector,
      pathKey: node.pathKey,
      notes,
      rect: node.rect,
    });
  };

  for (const node of nodes) {
    if (!node.visible) continue;
    const lowerClasses = node.classList.join(' ').toLowerCase();

    if ((node.tag === 'header' || node.role === 'banner') && node.rect.top < 160) {
      pushRegion(node, 'header', ['Top-level header region']);
    }

    if ((node.tag === 'nav' || node.role === 'navigation') && node.rect.top < 220) {
      pushRegion(node, 'navbar', ['Primary navigation block']);
    }

    if (node.tag === 'main') {
      pushRegion(node, 'main', ['Main content container']);
    }

    if (node.tag === 'footer' || node.role === 'contentinfo' || /footer/.test(lowerClasses)) {
      pushRegion(node, 'footer', ['Footer or closing information block']);
    }

    if (looksLikeHero(node)) {
      pushRegion(node, 'hero', ['Large top-of-page section with heading and action density']);
    }

    if (looksLikeForm(node)) {
      pushRegion(node, 'form', ['Form controls grouped into a functional input region']);
    }

    if (looksLikeSidebar(node, snapshot.page.viewport.width)) {
      pushRegion(node, 'sidebar', ['Narrow vertical supporting column']);
    }

    if (looksLikeModal(node, snapshot.page.viewport)) {
      pushRegion(node, 'modal', ['Overlay or modal-like panel']);
    }
  }

  for (const component of components) {
    if (component.type === 'card-grid') {
      pushRegion(component.node, 'card-grid', [`Repeated ${component.label.toLowerCase()} cluster`]);
    }
    if (component.type === 'cta') {
      pushRegion(component.node, 'cta', ['CTA-heavy block with heading and action controls']);
    }
  }

  return regions.slice(0, 20);
}

function detectResponsiveDifferences(desktopNodes: SnapshotNode[], mobileNodes: SnapshotNode[]): ResponsiveDifference[] {
  if (!mobileNodes.length) return [];

  const mobileByPath = new Map(mobileNodes.map((node) => [node.pathKey, node]));
  const differences: ResponsiveDifference[] = [];

  for (const desktopNode of desktopNodes) {
    const mobileNode = mobileByPath.get(desktopNode.pathKey);
    if (!mobileNode || !desktopNode.visible || !mobileNode.visible) continue;

    const changes: string[] = [];
    if (desktopNode.styles.display !== mobileNode.styles.display) {
      changes.push(`display: ${desktopNode.styles.display} -> ${mobileNode.styles.display}`);
    }
    if (desktopNode.styles.flexDirection !== mobileNode.styles.flexDirection) {
      changes.push(`flex-direction: ${desktopNode.styles.flexDirection || 'row'} -> ${mobileNode.styles.flexDirection || 'row'}`);
    }
    if (Math.abs(desktopNode.rect.width - mobileNode.rect.width) > 120) {
      changes.push(`width: ${desktopNode.rect.width}px -> ${mobileNode.rect.width}px`);
    }
    if (Math.abs(parsePx(desktopNode.styles.gap) - parsePx(mobileNode.styles.gap)) >= 8) {
      changes.push(`gap: ${desktopNode.styles.gap} -> ${mobileNode.styles.gap}`);
    }

    if (changes.length) {
      differences.push({
        pathKey: desktopNode.pathKey,
        selector: desktopNode.selector,
        changes,
      });
    }
  }

  return differences.slice(0, 18);
}

function signatureForNode(node: SnapshotNode, depth: number): string {
  if (depth <= 0) return node.tag;
  const childTags = node.children.slice(0, 6).map((child) => signatureForNode(child, depth - 1));
  const textBucket = node.textLength > 140 ? 'long' : node.textLength > 30 ? 'short' : 'tiny';
  return [node.tag, node.role || '', node.interactive ? 'i' : 'n', textBucket, childTags.join('|')].join(':');
}

function inferComponentLabel(parent: SnapshotNode, sample: SnapshotNode, count: number) {
  if (looksLikeCard(sample)) return count >= 3 ? 'Card Grid' : 'Card Cluster';
  if (looksLikeForm(sample)) return 'Form Block';
  if (sample.tag === 'li' || parent.tag === 'ul' || parent.tag === 'ol') return 'Repeated List Item';
  if (sample.tag === 'nav' || sample.role === 'navigation') return 'Navigation Block';
  if (looksLikeHero(sample)) return 'Hero Block';
  if (count >= 3 && (parent.styles.display.includes('grid') || parent.styles.display.includes('flex'))) return 'Card Grid';
  return 'Repeated Component';
}

function inferComponentType(label: string): ComponentCandidate['type'] {
  const normalized = label.toLowerCase();
  if (normalized.includes('hero')) return 'hero';
  if (normalized.includes('navigation')) return 'navbar';
  if (normalized.includes('form')) return 'form';
  if (normalized.includes('card grid')) return 'card-grid';
  if (normalized.includes('card')) return 'card';
  if (normalized.includes('cta')) return 'cta';
  if (normalized.includes('list')) return 'list';
  return 'component';
}

function buildComponentNotes(parent: SnapshotNode, sample: SnapshotNode, count: number) {
  const notes = [`Detected ${count} similar siblings under ${truncate(parent.selector, 80)}.`];
  if (parent.styles.display.includes('grid')) {
    notes.push(`Parent uses grid layout (${parent.styles.gridTemplateColumns || 'auto'}).`);
  }
  if (parent.styles.display.includes('flex')) {
    notes.push(`Parent uses flex layout (${parent.styles.flexDirection || 'row'}).`);
  }
  if (sample.interactive) {
    notes.push('Representative node includes interactive affordances.');
  }
  return notes;
}

function findSpecialComponents(root: SnapshotNode): ComponentCandidate[] {
  const all = flattenSnapshot(root);
  const results: ComponentCandidate[] = [];

  const maybePush = (node: SnapshotNode, label: string, type: ComponentCandidate['type'], notes: string[]) => {
    results.push({
      id: selectorToClassName(`${type}-${node.pathKey}`),
      label,
      type,
      selector: node.selector,
      pathKey: node.pathKey,
      occurrenceCount: 1,
      sourceViewport: 'desktop',
      area: nodeArea(node),
      notes,
      node,
    });
  };

  const header = all.find((node) => node.tag === 'header' || node.role === 'banner');
  if (header) maybePush(header, 'Header', 'header', ['Primary banner/header element']);

  const nav = all.find((node) => node.tag === 'nav' || node.role === 'navigation');
  if (nav) maybePush(nav, 'Navbar', 'navbar', ['Navigation landmarks and links']);

  const hero = all.find(looksLikeHero);
  if (hero) maybePush(hero, 'Hero Section', 'hero', ['Large introduction block near the top of the page']);

  const form = all.find(looksLikeForm);
  if (form) maybePush(form, 'Form', 'form', ['Visible input group']);

  const footer = all.find((node) => node.tag === 'footer');
  if (footer) maybePush(footer, 'Footer', 'footer', ['Closing page section']);

  const sidebar = all.find((node) => looksLikeSidebar(node, root.rect.width));
  if (sidebar) maybePush(sidebar, 'Sidebar', 'sidebar', ['Narrow supporting column']);

  return results;
}

function dedupeComponents(components: ComponentCandidate[]) {
  const seen = new Set<string>();
  return components.filter((component) => {
    if (seen.has(component.pathKey)) return false;
    seen.add(component.pathKey);
    return true;
  });
}

function looksLikeHero(node: SnapshotNode) {
  const area = nodeArea(node);
  const hasHeading = node.children.some((child) => !!child.headingLevel || child.tag === 'h1' || child.tag === 'h2');
  const actionCount = node.children.filter((child) => child.interactive || child.tag === 'a').length;
  return area > 120000 && node.rect.top < 900 && hasHeading && actionCount > 0;
}

function looksLikeForm(node: SnapshotNode) {
  const tags = flattenSnapshot(node).map((entry) => entry.tag);
  const controlCount = tags.filter((tag) => ['input', 'select', 'textarea', 'button'].includes(tag)).length;
  return node.tag === 'form' || controlCount >= 2;
}

function looksLikeSidebar(node: SnapshotNode, viewportWidth: number) {
  const widthRatio = node.rect.width / Math.max(1, viewportWidth);
  return widthRatio > 0.14 && widthRatio < 0.32 && node.rect.height > 240 && node.rect.top < 1600;
}

function looksLikeModal(node: SnapshotNode, viewport: SnapshotDocument['page']['viewport']) {
  return (
    ['fixed', 'absolute'].includes(node.styles.position) &&
    node.rect.width > viewport.width * 0.45 &&
    node.rect.height > viewport.height * 0.25 &&
    parsePx(node.styles.zIndex) >= 10
  );
}

function looksLikeCard(node: SnapshotNode) {
  const area = nodeArea(node);
  return area > 12000 && area < 240000 && (parsePx(node.styles.borderRadius) > 0 || node.styles.boxShadow !== 'none');
}

function labelForRegion(type: LayoutRegion['type'], node: SnapshotNode) {
  switch (type) {
    case 'header':
      return 'Header';
    case 'navbar':
      return 'Navigation';
    case 'hero':
      return 'Hero';
    case 'main':
      return 'Main Content';
    case 'cta':
      return 'Call To Action';
    case 'card-grid':
      return 'Card Grid';
    case 'form':
      return 'Form';
    case 'sidebar':
      return 'Sidebar';
    case 'footer':
      return 'Footer';
    case 'modal':
      return 'Modal';
    default:
      return node.tag;
  }
}

function stripNodeReference(component: ComponentCandidate) {
  const { node: _node, ...rest } = component;
  return rest;
}
