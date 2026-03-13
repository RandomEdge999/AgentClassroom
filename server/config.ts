import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ViewportConfig } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT_DIR = path.resolve(__dirname, '..');
export const STORAGE_DIR = path.join(ROOT_DIR, 'storage', 'jobs');
export const CLIENT_DIST_DIR = path.join(ROOT_DIR, 'dist');
export const SERVER_PORT = Number(process.env.PORT || 8787);

export const VIEWPORTS: Record<'desktop' | 'mobile', ViewportConfig> = {
  desktop: {
    id: 'desktop',
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
  },
  mobile: {
    id: 'mobile',
    width: 390,
    height: 844,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  },
};

export const SNAPSHOT_STYLE_PROPERTIES = [
  'display',
  'position',
  'color',
  'background-color',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'letter-spacing',
  'text-transform',
  'text-align',
  'border-top-width',
  'border-top-color',
  'border-radius',
  'box-shadow',
  'gap',
  'justify-content',
  'align-items',
  'flex-direction',
  'grid-template-columns',
  'grid-template-rows',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'max-width',
  'min-height',
  'width',
  'height',
  'opacity',
  'z-index',
];
