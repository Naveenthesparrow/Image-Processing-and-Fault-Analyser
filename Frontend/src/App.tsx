import { useState, useCallback, useRef } from 'react';
import {
  Zap, RotateCcw, Download, AlertTriangle,
  Info, ArrowLeft, ScanLine,
} from 'lucide-react';
import { UploadZone } from './components/UploadZone';
import { ProgressSteps, type StepStatus } from './components/ProgressSteps';
import { VerdictBanner } from './components/VerdictBanner';
import { ImageViewer } from './components/ImageViewer';
import { ComponentCard } from './components/ComponentCard';
import { analyzeImage } from './ai/gemini';
import { buildReport, type Report, type ImageQualityInfo } from './logic/rules';
import { validateImageFile, computeBlurScore, getImageDimensions } from './utils/image';
import { labelOf } from './config/taxonomy';
import { MIN_IMAGE_SIDE } from './config/settings';

// ── Types ─────────────────────────────────────────────────────────────────────

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
    tip: 'The AI did not recognize this as a valid power pole image. Please upload a clear RGB photo of a power pole.',
  },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function App() {
  const [appState, setAppState]         = useState<AppState>('idle');
  const [steps, setSteps]               = useState<ProgressStep[]>(INITIAL_STEPS);
  const [report, setReport]             = useState<Report | null>(null);
  const [imageUrl, setImageUrl]         = useState<string | null>(null);
  const [error, setError]               = useState<{ title: string; tip: string } | null>(null);
  const [geminiOutput, setGeminiOutput] = useState<any>(null);

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
      setStep(0, 'done');

      // Step 1: Type detection
      setStep(1, 'active');

      // Step 2: Analysing
      setStep(2, 'active');
      const result = await analyzeImage(file, 'rgb', false, (msg) => {
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
  }, [imageUrl, setStep]);

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
    resetSteps();
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(null);
    fileRef.current = null;
  }, [imageUrl]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col selection:bg-blue-500/30 selection:text-blue-200">
      {/* Top Navbar */}
      <nav className="h-16 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 flex items-center justify-between px-6 shrink-0 z-10 sticky top-0">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-blue-600/20 border border-blue-500/30">
            <Zap size={18} className="text-blue-400" aria-hidden="true" />
          </div>
          <span className="font-black text-white text-lg tracking-tight">PowerPole <span className="text-blue-400">Pro</span></span>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <div className="flex-1 overflow-y-auto p-4 sm:p-8">
          <div className="max-w-[1400px] mx-auto w-full pt-2">

            {/* Header / Back Button */}
            <header className="mb-8">
              {appState !== 'idle' && (
                <button
                  onClick={resetApp}
                  className="flex items-center gap-2 text-slate-400 hover:text-white mb-5 font-semibold text-sm transition-all w-fit cursor-pointer bg-slate-800/60 border border-slate-700 hover:border-slate-500 px-4 py-2 rounded-xl hover:bg-slate-800"
                >
                  <ArrowLeft size={15} aria-hidden="true" /> Clear &amp; Start Over
                </button>
              )}
              <div className="flex items-center gap-3 mb-2">
                <ScanLine size={28} className="text-blue-400" />
                <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
                  Power Pole Analysis
                </h1>
              </div>
              <p className="text-base font-medium text-slate-400 max-w-2xl leading-relaxed ml-10">
                Upload a power pole image — the AI will detect components, identify defects, and generate a safety report instantly.
              </p>
            </header>

            {/* ── IDLE / UPLOAD ── */}
            {appState === 'idle' && (
              <UploadZone onFile={handleFile} />
            )}

            {/* ── LOADING ── */}
            {appState === 'loading' && (
              <div className="flex flex-col md:flex-row items-center justify-center gap-12 lg:gap-20 py-16 w-full max-w-4xl mx-auto animate-fadeIn">
                {/* Left side: Image Scanning */}
                {imageUrl && (
                  <div className="relative w-64 h-64 md:w-80 md:h-80 shrink-0 rounded-3xl overflow-hidden shadow-[0_10px_60px_-10px_rgba(59,130,246,0.4)] border border-slate-700">
                    <img
                      src={imageUrl}
                      alt="Analyzing power pole image"
                      className="w-full h-full object-cover opacity-60"
                    />
                    {/* Scanning Laser Line */}
                    <div className="absolute inset-x-0 h-[2px] bg-blue-400 shadow-[0_0_20px_6px_rgba(59,130,246,0.9)] animate-scan z-10" aria-hidden="true" />
                    <div className="absolute inset-0 bg-blue-600/10 mix-blend-overlay animate-pulse" aria-hidden="true" />
                    {/* Grid overlay */}
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.05)_1px,transparent_1px)] bg-[size:20px_20px]" aria-hidden="true" />
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
                  <div className="relative w-64 h-64 md:w-80 md:h-80 shrink-0 rounded-3xl overflow-hidden shadow-lg border border-red-900/50">
                    <img
                      src={imageUrl}
                      alt="Uploaded image that failed analysis"
                      className="w-full h-full object-cover grayscale opacity-40"
                    />
                    <div className="absolute inset-0 bg-red-900/20" aria-hidden="true" />
                  </div>
                )}

                {/* Right side: Steps and Error */}
                <div className="flex-1 w-full max-w-sm flex flex-col gap-6">
                  <ProgressSteps steps={steps} />

                  <div
                    role="alert"
                    className="w-full px-5 py-4 rounded-2xl bg-red-950/60 border border-red-800/60 shadow-sm"
                  >
                    <div className="flex items-start gap-3">
                      <AlertTriangle size={20} className="text-red-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
                      <div>
                        <p className="font-bold text-red-300">{error.title}</p>
                        <p className="mt-1 text-sm text-red-400/90">{error.tip}</p>
                      </div>
                    </div>
                  </div>

                  <button
                    id="try-again-btn"
                    onClick={resetApp}
                    className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700 hover:border-slate-600 text-slate-200 font-bold text-sm shadow-sm transition-all"
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
                />

                {/* Quality warnings */}
                {(report.blurWarning || report.lowResWarning) && (
                  <div
                    role="alert"
                    className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-950/50 border border-amber-700/40 text-amber-300 text-sm"
                  >
                    <Info size={16} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      {report.blurWarning && <p>⚠ Image appears blurry — retake closer in daylight for better accuracy.</p>}
                      {report.lowResWarning && <p>⚠ Image resolution is low — tiny cracks may not be visible.</p>}
                    </div>
                  </div>
                )}

                {/* Image viewer + summary */}
                {imageUrl && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2">
                      <ImageViewer
                        imageUrl={imageUrl}
                        components={report.components}
                      />
                    </div>

                    {/* Summary sidebar */}
                    <div className="flex flex-col gap-4">
                      <div className="rounded-2xl border border-slate-700/60 bg-slate-900/70 shadow-sm p-5">
                        <h3 className="font-bold text-slate-300 text-xs mb-3 uppercase tracking-widest">AI Summary</h3>
                        <div className="text-sm text-slate-400 leading-relaxed whitespace-pre-line">
                          {report.summary}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Component cards */}
                <section aria-label="Component inspection results">
                  <h2 className="text-lg font-bold text-slate-200 mb-4">Component Findings</h2>
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

                {/* Action buttons */}
                <div className="flex flex-wrap gap-3 pt-2 pb-4">
                  <button
                    id="analyse-another-btn"
                    onClick={resetApp}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700 hover:border-slate-600 text-slate-200 shadow-sm font-medium text-sm transition-all"
                  >
                    <RotateCcw size={16} aria-hidden="true" />
                    Analyse another
                  </button>
                  <button
                    id="download-result-btn"
                    onClick={downloadResult}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 shadow-md text-white font-semibold text-sm transition-all"
                  >
                    <Download size={16} aria-hidden="true" />
                    Download report (JSON)
                  </button>
                </div>
              </div>
            )}

            {/* Footer */}
            <footer className="mt-16 pt-8 border-t border-slate-800 text-center">
              <div
                role="note"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-950/40 border border-amber-800/40 text-amber-400 font-medium text-xs shadow-sm"
              >
                <AlertTriangle size={12} aria-hidden="true" />
                AI-assisted result. Critical findings should be verified by a qualified inspector.
              </div>
            </footer>

          </div>
        </div>
      </main>
    </div>
  );
}
