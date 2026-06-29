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

export interface HistoryTreeNodeData<T = any> {
  name: string;
  isDir: boolean;
  children: HistoryTreeNodeData<T>[];
  file?: T;
  meta?: Record<string, any>;
}

export function buildHistoryTree<T extends { filename: string }>(
  files: T[],
  defaultScanFolder?: string
): HistoryTreeNodeData<T>[] {
  const root: HistoryTreeNodeData<T>[] = [];
  for (const file of files) {
    let path = file.filename.replace(/\\/g, '/');
    if (defaultScanFolder) {
      const prefix = defaultScanFolder.replace(/\\/g, '/').replace(/\/?$/, '/');
      if (path.startsWith(prefix)) {
        path = path.slice(prefix.length);
      }
    }
    path = path.replace(/^\/+/, '');
    const parts = path.split('/').filter(Boolean);
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      if (isLast) {
        current.push({ name: part, isDir: false, children: [], file });
      } else {
        let dir = current.find(n => n.name === part && n.isDir);
        if (!dir) {
          dir = { name: part, isDir: true, children: [], file: undefined };
          current.push(dir);
        }
        current = dir.children;
      }
    }
  }
  const sortNodes = (nodes: HistoryTreeNodeData<T>[]) => {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
      if (node.children.length > 0) sortNodes(node.children);
    }
  };
  sortNodes(root);
  return root;
}

export interface AppGroup<T> {
  appName: string;
  items: T[];
}

export function groupByTopLevelDir<T extends { filename: string }>(
  items: T[],
  rootLabel: string = 'Project Root'
): AppGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const path = item.filename.replace(/\\/g, '/');
    const slashIdx = path.indexOf('/');
    const appName = slashIdx === -1 ? '__root__' : path.substring(0, slashIdx);
    if (!groups.has(appName)) {
      groups.set(appName, []);
    }
    groups.get(appName)!.push(item);
  }
  return Array.from(groups.entries())
    .map(([appName, appItems]) => ({
      appName: appName === '__root__' ? rootLabel : appName,
      items: appItems,
    }))
    .sort((a, b) => {
      if (a.appName === rootLabel) return 1;
      if (b.appName === rootLabel) return -1;
      return a.appName.localeCompare(b.appName);
    });
}
