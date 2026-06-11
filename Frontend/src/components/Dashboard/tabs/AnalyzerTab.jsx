import { useState, useEffect, useRef } from 'react';
import { analysisAPI } from '../../../api/analysis';
import ImportPage from '../ImportPage';
import ResultsPage from '../ResultsPage';

export default function AnalyzerTab({ results, onResultsChange }) {
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
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 400, gap: 16 }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid rgba(5,150,105,0.2)', borderTopColor: '#34d399', animation: 'spin 0.6s linear infinite' }} />
        <p style={{ fontSize: 13, color: '#78716c', fontFamily: "'JetBrains Mono', monospace" }}>Analyzing results...</p>
      </div>
    );
  }

  if (view === 'results') {
    return (
      <ResultsPage
        batchResults={batchResults}
        batchErrors={batchErrors}
        onBackToImport={handleBackToImport}
      />
    );
  }

  return <ImportPage onAnalysisComplete={handleAnalysisComplete} />;
}
