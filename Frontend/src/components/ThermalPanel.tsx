import { useState } from 'react';
import { Thermometer, AlertCircle, Info } from 'lucide-react';
import type { ThermalResult } from '../logic/thermal';
import { THERMAL_THRESHOLD_C } from '../config/settings';

interface ThermalPanelProps {
  thermalResult: ThermalResult;
  onManualTemp: (tempC: number) => void;
}

export function ThermalPanel({ thermalResult, onManualTemp }: ThermalPanelProps) {
  const [inputVal, setInputVal] = useState('');
  const [inputError, setInputError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(inputVal);
    if (isNaN(val)) {
      setInputError('Please enter a valid number.');
      return;
    }
    setInputError('');
    onManualTemp(val);
  };

  const { tempC, source, isEstimated, verdict } = thermalResult;

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 shadow-sm p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-white border border-amber-100 shadow-sm text-amber-600">
          <Thermometer size={22} aria-hidden="true" />
        </div>
        <div>
          <h3 className="font-bold text-slate-900 text-base">Thermal Analysis</h3>
          <p className="text-xs text-slate-500">
            Threshold: {THERMAL_THRESHOLD_C} °C
          </p>
        </div>
      </div>

      {/* Temperature display */}
      {tempC !== null && tempC !== undefined ? (
        <div className="flex items-center gap-4">
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-widest">Max Temperature</p>
            <p className={`text-4xl font-black mt-1 ${
              tempC >= THERMAL_THRESHOLD_C ? 'text-red-600' : 'text-green-600'
            }`}
            aria-label={`Maximum temperature ${tempC} degrees Celsius`}>
              {tempC.toFixed(1)} °C
            </p>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Threshold: {THERMAL_THRESHOLD_C} °C &nbsp;
              {tempC >= THERMAL_THRESHOLD_C
                ? <span className="text-red-600">▲ {(tempC - THERMAL_THRESHOLD_C).toFixed(1)} above</span>
                : <span className="text-green-600">▼ {(THERMAL_THRESHOLD_C - tempC).toFixed(1)} below</span>
              }
            </p>
          </div>

          {/* Source badge */}
          <div className="ml-auto flex flex-col items-end gap-2">
            <span className={`px-2 py-1 rounded text-xs font-semibold shadow-sm ${
              source === 'overlay_text' ? 'bg-green-100 text-green-700' :
              source === 'colour_scale_estimate' ? 'bg-amber-100 text-amber-700' :
              source === 'manual' ? 'bg-blue-100 text-blue-700' :
              'bg-slate-200 text-slate-600'
            }`}>
              {source === 'overlay_text'           && '📷 From image text'}
              {source === 'colour_scale_estimate'   && '🎨 Estimated'}
              {source === 'manual'                  && '✍ Manual entry'}
              {source === 'none'                    && 'Unknown source'}
            </span>
            {isEstimated && (
              <p className="text-xs font-medium text-amber-700 text-right max-w-[180px]">
                Estimated from colour scale. Enter exact value for more accuracy.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2 text-amber-700 font-medium text-sm">
          <Info size={16} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
          <p>No temperature could be read from the image.</p>
        </div>
      )}

      {/* Manual input — shown when verdict is NEEDS_INPUT or estimated */}
      {(verdict === 'NEEDS_INPUT' || isEstimated) && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <label htmlFor="thermal-temp-input" className="text-sm text-slate-700 font-semibold">
            Enter maximum temperature from your thermal camera or API (°C):
          </label>
          <div className="flex gap-2">
            <input
              id="thermal-temp-input"
              type="number"
              step="0.1"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder="e.g. 72.3"
              className="
                flex-1 bg-white border border-slate-300 rounded-xl shadow-sm
                px-4 py-2.5 text-slate-900 placeholder-slate-400
                focus:outline-none focus:border-blue-500
                focus:ring-2 focus:ring-blue-500/20
                transition-colors text-sm font-medium
              "
              aria-describedby={inputError ? 'thermal-input-error' : undefined}
            />
            <button
              type="submit"
              id="thermal-submit-btn"
              className="
                px-5 py-2.5 rounded-xl bg-blue-600 text-white font-semibold shadow-sm
                text-sm hover:bg-blue-700 transition-colors
                focus:outline-none focus:ring-2 focus:ring-blue-600/30
              "
            >
              Apply
            </button>
          </div>
          {inputError && (
            <p id="thermal-input-error" role="alert" className="flex items-center gap-1.5 text-xs font-semibold text-red-600">
              <AlertCircle size={12} aria-hidden="true" /> {inputError}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
