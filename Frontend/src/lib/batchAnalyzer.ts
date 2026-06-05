import { splitIntoBatches } from './batchUtils';

export { splitIntoBatches };

export interface FileEntry {
  path: string;
  content: string;
  size_bytes: number;
}

export interface FileResult {
  path: string;
  filename: string;
  document_id: string | null;
  analysis: any;
  cached?: boolean;
}

export interface FileError {
  path: string;
  error: string;
}

export interface BatchProgress {
  total: number;
  completed: number;
  failed: number;
  currentBatch: number;
  totalBatches: number;
  results: FileResult[];
  errors: FileError[];
  currentFile?: string;
}

export type ProgressCallback = (p: BatchProgress) => void;

export interface AnalyzeOptions {
  ragBase: string;
  token: string;
  signal?: AbortSignal;
}

class AbortError extends Error {
  name = 'AbortError';
  constructor() {
    super('Analysis cancelled');
  }
}

async function readErrorDetail(response: Response, fallback: string): Promise<string> {
  const text = await response.text().catch(() => '');
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text);
    return parsed?.detail || parsed?.error || fallback;
  } catch {
    return text;
  }
}

export async function analyzeOneFile(
  entry: FileEntry,
  options: AnalyzeOptions,
  onProgress: ProgressCallback,
  accumulated: BatchProgress,
): Promise<FileResult> {
  const { ragBase, token, signal } = options;
  const filename = entry.path.split('/').pop() ?? entry.path;

  if (signal?.aborted) throw new AbortError();

  accumulated.currentFile = entry.path;
  onProgress({ ...accumulated });

  const fd = new FormData();
  fd.append('file', new File([entry.content], filename, { type: 'text/plain' }));

  let data: any = null;
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal?.aborted) throw new AbortError();
    try {
      const res = await fetch(`${ragBase}/analyze`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });

      if (res.status === 429) {
        const wait = Math.min(2 ** attempt * 1000, 30000);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }

      if (res.status === 503) {
        throw new Error('Analyzer unavailable — file skipped.');
      }

      if (!res.ok) {
        if (res.status === 400) {
          const detail = await readErrorDetail(res, '');
          if (detail.toLowerCase().includes('too large') || detail.toLowerCase().includes('size')) {
            const mb = (entry.size_bytes / (1024 * 1024)).toFixed(1);
            throw new Error(`File too large (${mb} MB) — limit is 10 MB. Skipped.`);
          }
        }
        const detail = await readErrorDetail(res, `Analysis failed (HTTP ${res.status})`);
        throw new Error(detail);
      }

      data = await res.json();
      break;
    } catch (err: any) {
      lastErr = err;
      if (err.message?.includes('Analyzer unavailable') || err.message?.includes('File too large')) break;
      if (attempt < 2) {
        const wait = Math.min(2 ** attempt * 1000, 30000);
        await new Promise(r => setTimeout(r, wait));
      }
    }
  }

  if (!data) {
    accumulated.currentFile = undefined;
    const msg = lastErr?.message || 'Analysis failed after 3 retries';
    accumulated.errors.push({ path: entry.path, error: msg });
    accumulated.failed++;
    onProgress({ ...accumulated });
    return { path: entry.path, filename, document_id: null, analysis: null };
  }

  const fileResult: FileResult = {
    path: entry.path,
    filename,
    document_id: data.document_id ?? null,
    analysis: data.analysis ?? data,
    cached: data.cached ?? false,
  };
  accumulated.results.push(fileResult);
  accumulated.completed++;
  accumulated.currentFile = undefined;
  onProgress({ ...accumulated });
  return fileResult;
}

export async function analyzeFiles(
  files: FileEntry[],
  options: AnalyzeOptions,
  onProgress: ProgressCallback,
): Promise<BatchProgress> {
  const { signal } = options;

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

  for (let b = 0; b < batches.length; b++) {
    if (signal?.aborted) break;

    accumulated.currentBatch = b + 1;
    onProgress({ ...accumulated });

    const batch = batches[b];

    // Process files within each batch concurrently (limit 10)
    const concurrencyLimit = 10;
    const slices: FileEntry[][] = [];
    for (let i = 0; i < batch.length; i += concurrencyLimit) {
      slices.push(batch.slice(i, i + concurrencyLimit));
    }

    for (const slice of slices) {
      if (signal?.aborted) break;
      await Promise.all(
        slice.map(entry => {
          if (signal?.aborted) return Promise.resolve();
          return analyzeOneFile(entry, options, onProgress, accumulated);
        }),
      );
    }
  }

  accumulated.currentFile = undefined;
  onProgress({ ...accumulated });
  return accumulated;
}
