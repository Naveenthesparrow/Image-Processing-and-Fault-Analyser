import { useState, useCallback, useRef } from 'react';
import {
  Zap, RotateCcw, Download, AlertTriangle,
  ChevronDown, ToggleLeft, ToggleRight, Info,
  ArrowLeft
} from 'lucide-react';
import { UploadZone } from './components/UploadZone';
import { ProgressSteps, type StepStatus } from './components/ProgressSteps';
import { VerdictBanner } from './components/VerdictBanner';
import { ImageViewer } from './components/ImageViewer';
import { ComponentCard } from './components/ComponentCard';
import { ThermalPanel } from './components/ThermalPanel';
import { analyzeImage, type ImageTypeHint } from './ai/gemini';
import { buildReport, type Report, type ImageQualityInfo } from './logic/rules';
import { validateImageFile, computeBlurScore, getImageDimensions } from './utils/image';
import { labelOf } from './config/taxonomy';
import { MIN_IMAGE_SIDE } from './config/settings';

// ── Types ────────────────────────────────────────────────────────────────────

type AppState = 'idle' | 'loading' | 'result' | 'error';

interface ProgressStep {
  label: string;
  status: StepStatus;
}

const INITIAL_STEPS: ProgressStep[] = [
  { label: 'Checking image', status: 'pending' },
  { label: 'Detecting type', status: 'pending' },
  { label: 'Analysing components', status: 'pending' },
  { label: 'Building report', status: 'pending' },
];

// ── Error messages ────────────────────────────────────────────────────────────

