import path from 'node:path';

import type { Browser, Page } from 'playwright';
import { chromium } from 'playwright';
import YAML from 'yaml';

import { SNAPSHOT_STYLE_PROPERTIES, VIEWPORTS } from '../config.js';
import type {
  CaptureOutput,
  ExtractionOptions,
  NetworkEntry,
  SnapshotDocument,
  ViewportCapture,
  ViewportConfig,
} from '../types.js';
import { ensureDir, writeJson, writeText } from '../utils/fs.js';
import { nowIso } from '../utils/values.js';

const RESOURCE_EXTENSIONS = ['.css', '.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp', '.woff', '.woff2', '.ttf'];

const BASE_HEADERS = {
  'Accept-Language': 'en-US,en;q=0.9',
};

export async function captureJob(url: string, options: ExtractionOptions, outputDir: string): Promise<CaptureOutput> {
  const captureDir = path.join(outputDir, 'capture');
  const screenshotDir = path.join(captureDir, 'screenshots');
  const networkDir = path.join(captureDir, 'network');

  await Promise.all([ensureDir(captureDir), ensureDir(screenshotDir), ensureDir(networkDir)]);

  const requestedViewports: ViewportConfig[] = [];
  if (options.desktop) requestedViewports.push(VIEWPORTS.desktop);
  if (options.mobile) requestedViewports.push(VIEWPORTS.mobile);
  if (requestedViewports.length === 0) requestedViewports.push(VIEWPORTS.desktop);

  const networkLog = new Map<string, NetworkEntry>();
  const browser = await chromium.launch({ headless: true });

  try {
    const captures: ViewportCapture[] = [];
    let pageTitle = '';
    let finalUrl = url;

    for (const viewport of requestedViewports) {
      const capture = await captureViewport({
        browser,
        url,
        viewport,
        screenshotDir,
        networkLog,
      });

      captures.push(capture);
      if (!pageTitle) pageTitle = capture.snapshot.page.title;
      finalUrl = capture.snapshot.page.url;
    }

    const canonicalViewport = captures.find((entry) => entry.viewport.id === 'desktop') || captures[0];
    const renderedHtmlPath = path.join(captureDir, 'rendered.html');
    const ariaSnapshotPath = path.join(captureDir, 'aria_snapshot.yaml');
    const domSnapshotPath = path.join(captureDir, 'dom_snapshot.json');
    const cssUsagePath = path.join(captureDir, 'css_usage.json');
    const networkLogPath = path.join(networkDir, 'requests.json');
    const sourceMetadataPath = path.join(captureDir, 'source_metadata.json');

    await writeText(renderedHtmlPath, canonicalViewport.html);
    await writeText(
      ariaSnapshotPath,
      YAML.stringify(
        Object.fromEntries(
          captures.map((entry) => [entry.viewport.id, entry.accessibilityTree || { note: 'No accessibility tree available.' }])
        )
      )
    );
    await writeJson(domSnapshotPath, {
      capturedAt: nowIso(),
      snapshots: Object.fromEntries(
        captures.map((entry) => [
          entry.viewport.id,
          {
            page: entry.snapshot.page,
            rawDomSnapshot: entry.domSnapshotRaw,
            nodeTree: entry.snapshot,
          },
        ])
      ),
    });
    await writeJson(cssUsagePath, {
      capturedAt: nowIso(),
      viewports: Object.fromEntries(captures.map((entry) => [entry.viewport.id, entry.cssUsage])),
    });
    await writeJson(networkLogPath, [...networkLog.values()]);
    await writeJson(sourceMetadataPath, {
      requestedUrl: url,
      finalUrl,
      pageTitle,
      capturedAt: nowIso(),
      resourceExtensionsObserved: [
        ...new Set(
          [...networkLog.values()]
            .map((entry) => safeExtname(entry.url))
            .filter(Boolean)
        ),
      ],
      notableResources: [...networkLog.values()]
        .filter((entry) => RESOURCE_EXTENSIONS.includes(safeExtname(entry.url)))
        .slice(0, 40),
    });

    return {
      pageTitle,
      finalUrl,
      renderedHtmlPath,
      ariaSnapshotPath,
      domSnapshotPath,
      cssUsagePath,
      networkLogPath,
      sourceMetadataPath,
      viewports: captures,
      networkLog: [...networkLog.values()],
    };
  } finally {
    await browser.close();
  }
}

