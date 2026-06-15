import { splitIntoBatches } from './batchUtils';

export { splitIntoBatches };

function combineSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const sig of signals) {
    if (sig.aborted) {
      controller.abort(sig.reason);
      return controller.signal;
    }
    sig.addEventListener('abort', () => controller.abort(sig.reason), { once: true });
  }
  return controller.signal;
}

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
  llm_refining?: boolean;
  _source_content?: string;
  scan_folder?: string;
  scan_type?: 'single' | 'folder' | 'repo';
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
  scanFolder?: string;
  scanType?: 'single' | 'folder' | 'repo';
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
  const filename = entry.path;

  if (signal?.aborted) throw new AbortError();

  accumulated.currentFile = entry.path;
  onProgress({ ...accumulated });

  const fd = new FormData();
  fd.append('file', new File([entry.content], filename, { type: 'text/plain' }));
  if (options.scanFolder) fd.append('scan_folder', options.scanFolder);
  fd.append('scan_type', options.scanType || 'single');

  let data: any = null;
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
      if (signal?.aborted) throw new AbortError();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);
      const combinedSignal = signal
        ? combineSignals(signal, controller.signal)
        : controller.signal;

      const res = await fetch(`${ragBase}/analyze`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
        signal: combinedSignal,
      });
      clearTimeout(timeoutId);

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
      if (err.name === 'AbortError') {
        if (signal?.aborted) throw new AbortError();
        lastErr = new Error('Request timed out after 120s — file skipped.');
        break;
      }
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
    accumulated.results.push({ path: entry.path, filename, document_id: null, analysis: null, error: msg, scan_type: options.scanType || 'single' });
    onProgress({ ...accumulated });
    return { path: entry.path, filename, document_id: null, analysis: null, error: msg, scan_type: options.scanType || 'single' };
  }

  const fileResult: FileResult = {
    path: entry.path,
    filename,
    document_id: data.document_id ?? null,
    analysis: data.analysis ?? data,
    cached: data.cached ?? false,
    llm_refining: (data.chunk_count === 0 && !!data.document_id) ?? false,
    scan_folder: options.scanFolder || '',
    scan_type: options.scanType || 'single',
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
  const { ragBase, token, signal } = options;

  const accumulated: BatchProgress = {
    total: files.length,
    completed: 0,
    failed: 0,
    currentBatch: 0,
    totalBatches: 1,
    results: [],
    errors: [],
  };

  // ── Clean up stale DB entries for deleted files ──
  if (!signal?.aborted) {
    try {
      const activePaths = files.map(f => f.path);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const combinedSignal = signal
        ? combineSignals(signal, controller.signal)
        : controller.signal;
      await fetch(`${ragBase}/cleanup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ files: activePaths.map(p => ({ name: p, content: '' })) }),
        signal: combinedSignal,
      });
      clearTimeout(timeoutId);
    } catch {
      /* non-critical — skip cleanup if endpoint is unavailable */
    }
  }

  // ── Try fast batch endpoint first (AST+grep, no LLM) ──
  if (!signal?.aborted) {
    const batchPayload = {
      files: files.map(f => ({ name: f.path, content: f.content })),
      scan_folder: options.scanFolder || '',
      scan_type: options.scanType || 'single',
    };
    try {
      onProgress({ ...accumulated, currentFile: 'Running fast batch analysis...' });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);
      const combinedSignal = signal
        ? combineSignals(signal, controller.signal)
        : controller.signal;

      const res = await fetch(`${ragBase}/batch-analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(batchPayload),
        signal: combinedSignal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        for (const fr of data.results || []) {
          accumulated.results.push({
            path: fr.filename,
            filename: fr.filename,
            document_id: fr.document_id || null,
            analysis: fr.analysis,
            _source_content: '',
            scan_folder: options.scanFolder || '',
            scan_type: options.scanType || 'single',
          });
        }
        accumulated.completed = accumulated.results.length;
        accumulated.currentFile = undefined;
        onProgress({ ...accumulated });
        return accumulated;
      }
      // Fall through to per-file analysis on non-OK
    } catch {
      // Fall through to per-file analysis on network error
    }
  }

  // ── Per-file analysis fallback (original flow) ──
  const batches = splitIntoBatches(files);
  accumulated.totalBatches = batches.length;

  try {
    for (let b = 0; b < batches.length; b++) {
      if (signal?.aborted) break;

      accumulated.currentBatch = b + 1;
      onProgress({ ...accumulated });

      const batch = batches[b];

      const concurrencyLimit = 20;
      const slices: FileEntry[][] = [];
      for (let i = 0; i < batch.length; i += concurrencyLimit) {
        slices.push(batch.slice(i, i + concurrencyLimit));
      }

      for (const slice of slices) {
        if (signal?.aborted) break;
        try {
          await Promise.all(
            slice.map(entry => {
              if (signal?.aborted) return Promise.resolve();
              return analyzeOneFile(entry, options, onProgress, accumulated);
            }),
          );
        } catch (innerErr) {
          if (innerErr.name === 'AbortError' || signal?.aborted) break;
          throw innerErr;
        }
      }
    }
  } catch (err) {
    if (err.name === 'AbortError' || signal?.aborted) {
      (accumulated as any)._stop_reason = 'User cancelled the analysis.';
    } else {
      throw err;
    }
  }

  accumulated.currentFile = undefined;
  onProgress({ ...accumulated });
  return accumulated;
}
