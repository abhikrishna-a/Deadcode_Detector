import { motion } from 'framer-motion';
import GridBg from './ui/GridBg';
import NoiseSVG from './ui/NoiseSVG';
import GlowOrb from './ui/GlowOrb';
import Btn from './ui/Btn';

export default function Landing({ onNav }) {
  return (
    <div style={{ position: 'relative', minHeight: '100vh', background: '#080808', overflow: 'hidden' }}>
      <NoiseSVG />
      <GridBg />
      <GlowOrb primary="#f97316" secondary="#7c2d12" top="20%" left="20%" size={500} />
      <GlowOrb primary="#f97316" secondary="#7c2d12" top="70%" left="80%" size={400} />

      {/* Nav */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 48px',
        background: 'rgba(8,8,8,0.8)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(249,115,22,0.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{
            background: 'linear-gradient(135deg, #ea580c, #f97316)',
            borderRadius: 8, padding: '4px 8px',
            fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 14, color: '#fff',
          }}>GC</span>
          <span style={{ color: '#f5ede0', fontSize: 16, fontWeight: 600, fontFamily: "'Syne', sans-serif" }}>
            GhostCode
          </span>
          <span style={{ color: '#6b7280', fontSize: 11, fontFamily: "'DM Mono', monospace'", display: 'none' }}>
            static analysis
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {/* <Btn variant="ghost" onClick={() => onNav('auth')}>Sign In</Btn> */}
          {/* <Btn variant="solid" onClick={() => onNav('auth')}>Get Started →</Btn> */}
        </div>
      </nav>

      {/* Hero */}
      <section style={{ textAlign: 'center', padding: '100px 48px', position: 'relative', zIndex: 1, maxWidth: 900, margin: '0 auto' }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <span style={{
            display: 'inline-block',
            background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.3)',
            borderRadius: 20, padding: '4px 14px',
            fontSize: 11, color: '#fb923c', fontFamily: "'DM Mono', monospace",
            marginBottom: 24, letterSpacing: 1,
          }}>
            ⬡ PYTHON · STATIC ANALYSIS · OPEN SOURCE
          </span>

          <h1 style={{
            fontFamily: "'Syne', sans-serif", fontWeight: 800,
            lineHeight: 1.15,
            marginBottom: 24,
          }}>
            <div style={{
              fontSize: 'clamp(3rem, 8vw, 6rem)',
              background: 'linear-gradient(135deg, #fff5eb 30%, #f97316 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              lineHeight: 1.1,
              marginBottom: 12,
            }}>Cleaner Repos.</div>
            <div style={{
              fontSize: 'clamp(1.8rem, 4vw, 3rem)',
              color: '#fb923c',
              lineHeight: 1.1,
            }}>Faster Deployments.</div>
          </h1>

          <p style={{
            fontFamily: "'DM Mono', monospace", fontSize: 16, color: '#9ca3af',
            maxWidth: 640, margin: '0 auto 40px', lineHeight: 1.7,
          }}>
            Upload Python source files and instantly detect unused functions, dead imports, stale variables, and unreachable code blocks.
          </p>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <Btn variant="solid" onClick={() => onNav('auth')}>Start Analyzing →</Btn>
            {/* <Btn variant="ghost" onClick={() => onNav('auth')}>Sign In</Btn> */}
          </div>
        </motion.div>
      </section>

      {/* Stats Row */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        style={{
          display: 'flex', justifyContent: 'center', gap: 60,
          padding: '0 48px 80px', flexWrap: 'wrap',
          position: 'relative', zIndex: 1,
        }}
      >
        {[
          { value: '5 types', label: 'of dead code' },
          { value: 'TOTP', label: 'MFA support' },
          { value: 'JWT', label: 'secure auth' },
          { value: 'REST', label: 'Django backend' },
        ].map(s => (
          <div key={s.label} style={{ textAlign: 'center' }}>
            <p style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 22, color: '#fb923c' }}>{s.value}</p>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#6b7280', marginTop: 4 }}>{s.label}</p>
          </div>
        ))}
      </motion.div>

      {/* Feature Cards */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 20, padding: '0 48px 100px', maxWidth: 1000, margin: '0 auto',
          position: 'relative', zIndex: 1,
        }}
      >
        {[
          { icon: '⬡', title: 'Ghost Scanner', desc: 'Detects unused functions, imports, variables, and unreachable blocks in your Python source files automatically.' },
          { icon: '⬡', title: 'Enterprise Security', desc: 'GhostCode ensures your data stays protected. No leaks. No breaches. Built for customer trust and peace of mind.' },
          { icon: '⬡', title: 'Customer Satisfaction', desc: 'Clean code means faster releases and fewer bugs. Your team ships with confidence, and your users feel the difference.' },
        ].map(f => (
          <div key={f.title} style={{
            background: 'rgba(0,0,0,0.5)',
            border: '1px solid rgba(249,115,22,0.2)',
            borderRadius: 16, padding: 28,
            transition: 'all 0.2s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(249,115,22,0.5)'; e.currentTarget.style.background = 'rgba(0,0,0,0.6)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(249,115,22,0.2)'; e.currentTarget.style.background = 'rgba(0,0,0,0.5)'; }}
          >
            <span style={{ fontSize: 24, color: '#f97316' }}>{f.icon}</span>
            <h3 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18, color: '#fff5eb', margin: '12px 0 8px' }}>{f.title}</h3>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#a8998a', lineHeight: 1.7 }}>{f.desc}</p>
          </div>
        ))}
      </motion.div>

      {/* Code preview strip */}
      <section style={{position:"relative",zIndex:10,maxWidth:900,margin:"0 auto",padding:"0 48px 120px"}}>
        <div style={{background:"rgba(0,0,0,0.5)",border:"1px solid rgba(249,115,22,0.2)",borderRadius:16,padding:28,fontFamily:"'DM Mono',monospace",fontSize:13,lineHeight:2}}>
          <div style={{display:"flex",gap:8,marginBottom:20}}>
            {["#f87171","#fbbf24","#4ade80"].map(c=><div key={c} style={{width:12,height:12,borderRadius:"50%",background:c}}/>)}
            <span style={{marginLeft:8,color:"#6b7280",fontSize:11}}>analysis_result.json</span>
          </div>
          <div><span style={{color:"#f97316"}}>{"{"}</span></div>
          <div style={{paddingLeft:24}}><span style={{color:"#f59e0b"}}>"status"</span><span style={{color:"#e2e8f0"}}>: </span><span style={{color:"#4ade80"}}>"completed"</span><span style={{color:"#e2e8f0"}}>,</span></div>
          <div style={{paddingLeft:24}}><span style={{color:"#f59e0b"}}>"issues"</span><span style={{color:"#e2e8f0"}}>: [</span></div>
          <div style={{paddingLeft:48}}><span style={{color:"#e2e8f0"}}>{"{ "}</span><span style={{color:"#f59e0b"}}>"type"</span><span style={{color:"#e2e8f0"}}>: </span><span style={{color:"#f87171"}}>"unused_function"</span><span style={{color:"#e2e8f0"}}>, </span><span style={{color:"#f59e0b"}}>"name"</span><span style={{color:"#e2e8f0"}}>: </span><span style={{color:"#4ade80"}}>"old_parser"</span><span style={{color:"#e2e8f0"}}>, </span><span style={{color:"#f59e0b"}}>"line"</span><span style={{color:"#e2e8f0"}}>: </span><span style={{color:"#fb923c"}}>42</span><span style={{color:"#e2e8f0"}}>{" }"}</span></div>
          <div style={{paddingLeft:48}}><span style={{color:"#e2e8f0"}}>{"{ "}</span><span style={{color:"#f59e0b"}}>"type"</span><span style={{color:"#e2e8f0"}}>: </span><span style={{color:"#fb923c"}}>"dead_import"</span><span style={{color:"#e2e8f0"}}>, </span><span style={{color:"#f59e0b"}}>"name"</span><span style={{color:"#e2e8f0"}}>: </span><span style={{color:"#4ade80"}}>"os.path"</span><span style={{color:"#e2e8f0"}}>, </span><span style={{color:"#f59e0b"}}>"confidence"</span><span style={{color:"#e2e8f0"}}>: </span><span style={{color:"#fb923c"}}>94</span><span style={{color:"#e2e8f0"}}>{" }"}</span></div>
          <div style={{paddingLeft:24}}><span style={{color:"#e2e8f0"}}>],</span></div>
          <div style={{paddingLeft:24}}><span style={{color:"#f59e0b"}}>"lines_saved"</span><span style={{color:"#e2e8f0"}}>: </span><span style={{color:"#fb923c"}}>312</span></div>
          <div><span style={{color:"#f97316"}}>{"}"}</span></div>
        </div>
      </section>
    </div>
  );
}
