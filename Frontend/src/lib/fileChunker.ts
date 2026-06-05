export const CHUNK_MAX_TOKENS = 6_000;
export const CHUNK_OVERLAP_LINES = 20;

export function approxTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

export interface ChunkMeta {
  chunkIndex: number;
  totalChunks: number;
  lineStart: number;
  lineEnd: number;
  content: string;
}

export function chunkFile(
  source: string,
  maxTokens = CHUNK_MAX_TOKENS,
  overlapLines = CHUNK_OVERLAP_LINES,
): ChunkMeta[] {
  const lines = source.split('\n');
  const chunks: ChunkMeta[] = [];
  let start = 0;

  while (start < lines.length) {
    let end = start;
    let tokenCount = 0;

    while (end < lines.length) {
      const lineTokens = approxTokens(lines[end]);
      if (tokenCount + lineTokens > maxTokens && end > start) break;
      tokenCount += lineTokens;
      end++;
    }

    if (end === start) end = start + 1;

    chunks.push({
      chunkIndex: chunks.length,
      totalChunks: 0,
      lineStart: start + 1,
      lineEnd: end,
      content: lines.slice(start, end).join('\n'),
    });

    start = Math.max(start + 1, end - overlapLines);
  }

  const total = chunks.length;
  for (const c of chunks) c.totalChunks = total;
  return chunks;
}

export function needsChunking(source: string, maxTokens = CHUNK_MAX_TOKENS): boolean {
  return approxTokens(source) > maxTokens;
}
