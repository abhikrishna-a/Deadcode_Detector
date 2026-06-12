import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, PlusCircle, FileSearch, BarChart3 } from 'lucide-react';
import { analysisAPI } from '../../../api/analysis';
import ImportPage from '../ImportPage';
import ResultsPage from '../ResultsPage';

export default function AnalyzerTab({ results, onResultsChange, onChatNavigate }) {
  const [view, setView] = useState('import');
  const [batchResults, setBatchResults] = useState([]);
  const [batchErrors, setBatchErrors] = useState([]);
  const [history, setHistory] = useState([]);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const initRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const resp = await analysisAPI.ragHistory(20, 0);
        setHistory(resp.items || []);
      } catch {}
    })();
  }, []);

  // Handle pre-existing results from parent (e.g. OverviewTab click)
  useEffect(() => {
    if (initRef.current) return;
    if (results?.document_id) {
      const batch = results._batch_results;
      if (Array.isArray(batch) && batch.length > 0) {
        setBatchResults(batch);
        setBatchErrors(results._batch_errors || []);
      } else {
        setBatchResults([{
          filename: results.filename || 'unknown',
          document_id: results.document_id,
          analysis: results.analysis || results,
          _source_content: results._source_content || '',
        }]);
      }
      setView('results');
    }
    initRef.current = true;
  }, [results]);

  const handleAnalysisComplete = async (newResults, newErrors) => {
    setBatchResults(newResults || []);
    setBatchErrors(newErrors || []);
    if (newResults?.length > 0) {
      const first = newResults[0];
      onResultsChange({
        filename: first.filename,
        document_id: first.document_id,
        ...first.analysis,
        _batch_results: newResults,
        _batch_errors: newErrors,
      });
    }
    setLoadingAnalysis(true);
    await new Promise(r => setTimeout(r, 4000));
    setLoadingAnalysis(false);
    setView('results');
  };

  const handleBackToImport = () => {
    setView('import');
  };

  const handleHistoryDelete = async (analysisId) => {
    try {
      await analysisAPI.ragDeleteAnalysis(analysisId);
      setHistory(prev => prev.filter(h => h.analysis_id !== analysisId));
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  if (loadingAnalysis) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{
              flex: 1, height: 80,
              background: 'linear-gradient(90deg, #292524 25%, #353230 50%, #292524 75%)',
              backgroundSize: '200% 100%',
              borderRadius: 12,
              animation: 'shimmer 1.5s ease-in-out infinite',
            }} />
          ))}
        </div>
        <div style={{
          height: 200,
          background: 'linear-gradient(90deg, #292524 25%, #353230 50%, #292524 75%)',
          backgroundSize: '200% 100%',
          borderRadius: 12,
          animation: 'shimmer 1.5s ease-in-out infinite',
        }} />
        <div style={{
          height: 120,
          background: 'linear-gradient(90deg, #292524 25%, #353230 50%, #292524 75%)',
          backgroundSize: '200% 100%',
          borderRadius: 12,
          animation: 'shimmer 1.5s ease-in-out infinite',
        }} />
      </motion.div>
    );
  }

  if (view === 'results') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
          padding: '8px 12px',
          background: '#1c1917',
          border: '1px solid rgba(5,150,105,0.12)',
          borderRadius: 12,
        }}>
          <div style={{ display: 'flex', gap: 4, background: '#292524', borderRadius: 8, padding: 2 }}>
            <button
              onClick={() => setView('import')}
              style={{
                background: 'transparent',
                border: 'none',
                borderRadius: 6, padding: '6px 14px',
                color: '#78716c', fontSize: 11,
                fontFamily: "'Inter', sans-serif", fontWeight: 500,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = '#e7e5e4'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#78716c'; }}
            >
              <FileSearch size={14} /> Import
            </button>
            <button
              style={{
                background: 'rgba(5,150,105,0.15)',
                border: '1px solid rgba(5,150,105,0.3)',
                borderRadius: 6, padding: '6px 14px',
                color: '#34d399', fontSize: 11,
                fontFamily: "'Inter', sans-serif", fontWeight: 600,
                cursor: 'default', display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <BarChart3 size={14} /> Results
            </button>
          </div>
          <span style={{ fontSize: 11, color: '#78716c', fontFamily: "'JetBrains Mono', monospace", marginLeft: 'auto' }}>
            {batchResults?.length || 0} file{(batchResults?.length || 0) !== 1 ? 's' : ''} analyzed
            {batchErrors?.length > 0 && (
              <span style={{ color: '#f87171', marginLeft: 6 }}>{batchErrors.length} failed</span>
            )}
          </span>
          <button
            onClick={handleBackToImport}
            style={{
              background: 'none',
              border: '1px solid rgba(5,150,105,0.3)', color: '#34d399',
              borderRadius: 8, padding: '6px 14px', fontSize: 11,
              cursor: 'pointer', fontFamily: "'Inter', sans-serif", fontWeight: 500,
              display: 'flex', alignItems: 'center', gap: 6,
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(5,150,105,0.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            <PlusCircle size={14} /> New Analysis
          </button>
        </div>
        <ResultsPage
          batchResults={batchResults}
          batchErrors={batchErrors}
          onBackToImport={handleBackToImport}
          onChatNavigate={onChatNavigate}
        />
      </motion.div>
    );
  }

  return <ImportPage onAnalysisComplete={handleAnalysisComplete} />;
}
