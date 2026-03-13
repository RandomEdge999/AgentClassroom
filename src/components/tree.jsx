import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  FileImage,
  FileJson,
  FileText,
  FolderTree,
} from 'lucide-react';

export function TreeNode({ entry, activePath, onSelect, level = 0 }) {
  const [open, setOpen] = useState(level < 1);

  if (entry.type === 'directory') {
    return (
      <div>
        <button
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center gap-2 py-2 pr-3 text-sm text-[var(--app-text)] transition hover:bg-white/70"
          style={{ paddingLeft: `${14 + level * 16}px` }}
        >
          {open ? <ChevronDown className="h-3.5 w-3.5 text-[var(--app-muted)]" /> : <ChevronRight className="h-3.5 w-3.5 text-[var(--app-muted)]" />}
          <FolderTree className="h-4 w-4 text-[var(--app-muted)]" />
          <span className="truncate font-medium">{entry.name}</span>
        </button>

        {open &&
          entry.children?.map((child) => (
            <TreeNode key={child.path} entry={child} activePath={activePath} onSelect={onSelect} level={level + 1} />
          ))}
      </div>
    );
  }

  const Icon = /\.(png|jpg|jpeg|gif|webp)$/i.test(entry.name)
    ? FileImage
    : /\.json$/i.test(entry.name)
      ? FileJson
      : /\.md$/i.test(entry.name)
        ? FileText
        : FileCode2;

  const active = activePath === entry.path;

  return (
    <button
      onClick={() => onSelect(entry.path)}
      className={`flex w-full items-center gap-2 py-2 pr-3 text-sm transition ${active ? 'bg-sky-50 font-semibold text-sky-800' : 'text-[var(--app-text)] hover:bg-white/70'}`}
      style={{ paddingLeft: `${34 + level * 16}px` }}
    >
      <Icon className="h-4 w-4 shrink-0 text-[var(--app-muted)]" />
      <span className="truncate">{entry.name}</span>
    </button>
  );
}

export function CodePanel({ content, fontMono }) {
  const lines = content.split('\n');

  return (
    <div className="flex h-full overflow-hidden bg-white">
      <div
        aria-hidden="true"
        className="w-14 shrink-0 border-r border-[var(--app-border)] bg-[var(--app-code-gutter)] px-2 py-4 text-right text-[12px] text-[var(--app-muted)]"
        style={{ fontFamily: fontMono }}
      >
        {lines.map((_, index) => (
          <div key={index} className="leading-6 opacity-70">
            {index + 1}
          </div>
        ))}
      </div>

      <div className="ide-scroll flex-1 overflow-auto p-4">
        <pre className="m-0 whitespace-pre-wrap text-[13px] leading-6 text-[var(--app-text)]" style={{ fontFamily: fontMono }}>
          {content}
        </pre>
      </div>
    </div>
  );
}
