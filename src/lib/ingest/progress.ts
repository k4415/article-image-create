type IngestProgressInput = {
  totalCandidates: number;
  processedCandidates: number;
  totalUrls: number;
  processedUrls: number;
};

export function calculateIngestProgressPercent(input: IngestProgressInput) {
  const total = input.totalCandidates > 0 ? input.totalCandidates : input.totalUrls;
  const processed = input.totalCandidates > 0 ? input.processedCandidates : input.processedUrls;

  if (total <= 0) return 0;

  return Math.min(100, Math.max(0, Math.round((processed / total) * 100)));
}
