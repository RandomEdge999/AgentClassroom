import React, { startTransition, useEffect, useRef, useState } from 'react';

import { ErrorBanner, EmptyWorkspace, Header, LaunchPanel, Sidebar } from './src/components/layout.jsx';
import { JobWorkspace } from './src/components/workspace-panels.jsx';
import { SkeletonWorkspace } from './src/components/Skeleton.jsx';
import { api } from './src/lib/api.js';
import {
  defaultConfig,
  filePriority,
  fileExists,
  findFirstExisting,
  getErrorMessage,
  isValidHttpUrl,
  prioritizeFiles,
  quickFileKeys,
  theme,
  upsertJob,
} from './src/lib/workspace.js';

export default function App() {
  const [url, setUrl] = useState('');
  const [config, setConfig] = useState(defaultConfig);
  const [jobs, setJobs] = useState([]);
  const [activeJobId, setActiveJobId] = useState(null);
  const [activeJob, setActiveJob] = useState(null);
  const [results, setResults] = useState(null);
  const [activeArtifact, setActiveArtifact] = useState(null);
  const [artifactContent, setArtifactContent] = useState(null);
  const [loadingArtifact, setLoadingArtifact] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [backendReady, setBackendReady] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const initialSelectionRef = useRef(false);
  const logScrollRef = useRef(null);

  const selectedJob = activeJob || jobs.find((job) => job.id === activeJobId) || null;
  const resultFiles = prioritizeFiles(results?.files || []);
  const summary = selectedJob?.summaryStats || results?.job?.summaryStats;
  const viewportsUsed = selectedJob?.viewportsUsed || results?.job?.viewportsUsed || [];
  const keyFiles = selectedJob?.keyFiles || results?.job?.keyFiles;
  const quickFiles = keyFiles
    ? quickFileKeys.map(([key, label]) => (keyFiles[key] ? { key, label, path: keyFiles[key] } : null)).filter(Boolean)
    : [];

  useEffect(() => {
    let ignore = false;
    async function bootstrap() {
      try {
        await api.health();
        if (!ignore) setBackendReady(true);
      } catch {
        if (!ignore) setBackendReady(false);
      }
      try {
        const data = await api.listJobs();
        if (ignore) return;
        const nextJobs = data.jobs || [];
        setJobs(nextJobs);
        if (!initialSelectionRef.current && nextJobs.length > 0) {
          initialSelectionRef.current = true;
          setActiveJobId(nextJobs[0].id);
        }
      } catch (err) {
        if (!ignore) setError(getErrorMessage(err, 'Failed to load existing jobs.'));
      } finally {
        if (!ignore) setBootstrapping(false);
      }
    }
    bootstrap();
    const timer = window.setInterval(bootstrap, 10000);
    return () => {
      ignore = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!activeJobId) {
      setActiveJob(null);
      return;
    }
    let ignore = false;
    let timeoutId;
    async function pollJob() {
      try {
        const { job } = await api.getJob(activeJobId);
        if (ignore) return;
        setActiveJob(job);
        setJobs((current) => upsertJob(current, job));
        if (job.status === 'complete') {
          const data = await api.getResults(activeJobId);
          if (!ignore) setResults(data);
        } else {
          if (!ignore) setResults(null);
          if (job.status !== 'failed') timeoutId = window.setTimeout(pollJob, 2000);
        }
      } catch (err) {
        if (!ignore) setError(getErrorMessage(err, 'Failed to load job status.'));
      }
    }
    pollJob();
    return () => {
      ignore = true;
      window.clearTimeout(timeoutId);
    };
  }, [activeJobId]);

  useEffect(() => {
    if (!results?.files?.length) return;
    const preferredArtifact =
      (activeArtifact && fileExists(results.files, activeArtifact) && activeArtifact) ||
      findFirstExisting(results.files, filePriority) ||
      results.job?.keyFiles?.prompt ||
      'manifest.json';
    if (preferredArtifact && preferredArtifact !== activeArtifact) startTransition(() => setActiveArtifact(preferredArtifact));
  }, [activeArtifact, results]);

  useEffect(() => {
    if (!activeJobId || !activeArtifact) {
      setArtifactContent(null);
      return;
    }
    let ignore = false;
    async function loadArtifact() {
      try {
        setLoadingArtifact(true);
        setArtifactContent(null);
        const data = await api.getArtifactContent(activeJobId, activeArtifact);
        if (!ignore) setArtifactContent(data);
      } catch (err) {
        if (!ignore) setError(getErrorMessage(err, 'Failed to load artifact content.'));
      } finally {
        if (!ignore) setLoadingArtifact(false);
      }
    }
    loadArtifact();
    return () => {
      ignore = true;
    };
  }, [activeArtifact, activeJobId]);

  useEffect(() => {
    if (!logScrollRef.current || !selectedJob || selectedJob.status === 'complete' || selectedJob.status === 'failed') return;
    logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
  }, [selectedJob?.logs?.length, selectedJob?.status]);

  async function handleExtract() {
    const trimmedUrl = url.trim();
    if (!trimmedUrl || submitting) return;
    if (!isValidHttpUrl(trimmedUrl)) return setError('Enter a valid http:// or https:// URL before starting an extraction.');
    if (!config.desktop && !config.mobile) return setError('Enable at least one viewport before starting extraction.');
    initialSelectionRef.current = true;
    setSubmitting(true);
    setError(null);
    setCopied(false);
    try {
      const data = await api.createJob({ url: trimmedUrl, options: config });
      startTransition(() => {
        setActiveJobId(data.job.id);
        setActiveJob(data.job);
        setResults(null);
        setActiveArtifact(null);
        setArtifactContent(null);
        setJobs((current) => upsertJob(current, data.job));
      });
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to create a new extraction job.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopy() {
    const content = artifactContent?.raw || artifactContent?.content;
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Clipboard access failed. Copy the file directly from the artifact panel.');
    }
  }

  function handleSelectJob(job) {
    initialSelectionRef.current = true;
    setSidebarOpen(false);
    setError(null);
    setCopied(false);
    startTransition(() => {
      setUrl(job.url);
      setActiveJobId(job.id);
      setActiveJob(job);
      setResults(null);
      setActiveArtifact(null);
      setArtifactContent(null);
    });
  }

  function handleSelectArtifact(path) {
    setCopied(false);
    startTransition(() => setActiveArtifact(path));
  }

  function resetView() {
    initialSelectionRef.current = true;
    setSidebarOpen(false);
    setUrl('');
    setActiveJobId(null);
    setActiveJob(null);
    setResults(null);
    setActiveArtifact(null);
    setArtifactContent(null);
    setCopied(false);
    setError(null);
  }

  async function handleCancelJob(jobId) {
    try {
      const data = await api.cancelJob(jobId);
      startTransition(() => {
        setActiveJob(data.job);
        setJobs((current) => upsertJob(current, data.job));
      });
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to cancel job.'));
    }
  }

  async function handleDeleteJob(jobId) {
    try {
      await api.deleteJob(jobId);
      startTransition(() => {
        setJobs((current) => current.filter((j) => j.id !== jobId));
        if (activeJobId === jobId) {
          resetView();
        }
      });
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to delete job.'));
    }
  }

  async function refreshJobs() {
    try {
      const data = await api.listJobs();
      const nextJobs = data.jobs || [];
      setJobs(nextJobs);
      if (activeJobId && !nextJobs.find(j => j.id === activeJobId)) {
        resetView();
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to refresh jobs.'));
    }
  }

  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--app-text)]" style={{ fontFamily: theme.fontSans }}>
      {sidebarOpen && <button className="fixed inset-0 z-20 bg-slate-950/35 lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Close job sidebar" />}
      <div className="mx-auto min-h-screen max-w-[1800px] lg:grid lg:grid-cols-[320px_minmax(0,1fr)]">
        <Sidebar jobs={jobs} activeJobId={activeJobId} onReset={resetView} onSelect={handleSelectJob} open={sidebarOpen} setSidebarOpen={setSidebarOpen} loading={bootstrapping} onDeleteJobs={refreshJobs} />
        <main className="min-w-0">
          <Header backendReady={backendReady} setSidebarOpen={setSidebarOpen} />
          <div className="px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-7xl flex-col gap-6">
              <LaunchPanel url={url} setUrl={setUrl} config={config} setConfig={setConfig} submitting={submitting} handleExtract={handleExtract} />
              {error && <ErrorBanner message={error} />}
              {selectedJob ? (
                <JobWorkspace activeArtifact={activeArtifact} activeJobId={activeJobId} artifactContent={artifactContent} copied={copied} handleCopy={handleCopy} handleSelectArtifact={handleSelectArtifact} loadingArtifact={loadingArtifact} logScrollRef={logScrollRef} quickFiles={quickFiles} resultFiles={resultFiles} results={results} selectedJob={selectedJob} summary={summary} viewportsUsed={viewportsUsed} onCancelJob={handleCancelJob} onDeleteJob={handleDeleteJob} />
              ) : (
                <EmptyWorkspace bootstrapping={bootstrapping} jobs={jobs} />
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
