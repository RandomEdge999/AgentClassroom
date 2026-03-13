import crypto from 'node:crypto';

import type { SnapshotNode } from '../types.js';

export function createJobId() {
  const date = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const suffix = crypto.randomBytes(3).toString('hex');
  return `job-${date}-${suffix}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function parsePx(value?: string | null) {
  if (!value) return 0;
  if (value === 'normal') return 0;
  const match = value.match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

export function normalizeColor(input?: string | null) {
  if (!input) return '';
  const value = input.trim().toLowerCase();
  if (!value || value === 'transparent' || value === 'rgba(0, 0, 0, 0)' || value === 'rgba(0,0,0,0)' || value === 'none') {
    return '';
  }

  const rgbMatch = value.match(/rgba?\(([^)]+)\)/);
  if (!rgbMatch) {
    return value;
  }

  const parts = rgbMatch[1]
    .split(',')
    .map((part) => part.trim())
    .map(Number);

  if (parts.length < 3) {
    return value;
  }

  const [r, g, b, a] = parts;
  const hex = `#${[r, g, b]
    .map((channel) => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, '0'))
    .join('')}`;

  if (Number.isFinite(a) && a < 1) {
    return `${hex}${Math.round(a * 255)
      .toString(16)
      .padStart(2, '0')}`;
  }

  return hex;
}

export function pushCount(counter: Map<string, number>, rawValue?: string | null) {
  const value = (rawValue || '').trim();
  if (!value) return;
  counter.set(value, (counter.get(value) || 0) + 1);
}

export function topCounts(counter: Map<string, number>, limit = 8) {
  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

export function truncate(value: string, limit = 120) {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1).trimEnd()}...`;
}

export function nodeArea(node: SnapshotNode) {
  return Math.max(0, node.rect.width) * Math.max(0, node.rect.height);
}

export function selectorToClassName(selector: string) {
  const base = selector
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return base ? `ac-${base}` : `ac-node-${crypto.randomBytes(2).toString('hex')}`;
}
