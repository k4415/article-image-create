"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from "react";
import { Play, RefreshCw, UploadCloud } from "lucide-react";
import { TEST_ARTICLE_URLS } from "@/lib/ingest/constants";
import type { IngestJob } from "@/lib/db/types";
import { calculateIngestProgressPercent } from "@/lib/ingest/progress";

type IngestResponse = {
  jobId: string;
  status: string;
};

export default function IngestPage() {
  const [urlsText, setUrlsText] = useState(TEST_ARTICLE_URLS.join("\n"));
  const [maxCandidatesPerUrl, setMaxCandidatesPerUrl] = useState("");
  const [jobs, setJobs] = useState<IngestJob[]>([]);
  const [result, setResult] = useState<IngestResponse | null>(null);
  const [activeJob, setActiveJob] = useState<IngestJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadJobs() {
    setJobsLoading(true);
    try {
      const response = await fetch("/api/jobs");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "ジョブ履歴の取得に失敗しました");
      setJobs(payload.jobs ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "ジョブ履歴の取得に失敗しました");
    } finally {
      setJobsLoading(false);
    }
  }

  async function loadJob(jobId: string) {
    const response = await fetch(`/api/jobs/${jobId}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "ジョブの取得に失敗しました");
    setActiveJob(payload.job);
    return payload.job as IngestJob;
  }

  async function submitIngest() {
    setLoading(true);
    setError("");
    setResult(null);
    const urls = urlsText
      .split(/\n+/)
      .map((url) => url.trim())
      .filter(Boolean);

    try {
      const parsedMaxCandidates = maxCandidatesPerUrl.trim() ? Number(maxCandidatesPerUrl) : undefined;
      const response = await fetch("/api/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ urls, maxCandidatesPerUrl: parsedMaxCandidates }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "取り込みに失敗しました");
      setResult(payload);
      await loadJob(payload.jobId);
      await loadJobs();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "取り込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadJobs();
  }, []);

  useEffect(() => {
    if (!result?.jobId) return;
    if (activeJob && !["queued", "running"].includes(activeJob.status)) return;

    const timer = window.setInterval(() => {
      void loadJob(result.jobId)
        .then((job) => {
          if (!["queued", "running"].includes(job.status)) {
            void loadJobs();
          }
        })
        .catch((pollError) => {
          setError(pollError instanceof Error ? pollError.message : "ジョブの取得に失敗しました");
        });
    }, 2000);

    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.jobId, activeJob?.status]);

  const isJobRunning = activeJob ? ["queued", "running"].includes(activeJob.status) : false;
  const activeProgress = activeJob
    ? calculateIngestProgressPercent({
        totalCandidates: activeJob.total_candidates,
        processedCandidates: activeJob.processed_candidates,
        totalUrls: activeJob.total_urls,
        processedUrls: activeJob.processed_urls,
      })
    : 0;
  const recentLogs = activeJob?.logs?.slice(-5).reverse() ?? [];

  return (
    <main className="min-h-[calc(100vh-56px)] bg-slate-50">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-5">
          <h1 className="text-xl font-semibold text-slate-950">URL追加</h1>
          <p className="mt-1 text-sm text-slate-500">記事LP内の画像・動画素材を抽出してSupabaseに保存します</p>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <label className="text-sm font-semibold text-slate-950">取り込みURL</label>
          <textarea
            value={urlsText}
            onChange={(event) => setUrlsText(event.target.value)}
            className="mt-3 h-72 w-full resize-y rounded-lg border border-slate-300 p-3 font-mono text-sm leading-6 outline-none focus:border-emerald-600"
          />
          <label className="mt-4 block text-sm font-semibold text-slate-950" htmlFor="max-candidates-per-url">
            1URLあたりの取り込み上限
          </label>
          <input
            id="max-candidates-per-url"
            type="number"
            min="1"
            max="500"
            placeholder="空欄で全件"
            value={maxCandidatesPerUrl}
            onChange={(event) => setMaxCandidatesPerUrl(event.target.value)}
            className="mt-2 w-48 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600"
          />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void submitIngest()}
              disabled={loading || isJobRunning}
              className="inline-flex items-center gap-2 rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
            >
              {loading || isJobRunning ? <RefreshCw className="animate-spin" size={16} /> : <Play size={16} />}
              取り込み実行
            </button>
            <button
              type="button"
              onClick={() => setUrlsText(TEST_ARTICLE_URLS.join("\n"))}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              <UploadCloud size={16} />
              テスト6URLを入れる
            </button>
          </div>

          {error ? <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div> : null}
          {activeJob ? (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-emerald-700">Job</p>
                  <p className="font-mono text-xs">{activeJob.id}</p>
                </div>
                <span className="rounded bg-white px-2 py-1 text-xs font-semibold text-emerald-800">{activeJob.status}</span>
              </div>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-white">
                <div className="h-full rounded-full bg-emerald-700 transition-all" style={{ width: `${activeProgress}%` }} />
              </div>
              <div className="mt-3 grid gap-2 text-xs sm:grid-cols-5">
                <span>進捗 {activeProgress}%</span>
                <span>
                  URL {activeJob.processed_urls}/{activeJob.total_urls}
                </span>
                <span>
                  候補 {activeJob.processed_candidates}/{activeJob.total_candidates}
                </span>
                <span>作成 {activeJob.created_assets}</span>
                <span>skip {activeJob.skipped_assets}</span>
              </div>
              <div className="mt-3 space-y-1 text-xs">
                <p className="font-semibold">{activeJob.current_step ?? "待機中"}</p>
                {activeJob.current_article_url ? <p className="break-all text-emerald-800">{activeJob.current_article_url}</p> : null}
                {activeJob.current_media_url ? <p className="break-all text-emerald-700">{activeJob.current_media_url}</p> : null}
              </div>
              {recentLogs.length > 0 ? (
                <div className="mt-3 max-h-32 space-y-1 overflow-y-auto rounded bg-white p-2 text-xs text-slate-600">
                  {recentLogs.map((entry, index) => (
                    <p key={`${entry.at}-${index}`}>
                      <span className="font-semibold">{String(entry.level ?? "info")}</span> {String(entry.message ?? "")}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          ) : result ? (
            <div className="mt-4 grid gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 sm:grid-cols-5">
              <div>
                <p className="text-xs text-emerald-700">Job</p>
                <p className="truncate font-semibold">{result.jobId}</p>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-950">ジョブ履歴</h2>
            <button
              type="button"
              onClick={() => void loadJobs()}
              className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              <RefreshCw className={jobsLoading ? "animate-spin" : ""} size={15} />
              更新
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {jobs.map((job) => (
              <div key={job.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{job.status}</span>
                  <span className="text-xs text-slate-500">{new Date(job.created_at).toLocaleString()}</span>
                </div>
                <p className="mt-2 truncate font-mono text-xs text-slate-500">{job.id}</p>
                <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                  <span>
                    候補 {job.processed_candidates}/{job.total_candidates}
                  </span>
                  <span>作成 {job.created_assets}</span>
                  <span>skip {job.skipped_assets}</span>
                  <span>失敗 {job.failed_assets}</span>
                </div>
              </div>
            ))}
            {jobs.length === 0 ? <p className="text-sm text-slate-500">履歴はまだありません</p> : null}
          </div>
        </aside>
      </section>
    </main>
  );
}
