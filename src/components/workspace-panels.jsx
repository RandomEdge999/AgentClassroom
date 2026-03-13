import React, { useState } from 'react';
import {
  Code2,
  Copy,
  Download,
  ExternalLink,
  FileCode2,
  FolderTree,
  Globe,
  Loader2,
  MessageSquare,
  Smartphone,
  Trash2,
  XCircle,
} from 'lucide-react';

import { api } from '../lib/api.js';
import { countFiles, formatTime, formatViewportName, statusSteps, stripProtocol, theme } from '../lib/workspace.js';
import { PendingArtifacts, JobMetaGrid, MetricCard, StagePill, StatusBadge } from './ui.jsx';
import { CodePanel, TreeNode } from './tree.jsx';

export function JobWorkspace({ activeArtifact, activeJobId, artifactContent, copied, handleCopy, handleSelectArtifact, loadingArtifact, logScrollRef, quickFiles, resultFiles, results, selectedJob, summary, viewportsUsed, onCancelJob, onDeleteJob }) {
  return (
    <div className="grid gap-4 sm:gap-6 xl:grid-cols-[minmax(0,390px)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4 sm:gap-6">
        <JobDetailsPanel selectedJob={selectedJob} logScrollRef={logScrollRef} onCancelJob={onCancelJob} onDeleteJob={onDeleteJob} />
        <SummaryPanel summary={summary} />
        <ViewportPanel selectedJob={selectedJob} viewportsUsed={viewportsUsed} activeJobId={activeJobId} handleSelectArtifact={handleSelectArtifact} />
        <QuickFilesPanel quickFiles={quickFiles} activeArtifact={activeArtifact} handleSelectArtifact={handleSelectArtifact} />
      </div>
      <ArtifactPanel
        selectedJob={selectedJob}
        results={results}
        resultFiles={resultFiles}
        activeArtifact={activeArtifact}
        activeJobId={activeJobId}
        handleSelectArtifact={handleSelectArtifact}
        copied={copied}
        handleCopy={handleCopy}
        loadingArtifact={loadingArtifact}
        artifactContent={artifactContent}
      />
    </div>
  );
}

