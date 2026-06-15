export type ImageGenerationStatus = "queued" | "planning" | "generating" | "uploading" | "completed" | "failed";

export type ImageGenerationBatchStatus = "queued" | "running" | "completed" | "failed";

export type GenerationProgressSummary = {
  status: ImageGenerationBatchStatus;
  queuedCount: number;
  runningCount: number;
  completedCount: number;
  failedCount: number;
};

export function normalizeTargetLineIndexes(targetLineIndexes: number[], batchLimit: number) {
  const normalized = [...new Set(targetLineIndexes)].sort((a, b) => a - b);

  if (normalized.length === 0) {
    throw new Error("生成対象行を1行以上選択してください");
  }
  if (normalized.some((lineIndex) => !Number.isInteger(lineIndex) || lineIndex < 0)) {
    throw new Error("targetLineIndexes must contain zero-based line numbers");
  }
  if (normalized.length > batchLimit) {
    throw new Error(`生成対象行は最大${batchLimit}行まで選択できます`);
  }

  return normalized;
}

export async function runWithConcurrency<T, R>(
  items: T[],
  maxConcurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<Array<PromiseSettledResult<R>>> {
  const concurrency = Math.max(1, Math.floor(maxConcurrency));
  const results: Array<PromiseSettledResult<R>> = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = {
          status: "fulfilled",
          value: await worker(items[index], index),
        };
      } catch (error) {
        results[index] = {
          status: "rejected",
          reason: error,
        };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker()));
  return results;
}

export function summarizeGenerationProgress(statuses: ImageGenerationStatus[]): GenerationProgressSummary {
  const queuedCount = statuses.filter((status) => status === "queued").length;
  const completedCount = statuses.filter((status) => status === "completed").length;
  const failedCount = statuses.filter((status) => status === "failed").length;
  const runningCount = statuses.length - queuedCount - completedCount - failedCount;

  if (runningCount > 0 || (queuedCount > 0 && completedCount + failedCount > 0)) {
    return { status: "running", queuedCount, runningCount, completedCount, failedCount };
  }
  if (queuedCount > 0) {
    return { status: "queued", queuedCount, runningCount, completedCount, failedCount };
  }
  if (completedCount > 0) {
    return { status: "completed", queuedCount, runningCount, completedCount, failedCount };
  }
  if (failedCount > 0) {
    return { status: "failed", queuedCount, runningCount, completedCount, failedCount };
  }
  return { status: "queued", queuedCount, runningCount, completedCount, failedCount };
}

export function findNextGenerationLineIndex(articleText: string, submittedLineIndex: number) {
  const lineCount = Math.max(1, articleText.split("\n").length);
  return Math.min(Math.max(submittedLineIndex, 0) + 1, lineCount - 1);
}
