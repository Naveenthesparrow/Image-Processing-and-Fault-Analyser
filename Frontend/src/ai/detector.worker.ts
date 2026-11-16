// Runs the local (in-browser) component detector off the main thread.
// Model: OWLv2 zero-shot object detection from Hugging Face, via transformers.js.
// Free, no API key, no rate limit — model files are cached by the browser after first load.
//
// Pinned to transformers.js 3.8.1 + WASM/q8: tested in Chrome, 4.x fails to create an
// OWLv2 session ("Cast" node unsupported), and WebGPU/fp16 returned garbage scores (all 1.00).

import { pipeline, RawImage, type ZeroShotObjectDetectionPipeline } from '@huggingface/transformers';
import { DETECTOR_MODEL, DETECTOR_PROMPTS, type DetectRequest, type DetectResponse, type RawDetection } from './detectorTypes';

let detectorPromise: Promise<ZeroShotObjectDetectionPipeline> | null = null;

// transformers.js 3.x's overloaded pipeline() type is too complex for tsc (TS2590); narrow it.
const createPipeline = pipeline as unknown as (
  task: 'zero-shot-object-detection', model: string, options: object
) => Promise<ZeroShotObjectDetectionPipeline>;

function getDetector(): Promise<ZeroShotObjectDetectionPipeline> {
  detectorPromise ??= createPipeline('zero-shot-object-detection', DETECTOR_MODEL, {
    device: 'wasm',
    dtype: 'q8',
    progress_callback: (p: { status: string; progress?: number }) => {
      if (p.status === 'progress' && typeof p.progress === 'number') {
        post({ type: 'progress', message: `Downloading detector model (one-time)… ${Math.round(p.progress)}%` });
      }
    },
  });
  // Allow a retry on the next request if loading failed (e.g. network drop)
  detectorPromise.catch(() => { detectorPromise = null; });
  return detectorPromise;
}

function post(msg: DetectResponse) {
  self.postMessage(msg);
}

self.onmessage = async (e: MessageEvent<DetectRequest>) => {
  const { id, image } = e.data;
  try {
    post({ type: 'progress', message: 'Loading detector…' });
    const detector = await getDetector();

    post({ type: 'progress', message: 'Detecting components…' });
    const img = await RawImage.fromBlob(image);
    const output = await detector(img, DETECTOR_PROMPTS.map((p) => p.prompt), {
      threshold: Math.min(...DETECTOR_PROMPTS.map((p) => p.minScore)),
      percentage: true,
    });

    const list = Array.isArray(output) ? output : [output];
    const detections: RawDetection[] = (list as Array<{ score: number; label: string; box: { xmin: number; ymin: number; xmax: number; ymax: number } }>)
      .map((d) => ({ label: d.label, score: d.score, box: d.box }));

    post({ type: 'result', id, detections });
  } catch (err) {
    post({ type: 'error', id, message: err instanceof Error ? err.message : String(err) });
  }
};
