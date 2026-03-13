import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowUp,
  Check,
  CheckCircle2,
  CheckSquare,
  Code2,
  Download,
  FolderTree,
  Globe,
  Loader2,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Smartphone,
  Square,
  Trash2,
  X,
} from 'lucide-react';

import { FeatureCard, OptionToggle, SidebarJobCard } from './ui.jsx';
import { SkeletonSidebar } from './Skeleton.jsx';
import { api } from '../lib/api.js';
import { theme } from '../lib/workspace.js';

export function Sidebar({ jobs, activeJobId, onReset, onSelect, open, setSidebarOpen, loading = false, onDeleteJobs }) {
  const [cleaning, setCleaning] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedJobs, setSelectedJobs] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const completedJobs = jobs.filter(j => j.status === 'complete' || j.status === 'failed');

  function toggleSelectMode() {
    setSelectMode(!selectMode);
    setSelectedJobs(new Set());
  }

  function toggleJobSelection(jobId) {
    setSelectedJobs(prev => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
  }

  function selectAll() {
    if (selectedJobs.size === completedJobs.length) {
      setSelectedJobs(new Set());
    } else {
      setSelectedJobs(new Set(completedJobs.map(j => j.id)));
    }
  }

  async function handleDeleteSelected() {
    if (selectedJobs.size === 0 || deleting) return;
    const count = selectedJobs.size;
    if (!window.confirm(`Delete ${count} selected ${count === 1 ? 'job' : 'jobs'}? This action cannot be undone.`)) return;
    setDeleting(true);
    try {
      const promises = Array.from(selectedJobs).map(id => api.deleteJob(id));
      await Promise.all(promises);
      setSelectedJobs(new Set());
      setSelectMode(false);
      if (onDeleteJobs) onDeleteJobs();
    } catch (err) {
      alert('Failed to delete jobs: ' + (err.message || 'Unknown error'));
    } finally {
      setDeleting(false);
    }
  }

  async function handleClearAll() {
    if (completedJobs.length === 0 || deleting) return;
    if (!window.confirm(`Clear all ${completedJobs.length} completed/failed jobs? This action cannot be undone.`)) return;
    setDeleting(true);
    try {
      const promises = completedJobs.map(j => api.deleteJob(j.id));
      await Promise.all(promises);
      setSelectedJobs(new Set());
      setSelectMode(false);
      if (onDeleteJobs) onDeleteJobs();
    } catch (err) {
      alert('Failed to clear history: ' + (err.message || 'Unknown error'));
    } finally {
      setDeleting(false);
    }
  }

  async function handleCleanup() {
    if (cleaning || completedJobs.length === 0) return;
    if (!window.confirm(`Clean up old jobs? This will keep the 10 most recent jobs and delete ${Math.max(0, completedJobs.length - 10)} older jobs.`)) return;
    setCleaning(true);
    try {
      await api.cleanupJobs(10);
      if (onDeleteJobs) onDeleteJobs();
    } catch (err) {
      alert('Failed to cleanup jobs: ' + (err.message || 'Unknown error'));
    } finally {
      setCleaning(false);
    }
  }

  return (
    <aside className={`fixed inset-y-0 left-0 z-30 w-80 max-w-[88vw] border-r border-[var(--app-border)] bg-[var(--app-panel)] shadow-2xl transition-transform duration-300 lg:sticky lg:top-0 lg:h-screen lg:w-auto lg:max-w-none lg:translate-x-0 lg:shadow-none ${open ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex h-full flex-col">
        <div className="border-b border-[var(--app-border)] px-5 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--app-muted)]">Workspace</p>
              <h2 className="mt-2 text-2xl tracking-tight text-[var(--app-text)]" style={{ fontFamily: theme.fontDisplay }}>AgentClassroom</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">Review previous runs or reopen any generated artifact package.</p>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="rounded-full border border-[var(--app-border)] bg-white/80 p-2 text-[var(--app-muted)] transition hover:border-[var(--app-border-strong)] hover:text-[var(--app-text)] lg:hidden" aria-label="Close job sidebar">
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>
          <button onClick={onReset} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--app-accent)] px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_35px_-22px_rgba(14,116,144,0.85)] transition hover:bg-[var(--app-accent-strong)]">
            <Plus className="h-4 w-4" />
            New extraction
          </button>
        </div>
        <div className="ide-scroll flex-1 overflow-y-auto px-4 py-4">
          <div className="mb-3 flex items-center justify-between px-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--app-muted)]">Recent jobs</div>
              <div className="mt-2 text-sm text-[var(--app-muted)]">
                {loading ? 'Loading jobs...' : jobs.length === 0 ? 'No completed or in-flight jobs yet.' : `${jobs.length} saved ${jobs.length === 1 ? 'run' : 'runs'} available locally.`}
              </div>
            </div>
            {completedJobs.length > 0 && (
              <div className="flex gap-1">
                {selectMode ? (
                  <>
                    <button
                      onClick={toggleSelectMode}
                      className="rounded-full border border-[var(--app-border)] bg-white/80 p-2 text-[var(--app-muted)] transition hover:border-[var(--app-border-strong)] hover:text-[var(--app-text)]"
                      title="Cancel selection"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={toggleSelectMode}
                      className="rounded-full border border-[var(--app-border)] bg-white/80 p-2 text-[var(--app-muted)] transition hover:border-[var(--app-border-strong)] hover:text-[var(--app-text)]"
                      title="Select jobs to delete"
                    >
                      <CheckSquare className="h-4 w-4" />
                    </button>
                    {completedJobs.length > 10 && (
                      <button
                        onClick={handleCleanup}
                        disabled={cleaning}
                        className="rounded-full border border-[var(--app-border)] bg-white/80 p-2 text-[var(--app-muted)] transition hover:border-amber-200 hover:text-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
                        title="Clean up old jobs (keep 10 most recent)"
                      >
                        {cleaning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Selection mode toolbar */}
          {selectMode && completedJobs.length > 0 && (
            <div className="mb-3 flex items-center justify-between rounded-2xl border border-[var(--app-border)] bg-white/75 px-3 py-2">
              <button
                onClick={selectAll}
                className="flex items-center gap-2 text-xs font-semibold text-[var(--app-text)] transition hover:text-sky-700"
              >
                {selectedJobs.size === completedJobs.length ? (
                  <CheckSquare className="h-4 w-4 text-sky-700" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
                {selectedJobs.size === completedJobs.length ? 'Deselect all' : 'Select all'}
              </button>
              <div className="flex gap-2">
                <span className="text-xs text-[var(--app-muted)]">{selectedJobs.size} selected</span>
                <button
                  onClick={handleDeleteSelected}
                  disabled={selectedJobs.size === 0 || deleting}
                  className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  Delete
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <SkeletonSidebar count={3} />
          ) : jobs.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[var(--app-border)] bg-white/75 px-5 py-6 text-sm leading-6 text-[var(--app-muted)]">
              Start an extraction from the main workspace. Every run is written to the local `storage/jobs` directory with its full artifact set.
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <SidebarJobCard
                  key={job.id}
                  job={job}
                  active={job.id === activeJobId}
                  onSelect={onSelect}
                  selectMode={selectMode}
                  selected={selectedJobs.has(job.id)}
                  onToggleSelect={() => toggleJobSelection(job.id)}
                />
              ))}
            </div>
          )}

          {/* Clear all button at bottom */}
          {selectMode && completedJobs.length > 0 && (
            <div className="mt-4 border-t border-[var(--app-border)] pt-4">
              <button
                onClick={handleClearAll}
                disabled={deleting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Clear all history ({completedJobs.length} jobs)
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

export function Header({ backendReady, setSidebarOpen }) {
  return (
    <header className="sticky top-0 z-10 border-b border-[var(--app-border)] bg-[color:rgba(245,241,234,0.88)] backdrop-blur">
      <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="rounded-full border border-[var(--app-border)] bg-white/80 p-2 text-[var(--app-muted)] transition hover:border-[var(--app-border-strong)] hover:text-[var(--app-text)] lg:hidden" aria-label="Open job sidebar">
            <PanelLeftOpen className="h-4 w-4" />
          </button>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--app-muted)]">Local-first extraction studio</div>
            <h1 className="mt-1 text-2xl tracking-tight text-[var(--app-text)]" style={{ fontFamily: theme.fontDisplay }}>AgentClassroom</h1>
          </div>
        </div>
        <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${backendReady ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
          {backendReady ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
          {backendReady ? 'Local engine online' : 'Backend unavailable'}
        </div>
      </div>
    </header>
  );
}

export function LaunchPanel({ url, setUrl, config, setConfig, submitting, handleExtract }) {
  return (
    <section className="overflow-hidden rounded-[32px] border border-[var(--app-border)] bg-[var(--app-card-strong)] shadow-[0_28px_70px_-45px_rgba(15,23,42,0.45)]">
      <div className="grid gap-6 px-4 py-4 sm:px-6 sm:py-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)] lg:gap-8 lg:px-8 lg:py-8">
        <div className="max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--app-muted)]">Launch-ready workflow</p>
          <h2 className="mt-3 text-2xl tracking-tight text-[var(--app-text)] sm:text-3xl lg:text-4xl" style={{ fontFamily: theme.fontDisplay }}>Capture a live page and export a clean reconstruction brief.</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--app-muted)] sm:mt-4 sm:text-[15px] sm:leading-7">Each run records rendered HTML, screenshots, accessibility data, network activity, distilled HTML and CSS, and a packaged skillpack that can be audited before it ships.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <FeatureCard icon={Globe} title="Live Chromium capture" description="Inspect the real rendered page instead of guessing from source HTML alone." />
            <FeatureCard icon={Code2} title="Deterministic outputs" description="Review prompt files, layout data, tokens, and skeleton markup without hidden model steps." />
            <FeatureCard icon={FolderTree} title="Local artifact storage" description="Every job stays on disk so launch teams can compare runs and keep a paper trail." />
          </div>
        </div>
        <div className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-card)] p-4 sm:p-5">
          <div className="text-sm font-semibold text-[var(--app-text)]">New extraction</div>
          <p className="mt-1 text-sm leading-6 text-[var(--app-muted)]">Paste a public URL and choose the viewports you want packaged into the final artifact set.</p>
          <label htmlFor="page-url" className="mt-4 block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--app-muted)] sm:mt-5">Page URL</label>
          <div className="mt-2 rounded-2xl border border-[var(--app-border)] bg-white px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] focus-within:border-[var(--app-border-strong)] focus-within:ring-2 focus-within:ring-sky-500/10">
            <input id="page-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && handleExtract()} placeholder="https://your-website.com" className="w-full border-0 bg-transparent text-[15px] text-[var(--app-text)] placeholder:text-[var(--app-muted)] focus:outline-none" disabled={submitting} autoComplete="off" spellCheck="false" />
          </div>
          <div className="mt-4 grid gap-3 sm:mt-5">
            <OptionToggle active={config.safeMode} onClick={() => setConfig((current) => ({ ...current, safeMode: !current.safeMode }))} icon={CheckCircle2} label="Safe mode" detail="Preserve layout and UI labels while replacing content-heavy copy with placeholders." />
            <div className="grid gap-3 sm:grid-cols-2">
              <OptionToggle active={config.desktop} onClick={() => setConfig((current) => ({ ...current, desktop: !current.desktop }))} icon={Monitor} label="Desktop capture" detail="Include a 1440px-wide rendered snapshot and desktop-oriented structure data." />
              <OptionToggle active={config.mobile} onClick={() => setConfig((current) => ({ ...current, mobile: !current.mobile }))} icon={Smartphone} label="Mobile capture" detail="Compare the page at 390px width and record responsive behavior changes." />
            </div>
          </div>
          <button onClick={handleExtract} disabled={!url.trim() || submitting} className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition sm:mt-5 ${url.trim() && !submitting ? 'bg-[var(--app-text)] text-white shadow-[0_24px_40px_-26px_rgba(15,23,42,0.8)] hover:bg-slate-800' : 'cursor-not-allowed bg-[var(--app-disabled)] text-[var(--app-muted)]'}`}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            {submitting ? 'Submitting extraction...' : 'Start extraction'}
          </button>
          <p className="mt-3 text-xs leading-5 text-[var(--app-muted)]">Runs locally with Playwright and deterministic heuristics. Confirm that the target page permits automated capture before launching a job.</p>
        </div>
      </div>
    </section>
  );
}

