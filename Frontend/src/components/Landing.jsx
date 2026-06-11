import { motion } from 'framer-motion';
import GridBg from './ui/GridBg';
import NoiseSVG from './ui/NoiseSVG';
import GlowOrb from './ui/GlowOrb';
import Btn from './ui/Btn';

export default function Landing({ onNav }) {
  return (
    <div style={{ position: 'relative', minHeight: '100vh', background: '#0c0a09', overflow: 'hidden' }}>
      {/* Rich background gradient layer */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        background: `
          radial-gradient(ellipse 80% 60% at 50% 0%, rgba(5,150,105,0.06) 0%, transparent 60%),
          radial-gradient(ellipse 60% 50% at 80% 80%, rgba(5,150,105,0.04) 0%, transparent 50%),
          radial-gradient(ellipse 50% 40% at 20% 60%, rgba(5,150,105,0.03) 0%, transparent 50%),
          linear-gradient(180deg, #0c0a09 0%, #0f1410 50%, #0c0a09 100%)
        `,
        pointerEvents: 'none',
      }} />

      {/* Subtle vignette */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1,
        background: 'radial-gradient(ellipse 100% 80% at 50% 50%, transparent 40%, rgba(0,0,0,0.4) 100%)',
        pointerEvents: 'none',
      }} />

      <NoiseSVG />
      <GridBg />

      {/* Glow orbs — positioned for visual harmony */}
      <GlowOrb primary="#059669" secondary="#022c22" top="15%" left="15%" size={550} />
      <GlowOrb primary="#059669" secondary="#022c22" top="65%" left="75%" size={450} />
      <GlowOrb primary="#059669" secondary="#022c22" top="75%" left="25%" size={350} />
      <GlowOrb primary="#059669" secondary="#022c22" top="35%" left="80%" size={280} />

      {/* Hero spotlight */}
      <div style={{
        position: 'absolute', zIndex: 1,
        top: '15%', left: '50%', transform: 'translateX(-50%)',
        width: '80vw', maxWidth: 800, height: 400,
        background: 'radial-gradient(ellipse 50% 100% at 50% 50%, rgba(5,150,105,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <nav style={{
        position: 'sticky', top: 0, zIndex: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 48px',
        background: 'rgba(12,10,9,0.8)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(5,150,105,0.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{
            background: 'linear-gradient(135deg, #047857, #059669)',
            borderRadius: 8, padding: '4px 8px',
            fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 14, color: '#fff',
          }}>GC</span>
          <span style={{ color: '#ecfdf5', fontSize: 16, fontWeight: 600, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            GhostCode
          </span>
        </div>
      </nav>

      <section style={{ textAlign: 'center', padding: '100px 48px', position: 'relative', zIndex: 1, maxWidth: 900, margin: '0 auto' }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
           <span style={{
             display: 'inline-block',
             background: 'rgba(5,150,105,0.1)', border: '1px solid rgba(5,150,105,0.25)',
             borderRadius: 20, padding: '4px 14px',
             fontSize: 12, color: '#34d399', fontFamily: "'Inter', sans-serif", fontWeight: 500,
             marginBottom: 24, letterSpacing: 1.2,
           }}>
             PYTHON · STATIC ANALYSIS · OPEN SOURCE
           </span>

          <h1 style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800,
            lineHeight: 1.15,
            marginBottom: 24,
            textShadow: '0 0 80px rgba(5,150,105,0.1)',
          }}>
            <div style={{
              fontSize: 'clamp(3rem, 8vw, 6rem)',
              background: 'linear-gradient(135deg, #ecfdf5 20%, #34d399 60%, #059669 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              lineHeight: 1.1,
              marginBottom: 12,
            }}>Cleaner Repos.</div>
            <div style={{
              fontSize: 'clamp(1.8rem, 4vw, 3rem)',
              background: 'linear-gradient(135deg, #34d399 0%, #6ee7b7 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              lineHeight: 1.1,
            }}>Faster Deployments.</div>
          </h1>

          <p style={{
            fontFamily: "'Inter', sans-serif", fontSize: 16, color: '#a8a29e',
            maxWidth: 640, margin: '0 auto 40px', lineHeight: 1.7,
          }}>
            Upload Python source files and instantly detect unused functions, dead imports, stale variables, and unreachable code blocks.
          </p>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <Btn variant="solid" onClick={() => onNav('auth')}>Start Analyzing →</Btn>
          </div>
        </motion.div>
      </section>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 0,
          padding: '40px 48px 80px', flexWrap: 'wrap',
          position: 'relative', zIndex: 1,
        }}
      >
        {[
          { value: 'zero', label: 'config needed' },
          { value: 'drag & drop', label: 'file upload' },
          { value: 'Python', label: 'JS · TS · more' },
          { value: 'no vendor', label: 'lock-in' },
        ].map((s, i, arr) => (
          <div key={s.label} style={{ textAlign: 'center', padding: '0 48px', position: 'relative' }}>
            {i < arr.length - 1 && (
              <div style={{
                position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
                width: 1, height: 36, background: 'rgba(5,150,105,0.12)',
              }} />
            )}
            <p style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 22, color: '#34d399' }}>{s.value}</p>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: '#78716c', marginTop: 4, letterSpacing: 0.5 }}>{s.label}</p>
          </div>
        ))}
      </motion.div>

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
          { icon: '◈', title: 'Ghost Scanner', desc: 'Detects unused functions, imports, variables, and unreachable blocks in your Python source files automatically.' },
          { icon: '◈', title: 'Enterprise Security', desc: 'Your data stays protected. No leaks. No breaches. Built for customer trust.' },
          { icon: '◈', title: 'Ship with Confidence', desc: 'Clean code means faster releases and fewer bugs. Your team ships with confidence.' },
        ].map(f => (
          <div key={f.title} style={{
            background: 'linear-gradient(135deg, rgba(28,25,23,0.9) 0%, rgba(28,25,23,0.6) 100%)',
            border: '1px solid rgba(53,50,48,0.6)',
            borderRadius: 14, padding: 28,
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: '0 0 0 0 rgba(5,150,105,0)',
            backdropFilter: 'blur(4px)',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(5,150,105,0.4)'; e.currentTarget.style.background = 'linear-gradient(135deg, rgba(41,37,36,0.95) 0%, rgba(41,37,36,0.7) 100%)'; e.currentTarget.style.boxShadow = '0 0 30px rgba(5,150,105,0.08)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(53,50,48,0.6)'; e.currentTarget.style.background = 'linear-gradient(135deg, rgba(28,25,23,0.9) 0%, rgba(28,25,23,0.6) 100%)'; e.currentTarget.style.boxShadow = '0 0 0 0 rgba(5,150,105,0)'; }}
          >
            <span style={{ fontSize: 20, color: '#34d399', opacity: 0.8 }}>{f.icon}</span>
            <h3 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 18, color: '#ecfdf5', margin: '12px 0 8px' }}>{f.title}</h3>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#a8a29e', lineHeight: 1.7 }}>{f.desc}</p>
          </div>
        ))}
      </motion.div>

       <section style={{position:"relative",zIndex:10,maxWidth:900,margin:"0 auto",padding:"0 48px 120px"}}>
         <div 
           style={{
              background:"linear-gradient(135deg, rgba(28,25,23,0.9) 0%, rgba(28,25,23,0.6) 100%)",
              border:"1px solid rgba(53,50,48,0.6)", 
              borderRadius:14, 
              padding:28, 
              fontFamily:"'JetBrains Mono',monospace", 
              fontSize:13, 
              lineHeight:2,
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: '0 0 0 0 rgba(5,150,105,0)',
              backdropFilter: 'blur(4px)',
           }}
           onMouseEnter={(e) => {
             e.currentTarget.style.borderColor = 'rgba(5,150,105,0.3)';
             e.currentTarget.style.background = 'linear-gradient(135deg, rgba(41,37,36,0.95) 0%, rgba(41,37,36,0.7) 100%)';
             e.currentTarget.style.boxShadow = '0 0 30px rgba(5,150,105,0.08)';
           }}
           onMouseLeave={(e) => {
             e.currentTarget.style.borderColor = 'rgba(53,50,48,0.6)';
             e.currentTarget.style.background = 'linear-gradient(135deg, rgba(28,25,23,0.9) 0%, rgba(28,25,23,0.6) 100%)';
             e.currentTarget.style.boxShadow = '0 0 0 0 rgba(5,150,105,0)';
           }}
         >
          <div style={{display:"flex",gap:8,marginBottom:20}}>
            {["#ef4444","#f59e0b","#22c55e"].map(c=><div key={c} style={{width:12,height:12,borderRadius:"50%",background:c}}/>)}
            <span style={{marginLeft:8,color:"#78716c",fontSize:11}}>analysis_result.json</span>
          </div>
          <div><span style={{color:"#34d399"}}>{"{"}</span></div>
          <div style={{paddingLeft:24}}><span style={{color:"#f59e0b"}}>"status"</span><span style={{color:"#e7e5e4"}}>: </span><span style={{color:"#22c55e"}}>"completed"</span><span style={{color:"#e7e5e4"}}>,</span></div>
          <div style={{paddingLeft:24}}><span style={{color:"#f59e0b"}}>"issues"</span><span style={{color:"#e7e5e4"}}>: [</span></div>
          <div style={{paddingLeft:48}}><span style={{color:"#e7e5e4"}}>{"{ "}</span><span style={{color:"#f59e0b"}}>"type"</span><span style={{color:"#e7e5e4"}}>: </span><span style={{color:"#ef4444"}}>"unused_function"</span><span style={{color:"#e7e5e4"}}>, </span><span style={{color:"#f59e0b"}}>"name"</span><span style={{color:"#e7e5e4"}}>: </span><span style={{color:"#22c55e"}}>"old_parser"</span><span style={{color:"#e7e5e4"}}>, </span><span style={{color:"#f59e0b"}}>"line"</span><span style={{color:"#e7e5e4"}}>: </span><span style={{color:"#34d399"}}>42</span><span style={{color:"#e7e5e4"}}>{" }"}</span></div>
          <div style={{paddingLeft:48}}><span style={{color:"#e7e5e4"}}>{"{ "}</span><span style={{color:"#f59e0b"}}>"type"</span><span style={{color:"#e7e5e4"}}>: </span><span style={{color:"#34d399"}}>"dead_import"</span><span style={{color:"#e7e5e4"}}>, </span><span style={{color:"#f59e0b"}}>"name"</span><span style={{color:"#e7e5e4"}}>: </span><span style={{color:"#22c55e"}}>"os.path"</span><span style={{color:"#e7e5e4"}}>, </span><span style={{color:"#f59e0b"}}>"confidence"</span><span style={{color:"#e7e5e4"}}>: </span><span style={{color:"#34d399"}}>94</span><span style={{color:"#e7e5e4"}}>{" }"}</span></div>
          <div style={{paddingLeft:24}}><span style={{color:"#e7e5e4"}}>],</span></div>
          <div style={{paddingLeft:24}}><span style={{color:"#f59e0b"}}>"lines_saved"</span><span style={{color:"#e7e5e4"}}>: </span><span style={{color:"#34d399"}}>312</span></div>
          <div><span style={{color:"#34d399"}}>{"}"}</span></div>
        </div>
      </section>
    </div>
  );
}
