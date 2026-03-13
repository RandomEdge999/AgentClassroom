import fs from 'node:fs/promises';
import path from 'node:path';

import type { FileTreeEntry } from '../types.js';

export async function ensureDir(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function writeJson(filePath: string, value: unknown) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

export async function writeText(filePath: string, value: string) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, value, 'utf8');
}

export async function readJson<T>(filePath: string): Promise<T> {
  const content = await fs.readFile(filePath, 'utf8');
  return JSON.parse(content) as T;
}

export async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function safeJoin(baseDir: string, requestedPath: string) {
  const resolved = path.resolve(baseDir, requestedPath);
  const normalizedBase = path.resolve(baseDir);

  if (!resolved.startsWith(normalizedBase)) {
    throw new Error('Requested path is outside of the job directory.');
  }

  return resolved;
}

export async function buildFileTree(rootDir: string, currentDir = rootDir): Promise<FileTreeEntry[]> {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  const results: FileTreeEntry[] = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === 'agentclassroom-skillpack.zip') {
      continue;
    }

    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = path.relative(rootDir, absolutePath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      results.push({
        path: relativePath,
        name: entry.name,
        type: 'directory',
        children: await buildFileTree(rootDir, absolutePath),
      });
      continue;
    }

    const stat = await fs.stat(absolutePath);
    results.push({
      path: relativePath,
      name: entry.name,
      type: 'file',
      size: stat.size,
    });
  }

  return results;
}
