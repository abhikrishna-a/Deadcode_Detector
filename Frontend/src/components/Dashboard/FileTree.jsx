import { useState, useMemo, useRef, useEffect } from 'react';

function buildTree(files, scanFolder) {
  const root = { name: '(root)', path: '', type: 'folder', children: [] };
  for (const file of files) {
    if (!file.path && file.filename) file.path = file.filename;
    const parts = file.path.replace(/\\/g, '/').split('/');
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      if (isLast) {
        current.children.push({
          name: part,
          path: file.path,
          type: 'file',
          analysis: file.analysis,
          document_id: file.document_id,
          health_score: file.analysis?.summary?.health_score ?? 50,
          total_issues: file.analysis?.summary?.total_issues ?? file.analysis?.issues?.length ?? 0,
        });
      } else {
        let child = current.children.find(c => c.name === part && c.type === 'folder');
        if (!child) {
          child = { name: part, path: parts.slice(0, i + 1).join('/'), type: 'folder', children: [] };
          current.children.push(child);
        }
        current = child;
      }
    }
  }
  if (scanFolder && root.children.length > 0) {
    return [{
      name: scanFolder,
      path: scanFolder,
      type: 'folder',
      children: root.children,
    }];
  }
  return root.children;
}

function TreeNode({ node, selectedPath, onSelect, onFolderSelect, depth }) {
  const [expanded, setExpanded] = useState(true);
  const isFolder = node.type === 'folder';
  const isSelected = node.path === selectedPath;

  if (isFolder) {
    const issueCount = node.children.reduce((s, c) => s + (c.total_issues || 0), 0);
    const fileCount = node.children.filter(c => c.type === 'file').length;
    return (
      <div>
        <div
          onClick={() => {
            setExpanded(v => !v);
            if (onFolderSelect) onFolderSelect(node);
          }}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '2px 4px', cursor: 'pointer', borderRadius: 4,
            fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
            color: '#34d399', fontWeight: 600,
            marginLeft: depth * 14, userSelect: 'none',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(5,150,105,0.06)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          <span style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', fontSize: 8 }}>▶</span>
          <span>📁 {node.name}/</span>
          <span style={{ color: '#57534e', fontSize: 9, fontWeight: 400, marginLeft: 2 }}>{fileCount}</span>
          {issueCount > 0 && (
            <span style={{ color: '#f87171', fontSize: 9, fontWeight: 400, marginLeft: 4 }}>{issueCount} iss.</span>
          )}
        </div>
        {expanded && node.children.map((child, i) => (
          <TreeNode key={child.path || i} node={child} selectedPath={selectedPath} onSelect={onSelect} onFolderSelect={onFolderSelect} depth={depth + 1} />
        ))}
      </div>
    );
  }

  const healthColor = node.health_score > 80 ? '#4ade80' : node.health_score > 50 ? '#fb923c' : '#f87171';
  const ext = node.name.split('.').pop();
  const langColors = { py: '#3572A5', js: '#f7df1e', ts: '#3178c6', jsx: '#61dafb', tsx: '#3178c6', txt: '#78716c', md: '#78716c' };
  const rowRef = useRef(null);

  useEffect(() => {
    if (isSelected && rowRef.current) {
      rowRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [isSelected]);

  return (
    <div
      ref={rowRef}
      onClick={() => onSelect(node)}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '3px 6px', cursor: 'pointer', borderRadius: 6,
        fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
        color: isSelected ? '#ecfdf5' : '#a8a29e',
        background: isSelected ? 'rgba(5,150,105,0.1)' : 'transparent',
        border: isSelected ? '1px solid rgba(5,150,105,0.3)' : '1px solid transparent',
        marginLeft: depth * 14,
        transition: 'all 0.15s',
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(5,150,105,0.06)'; }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: langColors[ext] || '#78716c', flexShrink: 0 }} />
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
      {node.total_issues > 0 && (
        <span style={{ color: '#f87171', fontSize: 9, flexShrink: 0 }}>{node.total_issues}</span>
      )}
      <span style={{ color: healthColor, fontSize: 9, flexShrink: 0 }}>{node.health_score}%</span>
    </div>
  );
}

export default function FileTree({ files, selectedPath, onSelectFile, onSelectFolder, scanFolder }) {
  const tree = useMemo(() => buildTree(files || [], scanFolder), [files, scanFolder]);

  if (!files || files.length === 0) {
    return (
      <div style={{ padding: 20, textAlign: 'center', fontSize: 11, color: '#78716c', fontFamily: "'JetBrains Mono', monospace" }}>
        No files to display
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {tree.map((node, i) => (
        <TreeNode key={node.path || i} node={node} selectedPath={selectedPath} onSelect={onSelectFile} onFolderSelect={onSelectFolder} depth={0} />
      ))}
    </div>
  );
}
