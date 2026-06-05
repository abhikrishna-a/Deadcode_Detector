import { splitIntoBatches } from './batchUtils';
import { needsChunking, chunkFile } from './fileChunker';
import type { ChunkMeta } from './fileChunker';
import { mergeChunkResults } from './chunkMerger';

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
  chunkProgress?: { current: number; total: number };
}

export type ProgressCallback = (p: BatchProgress) => void;

export interface AnalyzeOptions {
  analyzerBase: string;
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
  const { analyzerBase, ragBase, token, signal } = options;
  const filename = entry.path.split('/').pop() ?? entry.path;

  if (signal?.aborted) throw new AbortError();

  accumulated.currentFile = entry.path;
  onProgress({ ...accumulated });

  const totalLines = entry.content.split('\n').length;

  if (needsChunking(entry.content)) {
    const chunks = chunkFile(entry.content);
    const chunkResults: Array<{ analysis: any; chunk: ChunkMeta }> = [];

    for (let i = 0; i < chunks.length; i++) {
      if (signal?.aborted) throw new AbortError();

      const chunk = chunks[i];
      accumulated.chunkProgress = { current: i + 1, total: chunks.length };
      onProgress({ ...accumulated });

      const header = `# [GhostCode chunk ${chunk.chunkIndex + 1}/${chunk.totalChunks} lines ${chunk.lineStart}-${chunk.lineEnd} of ${filename}]\n`;
      const chunkContent = header + chunk.content;
      const chunkBlob = new Blob([chunkContent], { type: 'text/plain' });
      const chunkFileObj = new File([chunkBlob], `chunk_${filename}`, { type: 'text/plain' });

      const fd = new FormData();
      fd.append('file', chunkFileObj);

      let data: any = null;
      let lastErr: Error | null = null;

      for (let attempt = 0; attempt < 3; attempt++) {
        if (signal?.aborted) throw new AbortError();
        try {
          const res = await fetch(`${analyzerBase}/analyzer/analyze`, {
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
            const detail = await readErrorDetail(res, `Chunk analysis failed (HTTP ${res.status})`);
            throw new Error(detail);
          }

          data = await res.json();
          break;
        } catch (err: any) {
          lastErr = err;
          if (err.message?.includes('Analyzer unavailable')) break;
          if (attempt < 2) {
            const wait = Math.min(2 ** attempt * 1000, 30000);
            await new Promise(r => setTimeout(r, wait));
          }
        }
      }

      if (!data) {
        accumulated.chunkProgress = undefined;
        accumulated.currentFile = undefined;
        const msg = lastErr?.message || `Analysis failed after 3 retries`;
        accumulated.errors.push({ path: entry.path, error: msg });
        accumulated.failed++;
        onProgress({ ...accumulated });
        return { path: entry.path, filename, document_id: null, analysis: null };
      }

      chunkResults.push({ analysis: data.analysis ?? data, chunk });
    }

    accumulated.chunkProgress = undefined;
    const merged = mergeChunkResults(chunkResults, totalLines);

    let document_id: string | null = null;
    try {
      const ragFd = new FormData();
      ragFd.append('file', new File([entry.content], filename, { type: 'text/plain' }));
      ragFd.append('analysis_json', JSON.stringify(merged));
      const ragRes = await fetch(`${ragBase}/analyze`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: ragFd,
      });
      if (ragRes.ok) {
        document_id = (await ragRes.json()).document_id ?? null;
      }
    } catch { /* best-effort */ }

    const fileResult: FileResult = { path: entry.path, filename, document_id, analysis: merged };
    accumulated.results.push(fileResult);
    accumulated.completed++;
    accumulated.currentFile = undefined;
    onProgress({ ...accumulated });
    return fileResult;
  }

  // Single file, no chunking needed
  const fd = new FormData();
  fd.append('file', new File([entry.content], filename, { type: 'text/plain' }));

  let data: any = null;
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal?.aborted) throw new AbortError();
    try {
      const res = await fetch(`${analyzerBase}/analyzer/analyze`, {
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
            throw new Error(`File too large (${mb} MB) — analyzer limit is 500 KB. Skipped.`);
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

  let document_id: string | null = null;
  try {
    const ragFd = new FormData();
    ragFd.append('file', new File([entry.content], filename, { type: 'text/plain' }));
    ragFd.append('analysis_json', JSON.stringify(data.analysis ?? data));
    const ragRes = await fetch(`${ragBase}/analyze`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: ragFd,
    });
    if (ragRes.ok) {
      document_id = (await ragRes.json()).document_id ?? null;
    }
  } catch { /* best-effort */ }

  const fileResult: FileResult = {
    path: entry.path,
    filename,
    document_id,
    analysis: data.analysis ?? data,
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

    for (const entry of batch) {
      if (signal?.aborted) break;
      await analyzeOneFile(entry, options, onProgress, accumulated);
    }
  }

  accumulated.currentFile = undefined;
  accumulated.chunkProgress = undefined;
  onProgress({ ...accumulated });
  return accumulated;
}
