import {
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  XCircle,
  Eye,
  Zap,
} from 'lucide-react';
import type { Verdict } from '../logic/rules';

interface VerdictConfig {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  bg: string;
  border: string;
  textClass: string;
  accent: string;
}

const VERDICT_CONFIG: Record<Verdict, VerdictConfig> = {
  GOOD: {
    icon: <CheckCircle2 size={36} aria-hidden="true" />,
    label: 'ALL CLEAR',
    sublabel: 'No defects detected',
    bg: 'bg-emerald-950/60',
    border: 'border-emerald-700/40',
    textClass: 'text-emerald-400',
    accent: 'from-emerald-500/10 to-transparent',
  },
  DEFECT_FOUND: {
    icon: <AlertTriangle size={36} aria-hidden="true" />,
    label: 'DEFECT FOUND',
    sublabel: 'Inspection action required',
    bg: 'bg-red-950/60',
    border: 'border-red-700/40',
    textClass: 'text-red-400',
    accent: 'from-red-500/10 to-transparent',
  },
  GOOD_MONITOR: {
    icon: <CheckCircle2 size={36} aria-hidden="true" />,
    label: 'GOOD — MONITOR',
    sublabel: 'No defects, minor items to watch',
    bg: 'bg-teal-950/60',
    border: 'border-teal-700/40',
    textClass: 'text-teal-400',
    accent: 'from-teal-500/10 to-transparent',
  },
  INCONCLUSIVE: {
    icon: <HelpCircle size={36} aria-hidden="true" />,
    label: 'INCONCLUSIVE',
    sublabel: 'Limited visibility — not enough data for a clear verdict',
    bg: 'bg-slate-800/60',
    border: 'border-slate-600/40',
    textClass: 'text-slate-300',
    accent: 'from-slate-400/10 to-transparent',
  },
  INVALID: {
    icon: <XCircle size={36} aria-hidden="true" />,
    label: 'INVALID IMAGE',
    sublabel: 'Not a power pole or unusable image',
    bg: 'bg-slate-900/60',
    border: 'border-slate-700/40',
    textClass: 'text-slate-400',
    accent: 'from-slate-500/10 to-transparent',
  },
  NEEDS_REVIEW: {
    icon: <Eye size={36} aria-hidden="true" />,
    label: 'NEEDS REVIEW',
    sublabel: 'Human verification recommended',
    bg: 'bg-purple-950/60',
    border: 'border-purple-700/40',
    textClass: 'text-purple-400',
    accent: 'from-purple-500/10 to-transparent',
  },
  NEEDS_INPUT: {
    icon: <HelpCircle size={36} aria-hidden="true" />,
    label: 'NEEDS INPUT',
    sublabel: 'Additional information required',
    bg: 'bg-amber-950/60',
    border: 'border-amber-700/40',
    textClass: 'text-amber-400',
    accent: 'from-amber-500/10 to-transparent',
  },
};

interface VerdictBannerProps {
  verdict: Verdict;
  overallSeverity: number;
  severityLabel?: string;
}

export function VerdictBanner({
  verdict,
  overallSeverity,
  severityLabel,
}: VerdictBannerProps) {
  const cfg = VERDICT_CONFIG[verdict];

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Verdict: ${cfg.label}`}
      className={`
        relative overflow-hidden rounded-2xl border px-6 py-6
        ${cfg.bg} ${cfg.border}
        shadow-xl transition-all duration-700
      `}
    >
      {/* Gradient accent */}
      <div className={`absolute inset-0 bg-gradient-to-br ${cfg.accent} pointer-events-none`} aria-hidden="true" />

      {/* Pulse ring for high severity */}
      {verdict === 'DEFECT_FOUND' && overallSeverity >= 4 && (
        <div className="absolute inset-0 rounded-2xl border-2 border-red-500/30 animate-pulse" aria-hidden="true" />
      )}

      <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-4">
        {/* Icon */}
        <div className={`p-3 rounded-xl bg-slate-900/60 border border-slate-700/60 ${cfg.textClass} flex-shrink-0`}>
          {cfg.icon}
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className={`text-2xl sm:text-3xl font-black tracking-tight ${cfg.textClass}`}>
              {cfg.label}
            </h2>
            <span className="px-2 py-0.5 rounded-md bg-slate-800/80 border border-slate-700/60 text-slate-400 text-xs font-semibold flex items-center gap-1">
              <Zap size={10} aria-hidden="true" />
              RGB
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-slate-400">{cfg.sublabel}</p>
        </div>

        {/* Severity badge */}
        {verdict === 'DEFECT_FOUND' && severityLabel && (
          <div className="flex-shrink-0 flex flex-col items-center px-6 py-3 rounded-xl bg-slate-900/80 border border-slate-700/60 shadow-sm">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-0.5">Severity</span>
            <span className={`text-3xl font-black ${cfg.textClass}`}>{overallSeverity}</span>
            <span className={`text-xs font-bold ${cfg.textClass}`}>{severityLabel}</span>
          </div>
        )}
      </div>
    </div>
  );
}
