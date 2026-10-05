import { AlertTriangle, CheckCircle2, EyeOff, ChevronDown, ChevronUp, Crosshair } from 'lucide-react';
import { useState } from 'react';
import type { ComponentResult } from '../logic/rules';
import { labelOf } from '../config/taxonomy';

interface SummaryPanelProps {
  components: ComponentResult[];
  onComponentClick?: (componentName: string) => void;
  activeComponent?: string | null;
}

const ACTION_BY_SEVERITY: Record<number, string> = {
  0: 'No action required.',
  1: 'Monitor at next scheduled inspection.',
  2: 'Re-inspect within 3 months.',
  3: 'Schedule maintenance within 1 month.',
  4: 'Fix soon — prioritise within 2 weeks.',
  5: 'URGENT — take out of service immediately.',
};

const SEVERITY_BORDER: Record<number, string> = {
  0: 'border-slate-200',
  1: 'border-green-200',
  2: 'border-teal-200',
  3: 'border-yellow-200',
  4: 'border-orange-200',
  5: 'border-red-200',
};

const SEVERITY_BG: Record<number, string> = {
  0: 'bg-slate-50',
  1: 'bg-green-50',
  2: 'bg-teal-50',
  3: 'bg-yellow-50',
  4: 'bg-orange-50',
  5: 'bg-red-50',
};

export function SummaryPanel({ components, onComponentClick, activeComponent }: SummaryPanelProps) {
  const [showNotVisible, setShowNotVisible] = useState(false);

  const defects = components
    .filter((c) => c.status === 'DEFECT' && c.severity >= 1)
    .sort((a, b) => b.severity - a.severity);

  const monitors = components
    .filter((c) => c.status === 'DEFECT' && c.severity === 0)
    .concat(components.filter((c) => c.status === 'HEALTHY'));

  const notVisible = components.filter((c) => c.status === 'NOT_VISIBLE');

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm flex flex-col h-full max-h-[600px]">
      <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
        <h3 className="font-bold text-slate-800 text-sm uppercase tracking-widest">Inspection Summary</h3>
        <p className="text-xs text-slate-500 mt-1">Click an issue below to highlight it on the image</p>
      </div>

      <div className="divide-y divide-slate-100 overflow-y-auto">

        {/* ── DEFECTS section ── */}
        {defects.length > 0 ? (
          <div className="p-4 flex flex-col gap-3">
            <p className="text-[11px] font-bold text-red-600 uppercase tracking-widest flex items-center gap-1.5">
              <AlertTriangle size={11} />
              Defects Requiring Action
            </p>
            {defects.map((c) => {
              const sevMeta = labelOf(c.severity);
              const isActive = activeComponent === c.component;
              
              return (
                <button
                  key={c.component}
                  onClick={() => onComponentClick?.(c.component)}
                  className={`
                    w-full text-left rounded-xl border p-3 transition-all cursor-pointer
                    ${SEVERITY_BG[c.severity]} ${SEVERITY_BORDER[c.severity]}
                    ${isActive ? 'ring-2 ring-blue-500 shadow-md scale-[1.02]' : 'hover:shadow-sm hover:-translate-y-0.5'}
                  `}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Crosshair size={14} className={isActive ? 'text-blue-600 animate-pulse' : sevMeta.text} aria-hidden="true" />
                      <span className="font-bold text-slate-900 capitalize text-sm">{c.component}</span>
                    </div>
                    <span className={`text-xs font-black px-2 py-0.5 rounded-md border bg-white shadow-sm ${SEVERITY_BORDER[c.severity]} ${sevMeta.text}`}>
                      S{c.severity} · {sevMeta.label}
                    </span>
                  </div>

                  <p className="mt-1.5 text-xs font-semibold text-slate-700 capitalize">
                    Issue: {(c.issueType ?? '').replace(/_/g, ' ')}
                  </p>

                  {c.evidence && (
                    <p className="mt-1 text-xs text-slate-600 italic leading-relaxed">
                      "{c.evidence}"
                    </p>
                  )}

                  <div className={`mt-2 text-[11px] font-bold ${sevMeta.text} flex items-center gap-1`}>
                    <span>→</span>
                    <span>{ACTION_BY_SEVERITY[c.severity]}</span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="px-4 py-3 flex items-center gap-2 text-green-700 text-xs font-semibold bg-green-50/50">
            <CheckCircle2 size={14} />
            No defects detected
          </div>
        )}

        {/* ── HEALTHY / MONITOR section ── */}
        {monitors.length > 0 && (
          <div className="p-4 flex flex-col gap-2">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <CheckCircle2 size={11} />
              OK Components
            </p>
            {monitors.map((c) => (
              <div key={c.component} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-100">
                <CheckCircle2 size={13} className="text-green-600 mt-0.5 flex-shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-semibold text-slate-700 capitalize">{c.component}</span>
                  {c.issueType && (
                    <span className="text-slate-500 text-xs ml-1.5 capitalize">
                      — {c.issueType.replace(/_/g, ' ')}
                    </span>
                  )}
                  {c.evidence && (
                    <p className="text-[11px] text-slate-500 italic mt-0.5 leading-relaxed truncate">{c.evidence}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── NOT VISIBLE section (collapsed) ── */}
        {notVisible.length > 0 && (
          <div>
            <button
              onClick={() => setShowNotVisible((v) => !v)}
              className="w-full px-4 py-3 flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-widest hover:bg-slate-50 transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <EyeOff size={11} />
                Not Visible ({notVisible.length})
              </span>
              {showNotVisible ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>

            {showNotVisible && (
              <div className="px-4 pb-4 flex flex-col gap-1.5 bg-slate-50/50 pt-2 border-t border-slate-100">
                {notVisible.map((c) => (
                  <div key={c.component} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-slate-200 shadow-sm">
                    <EyeOff size={12} className="text-slate-400 flex-shrink-0" aria-hidden="true" />
                    <span className="text-xs font-medium text-slate-600 capitalize">{c.component}</span>
                    {c.notVisibleReason && (
                      <span className="text-slate-400 text-[11px]">— {c.notVisibleReason}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
