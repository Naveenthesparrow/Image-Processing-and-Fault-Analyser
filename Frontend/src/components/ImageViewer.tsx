import { Eye, EyeOff, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentResult } from '../logic/rules';
import { labelOf } from '../config/taxonomy';
import { normToPixelBox, type PixelBox } from '../utils/boxes';

interface Tooltip {
  x: number;
  y: number;
  label: string;
  issue: string;
  evidence: string;
  severity: number;
}

interface ImageViewerProps {
  imageUrl: string;
  components: ComponentResult[];
}

const SEVERITY_COLOURS: Record<number, string> = {
  0: '#3b82f6',
  1: '#22c55e',
  2: '#14b8a6',
  3: '#eab308',
  4: '#f97316',
  5: '#ef4444',
};

export function ImageViewer({ imageUrl, components }: ImageViewerProps) {
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const imgRef        = useRef<HTMLImageElement>(null);
  const containerRef  = useRef<HTMLDivElement>(null);
  const [showBoxes, setShowBoxes] = useState(true);
  const [tooltip, setTooltip]     = useState<Tooltip | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [zoom, setZoom]           = useState(1);

  // Draw canvas overlay whenever image loads or boxes toggle
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img    = imgRef.current;
    if (!canvas || !img || !imgLoaded) return;

    const W = img.clientWidth;
    const H = img.clientHeight;
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);

    if (!showBoxes) return;

    for (const comp of components) {
      if (!comp.box2d || comp.status === 'NOT_VISIBLE') continue;
      const box = normToPixelBox(comp.box2d, W, H);
      if (!box) continue;
      const colour = SEVERITY_COLOURS[comp.severity] ?? SEVERITY_COLOURS[0];
      drawBox(ctx, box, colour, comp.component, comp.severity);
    }
  }, [components, showBoxes, imgLoaded]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas, zoom]);

  // Redraw on resize
  useEffect(() => {
    const ro = new ResizeObserver(() => drawCanvas());
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [drawCanvas]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const img    = imgRef.current;
    if (!canvas || !img) return;

    const rect   = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) / zoom;
    const mouseY = (e.clientY - rect.top) / zoom;
    const W = img.clientWidth;
    const H = img.clientHeight;

    for (const comp of components) {
      if (!comp.box2d || comp.status === 'NOT_VISIBLE') continue;
      const box = normToPixelBox(comp.box2d, W, H);
      if (!box) continue;
      if (
        mouseX >= box.x && mouseX <= box.x + box.width &&
        mouseY >= box.y && mouseY <= box.y + box.height
      ) {
        setTooltip({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          label: comp.component,
          issue: comp.issueType ?? '',
          evidence: comp.evidence,
          severity: comp.severity,
        });
        return;
      }
    }
    setTooltip(null);
  }, [components, zoom]);

  return (
    <div className="flex flex-col gap-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          id="toggle-boxes-btn"
          onClick={() => setShowBoxes((b) => !b)}
          className={`
            flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold shadow-sm
            border transition-all duration-200
            ${showBoxes
              ? 'bg-blue-600/20 border-blue-500/40 text-blue-300'
              : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
            }
          `}
          aria-pressed={showBoxes}
          aria-label={showBoxes ? 'Hide detection boxes' : 'Show detection boxes'}
        >
          {showBoxes ? <Eye size={16} aria-hidden="true" /> : <EyeOff size={16} aria-hidden="true" />}
          {showBoxes ? 'Hide boxes' : 'Show boxes'}
        </button>

        <button
          id="zoom-in-btn"
          onClick={() => setZoom((z) => Math.min(z + 0.25, 3))}
          className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 shadow-sm hover:border-slate-600 transition-all"
          aria-label="Zoom in"
        >
          <ZoomIn size={16} aria-hidden="true" />
        </button>
        <button
          id="zoom-out-btn"
          onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))}
          className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 shadow-sm hover:border-slate-600 transition-all"
          aria-label="Zoom out"
        >
          <ZoomOut size={16} aria-hidden="true" />
        </button>
        {zoom !== 1 && (
          <button
            id="zoom-reset-btn"
            onClick={() => setZoom(1)}
            className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 font-medium shadow-sm text-xs hover:border-slate-600 transition-all"
            aria-label="Reset zoom"
          >
            Reset
          </button>
        )}
      </div>

      {/* Image + canvas overlay */}
      <div
        ref={containerRef}
        className="relative rounded-2xl overflow-hidden bg-slate-900 border border-slate-700/60 shadow-inner cursor-crosshair"
        onClick={() => setTooltip(null)}
        style={{ maxHeight: '520px' }}
      >
        <div
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
            width: `${100 / zoom}%`,
            transition: 'transform 0.2s ease',
          }}
        >
          <img
            ref={imgRef}
            src={imageUrl}
            alt="Power pole under analysis"
            className="w-full block"
            onLoad={() => { setImgLoaded(true); drawCanvas(); }}
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full"
            style={{ pointerEvents: 'auto' }}
            onClick={handleCanvasClick}
            role="img"
            aria-label="Detection overlay showing component bounding boxes"
          />
        </div>

        {/* Tooltip */}
        {tooltip && (
          <div
            className="absolute z-10 pointer-events-none"
            style={{ left: tooltip.x + 12, top: tooltip.y - 8 }}
          >
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 shadow-2xl min-w-[180px] max-w-[260px]">
              <p className="font-bold text-white capitalize text-sm">{tooltip.label}</p>
              <p className="text-xs font-semibold text-slate-400 mt-0.5 capitalize">{tooltip.issue.replace(/_/g, ' ')}</p>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed italic">"{tooltip.evidence}"</p>
              <div className={`mt-2 text-xs font-bold ${labelOf(tooltip.severity).text}`}>
                Severity {tooltip.severity} — {labelOf(tooltip.severity).label}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Canvas draw helpers ──────────────────────────────────────────────────────

function drawBox(
  ctx: CanvasRenderingContext2D,
  box: PixelBox,
  colour: string,
  label: string,
  severity: number
) {
  const lineW = severity >= 4 ? 3 : 2;
  ctx.strokeStyle = colour;
  ctx.lineWidth   = lineW;
  ctx.strokeRect(box.x, box.y, box.width, box.height);

  // Corner accents
  const cs = 12;
  ctx.lineWidth = lineW + 1;
  [[box.x, box.y], [box.x + box.width, box.y],
   [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]]
    .forEach(([cx, cy], i) => {
      ctx.beginPath();
      ctx.moveTo(cx + (i % 2 === 0 ? cs : -cs), cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + (i < 2 ? cs : -cs));
      ctx.stroke();
    });

  // Label
  const fontSize = 11;
  ctx.font       = `bold ${fontSize}px Inter, sans-serif`;
  const text     = label.toUpperCase();
  const tw       = ctx.measureText(text).width;
  ctx.fillStyle  = colour;
  const lx = box.x;
  const ly = box.y > 20 ? box.y - 4 : box.y + box.height + 16;
  ctx.fillRect(lx, ly - fontSize - 2, tw + 8, fontSize + 6);
  ctx.fillStyle = '#fff';
  ctx.fillText(text, lx + 4, ly);
}