function JobDetailsPanel({ selectedJob, logScrollRef, onCancelJob, onDeleteJob }) {
  const [cancelling, setCancelling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  const emptyLogMessage =
    selectedJob.status === 'complete' || selectedJob.status === 'failed'
      ? 'Historical log lines were not persisted for this saved run.'
      : 'Waiting for pipeline output.';

  const canCancel = selectedJob.status !== 'complete' && selectedJob.status !== 'failed';
  const canDelete = selectedJob.status === 'complete' || selectedJob.status === 'failed';

  async function handleCancel() {
    if (cancelling || !onCancelJob) return;
    setCancelling(true);
    try {
      await onCancelJob(selectedJob.id);
    } finally {
      setCancelling(false);
    }
  }

  async function handleDelete() {
    if (deleting || !onDeleteJob) return;
    if (!window.confirm('Are you sure you want to delete this job? This action cannot be undone.')) return;
    setDeleting(true);
    try {
      await onDeleteJob(selectedJob.id);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-card-strong)] p-4 shadow-[0_22px_55px_-40px_rgba(15,23,42,0.5)] sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--app-muted)]">Current job</div>
          <h3 className="mt-2 truncate text-xl tracking-tight text-[var(--app-text)] sm:mt-3 sm:text-2xl" style={{ fontFamily: theme.fontDisplay }}>{selectedJob.pageTitle || stripProtocol(selectedJob.finalUrl || selectedJob.url)}</h3>
          <a href={selectedJob.finalUrl || selectedJob.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex max-w-full items-center gap-2 truncate text-sm text-sky-700 transition hover:text-sky-800 sm:mt-3">
            <Globe className="h-4 w-4 shrink-0" />
            <span className="truncate">{selectedJob.finalUrl || selectedJob.url}</span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          </a>
        </div>
        <StatusBadge status={selectedJob.status} />
      </div>
      <JobMetaGrid job={selectedJob} />
      
      {/* Action buttons */}
      <div className="mt-4 flex gap-2 sm:mt-5">
        {canCancel && (
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="inline-flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
            Cancel job
          </button>
        )}
        {canDelete && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="inline-flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete job
          </button>
        )}
      </div>

      <div className="mt-4 grid gap-2 sm:mt-6 sm:grid-cols-2">{statusSteps.map((step) => <StagePill key={step} job={selectedJob} step={step} />)}</div>
      {selectedJob.status === 'failed' && <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm leading-6 text-red-700 sm:mt-5"><div className="font-semibold">Job failed before packaging finished.</div><div className="mt-1">{selectedJob.error || 'The pipeline stopped without writing the final artifact package.'}</div></div>}
      <div className="mt-4 rounded-[24px] border border-[var(--app-border)] bg-[var(--app-card)] sm:mt-6">
        <div className="flex items-center justify-between border-b border-[var(--app-border)] px-4 py-3">
          <div className="text-sm font-semibold text-[var(--app-text)]">Pipeline log</div>
          <div className="text-xs font-semibold text-[var(--app-muted)]">{Math.round((selectedJob.progress || 0) * 100)}%</div>
        </div>
        <div ref={logScrollRef} className="ide-scroll max-h-[200px] overflow-y-auto px-4 py-3 sm:max-h-[280px]" style={{ fontFamily: theme.fontMono }}>
          {(selectedJob.logs || []).length === 0 ? (
            <div className="py-6 text-sm text-[var(--app-muted)]">{emptyLogMessage}</div>
          ) : (
            selectedJob.logs.map((log, index) => (
              <div key={`${log.at}-${index}`} className="mb-3 flex gap-3 text-[12px] leading-6 last:mb-0">
                <div className="shrink-0 text-[var(--app-muted)]">[{formatTime(log.at)}]</div>
                <div className={log.level === 'error' ? 'text-red-700' : log.level === 'success' ? 'text-emerald-700' : log.level === 'system' ? 'text-sky-700' : 'text-[var(--app-text)]'}>{log.message}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function SummaryPanel({ summary }) {
  return (
    <section className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-card-strong)] p-6 shadow-[0_22px_55px_-40px_rgba(15,23,42,0.5)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--app-muted)]">Summary</div>
      <h3 className="mt-2 text-xl text-[var(--app-text)]" style={{ fontFamily: theme.fontDisplay }}>Distillation signals</h3>
      {summary ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <MetricCard label="Nodes retained" value={`${summary.keptNodes} / ${summary.totalNodes}`} note="Structure preserved after filtering." icon={Code2} />
          <MetricCard label="Placeholders" value={summary.placeholders} note="Content replaced with stable slots." icon={FileCode2} />
          <MetricCard label="Components" value={summary.components} note="Repeated patterns surfaced for reuse." icon={FolderTree} />
          <MetricCard label="Regions" value={summary.layoutRegions} note="Major layout sections detected." icon={Globe} />
          <MetricCard label="Responsive deltas" value={summary.responsiveDifferences} note="Layout changes across selected breakpoints." icon={Smartphone} />
          <MetricCard label="Network requests" value={summary.networkRequests} note="Requests captured during render." icon={MessageSquare} />
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-[var(--app-border)] bg-[var(--app-card)] px-4 py-5 text-sm leading-6 text-[var(--app-muted)]">Summary metrics appear once analysis has enough capture data to compute them.</div>
      )}
    </section>
  );
}

function ViewportPanel({ selectedJob, viewportsUsed, activeJobId, handleSelectArtifact }) {
  return (
    <section className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-card-strong)] p-6 shadow-[0_22px_55px_-40px_rgba(15,23,42,0.5)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--app-muted)]">Captured viewports</div>
      <h3 className="mt-2 text-xl text-[var(--app-text)]" style={{ fontFamily: theme.fontDisplay }}>Source snapshots</h3>
      {viewportsUsed.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-[var(--app-border)] bg-[var(--app-card)] px-4 py-5 text-sm leading-6 text-[var(--app-muted)]">Screenshot previews appear after a completed run records the selected viewports.</div>
      ) : (
        <div className="mt-5 grid gap-4">
          {viewportsUsed.map((viewport) => (
            <button key={viewport.id} onClick={() => handleSelectArtifact(viewport.screenshot)} className="overflow-hidden rounded-[24px] border border-[var(--app-border)] bg-[var(--app-card)] text-left transition hover:border-[var(--app-border-strong)]">
              <div className="flex items-center justify-between border-b border-[var(--app-border)] px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-[var(--app-text)]">{formatViewportName(viewport.id)}</div>
                  <div className="text-xs text-[var(--app-muted)]">{viewport.width} x {viewport.height}</div>
                </div>
                <div className="text-xs font-semibold text-sky-700">Open screenshot</div>
              </div>
              {selectedJob.status === 'complete' && viewport.screenshot ? (
                <div className="bg-white p-3">
                  <img src={api.artifactUrl(activeJobId, viewport.screenshot)} alt={`${formatViewportName(viewport.id)} capture`} className="h-44 w-full rounded-2xl border border-[var(--app-border)] object-cover object-top" />
                </div>
              ) : (
                <div className="flex h-32 items-center justify-center bg-[var(--app-card)] text-sm text-[var(--app-muted)]">Preview available after packaging finishes.</div>
              )}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function QuickFilesPanel({ quickFiles, activeArtifact, handleSelectArtifact }) {
  return (
    <section className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-card-strong)] p-6 shadow-[0_22px_55px_-40px_rgba(15,23,42,0.5)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--app-muted)]">Key outputs</div>
      <h3 className="mt-2 text-xl text-[var(--app-text)]" style={{ fontFamily: theme.fontDisplay }}>Jump to important files</h3>
      {quickFiles.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-[var(--app-border)] bg-[var(--app-card)] px-4 py-5 text-sm leading-6 text-[var(--app-muted)]">Quick links appear after the job writes its packaged files.</div>
      ) : (
        <div className="mt-5 grid gap-3">
          {quickFiles.map((file) => (
            <button key={file.key} onClick={() => handleSelectArtifact(file.path)} className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition ${activeArtifact === file.path ? 'border-[var(--app-border-strong)] bg-sky-50 text-sky-800' : 'border-[var(--app-border)] bg-[var(--app-card)] text-[var(--app-text)] hover:border-[var(--app-border-strong)]'}`}>
              <span className="font-medium">{file.label}</span>
              <span className="truncate text-xs text-[var(--app-muted)]">{file.path}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function ArtifactPanel({ selectedJob, results, resultFiles, activeArtifact, activeJobId, handleSelectArtifact, copied, handleCopy, loadingArtifact, artifactContent }) {
  return (
    <section className="overflow-hidden rounded-[30px] border border-[var(--app-border)] bg-[var(--app-card-strong)] shadow-[0_28px_70px_-45px_rgba(15,23,42,0.45)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--app-border)] px-4 py-3 sm:px-5 sm:py-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--app-muted)]">Artifacts</div>
          <h3 className="mt-1 text-lg text-[var(--app-text)] sm:text-xl" style={{ fontFamily: theme.fontDisplay }}>Package explorer</h3>
        </div>
        {selectedJob.status === 'complete' ? (
          <a href={api.downloadUrl(activeJobId)} className="inline-flex items-center gap-2 rounded-2xl border border-[var(--app-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--app-text)] transition hover:border-[var(--app-border-strong)] sm:px-4">
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Download zip</span>
            <span className="sm:hidden">Zip</span>
          </a>
        ) : (
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--app-muted)]">After packaging</div>
        )}
      </div>
      {selectedJob.status === 'complete' && results ? (
        <div className="grid min-h-[500px] lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)]">
          <div className="border-b border-[var(--app-border)] bg-[var(--app-card)] lg:border-b-0 lg:border-r">
            <div className="border-b border-[var(--app-border)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--app-muted)]">{countFiles(results.files)} files</div>
            <div className="ide-scroll max-h-[400px] overflow-y-auto py-2 lg:max-h-none lg:h-[calc(100%-47px)]">{resultFiles.map((entry) => <TreeNode key={entry.path} entry={entry} activePath={activeArtifact} onSelect={handleSelectArtifact} />)}</div>
          </div>
          <div className="flex min-h-0 min-w-0 flex-col">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--app-border)] px-4 py-3">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--app-muted)]">Selected artifact</div>
                <div className="truncate text-sm font-semibold text-[var(--app-text)]">{activeArtifact || 'Choose a file'}</div>
              </div>
              <button onClick={handleCopy} disabled={!artifactContent || artifactContent.kind === 'image'} className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold transition ${!artifactContent || artifactContent.kind === 'image' ? 'cursor-not-allowed border-[var(--app-border)] bg-[var(--app-disabled)] text-[var(--app-muted)]' : 'border-[var(--app-border)] bg-white text-[var(--app-text)] hover:border-[var(--app-border-strong)]'}`}>
                <Copy className="h-4 w-4" />
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="min-h-0 flex-1 bg-white">
              {loadingArtifact ? (
                <div className="flex h-full items-center justify-center gap-2 text-sm text-[var(--app-muted)]"><Loader2 className="h-4 w-4 animate-spin" />Loading artifact...</div>
              ) : artifactContent?.kind === 'image' ? (
                <div className="ide-scroll h-full overflow-auto bg-[var(--app-card)] p-4"><img src={artifactContent.url} alt={activeArtifact} className="mx-auto max-w-full rounded-[24px] border border-[var(--app-border)] bg-white shadow-[0_16px_40px_-30px_rgba(15,23,42,0.45)]" /></div>
              ) : (
                <CodePanel content={artifactContent?.raw || artifactContent?.content || 'Select an artifact to inspect its contents.'} fontMono={theme.fontMono} />
              )}
            </div>
          </div>
        </div>
      ) : (
        <PendingArtifacts selectedJob={selectedJob} resultsLoaded={Boolean(results)} />
      )}
    </section>
  );
}
