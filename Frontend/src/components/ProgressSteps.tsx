import { Check, Loader2, AlertCircle } from 'lucide-react';

export type StepStatus = 'pending' | 'active' | 'done' | 'error';

interface Step {
  label: string;
  status: StepStatus;
}

interface ProgressStepsProps {
  steps: Step[];
}

export function ProgressSteps({ steps }: ProgressStepsProps) {
  return (
    <div className="flex flex-col w-full" role="status" aria-live="polite" aria-label="Analysis progress">
      {steps.map((step, idx) => {
        const isLast = idx === steps.length - 1;
        
        return (
          <div key={idx} className="relative flex gap-4">
            {/* Timeline line */}
            {!isLast && (
              <div 
                className={`absolute left-[15px] top-[30px] bottom-[-10px] w-[2px] transition-colors duration-500 ${
                  step.status === 'done' ? 'bg-green-500' : 'bg-slate-200'
                }`}
                aria-hidden="true"
              />
            )}
            
            {/* Timeline Icon */}
            <div className={`
              relative z-10 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center border-2 bg-white transition-all duration-500
              ${step.status === 'active' ? 'border-blue-500 text-blue-600 shadow-[0_0_10px_rgba(59,130,246,0.2)]' : ''}
              ${step.status === 'done' ? 'border-green-500 bg-green-500 text-white' : ''}
              ${step.status === 'error' ? 'border-red-500 text-red-600' : ''}
              ${step.status === 'pending' ? 'border-slate-200 text-slate-300' : ''}
            `}>
              {step.status === 'active' && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
              {step.status === 'done' && <Check size={16} strokeWidth={3} aria-hidden="true" />}
              {step.status === 'error' && <AlertCircle size={16} aria-hidden="true" />}
              {step.status === 'pending' && <span className="w-2 h-2 rounded-full bg-slate-200" aria-hidden="true" />}
            </div>

            {/* Content box */}
            <div className={`
              flex-1 pb-6 pt-1 transition-all duration-500
              ${step.status === 'pending' ? 'opacity-50' : 'opacity-100'}
            `}>
              <div className={`
                px-4 py-3 rounded-xl border bg-white shadow-sm flex items-center
                ${step.status === 'active' ? 'border-blue-200 bg-blue-50/50' : ''}
                ${step.status === 'done' ? 'border-green-200 bg-green-50/30' : ''}
                ${step.status === 'error' ? 'border-red-200 bg-red-50' : ''}
                ${step.status === 'pending' ? 'border-slate-100' : ''}
              `}>
                <span className={`text-sm font-bold
                  ${step.status === 'active' ? 'text-blue-700' : ''}
                  ${step.status === 'done' ? 'text-green-700' : ''}
                  ${step.status === 'error' ? 'text-red-700' : ''}
                  ${step.status === 'pending' ? 'text-slate-400' : ''}
                `}>
                  {step.label}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
