export type JobStatus =
  | 'queued'
  | 'validating'
  | 'capturing'
  | 'analyzing'
  | 'distilling'
  | 'packaging'
  | 'complete'
  | 'failed';

export type LogLevel = 'info' | 'success' | 'warn' | 'error' | 'system';

export interface ExtractionOptions {
  desktop: boolean;
  mobile: boolean;
  safeMode: boolean;
}

export interface JobLog {
  at: string;
  stage: JobStatus;
  level: LogLevel;
  message: string;
}

export interface ViewportConfig {
  id: 'desktop' | 'mobile';
  width: number;
  height: number;
  isMobile?: boolean;
  hasTouch?: boolean;
  deviceScaleFactor?: number;
  userAgent?: string;
}

export interface ViewportResult {
  id: string;
  width: number;
  height: number;
  screenshot: string;
  html?: string;
  aria?: string;
  dom?: string;
}

export interface SummaryStats {
  totalNodes: number;
  keptNodes: number;
  placeholders: number;
  components: number;
  layoutRegions: number;
  paletteSwatches: number;
  responsiveDifferences: number;
  networkRequests: number;
}

export interface KeyFiles {
  manifest: string;
  prompt: string;
  renderedHtml: string;
  ariaSnapshot: string;
  domSnapshot: string;
  cssUsage: string;
  networkLog: string;
  skeletonHtml: string;
  skeletonCss: string;
  placeholders: string;
  tokens: string;
  palette: string;
  typography: string;
  spacing: string;
  layout: string;
  components: string;
  download: string;
}

export interface JobRecord {
  id: string;
  url: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  progress: number;
  options: ExtractionOptions;
  outputDir: string;
  logs: JobLog[];
  error?: string;
  pageTitle?: string;
  finalUrl?: string;
  viewportsUsed: ViewportResult[];
  summaryStats?: SummaryStats;
  keyFiles?: KeyFiles;
}

export interface FileTreeEntry {
  path: string;
  name: string;
  type: 'file' | 'directory';
  children?: FileTreeEntry[];
  size?: number;
}

export interface NetworkEntry {
  url: string;
  method: string;
  resourceType: string;
  status?: number;
  contentType?: string | null;
  ok?: boolean;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  timing?: {
    startedAt: string;
    endedAt?: string;
  };
}

export interface SnapshotNode {
  id: string;
  pathKey: string;
  selector: string;
  tag: string;
  role?: string | null;
  ariaLabel?: string | null;
  text: string;
  textLength: number;
  interactive: boolean;
  visible: boolean;
  semantic: boolean;
  isTextBlock: boolean;
  imageLike: boolean;
  headingLevel?: number | null;
  attributes: Record<string, string>;
  classList: string[];
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
    top: number;
    left: number;
    right: number;
    bottom: number;
  };
  styles: Record<string, string>;
  children: SnapshotNode[];
}

export interface SnapshotDocument {
  page: {
    url: string;
    title: string;
    viewport: {
      width: number;
      height: number;
    };
    scrollHeight: number;
    scrollWidth: number;
  };
  root: SnapshotNode;
  nodeCount: number;
}

export interface ViewportCapture {
  viewport: ViewportConfig;
  html: string;
  accessibilityTree: unknown;
  domSnapshotRaw: unknown;
  snapshot: SnapshotDocument;
  cssUsage: unknown;
  screenshotPath: string;
}

export interface CaptureOutput {
  pageTitle: string;
  finalUrl: string;
  renderedHtmlPath: string;
  ariaSnapshotPath: string;
  domSnapshotPath: string;
  cssUsagePath: string;
  networkLogPath: string;
  sourceMetadataPath: string;
  viewports: ViewportCapture[];
  networkLog: NetworkEntry[];
}

export interface ComponentCandidate {
  id: string;
  label: string;
  type:
    | 'header'
    | 'navbar'
    | 'hero'
    | 'cta'
    | 'card'
    | 'card-grid'
    | 'form'
    | 'footer'
    | 'sidebar'
    | 'modal'
    | 'list'
    | 'component';
  selector: string;
  pathKey: string;
  occurrenceCount: number;
  sourceViewport: string;
  area: number;
  notes: string[];
  node: SnapshotNode;
  parentPathKey?: string;
}

export interface LayoutRegion {
  id: string;
  label: string;
  type:
    | 'header'
    | 'navbar'
    | 'hero'
    | 'main'
    | 'section'
    | 'cta'
    | 'card-grid'
    | 'form'
    | 'sidebar'
    | 'footer'
    | 'modal';
  selector: string;
  pathKey: string;
  notes: string[];
  rect: SnapshotNode['rect'];
}

export interface ResponsiveDifference {
  pathKey: string;
  selector: string;
  changes: string[];
}

export interface DesignOutput {
  tokens: Record<string, unknown>;
  palette: Record<string, unknown>;
  typography: Record<string, unknown>;
  spacing: Record<string, unknown>;
  layout: {
    page: Record<string, unknown>;
    regions: LayoutRegion[];
    responsiveDifferences: ResponsiveDifference[];
  };
  components: ComponentCandidate[];
  summary: SummaryStats;
}

export interface PlaceholderEntry {
  placeholder: string;
  kind: 'text' | 'image';
  selector: string;
  pathKey: string;
  replacement: string;
  originalPreview?: string;
  originalAlt?: string;
  dimensions?: {
    width: number;
    height: number;
  };
}

export interface DistillOutput {
  skeletonHtmlPath: string;
  skeletonCssPath: string;
  placeholdersPath: string;
  componentIndexPath: string;
  placeholders: PlaceholderEntry[];
  keptNodeCount: number;
  componentOutputPaths: string[];
}
