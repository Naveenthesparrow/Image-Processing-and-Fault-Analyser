import { Eye, EyeOff, ZoomIn, ZoomOut, Maximize, Minimize, Crosshair } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
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
  activeComponent?: string | null;
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

export const ImageViewer = forwardRef<ImageViewerHandle, ImageViewerProps>(
  ({ imageUrl, components, activeComponent }, ref) => {
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

      if (!showMarkers) return;

      const drawnReticles: { x: number, y: number }[] = [];
      const drawnLabels: { x: number, y: number, w: number, h: number }[] = [];

      for (const comp of components) {
        if (comp.status !== 'DEFECT') continue;
        if (!comp.box2d) continue;
        const box = normToPixelBox(comp.box2d, W, H);
        if (!box) continue;
        
        const colour = SEVERITY_COLOURS[comp.severity] ?? SEVERITY_COLOURS[4];
        const isActive = activeComponent === comp.component;
        
        drawAdvancedMarker(ctx, box, colour, comp.component, comp.issueType ?? '', isActive, drawnReticles, drawnLabels);
      }
    }, [components, showMarkers, imgLoaded, activeComponent]);

    useEffect(() => {
      drawCanvas();
    }, [drawCanvas]);

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
      // Calculate click coordinates relative to the original image dimensions
      const mouseX = (e.clientX - rect.left) / (rect.width / img.naturalWidth);
      const mouseY = (e.clientY - rect.top) / (rect.height / img.naturalHeight);
      
      const W = img.naturalWidth;
      const H = img.naturalHeight;

      for (const comp of components) {
        if (comp.status !== 'DEFECT' || !comp.box2d) continue;
        const box = normToPixelBox(comp.box2d, W, H);
        if (!box) continue;
        
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        const dist = Math.sqrt(Math.pow(mouseX - cx, 2) + Math.pow(mouseY - cy, 2));
        
        // Hit detection radius (scaled to native resolution)
        if (dist < 100) {
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
    }, [components]);

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
      if (showMarkers) {
        const drawnReticles: { x: number, y: number }[] = [];
        const drawnLabels: { x: number, y: number, w: number, h: number }[] = [];

        for (const comp of components) {
          if (comp.status !== 'DEFECT' || !comp.box2d) continue;
          const box = normToPixelBox(comp.box2d, W, H);
          if (!box) continue;
          
          const colour = SEVERITY_COLOURS[comp.severity] ?? SEVERITY_COLOURS[4];
          const isActive = activeComponent === comp.component;
          
          drawAdvancedMarker(ctx, box, colour, comp.component, comp.issueType ?? '', isActive, drawnReticles, drawnLabels);
        }
      }

      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `marked-image-${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }, 'image/png');
    }, [components, showMarkers, activeComponent]);

    // Expose downloadImage to parent
    useImperativeHandle(ref, () => ({
      downloadImage
    }));

    // Handle native fullscreen API changes
    useEffect(() => {
      const handleFullscreenChange = () => {
        const isFull = !!document.fullscreenElement;
        setIsFullscreen(isFull);
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
              className={`block cursor-crosshair mx-auto ${isFullscreen ? 'w-full h-auto' : 'max-w-full max-h-[596px] object-contain'}`}
              onLoad={() => { setImgLoaded(true); drawCanvas(); }}
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full cursor-crosshair"
              style={{ pointerEvents: 'auto' }}
              onClick={handleCanvasClick}
            />
          </div>

          {/* Floating Tooltip */}
          {tooltip && (
            <div
              className="absolute z-10 pointer-events-none transition-opacity duration-200"
              style={{ left: tooltip.x + 16, top: tooltip.y - 16 }}
            >
              <div className="bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-xl p-4 shadow-2xl min-w-[220px] max-w-[280px]">
                <div className="flex items-center gap-2 mb-1">
                  <Crosshair size={14} className={labelOf(tooltip.severity).text} />
                  <p className="font-black text-white capitalize text-sm">{tooltip.label}</p>
                </div>
                <p className="text-xs font-bold text-slate-300 capitalize pb-2 border-b border-slate-700/50">
                  {tooltip.issue.replace(/_/g, ' ')}
                </p>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">"{tooltip.evidence}"</p>
                <div className={`mt-3 text-[11px] font-black tracking-wider uppercase bg-slate-800 px-2 py-1 rounded inline-block ${labelOf(tooltip.severity).text}`}>
                  Severity {tooltip.severity}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
);

ImageViewer.displayName = 'ImageViewer';

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
