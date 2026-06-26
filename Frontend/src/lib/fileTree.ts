import { AnalysisResult } from '../types';

export interface TreeNodeData {
  name: string;
  isDir: boolean;
  children: TreeNodeData[];
  file?: AnalysisResult;
  totalIssues: number;
}

export function buildFileTree(files: AnalysisResult[], stripPrefix?: string): TreeNodeData[] {
  const root: TreeNodeData[] = [];
  const seenFullPaths = new Set<string>();

  for (const file of files) {
    let filepath = file.filename.replace(/\\/g, '/');
    if (stripPrefix) {
      const prefix = stripPrefix.replace(/\\/g, '/').replace(/\/?$/, '/');
      if (filepath.startsWith(prefix)) {
        filepath = filepath.slice(prefix.length);
      }
    }
    const parts = filepath.split('/');
    const fullPath = parts.join('/');
    if (seenFullPaths.has(fullPath)) continue;
    seenFullPaths.add(fullPath);

    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;

      if (isLast) {
        current.push({
          name: part,
          isDir: false,
          children: [],
          file,
          totalIssues: file.summary?.total_issues ?? 0,
        });
      } else {
        let dir = current.find(n => n.name === part && n.isDir);
        if (!dir) {
          dir = {
            name: part,
            isDir: true,
            children: [],
            file: undefined,
            totalIssues: 0,
          };
          current.push(dir);
        }
        current = dir.children;
      }
    }
  }

  // Post-process: aggregate issue counts into directory nodes
  function sumIssues(nodes: TreeNodeData[]): number {
    let total = 0;
    for (const n of nodes) {
      if (n.isDir) {
        const childTotal = sumIssues(n.children);
        n.totalIssues = childTotal;
        total += childTotal;
      } else {
        total += n.totalIssues;
      }
    }
    return total;
  }
  sumIssues(root);

  function sortTree(nodes: TreeNodeData[]): void {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const n of nodes) {
      if (n.isDir) sortTree(n.children);
    }
  }
  sortTree(root);
  return root;
}
