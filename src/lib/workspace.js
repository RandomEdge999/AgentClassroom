export const theme = {
  fontDisplay: '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", ui-serif, Georgia, serif',
  fontSans: '"Aptos", "Segoe UI", "Inter", ui-sans-serif, system-ui, sans-serif',
  fontMono: '"Cascadia Code", "JetBrains Mono", "Consolas", ui-monospace, SFMono-Regular, monospace',
};

export const defaultConfig = Object.freeze({
  desktop: true,
  mobile: true,
  safeMode: true,
});

export const statusSteps = ['queued', 'validating', 'capturing', 'analyzing', 'distilling', 'packaging', 'complete'];
export const filePriority = ['PROMPT.md', 'manifest.json', 'design/tokens.json', 'design/layout.json', 'distill/skeleton.html', 'distill/skeleton.css'];
export const quickFileKeys = [
  ['prompt', 'Prompt brief'],
  ['manifest', 'Manifest'],
  ['tokens', 'Design tokens'],
  ['layout', 'Layout map'],
  ['skeletonHtml', 'Skeleton HTML'],
  ['skeletonCss', 'Skeleton CSS'],
  ['components', 'Components index'],
];

export function getStatusMeta(status) {
  switch (status) {
    case 'complete':
      return {
        label: 'Complete',
        tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      };
    case 'failed':
      return {
        label: 'Failed',
        tone: 'border-red-200 bg-red-50 text-red-700',
      };
    default:
      return {
        label: 'In progress',
        tone: 'border-sky-200 bg-sky-50 text-sky-700',
      };
  }
}

export function formatStatusLabel(value) {
  return value.replace('-', ' ');
}

export function formatTime(value) {
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function formatDateTime(value) {
  return new Intl.DateTimeFormat([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function formatRelativeTime(value) {
  const diff = new Date(value).getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat([], { numeric: 'auto' });
  const minutes = Math.round(diff / 60000);

  if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');

  const hours = Math.round(diff / 3600000);
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');

  const days = Math.round(diff / 86400000);
  return rtf.format(days, 'day');
}

export function formatViewportName(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function stripProtocol(value = '') {
  return value.replace(/^https?:\/\//, '');
}

export function upsertJob(list, job) {
  return [job, ...list.filter((entry) => entry.id !== job.id)].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export function prioritizeFiles(entries) {
  const sorted = [...entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;

    const aIndex = filePriority.indexOf(a.path);
    const bIndex = filePriority.indexOf(b.path);

    if (aIndex !== -1 || bIndex !== -1) {
      return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
    }

    return a.name.localeCompare(b.name);
  });

  return sorted.map((entry) => (entry.type === 'directory' ? { ...entry, children: prioritizeFiles(entry.children || []) } : entry));
}

export function findFirstExisting(files, preferredPaths) {
  const allPaths = [];
  const walk = (entries) => {
    entries.forEach((entry) => {
      if (entry.type === 'file') {
        allPaths.push(entry.path);
      } else {
        walk(entry.children || []);
      }
    });
  };

  walk(files);
  return preferredPaths.find((path) => allPaths.includes(path)) || allPaths[0] || null;
}

export function fileExists(entries, candidatePath) {
  return entries.some((entry) => {
    if (entry.path === candidatePath) return true;
    return entry.type === 'directory' ? fileExists(entry.children || [], candidatePath) : false;
  });
}

export function countFiles(entries) {
  return entries.reduce((count, entry) => {
    if (entry.type === 'file') return count + 1;
    return count + countFiles(entry.children || []);
  }, 0);
}

export function isValidHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function getErrorMessage(error, fallback) {
  return error instanceof Error ? error.message : fallback;
}

export function getJobStageIndex(job) {
  if (!job) return -1;
  if (job.status === 'complete') return statusSteps.length - 1;
  if (job.status !== 'failed') return statusSteps.indexOf(job.status);

  const lastKnownStage = [...(job.logs || [])].reverse().find((log) => log.stage !== 'failed')?.stage;
  return Math.max(statusSteps.indexOf(lastKnownStage || 'queued'), 0);
}