const ERROR_MESSAGES: Record<string, { title: string; tip: string }> = {
  FREE_LIMIT_REACHED: {
    title: 'Free rate limit reached',
    tip: 'Wait about 1 minute and try again. Gemini free tier allows ~15 requests per minute.',
  },
  INVALID_API_KEY: {
    title: 'Invalid API key',
    tip: 'Check your VITE_GEMINI_API_KEY in the .env file. Make sure it is valid and not expired.',
  },
  ANALYSIS_FAILED: {
    title: 'Analysis failed',
    tip: 'Gemini returned an unexpected response. Please try again. If this persists, the image may be unsupported.',
  },
  NOT_A_POLE: {
    title: 'Image not recognized',
    tip: 'The AI did not recognize this as a valid power pole image. Please upload a clear RGB or Thermal photo of a power pole.',
  },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function App() {
  const [appState, setAppState]       = useState<AppState>('idle');
  const [steps, setSteps]             = useState<ProgressStep[]>(INITIAL_STEPS);
  const [report, setReport]           = useState<Report | null>(null);
  const [imageUrl, setImageUrl]       = useState<string | null>(null);
  const [error, setError]             = useState<{ title: string; tip: string } | null>(null);
  const [imageHint, setImageHint]     = useState<ImageTypeHint>('auto');
  const [doubleCheck, setDoubleCheck] = useState(false);
  const [geminiOutput, setGeminiOutput] = useState<any>(null);
  const [qualityInfo, setQualityInfo]   = useState<ImageQualityInfo | null>(null);

  const fileRef = useRef<File | null>(null);

  // ── Step helpers ─────────────────────────────────────────────────────────

  const setStep = useCallback((idx: number, status: StepStatus) => {
    setSteps((prev) => prev.map((s, i) => i === idx ? { ...s, status } : s));
  }, []);

  function resetSteps() {
    setSteps(INITIAL_STEPS.map((s) => ({ ...s, status: 'pending' })));
  }

  // ── Main analysis flow ───────────────────────────────────────────────────

  const handleFile = useCallback(async (file: File) => {
    fileRef.current = file;
    setAppState('loading');
    setError(null);
    setReport(null);
    resetSteps();

    // Revoke old URL
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    const url = URL.createObjectURL(file);
    setImageUrl(url);

    try {
      // Step 0: Image validation
      setStep(0, 'active');
      const validation = await validateImageFile(file);
      if (!validation.ok) {
        setStep(0, 'error');
        setError({ title: validation.error!, tip: validation.tip! });
        setAppState('error');
        return;
      }
      const dims = await getImageDimensions(file);
      const blurResult = await computeBlurScore(file);
      const quality: ImageQualityInfo = {
        blurWarning: blurResult.isBlurry,
        lowResWarning: Math.min(dims.width, dims.height) < MIN_IMAGE_SIDE * 1.5,
      };
      setQualityInfo(quality);
      setStep(0, 'done');

      // Step 1: Type detection (starts AI call)
      setStep(1, 'active');

      // Step 2: Analysing
      setStep(2, 'active');
      const result = await analyzeImage(file, imageHint, doubleCheck, (msg) => {
        // Update step label dynamically
        setSteps((prev) => {
          const next = [...prev];
          if (next[2].status === 'active') next[2] = { ...next[2], label: msg };
          return next;
        });
      });
      setStep(1, 'done');
      setStep(2, 'done');
      setGeminiOutput(result.data);

      // Step 3: Build report
      setStep(3, 'active');
      const rep = buildReport(result.data, quality, result.doubleCheckDisagreement ?? false);
      setReport(rep);
      setStep(3, 'done');
      setAppState('result');

    } catch (err) {
      const code = String(err instanceof Error ? err.message : err);
      const errInfo = ERROR_MESSAGES[code] ?? ERROR_MESSAGES.ANALYSIS_FAILED;
      setSteps((prev) => prev.map((s) => s.status === 'active' ? { ...s, status: 'error' } : s));
      setError(errInfo);
      setAppState('error');
    }
  }, [imageUrl, imageHint, doubleCheck, setStep]);

  // Handle manual thermal temperature entry
  const handleManualTemp = useCallback((tempC: number) => {
    if (!geminiOutput || !qualityInfo) return;
    const rep = buildReport(geminiOutput, qualityInfo, false, tempC);
    setReport(rep);
  }, [geminiOutput, qualityInfo]);

  // Download result JSON
  const downloadResult = useCallback(() => {
    if (!report || !geminiOutput) return;
    const payload = { report, geminiOutput, timestamp: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pole-inspection-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [report, geminiOutput]);

  const resetApp = useCallback(() => {
    setAppState('idle');
    setReport(null);
    setError(null);
    setGeminiOutput(null);
    setQualityInfo(null);
    resetSteps();
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(null);
    fileRef.current = null;
  }, [imageUrl]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col selection:bg-blue-200 selection:text-blue-900">
      {/* Top Navbar */}
      <nav className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 z-10">
        <div className="flex items-center gap-2">
          <Zap size={22} className="text-blue-600" aria-hidden="true" />
          <span className="font-black text-slate-900 text-xl tracking-tight">PowerPole Pro</span>
        </div>
        <a href="https://github.com/google/gemini" target="_blank" rel="noreferrer" className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors text-sm font-semibold bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
          <Info size={16} aria-hidden="true" />
          About
        </a>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8">
          <div className="max-w-[1400px] mx-auto w-full pt-2">
            {/* Header / Back Button */}
            <header className="mb-8">
              {appState !== 'idle' && (
                <button 
                  onClick={resetApp}
                  className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-5 font-bold text-sm transition-all w-fit cursor-pointer bg-white border border-slate-300 px-4 py-2 rounded-xl shadow-sm hover:shadow"
                >
                  <ArrowLeft size={16} aria-hidden="true" /> Clear & Start Over
                </button>
              )}
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900 mb-2">
                Power Pole Analysis
              </h1>
              <p className="text-base font-medium text-slate-500 max-w-2xl leading-relaxed">
                Upload a power pole image. The AI will automatically detect components, identify defects, and generate a safety report.
              </p>
            </header>

        {/* Controls bar */}
        {appState !== 'result' && (
          <div className="mb-6 flex flex-wrap items-center gap-4">
            {/* Image type override */}
            <div className="flex items-center gap-2">
              <label htmlFor="image-type-select" className="text-sm font-medium text-slate-500">
                Image type:
              </label>
              <div className="relative">
                <select
                  id="image-type-select"
                  value={imageHint}
                  onChange={(e) => setImageHint(e.target.value as ImageTypeHint)}
                  className="
                    appearance-none bg-white border border-slate-300 shadow-sm rounded-xl
                    px-4 py-2 pr-8 text-sm text-slate-800 font-medium
                    focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20
                    cursor-pointer
                  "
                  aria-label="Override image type detection"
                >
                  <option value="auto">Auto detect</option>
                  <option value="rgb">RGB</option>
                  <option value="thermal">Thermal</option>
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" aria-hidden="true" />
              </div>
            </div>

            {/* Double-check toggle */}
            <button
              id="double-check-toggle"
              onClick={() => setDoubleCheck((d) => !d)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition-all shadow-sm ${
                doubleCheck
                  ? 'bg-purple-50 border-purple-200 text-purple-700'
                  : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400'
              }`}
              aria-pressed={doubleCheck}
              title="Runs the AI analysis twice with different prompts to ensure consistency and high accuracy."
            >
              {doubleCheck ? <ToggleRight size={16} aria-hidden="true" /> : <ToggleLeft size={16} aria-hidden="true" />}
              Double-check mode
              <Info size={14} className="opacity-60 ml-1" aria-hidden="true" />
            </button>
            
            {doubleCheck && (
              <p className="text-xs text-purple-600 bg-purple-50 px-3 py-1.5 rounded-lg border border-purple-100 animate-fadeIn flex items-center gap-2">
                <Info size={12} />
                <strong>Double-check is ON:</strong> The AI will analyze the image twice to cross-verify results and ensure maximum accuracy.
              </p>
            )}
          </div>
        )}

        {/* ── IDLE / UPLOAD ── */}
        {appState === 'idle' && (
          <UploadZone onFile={handleFile} />
        )}

        {/* ── LOADING ── */}
        {appState === 'loading' && (
          <div className="flex flex-col md:flex-row items-center justify-center gap-12 lg:gap-20 py-16 w-full max-w-4xl mx-auto animate-fadeIn">
            {/* Left side: Image Scanning */}
            {imageUrl && (
              <div className="relative w-64 h-64 md:w-80 md:h-80 shrink-0 rounded-3xl overflow-hidden shadow-[0_10px_40px_-10px_rgba(59,130,246,0.3)] border border-slate-200">
                <img
                  src={imageUrl}
                  alt="Analyzing power pole image"
                  className="w-full h-full object-cover grayscale opacity-80"
                />
                {/* Scanning Laser Line */}
                <div className="absolute inset-x-0 h-[2px] bg-blue-500 shadow-[0_0_20px_4px_rgba(59,130,246,0.8)] animate-scan z-10" aria-hidden="true" />
                <div className="absolute inset-0 bg-blue-500/10 mix-blend-overlay animate-pulse" aria-hidden="true" />
              </div>
            )}
            
            {/* Right side: Steps */}
            <div className="flex-1 w-full max-w-sm">
              <ProgressSteps steps={steps} />
            </div>
          </div>
        )}

        {/* ── ERROR ── */}
        {appState === 'error' && error && (
          <div className="flex flex-col md:flex-row items-center justify-center gap-12 lg:gap-20 py-16 w-full max-w-4xl mx-auto animate-fadeIn">
            {/* Left side: Image */}
            {imageUrl && (
              <div className="relative w-64 h-64 md:w-80 md:h-80 shrink-0 rounded-3xl overflow-hidden shadow-lg border border-red-200">
                <img
                  src={imageUrl}
                  alt="Uploaded image that failed analysis"
                  className="w-full h-full object-cover grayscale opacity-50"
                />
                <div className="absolute inset-0 bg-red-500/10 mix-blend-overlay" aria-hidden="true" />
              </div>
            )}
            
            {/* Right side: Steps and Error */}
            <div className="flex-1 w-full max-w-sm flex flex-col gap-6">
              <ProgressSteps steps={steps} />
              
              <div
                role="alert"
                className="w-full px-5 py-4 rounded-2xl bg-red-50 border border-red-200 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle size={20} className="text-red-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <p className="font-bold text-red-700">{error.title}</p>
                    <p className="mt-1 text-sm text-red-600/90">{error.tip}</p>
                  </div>
                </div>
              </div>
              
              <button
                id="try-again-btn"
                onClick={resetApp}
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-sm shadow-sm transition-all"
              >
                <RotateCcw size={16} aria-hidden="true" />
                Try another image
              </button>
            </div>
          </div>
        )}

        {/* ── RESULT ── */}
        {appState === 'result' && report && (
          <div className="flex flex-col gap-6 animate-fadeIn">
            {/* Verdict banner */}
            <VerdictBanner
              verdict={report.verdict}
              overallSeverity={report.overallSeverity}
              severityLabel={labelOf(report.overallSeverity).label}
              imageType={report.imageType}
              isEstimated={report.thermalResult?.isEstimated}
            />

            {/* Quality warnings */}
            {(report.blurWarning || report.lowResWarning) && (
              <div
                role="alert"
                className="flex items-start gap-3 px-4 py-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 text-sm"
              >
                <Info size={16} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  {report.blurWarning && <p>⚠ Image appears blurry — retake closer in daylight for better accuracy.</p>}
                  {report.lowResWarning && <p>⚠ Image resolution is low — tiny cracks may not be visible.</p>}
                </div>
              </div>
            )}

            {/* Image viewer + thermal */}
            {imageUrl && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <ImageViewer
                    imageUrl={imageUrl}
                    components={report.components}
                    thermalHotspot={report.thermalResult ? (geminiOutput?.thermal?.hotspot_box_2d ?? null) : null}
                    thermalTempC={report.thermalResult?.tempC}
                    imageType={report.imageType}
                  />
                </div>

                {/* Thermal panel / summary sidebar */}
                <div className="flex flex-col gap-4">
                  {report.imageType === 'thermal' && report.thermalResult && (
                    <ThermalPanel
                      thermalResult={report.thermalResult}
                      onManualTemp={handleManualTemp}
                    />
                  )}

                  {/* Summary text */}
                  <div className="rounded-2xl border border-slate-300 bg-white shadow-sm p-5">
                    <h3 className="font-bold text-slate-800 text-sm mb-3 uppercase tracking-wider">Summary</h3>
                    <div className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">
                      {report.summary}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Component cards */}
            {report.imageType === 'rgb' && (
              <section aria-label="Component inspection results">
                <h2 className="text-lg font-bold text-slate-800 mb-4">Component Findings</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                  {[...report.components]
                    .sort((a, b) => {
                      if (a.status === 'NOT_VISIBLE' && b.status !== 'NOT_VISIBLE') return 1;
                      if (a.status !== 'NOT_VISIBLE' && b.status === 'NOT_VISIBLE') return -1;
                      return 0;
                    })
                    .map((comp) => (
                    <ComponentCard key={comp.component} result={comp} />
                  ))}
                </div>
              </section>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-3 pt-2">
              <button
                id="analyse-another-btn"
                onClick={resetApp}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 shadow-sm font-medium text-sm transition-all hover:border-slate-400"
              >
                <RotateCcw size={16} aria-hidden="true" />
                Analyse another
              </button>
              <button
                id="download-result-btn"
                onClick={downloadResult}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-electric-blue hover:bg-blue-600 shadow-sm text-white font-medium text-sm transition-all"
              >
                <Download size={16} aria-hidden="true" />
                Download result (JSON)
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-slate-300 text-center">
          <div
            role="note"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 font-medium text-xs shadow-sm"
          >
            <AlertTriangle size={12} aria-hidden="true" />
            AI-assisted result. Critical findings should be verified by a qualified inspector.
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Power Pole Inspector — frontend demo only. API key is bundled in browser build; do not deploy publicly.
          </p>
        </footer>
          </div>
        </div>
      </main>
    </div>
  );
}
