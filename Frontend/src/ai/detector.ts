// Main-thread wrapper around the detector worker + post-processing (filtering, NMS).

import { DETECTOR_PROMPTS, type Detection, type DetectResponse, type RawDetection } from './detectorTypes';

let worker: Worker | null = null;
let nextId = 0;

function getWorker(): Worker {
  worker ??= new Worker(new URL('./detector.worker.ts', import.meta.url), { type: 'module' });
  return worker;
}

/** Detect power-pole components locally in the browser. Never calls a paid API. */
export function detectComponents(image: Blob, onProgress?: (msg: string) => void): Promise<Detection[]> {
  const w = getWorker();
  const id = ++nextId;

  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent<DetectResponse>) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        onProgress?.(msg.message);
        return;
      }
      if (msg.id !== id) return;
      w.removeEventListener('message', onMessage);
      if (msg.type === 'result') resolve(postProcess(msg.detections));
      else reject(new Error(msg.message));
    };
    w.addEventListener('message', onMessage);
    w.postMessage({ id, image });
  });
}

// ── Post-processing ──────────────────────────────────────────────────────────

export function postProcess(raw: RawDetection[]): Detection[] {
  const byPrompt = new Map(DETECTOR_PROMPTS.map((p) => [p.prompt, p]));

  const candidates: Detection[] = [];
  for (const d of raw) {
    const cfg = byPrompt.get(d.label);
    if (!cfg || d.score < cfg.minScore) continue;
    const b = d.box;
    const box2d: [number, number, number, number] = [
      clamp1000(b.ymin * 1000), clamp1000(b.xmin * 1000),
      clamp1000(b.ymax * 1000), clamp1000(b.xmax * 1000),
    ];
    if (box2d[0] >= box2d[2] || box2d[1] >= box2d[3]) continue;
    // Ignore boxes too big for this component — usually a false "match the scene" hit
    if (area(box2d) > cfg.maxArea * 1000 * 1000) continue;
    candidates.push({ component: cfg.component, score: d.score, box2d });
  }

  // Per-component non-max suppression, then cap the count
  const result: Detection[] = [];
  for (const cfg of uniqueComponents()) {
    const kept: Detection[] = [];
    const sorted = candidates.filter((c) => c.component === cfg.component).sort((a, b) => b.score - a.score);
    for (const c of sorted) {
      if (kept.length >= cfg.maxCount) break;
      if (kept.every((k) => iou(k.box2d, c.box2d) < 0.4)) kept.push(c);
    }
    result.push(...kept);
  }

  // The model scores every prompt independently, so one box can be both "pole" and
  // "insulator". When boxes of different components overlap heavily, keep the more
  // specific component (earlier in COMPONENT_PRIORITY).
  return result.filter((d) => !result.some((o) =>
    o !== d &&
    o.component !== d.component &&
    COMPONENT_PRIORITY.indexOf(o.component) < COMPONENT_PRIORITY.indexOf(d.component) &&
    iou(o.box2d, d.box2d) > 0.5
  ));
}

const COMPONENT_PRIORITY: Detection['component'][] = ['insulator', 'structure', 'conductor', 'vegetation', 'sag'];

function uniqueComponents() {
  const seen = new Map<string, { component: Detection['component']; maxCount: number }>();
  for (const p of DETECTOR_PROMPTS) {
    const prev = seen.get(p.component);
    seen.set(p.component, { component: p.component, maxCount: Math.max(prev?.maxCount ?? 0, p.maxCount) });
  }
  return [...seen.values()];
}

function clamp1000(v: number): number {
  return Math.max(0, Math.min(1000, Math.round(v)));
}

function area([ymin, xmin, ymax, xmax]: [number, number, number, number]): number {
  return Math.max(0, ymax - ymin) * Math.max(0, xmax - xmin);
}

export function iou(a: [number, number, number, number], b: [number, number, number, number]): number {
  const inter = area([Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])]);
  const union = area(a) + area(b) - inter;
  return union > 0 ? inter / union : 0;
}
