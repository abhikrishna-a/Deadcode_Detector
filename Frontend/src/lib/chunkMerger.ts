import type { ChunkMeta } from './fileChunker';

export function mergeChunkResults(
  chunkResults: Array<{ analysis: any; chunk: ChunkMeta }>,
  totalLines: number,
): any {
  if (chunkResults.length === 0) return null;
  if (chunkResults.length === 1) return chunkResults[0].analysis;

  const seen = new Set<string>();
  const allIssues: any[] = [];

  for (const { analysis, chunk } of chunkResults) {
    for (const issue of analysis?.issues ?? []) {
      const key = `${issue.category}:${issue.line_start}:${issue.name ?? ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        allIssues.push({ ...issue });
      }
    }
  }

  allIssues.sort((a, b) => (a.line_start ?? 0) - (b.line_start ?? 0));
  allIssues.forEach((issue, i) => {
    issue.id = `DC${String(i + 1).padStart(3, '0')}`;
  });

  const severityCounts = { high: 0, medium: 0, low: 0 };
  const categories: Record<string, number> = {};

  for (const issue of allIssues) {
    const sev = issue.severity as keyof typeof severityCounts;
    if (sev in severityCounts) severityCounts[sev]++;
    const cat = issue.category as string;
    categories[cat] = (categories[cat] ?? 0) + 1;
  }

  const lastMetrics = chunkResults[chunkResults.length - 1].analysis?.metrics ?? {};
  const deadLinesRaw = chunkResults.reduce(
    (sum, r) => sum + (r.analysis?.metrics?.dead_lines_estimate ?? 0), 0,
  );
  const deadLines = Math.min(deadLinesRaw, Math.floor(totalLines * 0.8));

  const metrics = {
    ...lastMetrics,
    total_lines: totalLines,
    dead_lines_estimate: deadLines,
    dead_code_percentage: totalLines > 0
      ? parseFloat(((deadLines / totalLines) * 100).toFixed(1))
      : 0,
  };

  const scores = chunkResults
    .map(r => r.analysis?.summary?.health_score)
    .filter((s): s is number => typeof s === 'number');
  const avgScore = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0;

  const overallHealth =
    avgScore >= 90 ? 'clean' :
    avgScore >= 70 ? 'good' :
    avgScore >= 40 ? 'needs_attention' : 'poor';

  const hintsSeen = new Set<string>();
  const refactorHints: string[] = [];
  for (const { analysis } of chunkResults) {
    for (const hint of analysis?.refactor_hints ?? []) {
      const key = (hint as string).slice(0, 40);
      if (!hintsSeen.has(key)) {
        hintsSeen.add(key);
        refactorHints.push(hint);
      }
    }
  }

  return {
    summary: {
      total_issues: allIssues.length,
      severity_counts: severityCounts,
      categories,
      overall_health: overallHealth,
      health_score: avgScore,
    },
    issues: allIssues,
    metrics,
    refactor_hints: refactorHints,
    _chunked: true,
    _chunk_count: chunkResults.length,
  };
}
