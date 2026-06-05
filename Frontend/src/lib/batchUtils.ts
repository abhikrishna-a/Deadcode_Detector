export interface FileEntry {
  path: string;
  content: string;
  size_bytes: number;
}

export function splitIntoBatches(files: FileEntry[]): FileEntry[][] {
  const sorted = [...files].sort((a, b) => a.size_bytes - b.size_bytes);
  const batches: FileEntry[][] = [];
  const MAX_FILES = 10;
  const MAX_BYTES = 500 * 1024;

  let current: FileEntry[] = [];
  let currentBytes = 0;

  for (const f of sorted) {
    if (f.size_bytes > MAX_BYTES) {
      batches.push([f]);
      continue;
    }

    if (current.length >= MAX_FILES || currentBytes + f.size_bytes > MAX_BYTES) {
      if (current.length > 0) {
        batches.push(current);
        current = [];
        currentBytes = 0;
      }
      current.push(f);
      currentBytes = f.size_bytes;
    } else {
      current.push(f);
      currentBytes += f.size_bytes;
    }
  }

  if (current.length > 0) {
    batches.push(current);
  }

  return batches;
}