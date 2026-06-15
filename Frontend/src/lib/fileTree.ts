import { AnalysisResult } from '../types';

export interface TreeNodeData {
  name: string;
  isDir: boolean;
  children: TreeNodeData[];
  file?: AnalysisResult;
}

export function buildFileTree(files: AnalysisResult[]): TreeNodeData[] {
  const root: TreeNodeData[] = [];

  for (const file of files) {
    const parts = file.filename.replace(/\\/g, '/').split('/');
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
  return root;
}
