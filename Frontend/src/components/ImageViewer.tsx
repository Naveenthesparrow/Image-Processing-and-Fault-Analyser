import { Eye, EyeOff, ZoomIn, ZoomOut, Maximize, Minimize, Crosshair, Cpu, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import type { ComponentResult } from '../logic/rules';
import type { Detection } from '../ai/detectorTypes';
import { COMPONENT_META, labelOf, type Component } from '../config/taxonomy';
import { normToPixelBox, type PixelBox } from '../utils/boxes';

/** Anything on the image the user can hover or click. */
interface Target {
  key: string;
  component: Component;
  box2d: [number, number, number, number];
  source: 'gemini' | 'local';
  /** Local detector match score (0–1); undefined for Gemini boxes. */
  score?: number;
  /** Fault-check result for this component type, if the AI inspection ran. */
  result?: ComponentResult;
}

interface Tooltip {
  x: number;
  y: number;
  target: Target;
  pinned: boolean;
}

interface ImageViewerProps {
  imageUrl: string;
  components: ComponentResult[];
  /** Components found by the local in-browser detector. */
  detections?: Detection[];
  activeComponent?: string | null;
  onSelectComponent?: (component: Component) => void;
}

export interface ImageViewerHandle {
  downloadImage: () => void;
}

const SEVERITY_COLOURS: Record<number, string> = {
  0: '#3b82f6',
  1: '#22c55e',
  2: '#14b8a6',
  3: '#eab308',
  4: '#f97316',
  5: '#ef4444',
};

/** Outline colour per component type (non-defect boxes). */
const COMPONENT_COLOURS: Record<Component, string> = {
  structure: '#a78bfa',
  insulator: '#38bdf8',
  conductor: '#f472b6',
  vegetation: '#4ade80',
  sag: '#fbbf24',
};

const TOOLTIP_W = 280;

export const ImageViewer = forwardRef<ImageViewerHandle, ImageViewerProps>(
  ({ imageUrl, components, detections = [], activeComponent, onSelectComponent }, ref) => {
    const canvasRef     = useRef<HTMLCanvasElement>(null);
    const imgRef        = useRef<HTMLImageElement>(null);
    const containerRef  = useRef<HTMLDivElement>(null);
    const wrapperRef    = useRef<HTMLDivElement>(null);

    const [showMarkers, setShowMarkers] = useState(true);
    const [tooltip, setTooltip]         = useState<Tooltip | null>(null);
    const [imgLoaded, setImgLoaded]     = useState(false);
    const [zoom, setZoom]               = useState(1);
    const [isFullscreen, setIsFullscreen] = useState(false);

    // When active component changes, make sure markers are on
    useEffect(() => {
      if (activeComponent) {
        setShowMarkers(true);
      }
    }, [activeComponent]);

    const targets = useMemo(
      () => buildTargets(components, detections),
      [components, detections]
    );

    const hoveredKey = tooltip?.target.key ?? null;

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

      drawOverlay(ctx, W, H, targets, showMarkers, hoveredKey, activeComponent ?? null);
    }, [targets, showMarkers, imgLoaded, activeComponent, hoveredKey]);

    useEffect(() => {
      drawCanvas();
    }, [drawCanvas]);

    // Redraw on resize
    useEffect(() => {
      const ro = new ResizeObserver(() => drawCanvas());
      if (containerRef.current) ro.observe(containerRef.current);
      return () => ro.disconnect();
    }, [drawCanvas]);

    /** Find the smallest target under the pointer (smallest = most specific). */
    const hitTest = useCallback((e: React.MouseEvent<HTMLCanvasElement>): Target | null => {
      const rect = e.currentTarget.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 1000;
      const ny = ((e.clientY - rect.top) / rect.height) * 1000;

      let best: Target | null = null;
      let bestArea = Infinity;
      for (const t of targets) {
        const [ymin, xmin, ymax, xmax] = t.box2d;
        if (nx < xmin || nx > xmax || ny < ymin || ny > ymax) continue;
        const a = (ymax - ymin) * (xmax - xmin);
        if (a < bestArea) {
          best = t;
          bestArea = a;
        }
      }
      return best;
    }, [targets]);

    /** Tooltip position relative to the scrollable container, kept inside it. */
    const tooltipPos = useCallback((e: React.MouseEvent) => {
      const c = containerRef.current;
      if (!c) return { x: 0, y: 0 };
      const r = c.getBoundingClientRect();
      let x = e.clientX - r.left + c.scrollLeft + 16;
      let y = e.clientY - r.top + c.scrollTop + 16;
      if (x + TOOLTIP_W > c.scrollLeft + c.clientWidth - 8) x -= TOOLTIP_W + 32;
      if (y + 200 > c.scrollTop + c.clientHeight) y -= 200;
      return { x: Math.max(c.scrollLeft + 8, x), y: Math.max(c.scrollTop + 8, y) };
    }, []);

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
      if (tooltip?.pinned) return;
      const t = hitTest(e);
      setTooltip(t ? { ...tooltipPos(e), target: t, pinned: false } : null);
    }, [tooltip?.pinned, hitTest, tooltipPos]);

    const handleMouseLeave = useCallback(() => {
      setTooltip((prev) => (prev?.pinned ? prev : null));
    }, []);

    const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
      e.stopPropagation();
      const t = hitTest(e);
      if (!t) {
        setTooltip(null);
        return;
      }
      setTooltip({ ...tooltipPos(e), target: t, pinned: true });
      onSelectComponent?.(t.component);
    }, [hitTest, tooltipPos, onSelectComponent]);

    const downloadImage = useCallback(() => {
      const img = imgRef.current;
      if (!img) return;

      const W = img.naturalWidth;
      const H = img.naturalHeight;

      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Draw full resolution base image
      ctx.drawImage(img, 0, 0);

      // Draw markers at full resolution if they are enabled
      drawOverlay(ctx, W, H, targets, showMarkers, null, activeComponent ?? null);

      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `marked-image-${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }, 'image/png');
    }, [targets, showMarkers, activeComponent]);

    // Expose downloadImage to parent
    useImperativeHandle(ref, () => ({
      downloadImage
    }));

    // Handle native fullscreen API changes
    useEffect(() => {
      const handleFullscreenChange = () => {
        const isFull = !!document.fullscreenElement;
        setIsFullscreen(isFull);
        setTooltip(null);
        if (!isFull) {
          setZoom(1); // Reset zoom when exiting fullscreen
        }
      };
      document.addEventListener('fullscreenchange', handleFullscreenChange);
      return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    const toggleFullscreen = () => {
      if (!document.fullscreenElement) {
        wrapperRef.current?.requestFullscreen().catch(err => {
          console.warn(`Error attempting to enable fullscreen: ${err.message}`);
        });
      } else {
        document.exitFullscreen();
      }
    };

    return (
      <div ref={wrapperRef} className={`flex flex-col gap-3 h-full ${isFullscreen ? 'bg-slate-900 p-6' : ''}`}>
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={() => setShowMarkers((b) => !b)}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold shadow-sm
              border transition-all duration-200
              ${showMarkers
                ? 'bg-blue-50 border-blue-200 text-blue-700'
                : (isFullscreen ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-white border-slate-300 text-slate-600')
              }
            `}
          >
            {showMarkers ? <Eye size={16} /> : <EyeOff size={16} />}
            {showMarkers ? 'Hide markers' : 'Show markers'}
          </button>

          <div className="h-6 w-px bg-slate-300 mx-1 opacity-50" />

          {isFullscreen && (
            <>
              <button
                onClick={() => setZoom((z) => Math.min(z + 0.5, 3))}
                className="p-2 rounded-xl border shadow-sm transition-all bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                title="Zoom In"
              >
                <ZoomIn size={18} />
              </button>
              <button
                onClick={() => setZoom((z) => Math.max(z - 0.5, 1))}
                className="p-2 rounded-xl border shadow-sm transition-all bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                title="Zoom Out"
              >
                <ZoomOut size={18} />
              </button>

              {zoom !== 1 && (
                <button
                  onClick={() => setZoom(1)}
                  className="px-3 py-2 rounded-xl font-medium text-xs border shadow-sm transition-all bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                >
                  Reset Zoom
                </button>
              )}
            </>
          )}

          <p className={`text-xs font-medium ${isFullscreen ? 'text-slate-400' : 'text-slate-500'}`}>
            {targets.length > 0
              ? `Hover or click a box to identify it · ${targets.length} found`
              : 'No components located on the image'}
          </p>

          <div className="flex-1" />

          <button
            onClick={toggleFullscreen}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border shadow-sm transition-all ${isFullscreen ? 'bg-slate-800 border-slate-600 text-white hover:bg-slate-700' : 'bg-slate-900 border-slate-800 text-white hover:bg-slate-800'}`}
          >
            {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
            {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          </button>
        </div>

        {/* Image Container with native scrollbars only in fullscreen */}
        <div
          ref={containerRef}
          className={`relative flex items-center justify-center rounded-2xl shadow-inner border overflow-auto ${isFullscreen ? 'flex-1 bg-black border-slate-800' : 'bg-slate-100 border-slate-300 h-[600px]'}`}
          onClick={() => setTooltip(null)}
        >
          {/* Wrapper that scales its width based on zoom to force scrollbars */}
          <div
            className="relative origin-top-left transition-all duration-200"
            style={isFullscreen ? { width: `${zoom * 100}%` } : {}}
          >
            <img
              ref={imgRef}
              src={imageUrl}
              alt="Inspection target"
              className={`block mx-auto ${isFullscreen ? 'w-full h-auto' : 'max-w-full max-h-[596px] object-contain'}`}
              onLoad={() => { setImgLoaded(true); drawCanvas(); }}
            />
            <canvas
              ref={canvasRef}
              className={`absolute inset-0 w-full h-full ${hoveredKey ? 'cursor-pointer' : 'cursor-crosshair'}`}
              style={{ pointerEvents: 'auto' }}
              onClick={handleCanvasClick}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            />
          </div>

          {/* Floating Tooltip */}
          {tooltip && (
            <ComponentTooltip
              tooltip={tooltip}
              onClose={() => setTooltip(null)}
            />
          )}
        </div>
      </div>
    );
  }
);

ImageViewer.displayName = 'ImageViewer';

// ── Tooltip ───────────────────────────────────────────────────────────────────

function ComponentTooltip({ tooltip, onClose }: { tooltip: Tooltip; onClose: () => void }) {
  const { target, pinned } = tooltip;
  const r = target.result;
  const name = target.component.charAt(0).toUpperCase() + target.component.slice(1);
  const isDefect = r?.status === 'DEFECT';
  const sev = labelOf(r?.severity ?? 0);

  const issueText = (issue: string) => issue.charAt(0).toUpperCase() + issue.slice(1).replace(/_/g, ' ');
  let statusText: string;
  if (!r) statusText = 'Fault check not available for this image';
  else if (r.status === 'DEFECT') statusText = `${issueText(r.issueType ?? 'defect')} · Severity ${r.severity} (${sev.label})`;
  else if (r.status === 'HEALTHY') statusText = `No fault found${r.issueType ? ` · ${r.issueType.replace(/_/g, ' ')}` : ''}`;
  else if (r.status === 'LOW_CONFIDENCE') statusText = 'Uncertain — verify on site';
  else statusText = 'Not assessed by the fault check';

  return (
    <div
      className={`absolute z-10 ${pinned ? '' : 'pointer-events-none'}`}
      style={{ left: tooltip.x, top: tooltip.y, width: TOOLTIP_W }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-xl p-4 shadow-2xl">
        <div className="flex items-center gap-2 mb-1">
          <Crosshair size={14} style={{ color: isDefect ? SEVERITY_COLOURS[r!.severity] : COMPONENT_COLOURS[target.component] }} />
          <p className="font-black text-white text-sm flex-1">{name}</p>
          {pinned && (
            <button onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Close">
              <X size={14} />
            </button>
          )}
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          {COMPONENT_META[target.component].description}
        </p>

        <div className="mt-2 pt-2 border-t border-slate-700/50">
          <p className={`text-xs font-bold ${isDefect ? sev.text : r?.status === 'HEALTHY' ? 'text-green-400' : 'text-slate-400'}`}>
            {statusText}
          </p>
          {r?.evidence && r.status !== 'NOT_VISIBLE' && (
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">"{r.evidence}"</p>
          )}
        </div>

        <div className="mt-3 flex items-center gap-1.5 text-[10px] font-bold tracking-wider uppercase text-slate-500">
          {target.source === 'local'
            ? <><Cpu size={11} /> Detected on device · {Math.round((target.score ?? 0) * 100)}% match</>
            : <><Sparkles size={11} /> Approximate area from AI inspection</>}
        </div>
      </div>
    </div>
  );
}

// ── Targets & overlay ────────────────────────────────────────────────────────

function buildTargets(components: ComponentResult[], detections: Detection[]): Target[] {
  const resultOf = new Map(components.map((c) => [c.component, c]));
  const locallyFound = new Set(detections.map((d) => d.component));
  const targets: Target[] = [];

  // Positions come from the on-device detector (tight boxes). Gemini's boxes were tested on
  // real drone photos and land in the wrong place, so Gemini only supplies the verdict here.
  detections.forEach((d, i) => {
    targets.push({
      key: `l-${i}`,
      component: d.component,
      box2d: d.box2d,
      source: 'local',
      score: d.score,
      result: resultOf.get(d.component),
    });
  });

  // Fallback: a defect whose component the detector didn't find — show Gemini's (approximate) box
  for (const c of components) {
    if (c.status !== 'DEFECT' || !c.box2d || locallyFound.has(c.component)) continue;
    targets.push({ key: `g-${c.component}`, component: c.component, box2d: c.box2d, source: 'gemini', result: c });
  }
  return targets;
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  targets: Target[],
  showMarkers: boolean,
  hoveredKey: string | null,
  activeComponent: string | null
) {
  const baseScale = Math.max(1, W / 1200);
  const drawnReticles: { x: number, y: number }[] = [];
  const drawnLabels: { x: number, y: number, w: number, h: number }[] = [];
  const labelledDefects = new Set<string>();

  for (const t of targets) {
    const isHovered = t.key === hoveredKey;
    const isActive = activeComponent === t.component;
    if (!showMarkers && !isHovered) continue;

    const box = normToPixelBox(t.box2d, W, H);
    if (!box) continue;
    const r = t.result;
    const isDefect = r?.status === 'DEFECT';
    const colour = isDefect ? (SEVERITY_COLOURS[r.severity] ?? SEVERITY_COLOURS[4]) : COMPONENT_COLOURS[t.component];

    // Full marker with a label once per defective component (on its best box) and for Gemini fallbacks
    if (isDefect && (t.source === 'gemini' || !labelledDefects.has(t.component))) {
      labelledDefects.add(t.component);
      const issue = t.source === 'gemini' ? `${r.issueType ?? ''} (approx.)` : (r.issueType ?? '');
      drawAdvancedMarker(ctx, box, colour, t.component, issue, isHovered || isActive, drawnReticles, drawnLabels);
      continue;
    }

    if (isHovered || isActive) {
      ctx.fillStyle = hexToRgbA(colour, isHovered ? 0.22 : 0.12);
      ctx.fillRect(box.x, box.y, box.width, box.height);
    }
    ctx.strokeStyle = colour;
    ctx.lineWidth = (isHovered || isActive ? 2.5 : isDefect ? 2 : 1.25) * baseScale;
    ctx.setLineDash(!isDefect && !isHovered ? [5 * baseScale, 4 * baseScale] : []);
    ctx.strokeRect(box.x, box.y, box.width, box.height);
    ctx.setLineDash([]);

    if (isHovered) drawSmallLabel(ctx, box, colour, t.component, baseScale);
  }
}

function drawSmallLabel(ctx: CanvasRenderingContext2D, box: PixelBox, colour: string, text: string, baseScale: number) {
  const fontSize = 11 * baseScale;
  ctx.font = `bold ${fontSize}px Inter, sans-serif`;
  const label = text.toUpperCase();
  const w = ctx.measureText(label).width + 12 * baseScale;
  const h = fontSize + 8 * baseScale;
  const x = Math.min(box.x, ctx.canvas.width - w - 2);
  const y = box.y - h - 2 >= 0 ? box.y - h - 2 : box.y + 2;
  ctx.fillStyle = colour;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#0f172a';
  ctx.fillText(label, x + 6 * baseScale, y + fontSize + 2 * baseScale);
}

// ── High-Tech Marker Drawing ──────────────────────────────────────────────────

function drawAdvancedMarker(
  ctx: CanvasRenderingContext2D,
  box: PixelBox,
  colour: string,
  label: string,
  issueType: string,
  isActive: boolean,
  drawnReticles: { x: number, y: number }[],
  drawnLabels: { x: number, y: number, w: number, h: number }[]
) {
  const baseScale = Math.max(1, ctx.canvas.width / 1200);

  // 1. Draw Bounding Box (Light Fill + Corner Brackets)
  ctx.fillStyle = hexToRgbA(colour, isActive ? 0.2 : 0.05);
  ctx.fillRect(box.x, box.y, box.width, box.height);

  const cs = Math.max(15, Math.min(box.width, box.height) * 0.2) * baseScale;
  ctx.strokeStyle = colour;
  ctx.lineWidth = (isActive ? 3 : 2) * baseScale;
  
  ctx.beginPath();
  // Top-Left
  ctx.moveTo(box.x, box.y + cs);
  ctx.lineTo(box.x, box.y);
  ctx.lineTo(box.x + cs, box.y);
  // Top-Right
  ctx.moveTo(box.x + box.width - cs, box.y);
  ctx.lineTo(box.x + box.width, box.y);
  ctx.lineTo(box.x + box.width, box.y + cs);
  // Bottom-Right
  ctx.moveTo(box.x + box.width, box.y + box.height - cs);
  ctx.lineTo(box.x + box.width, box.y + box.height);
  ctx.lineTo(box.x + box.width - cs, box.y + box.height);
  // Bottom-Left
  ctx.moveTo(box.x + cs, box.y + box.height);
  ctx.lineTo(box.x, box.y + box.height);
  ctx.lineTo(box.x, box.y + box.height - cs);
  ctx.stroke();

  if (isActive) {
    ctx.setLineDash([4 * baseScale, 4 * baseScale]);
    ctx.strokeRect(box.x, box.y, box.width, box.height);
    ctx.setLineDash([]);
  }

  // Anchor point for label: Top-Right corner of the bounding box
  let cx = box.x + box.width;
  let cy = box.y;

  // Prevent anchor overlap if multiple boxes share the same top-right corner
  let rAttempts = 0;
  let rCollides = true;
  while (rCollides && rAttempts < 5) {
    rCollides = false;
    for (const dr of drawnReticles) {
      if (Math.hypot(cx - dr.x, cy - dr.y) < 15 * baseScale) {
        rCollides = true;
        cx += 15 * baseScale;
        cy -= 15 * baseScale;
        break;
      }
    }
    rAttempts++;
  }
  drawnReticles.push({ x: cx, y: cy });

  // 2. Draw Label
  const fontSize = (isActive ? 12 : 10) * baseScale;
  ctx.font = `bold ${fontSize}px Inter, sans-serif`;
  
  const displayIssue = issueType ? issueType.replace(/_/g, ' ').toUpperCase() : '';
  const text = displayIssue ? `${label.toUpperCase()} · ${displayIssue}` : label.toUpperCase();
  const tw = ctx.measureText(text).width;
  
  const pillH = fontSize + (10 * baseScale);
  const pillW = tw + (16 * baseScale);
  
  // Initial label position (shifted slightly right of the anchor)
  let lx = cx + (10 * baseScale);
  let ly = cy - pillH / 2;

  // Label Collision Resolution
  const spacing = 4 * baseScale;
  let lAttempts = 0;
  let lCollides = true;
  while (lCollides && lAttempts < 10) {
    lCollides = false;
    for (const dl of drawnLabels) {
      if (!(lx >= dl.x + dl.w + spacing || 
            lx + pillW + spacing <= dl.x || 
            ly >= dl.y + dl.h + spacing || 
            ly + pillH + spacing <= dl.y)) {
        lCollides = true;
        ly = dl.y + dl.h + spacing; // push down
        break;
      }
    }
    lAttempts++;
  }

  // Final Boundary Clamping to prevent rendering off-screen!
  if (lx + pillW > ctx.canvas.width - (5 * baseScale)) {
    lx = ctx.canvas.width - pillW - (5 * baseScale);
  }
  if (lx < 5 * baseScale) lx = 5 * baseScale;
  
  if (ly + pillH > ctx.canvas.height - (5 * baseScale)) {
    ly = ctx.canvas.height - pillH - (5 * baseScale);
  }
  if (ly < 5 * baseScale) ly = 5 * baseScale;

  drawnLabels.push({ x: lx, y: ly, w: pillW, h: pillH });

  // Draw connecting line from bounding box corner to label
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  const labelMidY = ly + pillH / 2;
  
  if (lx < cx) {
    // If the label was clamped left of the anchor, connect to its RIGHT side
    const elbowX = cx - (5 * baseScale);
    if (Math.abs(labelMidY - cy) > 2 * baseScale) {
      ctx.lineTo(elbowX, cy);
      ctx.lineTo(elbowX, labelMidY);
    }
    ctx.lineTo(lx + pillW, labelMidY);
  } else {
    // Label is on the right, connect to its LEFT side
    const elbowX = cx + (5 * baseScale);
    if (Math.abs(labelMidY - cy) > 2 * baseScale) {
      ctx.lineTo(elbowX, cy);
      ctx.lineTo(elbowX, labelMidY);
    }
    ctx.lineTo(lx, labelMidY);
  }
  
  ctx.strokeStyle = colour;
  ctx.lineWidth = 1.5 * baseScale;
  ctx.stroke();

  // Draw Pill Background
  ctx.fillStyle = isActive ? colour : 'rgba(15, 23, 42, 0.85)';
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(lx, ly, pillW, pillH, 4 * baseScale);
  } else {
    ctx.rect(lx, ly, pillW, pillH);
  }
  ctx.fill();

  ctx.strokeStyle = isActive ? '#fff' : colour;
  ctx.lineWidth = 1 * baseScale;
  ctx.stroke();

  // Draw Text
  ctx.fillStyle = isActive ? '#fff' : '#fff';
  ctx.fillText(text, lx + (8 * baseScale), ly + fontSize + (3 * baseScale));
}

function hexToRgbA(hex: string, alpha: number): string {
  if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
    let c = hex.substring(1).split('');
    if (c.length === 3) {
      c = [c[0], c[0], c[1], c[1], c[2], c[2]];
    }
    const num = parseInt(c.join(''), 16);
    return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
  }
  return `rgba(255, 0, 0, ${alpha})`; 
}