async function captureViewport({
  browser,
  url,
  viewport,
  screenshotDir,
  networkLog,
}: {
  browser: Browser;
  url: string;
  viewport: ViewportConfig;
  screenshotDir: string;
  networkLog: Map<string, NetworkEntry>;
}): Promise<ViewportCapture> {
  const context = await browser.newContext({
    viewport: {
      width: viewport.width,
      height: viewport.height,
    },
    isMobile: viewport.isMobile,
    hasTouch: viewport.hasTouch,
    deviceScaleFactor: viewport.deviceScaleFactor,
    userAgent: viewport.userAgent,
    extraHTTPHeaders: BASE_HEADERS,
  });

  const page = await context.newPage();
  bindNetworkLogging(page, networkLog);

  const client = await context.newCDPSession(page);
  await client.send('Accessibility.enable');
  await client.send('DOM.enable');
  await client.send('CSS.enable');
  await client.send('CSS.startRuleUsageTracking');

  // Use 'load' wait strategy with fallback - more reliable for JS-heavy sites
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  } catch {
    // If load times out, try with domcontentloaded
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  }
  
  // Wait for network to settle (best effort, don't fail if it doesn't)
  try {
    await page.waitForLoadState('networkidle', { timeout: 10000 });
  } catch {
    // Network didn't settle, but page is loaded enough to capture
  }
  
  // Additional wait for dynamic content
  await page.waitForTimeout(2000);
  
  // Scroll to trigger lazy-loaded content
  await autoScroll(page);
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);

  const html = await page.content();
  const accessibilityTree = await client.send('Accessibility.getFullAXTree');
  const domSnapshotRaw = await client.send('DOMSnapshot.captureSnapshot', {
    computedStyles: SNAPSHOT_STYLE_PROPERTIES,
    includeDOMRects: true,
    includePaintOrder: true,
  });
  const snapshot = await page.evaluate(buildSnapshot);
  const cssUsage = await client.send('CSS.takeCoverageDelta');
  await client.send('CSS.stopRuleUsageTracking');

  const screenshotPath = path.join(screenshotDir, `${viewport.id}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  await context.close();

  return {
    viewport,
    html,
    accessibilityTree,
    domSnapshotRaw,
    snapshot,
    cssUsage,
    screenshotPath,
  };
}

function bindNetworkLogging(page: Page, networkLog: Map<string, NetworkEntry>) {
  page.on('request', (request) => {
    const key = `${request.method()}:${request.url()}`;
    networkLog.set(key, {
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      requestHeaders: request.headers(),
      timing: {
        startedAt: nowIso(),
      },
    });
  });

  page.on('response', async (response) => {
    const request = response.request();
    const key = `${request.method()}:${request.url()}`;
    const previous = networkLog.get(key);
    const headers = response.headers();

    networkLog.set(key, {
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      status: response.status(),
      ok: response.ok(),
      contentType: headers['content-type'] || null,
      requestHeaders: previous?.requestHeaders || request.headers(),
      responseHeaders: headers,
      timing: {
        startedAt: previous?.timing?.startedAt || nowIso(),
        endedAt: nowIso(),
      },
    });
  });
}

async function autoScroll(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let traversed = 0;
      const step = Math.max(window.innerHeight * 0.75, 320);
      const timer = window.setInterval(() => {
        window.scrollBy(0, step);
        traversed += step;
        if (traversed + window.innerHeight >= document.body.scrollHeight) {
          window.clearInterval(timer);
          resolve();
        }
      }, 120);
    });
  });
}

function safeExtname(urlValue: string) {
  try {
    return path.extname(new URL(urlValue).pathname).toLowerCase();
  } catch {
    return '';
  }
}

function buildSnapshot(): SnapshotDocument {
  const styleKeys = [
    'display',
    'position',
    'color',
    'backgroundColor',
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
    'gap',
    'justifyContent',
    'alignItems',
    'flexDirection',
    'gridTemplateColumns',
    'gridTemplateRows',
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
    'opacity',
    'zIndex',
  ] as const;

  let nodeCount = 0;
  const maxNodes = 1600;

  const createSelector = (element: Element) => {
    if (!(element instanceof HTMLElement)) {
      return element.tagName.toLowerCase();
    }

    if (element.id) {
      return `#${CSS.escape(element.id)}`;
    }

    const segments: string[] = [];
    let current: Element | null = element;

    while (current && current !== document.body && segments.length < 6) {
      let segment = current.tagName.toLowerCase();
      const classList = [...current.classList]
        .filter((value) => value && !value.startsWith('hover:') && !value.startsWith('focus:'))
        .slice(0, 2);

      if (classList.length) {
        segment += classList.map((token) => `.${CSS.escape(token)}`).join('');
      } else if (current.parentElement) {
        const siblings = [...current.parentElement.children].filter((candidate) => candidate.tagName === current?.tagName);
        const index = siblings.indexOf(current) + 1;
        segment += `:nth-of-type(${index})`;
      }

      segments.unshift(segment);
      current = current.parentElement;
    }

    return ['body', ...segments].join(' > ');
  };

  const createPathKey = (element: Element) => {
    const segments: string[] = [];
    let current: Element | null = element;

    while (current) {
      const parent: Element | null = current.parentElement;
      let index = 1;
      if (parent) {
        index = [...parent.children].filter((candidate) => candidate.tagName === current?.tagName).indexOf(current) + 1;
      }
      segments.unshift(`${current.tagName.toLowerCase()}[${index}]`);
      current = parent;
    }

    return `/${segments.join('/')}`;
  };

  const collectNode = (element: Element): any => {
    if (nodeCount >= maxNodes) {
      return null;
    }

    const tag = element.tagName.toLowerCase();
    if (['script', 'style', 'noscript', 'template'].includes(tag)) {
      return null;
    }

    const computed = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const text = ('innerText' in element ? (element as HTMLElement).innerText : '')
      .replace(/\s+/g, ' ')
      .trim();
    const visible =
      computed.display !== 'none' &&
      computed.visibility !== 'hidden' &&
      Number(computed.opacity || '1') > 0 &&
      rect.width > 0 &&
      rect.height > 0;

    if (!visible && !['html', 'body'].includes(tag)) {
      return null;
    }

    nodeCount += 1;

    const attributes: Record<string, string> = {};
    for (const name of ['href', 'type', 'placeholder', 'alt', 'aria-label', 'src', 'name']) {
      const value = element.getAttribute(name);
      if (value) attributes[name] = value;
    }

    const styles = Object.fromEntries(styleKeys.map((key) => [key, computed[key]]));
    const role = element.getAttribute('role');
    const semantic = ['header', 'nav', 'main', 'section', 'footer', 'aside', 'form', 'button', 'input', 'select', 'textarea', 'ul', 'ol', 'li'].includes(tag);
    const interactive =
      ['button', 'input', 'select', 'textarea'].includes(tag) ||
      role === 'button' ||
      role === 'link' ||
      tag === 'a' ||
      !!(element as HTMLElement).onclick;
    const imageLike =
      tag === 'img' ||
      (styles.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
        styles.backgroundColor !== 'transparent' &&
        text.length === 0 &&
        rect.height > 80 &&
        rect.width > 80);
    const headingLevel = /^h[1-6]$/.test(tag) ? Number(tag[1]) : null;

    return {
      id: createPathKey(element),
      pathKey: createPathKey(element),
      selector: createSelector(element),
      tag,
      role,
      ariaLabel: element.getAttribute('aria-label'),
      text: text.slice(0, 240),
      textLength: text.length,
      interactive,
      visible,
      semantic,
      isTextBlock: ['p', 'article', 'blockquote'].includes(tag) || text.length > 140,
      imageLike,
      headingLevel,
      attributes,
      classList: [...element.classList].slice(0, 6),
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        top: Math.round(rect.top + window.scrollY),
        left: Math.round(rect.left + window.scrollX),
        right: Math.round(rect.right + window.scrollX),
        bottom: Math.round(rect.bottom + window.scrollY),
      },
      styles,
      children: [...element.children]
        .map((child) => collectNode(child))
        .filter(Boolean),
    };
  };

  return {
    page: {
      url: location.href,
      title: document.title,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      scrollHeight: document.documentElement.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
    },
    root: collectNode(document.body),
    nodeCount,
  };
}
