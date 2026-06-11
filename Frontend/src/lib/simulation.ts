import { splitIntoBatches } from './batchUtils';
import type { FileEntry, FileResult, FileError, BatchProgress, ProgressCallback } from './batchAnalyzer';

export { splitIntoBatches };

export interface SimulateOptions {
  signal?: AbortSignal;
  /** File index (0-based) at which to simulate a failure stop (default 51 → file 52) */
  failAt?: number;
  /** Base delay per file in ms (default 120) */
  baseDelay?: number;
}

class AbortError extends Error {
  name = 'AbortError';
  constructor() {
    super('Analysis cancelled');
  }
}

function localFileResult(entry: FileEntry, idx: number): FileResult {
  const filename = entry.path.split('/').pop() ?? entry.path;
  const issuesCount = Math.max(1, Math.floor(idx / 3) + 1);
  const issues = [];
  for (let i = 0; i < issuesCount; i++) {
    issues.push({
      id: `DC${String(i + 1).padStart(3, '0')}`,
      category: ['unused_import', 'unused_function', 'dead_branch', 'unused_variable'][i % 4],
      severity: ['high', 'medium', 'low'][i % 3],
      line_start: (i * 10 + 1),
      line_end: (i * 10 + 3),
      name: `${filename.replace('.', '_')}_sym${i}`,
      description: 'Simulated dead code — backend unavailable.',
      code_snippet: '// simulated',
      suggestion: 'Review and remove unreferenced code.',
      confidence: 0.95,
    });
  }
  const healthScore = Math.max(30, 90 - issuesCount * 6);
  const promptTok = 600 + idx * 20;
  const completionTok = 150 + idx * 8;
  return {
    path: entry.path,
    filename,
    document_id: `sim-${idx}`,
    analysis: {
      summary: {
        total_issues: issuesCount,
        severity_counts: { high: 0, medium: 0, low: 0 },
        categories: {},
        overall_health: healthScore > 80 ? 'clean' : healthScore > 50 ? 'needs_attention' : 'poor',
        health_score: healthScore,
      },
      issues,
      metrics: {
        total_lines: 60 + idx,
        code_lines: 40 + idx,
        comment_lines: 5,
        blank_lines: 3,
        dead_lines_estimate: issuesCount * 3,
        dead_code_percentage: Math.min(30, Math.round((issuesCount * 3 / (60 + idx)) * 100)),
        complexity_hint: 'low',
      },
      refactor_hints: ['Consider removing unreferenced code.'],
      _token_usage: { prompt_tokens: promptTok, completion_tokens: completionTok, total_tokens: promptTok + completionTok },
      _local_only: true,
    },
  };
}

export async function simulateFiles(
  files: FileEntry[],
  options: SimulateOptions,
  onProgress: ProgressCallback,
): Promise<BatchProgress> {
  const { signal, failAt = 51, baseDelay = 120 } = options;

  const batches = splitIntoBatches(files);
  const accumulated: BatchProgress = {
    total: files.length,
    completed: 0,
    failed: 0,
    currentBatch: 0,
    totalBatches: batches.length,
    results: [],
    errors: [],
  };

  let simulationStop = false;

  for (let b = 0; b < batches.length; b++) {
    if (signal?.aborted || simulationStop) break;

    accumulated.currentBatch = b + 1;
    onProgress({ ...accumulated });

    const batch = batches[b];

    for (const entry of batch) {
      if (signal?.aborted || simulationStop) break;

      const idx = accumulated.completed + accumulated.failed;

      // Simulate failure at the configured file index
      if (idx === failAt) {
        accumulated.currentFile = entry.path;
        onProgress({ ...accumulated });

        await sleep(500, signal);

        accumulated.errors.push({
          path: entry.path,
          error: 'Analysis stopped: request timed out after 120s while processing large file with complex nested patterns.',
        });
        accumulated.failed++;
        accumulated.currentFile = undefined;
        onProgress({ ...accumulated });
        simulationStop = true;
        break;
      }

      // Progressive slowdown after file 45
      let delay = baseDelay;
      if (idx >= 50) {
        delay = baseDelay + (idx - 50) * 60;
      } else if (idx >= 45) {
        delay = baseDelay + (idx - 45) * 20;
      }

      accumulated.currentFile = entry.path;
      onProgress({ ...accumulated });

      await sleep(delay, signal);

      const result = localFileResult(entry, idx);
      accumulated.results.push(result);
      accumulated.completed++;
      accumulated.currentFile = undefined;
      onProgress({ ...accumulated });
    }
  }

  const stoppedEarly = simulationStop || signal?.aborted;
  if (stoppedEarly) {
    (accumulated as any)._stop_reason = signal?.aborted
      ? 'User cancelled the analysis.'
      : `Analysis timed out at file ${failAt + 1} of ${files.length}.`;
    (accumulated as any)._simulated = true;
  }

  accumulated.currentFile = undefined;
  onProgress({ ...accumulated });
  return accumulated;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal?.aborted) { resolve(); return; }
    const onAbort = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
