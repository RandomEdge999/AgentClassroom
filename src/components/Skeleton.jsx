import React from 'react';

export function SkeletonLine({ width = '100%', height = '16px', className = '' }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-gray-200 ${className}`}
      style={{ width, height }}
    />
  );
}

export function SkeletonBlock({ lines = 3, className = '' }) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine
          key={i}
          width={i === lines - 1 ? '60%' : '100%'}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className = '' }) {
  return (
    <div className={`rounded-[24px] border border-[var(--app-border)] bg-[var(--app-card)] p-4 ${className}`}>
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 animate-pulse rounded bg-gray-200" />
        <SkeletonLine width="80px" height="11px" />
      </div>
      <div className="mt-3">
        <SkeletonLine width="60px" height="24px" />
      </div>
      <div className="mt-2">
        <SkeletonLine width="120px" height="14px" />
      </div>
    </div>
  );
}

export function SkeletonJobCard({ className = '' }) {
  return (
    <div className={`rounded-[24px] border border-[var(--app-border)] bg-white/75 px-4 py-4 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <SkeletonLine width="70%" height="14px" />
          <div className="mt-2">
            <SkeletonLine width="50%" height="12px" />
          </div>
        </div>
        <SkeletonLine width="60px" height="20px" className="rounded-full" />
      </div>
      <div className="mt-4 flex items-center justify-between">
        <SkeletonLine width="80px" height="12px" />
        <SkeletonLine width="30px" height="12px" />
      </div>
    </div>
  );
}

export function SkeletonWorkspace({ className = '' }) {
  return (
    <div className={`grid gap-6 xl:grid-cols-[minmax(0,390px)_minmax(0,1fr)] ${className}`}>
      <div className="flex flex-col gap-6">
        {/* Job Details Panel */}
        <div className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-card-strong)] p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <SkeletonLine width="100px" height="11px" />
              <div className="mt-3">
                <SkeletonLine width="80%" height="24px" />
              </div>
              <div className="mt-3">
                <SkeletonLine width="60%" height="14px" />
              </div>
            </div>
            <SkeletonLine width="80px" height="24px" className="rounded-full" />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonLine key={i} width="100%" height="32px" className="rounded-2xl" />
            ))}
          </div>
        </div>

        {/* Summary Panel */}
        <div className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-card-strong)] p-6">
          <SkeletonLine width="80px" height="11px" />
          <div className="mt-2">
            <SkeletonLine width="150px" height="20px" />
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      </div>

      {/* Artifact Panel */}
      <div className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-card-strong)] p-6">
        <SkeletonLine width="120px" height="11px" />
        <div className="mt-3">
          <SkeletonLine width="180px" height="20px" />
        </div>
        <div className="mt-6">
          <SkeletonBlock lines={8} />
        </div>
      </div>
    </div>
  );
}

export function SkeletonSidebar({ count = 3, className = '' }) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonJobCard key={i} />
      ))}
    </div>
  );
}
