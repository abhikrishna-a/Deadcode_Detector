import { motion } from 'motion/react';
import { CheckCircle2 } from 'lucide-react';

interface DonutSegment {
  label: string;
  count: number;
  color: string;
  percent: number;
  startPercent: number;
}

interface DonutChartProps {
  segments: DonutSegment[];
  totalCount: number;
}

export default function DonutChart({ segments, totalCount }: DonutChartProps) {
  return (
    <div className="flex gap-6 items-start">
      <div className="flex-1 p-5 rounded-3xl glass-card">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-1 h-4 bg-cyan-400 rounded-full" />
          <span className="text-[10px] font-mono tracking-wider uppercase text-cyan-400 font-bold">Issue Breakdown</span>
          {segments.length > 0 && (
            <span className="text-[10px] font-mono text-zinc-500 ml-auto">
              {totalCount} total
            </span>
          )}
        </div>
        {segments.length > 0 ? (
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="relative flex-shrink-0">
              <svg width="140" height="140" viewBox="0 0 180 180">
                <circle cx="90" cy="90" r="72" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="18" />
                {segments.map((seg, i) => {
                  const circumference = 2 * Math.PI * 72;
                  const dashLen = seg.percent * circumference;
                  const dashGap = circumference - dashLen;
                  const offset = -seg.startPercent * circumference;
                  return (
                    <motion.circle
                      key={i}
                      cx="90" cy="90" r="72"
                      fill="none"
                      stroke={seg.color}
                      strokeWidth="18"
                      strokeDasharray={`${dashLen} ${dashGap}`}
                      strokeDashoffset={offset}
                      transform="rotate(-90 90 90)"
                      strokeLinecap="round"
                      initial={{ strokeDasharray: `0 ${circumference}` }}
                      animate={{ strokeDasharray: `${dashLen} ${dashGap}` }}
                      transition={{ duration: 0.8, delay: i * 0.1, ease: 'easeOut' }}
                    />
                  );
                })}
                <circle cx="90" cy="90" r="52" fill="#060608" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-lg font-display font-bold text-zinc-100">
                  {totalCount}
                </span>
              </div>
            </div>
            <div className="space-y-2 flex-1 w-full">
              {segments.map((seg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: i * 0.08 }}
                  className="flex items-center justify-between py-1"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: seg.color }} />
                    <span className="text-[11px] text-zinc-300 font-mono">{seg.label}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="font-mono text-zinc-400">{seg.count}</span>
                    <span className="text-[10px] font-mono text-zinc-600 w-8 text-right">
                      {Math.round(seg.percent * 100)}%
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-6 text-zinc-500">
            <CheckCircle2 size={22} className="text-emerald-400 mb-2" />
            <p className="text-[10px] font-mono">No issues found</p>
          </div>
        )}
      </div>
    </div>
  );
}
