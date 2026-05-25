import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { analyzeCode } from '../../../lib/analyzeCode';
import ResultsPanel from '../ResultsPanel';
import Btn from '../../ui/Btn';

export default function AnalyzerTab({ results, onResultsChange, onFileChange, file }) {
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const handleFile = (f) => {
    if (f) {
      onFileChange(f);
      onResultsChange(null);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleClick = () => inputRef.current?.click();

  const handleInputChange = (e) => {
    const f = e.target.files[0];
    if (f) handleFile(f);
    e.target.value = '';
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const text = await file.text();
      const result = analyzeCode(text, file.name);
      // Simulate a small delay for UX
      await new Promise(r => setTimeout(r, 400));
      onResultsChange(result);
    } catch {
      onResultsChange({ filename: file.name, lines: 0, issues: [], summary: {}, raw: '' });
    } finally {
      setLoading(false);
    }
  };

  const dropZoneBorderColor = file
    ? 'rgba(74,222,128,0.5)'
    : dragOver
      ? 'rgba(249,115,22,0.7)'
      : 'rgba(249,115,22,0.25)';

  const dropZoneStyle = {
    border: `2px dashed ${dropZoneBorderColor}`,
    background: dragOver ? 'rgba(249,115,22,0.06)' : 'rgba(255,255,255,0.02)',
    borderRadius: 16,
    padding: 40,
    minHeight: 200,
    cursor: 'pointer',
    transition: 'all 0.25s',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
  };

  return (
    <motion.div
      key="analyzer"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}
      className="analyzer-grid"
    >
      {/* LEFT PANEL */}
      <div>
        {/* Drop Zone */}
        <div
          style={dropZoneStyle}
          onClick={handleClick}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          {file ? (
            <>
              <span style={{ fontSize: 32, marginBottom: 8 }}>📄</span>
              <p style={{ fontSize: 14, color: '#f5ede0', fontWeight: 600, fontFamily: "'DM Mono', monospace" }}>{file.name}</p>
              <p style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>{(file.size / 1024).toFixed(1)} KB · Click to change</p>
            </>
          ) : (
            <>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fb923c" strokeWidth={1.5} style={{ marginBottom: 12, opacity: 0.6 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 12V4m0 0l-3 3m3-3l3 3" />
              </svg>
              <p style={{ fontSize: 14, color: '#6b7280', fontFamily: "'DM Mono', monospace" }}>Drop your Python file</p>
              <p style={{ fontSize: 11, color: '#4a4038', marginTop: 6 }}>or click to browse · .py .js .ts .txt</p>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".py,.js,.ts,.jsx,.tsx,.txt"
            style={{ display: 'none' }}
            onChange={handleInputChange}
          />
        </div>

        {/* Detection Rules */}
        <div style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(249,115,22,0.1)',
          borderRadius: 16, padding: 20, marginTop: 20,
        }}>
          <p style={{ fontSize: 11, color: '#fb923c', fontFamily: "'DM Mono', monospace", fontWeight: 600, marginBottom: 16, letterSpacing: 0.5 }}>
            DETECTION RULES ACTIVE
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'Unused functions', desc: 'Defined but never called' },
              { label: 'Dead imports', desc: 'Imported but not used' },
              { label: 'Bare except', desc: 'Catches all exceptions' },
              { label: 'Code markers', desc: 'TODO / FIXME / HACK' },
              { label: 'Empty functions', desc: 'Contains only `pass`' },
            ].map(r => (
              <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: '#4ade80', boxShadow: '0 0 6px rgba(74,222,128,0.6)',
                  flexShrink: 0,
                }} />
                <div>
                  <p style={{ fontSize: 13, color: '#f5ede0', fontFamily: "'DM Mono', monospace" }}>{r.label}</p>
                  <p style={{ fontSize: 10, color: '#6b7280' }}>{r.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Analyze Button */}
        {file && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ marginTop: 20 }}
          >
            <Btn
              variant="solid"
              disabled={loading}
              onClick={handleAnalyze}
              style={{ width: '100%' }}
            >
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  Scanning…
                </span>
              ) : (
                `Analyze ${file.name} →`
              )}
            </Btn>
          </motion.div>
        )}

        {/* Loading State */}
        {loading && (
          <div style={{
            marginTop: 16,
            background: 'rgba(249,115,22,0.06)',
            border: '1px solid rgba(249,115,22,0.2)',
            borderRadius: 12, padding: 16, overflow: 'hidden',
          }}>
            <p style={{ fontSize: 12, color: '#fb923c', fontFamily: "'DM Mono', monospace", marginBottom: 8 }}>Scanning…</p>
            <div style={{
              width: '100%', height: 4, background: 'rgba(249,115,22,0.15)',
              borderRadius: 2, overflow: 'hidden', position: 'relative',
            }}>
              <div style={{
                width: '50%', height: '100%',
                background: 'linear-gradient(90deg, #ea580c, #f97316)',
                borderRadius: 2,
                animation: 'scan 1.2s ease-in-out infinite',
              }} />
            </div>
          </div>
        )}
      </div>

      {/* RIGHT PANEL */}
      <div>
        <ResultsPanel results={results} onClear={() => onResultsChange(null)} />
      </div>
    </motion.div>
  );
}
