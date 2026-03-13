import React from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  CheckSquare,
  FolderTree,
  Loader2,
  Square,
} from 'lucide-react';

import {
  formatDateTime,
  formatRelativeTime,
  formatStatusLabel,
  getJobStageIndex,
  getStatusMeta,
  statusSteps,
  stripProtocol,
} from '../lib/workspace.js';

export function SidebarJobCard({ job, active, onSelect, selectMode = false, selected = false, onToggleSelect }) {
  const status = getStatusMeta(job.status);
  const canSelect = job.status === 'complete' || job.status === 'failed';

  function handleClick() {
    if (selectMode && canSelect) {
      onToggleSelect();
    } else {
      onSelect(job);
    }
  }

  return (
    <button
      onClick={handleClick}
      className={`w-full rounded-[24px] border px-4 py-4 text-left transition ${
        selectMode && selected
          ? 'border-sky-300 bg-sky-50 shadow-[0_16px_30px_-28px_rgba(2,132,199,0.75)]'
          : active
            ? 'border-[var(--app-border-strong)] bg-sky-50 shadow-[0_16px_30px_-28px_rgba(2,132,199,0.75)]'
            : 'border-[var(--app-border)] bg-white/75 hover:border-[var(--app-border-strong)] hover:bg-white'
      } ${selectMode && !canSelect ? 'opacity-50 cursor-not-allowed' : ''}`}
      disabled={selectMode && !canSelect}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          {selectMode && canSelect && (
            <div className="mt-0.5 shrink-0">
              {selected ? (
                <CheckSquare className="h-4 w-4 text-sky-700" />
              ) : (
                <Square className="h-4 w-4 text-[var(--app-muted)]" />
              )}
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-[var(--app-text)]">{job.pageTitle || stripProtocol(job.finalUrl || job.url)}</div>
            <div className="mt-1 truncate text-xs text-[var(--app-muted)]">{stripProtocol(job.finalUrl || job.url)}</div>
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${status.tone}`}>
          {status.label}
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-[var(--app-muted)]">
        <span>{formatRelativeTime(job.updatedAt || job.createdAt)}</span>
        <span>{Math.round((job.progress || 0) * 100)}%</span>
      </div>
    </button>
  );
}

export function OptionToggle({ active, onClick, icon: Icon, label, detail }) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-[22px] border px-4 py-3 text-left transition ${active ? 'border-[var(--app-border-strong)] bg-sky-50 shadow-[0_14px_30px_-26px_rgba(2,132,199,0.85)]' : 'border-[var(--app-border)] bg-white hover:border-[var(--app-border-strong)]'}`}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 rounded-full p-2 ${active ? 'bg-sky-100 text-sky-700' : 'bg-[var(--app-card)] text-[var(--app-muted)]'}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-[var(--app-text)]">{label}</div>
            {active && <Check className="h-4 w-4 text-sky-700" />}
          </div>
          <div className="mt-1 text-sm leading-6 text-[var(--app-muted)]">{detail}</div>
        </div>
      </div>
    </button>
  );
}

export function FeatureCard({ icon: Icon, title, description }) {
  return (
    <div className="rounded-[26px] border border-[var(--app-border)] bg-[var(--app-card)] p-5">
      <div className="inline-flex rounded-full bg-white p-2.5 text-[var(--app-accent)] shadow-sm">
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div className="mt-4 text-base font-semibold text-[var(--app-text)]">{title}</div>
      <div className="mt-2 text-sm leading-6 text-[var(--app-muted)]">{description}</div>
    </div>
  );
}

export function InfoCard({ label, value }) {
  return (
    <div className="rounded-[22px] border border-[var(--app-border)] bg-[var(--app-card)] px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--app-muted)]">{label}</div>
      <div className="mt-2 text-sm font-semibold text-[var(--app-text)]">{value}</div>
    </div>
  );
}

export function StagePill({ job, step }) {
  const currentIndex = getJobStageIndex(job);
  const stepIndex = statusSteps.indexOf(step);
  const isComplete = job.status === 'complete' && stepIndex <= currentIndex;
  const isCurrent = job.status !== 'complete' && job.status !== 'failed' && stepIndex === currentIndex;
  const isDone = stepIndex < currentIndex;

  return (
    <div
      className={`rounded-2xl border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
        isCurrent
          ? 'border-sky-200 bg-sky-50 text-sky-800'
          : isDone || isComplete
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-[var(--app-border)] bg-[var(--app-card)] text-[var(--app-muted)]'
      }`}
    >
      {formatStatusLabel(step)}
    </div>
  );
}

export function MetricCard({ icon: Icon, label, value, note }) {
  return (
    <div className="rounded-[24px] border border-[var(--app-border)] bg-[var(--app-card)] p-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--app-muted)]">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-3 text-2xl font-semibold text-[var(--app-text)]">{value}</div>
      <div className="mt-2 text-sm leading-6 text-[var(--app-muted)]">{note}</div>
    </div>
  );
}

export function PendingArtifacts({ selectedJob, resultsLoaded }) {
  let title = 'Artifacts are generated after packaging finishes.';
  let description = 'The explorer will populate automatically once the pipeline writes the final artifact set.';

  if (selectedJob.status === 'complete' && !resultsLoaded) {
    title = 'Loading packaged artifacts...';
    description = 'The run is complete. AgentClassroom is now reading the saved files from disk.';
  }

  if (selectedJob.status === 'failed') {
    title = 'This job did not produce a complete artifact package.';
    description = 'Review the pipeline log to find the failure point, then rerun the extraction when the underlying issue is resolved.';
  }

  return (
    <div className="flex min-h-[620px] items-center justify-center px-6 py-10 text-center">
      <div className="max-w-lg">
        {selectedJob.status === 'complete' && !resultsLoaded ? (
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[var(--app-muted)]" />
        ) : (
          <FolderTree className="mx-auto h-8 w-8 text-[var(--app-muted)]" />
        )}
        <h4 className="mt-4 text-xl font-semibold text-[var(--app-text)]">{title}</h4>
        <p className="mt-3 text-sm leading-7 text-[var(--app-muted)]">{description}</p>
      </div>
    </div>
  );
}

export function StatusBadge({ status }) {
  const meta = getStatusMeta(status);

  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] ${meta.tone}`}>
      {status === 'complete' ? <CheckCircle2 className="h-3.5 w-3.5" /> : status === 'failed' ? <AlertCircle className="h-3.5 w-3.5" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {meta.label}
    </div>
  );
}

export function JobMetaGrid({ job }) {
  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      <InfoCard label="Created" value={formatDateTime(job.createdAt)} />
      <InfoCard label="Updated" value={formatDateTime(job.updatedAt)} />
      <InfoCard label="Progress" value={`${Math.round((job.progress || 0) * 100)}%`} />
      <InfoCard label="Archive" value={job.status === 'complete' ? 'Ready for download' : 'Published after packaging'} />
    </div>
  );
}