export function ErrorBanner({ message }) {
  return (
    <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm leading-6 text-red-700">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>{message}</div>
      </div>
    </div>
  );
}

export function EmptyWorkspace({ bootstrapping, jobs }) {
  if (bootstrapping) {
    return (
      <section className="rounded-[32px] border border-[var(--app-border)] bg-[var(--app-card-strong)] px-6 py-8 shadow-[0_22px_55px_-40px_rgba(15,23,42,0.45)] sm:px-8">
        <div className="max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--app-muted)]">Workspace</p>
          <h3 className="mt-3 text-3xl tracking-tight text-[var(--app-text)]" style={{ fontFamily: theme.fontDisplay }}>Loading saved jobs...</h3>
          <p className="mt-4 text-[15px] leading-7 text-[var(--app-muted)] sm:text-base">AgentClassroom is checking the local workspace and rebuilding the current session state.</p>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-[26px] border border-[var(--app-border)] bg-[var(--app-card)] p-5">
            <div className="h-10 w-10 animate-pulse rounded-full bg-gray-200" />
            <div className="mt-4 h-5 w-32 animate-pulse rounded bg-gray-200" />
            <div className="mt-2 space-y-2">
              <div className="h-4 w-full animate-pulse rounded bg-gray-200" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200" />
            </div>
          </div>
          <div className="rounded-[26px] border border-[var(--app-border)] bg-[var(--app-card)] p-5">
            <div className="h-10 w-10 animate-pulse rounded-full bg-gray-200" />
            <div className="mt-4 h-5 w-32 animate-pulse rounded bg-gray-200" />
            <div className="mt-2 space-y-2">
              <div className="h-4 w-full animate-pulse rounded bg-gray-200" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200" />
            </div>
          </div>
          <div className="rounded-[26px] border border-[var(--app-border)] bg-[var(--app-card)] p-5">
            <div className="h-10 w-10 animate-pulse rounded-full bg-gray-200" />
            <div className="mt-4 h-5 w-32 animate-pulse rounded bg-gray-200" />
            <div className="mt-2 space-y-2">
              <div className="h-4 w-full animate-pulse rounded bg-gray-200" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200" />
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-[32px] border border-[var(--app-border)] bg-[var(--app-card-strong)] px-6 py-8 shadow-[0_22px_55px_-40px_rgba(15,23,42,0.45)] sm:px-8">
      <div className="max-w-3xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--app-muted)]">Workspace</p>
        <h3 className="mt-3 text-3xl tracking-tight text-[var(--app-text)]" style={{ fontFamily: theme.fontDisplay }}>{jobs.length > 0 ? 'Ready for the next extraction.' : 'No saved jobs yet.'}</h3>
        <p className="mt-4 text-[15px] leading-7 text-[var(--app-muted)] sm:text-base">{jobs.length > 0 ? 'Select a previous job from the sidebar or start a fresh extraction above. The redesigned workspace keeps packaging, previews, and logs in one place.' : 'Start your first run above. The app will package screenshots, structural captures, distilled files, and a downloadable archive into the local job folder.'}</p>
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <FeatureCard icon={Monitor} title="Production review" description="Inspect logs, screenshots, summary signals, and generated files without leaving the workspace." />
        <FeatureCard icon={Code2} title="Cleaner packaging" description="Open prompt, tokens, layout data, and distilled markup from a single artifact explorer." />
        <FeatureCard icon={Download} title="Ready to ship" description="Completed jobs expose a downloadable zip archive built for handoff and launch review." />
      </div>
    </section>
  );
}
