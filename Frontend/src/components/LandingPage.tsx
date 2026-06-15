import { motion } from 'motion/react';
import { Sparkles, Code, GitBranch, MessageSquare } from 'lucide-react';

interface LandingPageProps {
  onStart: () => void;
}

export default function LandingPage({ onStart }: LandingPageProps) {
  return (
    <div className="relative min-h-screen overflow-hidden flex flex-col">
      {/* Background radial spotlights */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-cyan-900/10 rounded-full blur-[120px] -translate-y-1/2" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-purple-900/5 rounded-full blur-[100px]" />
        {/* Wireframe background mesh pattern */}
        <div 
          className="absolute inset-0 opacity-[0.02]" 
          style={{
            backgroundImage: `linear-gradient(rgba(34, 211, 238, 0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(34, 211, 238, 0.15) 1px, transparent 1px)`,
            backgroundSize: '50px 50px'
          }}
        />
      </div>

      {/* Header navbar - Frosted Glass panel */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-5 glass-card border-t-0 border-x-0 rounded-none">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <span className="font-display font-black text-xs text-white tracking-widest">GC</span>
          </div>
          <span className="font-display font-bold text-base tracking-tight text-zinc-100 uppercase">Ghost.Code</span>
          <span className="px-2 py-0.5 text-[9px] font-semibold text-cyan-400 bg-cyan-400/5 border border-cyan-400/10 rounded-md">DETECTOR</span>
        </div>
        <div className="flex items-center space-x-2 text-xs text-zinc-400 uppercase tracking-widest">
          <div className="status-dot bg-emerald-400"></div>
          <span>System: Online</span>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 flex-1 max-w-6xl mx-auto px-6 py-14 flex flex-col items-center justify-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          className="space-y-6 max-w-3xl"
        >
          <span className="inline-flex items-center gap-2 px-3.5 py-1 text-[11px] font-semibold tracking-wider text-cyan-400 bg-cyan-400/5 border border-cyan-400/10 rounded-full uppercase">
            <Sparkles size={12} className="text-cyan-400" /> static code analysis
          </span>

          <h1 className="font-display font-extrabold text-[2.75rem] md:text-6xl text-white tracking-tight leading-[1.12]">
            Expose dead code.<br />
            <span className="bg-gradient-to-r from-cyan-400 via-violet-400 to-purple-400 bg-clip-text text-transparent">
              Elevate program speed.
            </span>
          </h1>

          <p className="text-zinc-400 text-sm max-w-xl mx-auto font-sans leading-relaxed">
            Upload files or parse entire directories instantly. Detect unused libraries, inactive routines, obsolete variables, and dead parameters with surgical precision. Keep your codebase clean, functional, and lightning fast.
          </p>

          <div className="pt-4 flex flex-col sm:flex-row gap-4 justify-center items-center">
            <button
              onClick={onStart}
              style={{
                boxShadow: '0 8px 30px rgba(34, 211, 238, 0.2)'
              }}
              className="px-8 py-3 text-[13px] font-bold rounded-full bg-gradient-to-r from-cyan-400 to-purple-600 text-white hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer flex items-center gap-2"
            >
              Start Code Scan
              <span className="text-cyan-100">→</span>
            </button>
          </div>
        </motion.div>

        {/* Feature Grid panels in Frosted Glass */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: 'easeOut' }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl pt-16 mt-8"
        >
          {[
            {
              icon: Code,
              title: 'RAG-Powered Analysis',
              desc: 'Upload files or entire directories for deep AST-level dead code detection powered by Groq LLM analysis with vector storage.'
            },
            {
              icon: GitBranch,
              title: 'Git Repository Scanning',
              desc: 'Clone remote repositories and batch-analyze entire codebases. Identify dead imports, unused functions, and unreachable code across branches.'
            },
            {
              icon: MessageSquare,
              title: 'AI Chat Inspector',
              desc: 'Ask natural language questions about your analysis results. Our RAG chat engine provides contextual responses with source citations.'
            }
          ].map((f, i) => (
            <div
              key={i}
              className="group p-6 rounded-3xl text-left glass-card glass-card-hover hover:scale-[1.02] duration-300 transition-all flex flex-col"
            >
              <div className="w-10 h-10 rounded-xl bg-cyan-400/10 border border-cyan-400/15 flex items-center justify-center text-cyan-400 group-hover:bg-cyan-400/20 group-hover:text-cyan-300 transition-colors mb-4">
                <f.icon size={18} />
              </div>
              <h3 className="font-display font-bold text-sm text-zinc-100 tracking-tight mb-2">
                {f.title}
              </h3>
              <p className="text-zinc-400 text-xs leading-relaxed font-sans mt-1">
                {f.desc}
              </p>
            </div>
          ))}
        </motion.div>

        {/* Stats dashboard footer banner with glass cards */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.9, delay: 0.4 }}
          className="mt-16 w-full max-w-4xl border-t border-white/[0.05] pt-8 flex flex-wrap justify-around items-center gap-6"
        >
          {[
            { metric: 'Groq LLM', label: 'analysis engine' },
            { metric: 'AST + RAG', label: 'hybrid scanner' },
            { metric: 'Multi-lang', label: 'python · js · ts · go' },
            { metric: 'Git Clone', label: 'remote repository' }
          ].map((s, i) => (
            <div key={i} className="text-center px-4 py-2 rounded-2xl bg-white/[0.01] border border-white/[0.03]">
              <p className="font-display font-extrabold text-sm text-cyan-300 uppercase tracking-widest bg-gradient-to-br from-cyan-300 to-purple-300 bg-clip-text text-transparent">
                {s.metric}
              </p>
              <p className="text-[10px] text-zinc-500 uppercase font-mono tracking-widest mt-1">
                {s.label}
              </p>
            </div>
          ))}
        </motion.div>
      </main>

      {/* Floating neon ambient overlay highlights */}
      <footer className="relative z-10 glass-card border-x-0 border-b-0 rounded-none py-6 text-center text-[10px] text-zinc-500 font-mono tracking-[0.2em] mt-auto">
        GHOSTCODE DETECTOR © 2026 • ALL-IN-ONE SECURE WORKSPACE
      </footer>
    </div>
  );
}
