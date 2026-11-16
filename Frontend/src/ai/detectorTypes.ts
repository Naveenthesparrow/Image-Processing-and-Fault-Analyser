import type { Component } from '../config/taxonomy';

/**
 * OWLv2 zero-shot detector (Hugging Face, ONNX), run as q8 on WASM (~155 MB, one-time download).
 * Chosen over OWL-ViT v1, which found almost nothing on test pole photos.
 */
export const DETECTOR_MODEL = 'Xenova/owlv2-base-patch16-ensemble';

/**
 * Text prompts sent to the zero-shot detector, and which component each maps to.
 * Edit here to tune what the local detector looks for.
 *   minScore — per-prompt cut-off (tuned on sample photos; real hits scored 0.3–0.6)
 *   maxCount — cap on boxes kept per component
 *   maxArea  — largest plausible box as a fraction of the image (filters "whole scene" hits)
 */
export const DETECTOR_PROMPTS: Array<{ prompt: string; component: Component; minScore: number; maxCount: number; maxArea: number }> = [
  // No "electricity pylon" prompt: it scored higher than "insulator" on insulator strings.
  { prompt: 'utility pole',         component: 'structure',  minScore: 0.30, maxCount: 3, maxArea: 0.5 },
  { prompt: 'concrete pole',        component: 'structure',  minScore: 0.30, maxCount: 3, maxArea: 0.5 },
  { prompt: 'insulator',            component: 'insulator',  minScore: 0.15, maxCount: 8, maxArea: 0.08 },
  { prompt: 'electrical insulator', component: 'insulator',  minScore: 0.15, maxCount: 8, maxArea: 0.08 },
  { prompt: 'ceramic insulator',    component: 'insulator',  minScore: 0.15, maxCount: 8, maxArea: 0.08 },
  { prompt: 'electric wire',      component: 'conductor',  minScore: 0.40, maxCount: 4, maxArea: 0.8 },
  { prompt: 'tree',               component: 'vegetation', minScore: 0.20, maxCount: 3, maxArea: 0.8 },
];

export interface RawDetection {
  label: string;
  score: number;
  /** Fractions 0–1 of image width/height. */
  box: { xmin: number; ymin: number; xmax: number; ymax: number };
}

export interface Detection {
  component: Component;
  score: number;
  /** Same format as Gemini boxes: [ymin, xmin, ymax, xmax] normalised 0–1000. */
  box2d: [number, number, number, number];
}

export type DetectRequest = { id: number; image: Blob };

export type DetectResponse =
  | { type: 'progress'; message: string }
  | { type: 'result'; id: number; detections: RawDetection[] }
  | { type: 'error'; id: number; message: string };
