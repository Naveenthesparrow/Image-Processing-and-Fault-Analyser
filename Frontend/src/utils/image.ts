import {
  MAX_IMAGE_SIDE,
  JPEG_QUALITY,
  MAX_FILE_SIZE,
  MIN_IMAGE_SIDE,
  BLUR_WARN_THRESHOLD,
} from '../config/settings';

// ── File validation ──────────────────────────────────────────────────────────

const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export interface ImageValidationResult {
  ok: boolean;
  error?: string;
  /** Human-readable fix tip shown in the UI. */
  tip?: string;
}

export async function validateImageFile(file: File): Promise<ImageValidationResult> {
  // 1. File type
  if (!ACCEPTED_TYPES.has(file.type)) {
    return {
      ok: false,
      error: `Unsupported file type: ${file.type || 'unknown'}`,
      tip: 'Use a JPG, PNG, or WEBP image.',
    };
  }

  // 2. File size
  if (file.size > MAX_FILE_SIZE) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return {
      ok: false,
      error: `File too large: ${mb} MB (max ${MAX_FILE_SIZE / 1024 / 1024} MB)`,
      tip: 'Reduce the image resolution or use a different camera setting.',
    };
  }

  // 3. Decode & dimension check
  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch {
    return {
      ok: false,
      error: 'Could not decode image file.',
      tip: 'The file may be corrupted. Try a different image.',
    };
  }

  const minSide = Math.min(img.naturalWidth, img.naturalHeight);
  if (minSide < MIN_IMAGE_SIDE) {
    return {
      ok: false,
      error: `Image is too small (${img.naturalWidth}×${img.naturalHeight} px, minimum ${MIN_IMAGE_SIDE} px on each side)`,
      tip: 'Use a higher-resolution photo taken closer to the pole.',
    };
  }

  return { ok: true };
}

// ── Blur detection ────────────────────────────────────────────────────────────

export interface BlurResult {
  score: number;
  isBlurry: boolean;
}

/** Compute Laplacian variance as a proxy for sharpness. */
export async function computeBlurScore(file: File): Promise<BlurResult> {
  const img = await loadImage(file);

  // Downscale for speed (max 256×256)
  const scale = Math.min(1, 256 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);

  const { data } = ctx.getImageData(0, 0, w, h);

  // Convert to greyscale
  const grey: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    grey.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }

  // Laplacian kernel convolution
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const lap =
        -grey[idx - w - 1] - grey[idx - w] - grey[idx - w + 1]
        - grey[idx - 1]  + 8 * grey[idx] - grey[idx + 1]
        - grey[idx + w - 1] - grey[idx + w] - grey[idx + w + 1];
      sumSq += lap * lap;
      count++;
    }
  }

  const score = count > 0 ? sumSq / count : 0;
  return { score, isBlurry: score < BLUR_WARN_THRESHOLD };
}

// ── Image resize ──────────────────────────────────────────────────────────────

/** Resize image so longest side ≤ maxSide, returning a new File/Blob. */
export async function resizeImage(
  file: File,
  maxSide: number = MAX_IMAGE_SIDE,
  quality: number = JPEG_QUALITY
): Promise<Blob> {
  const img = await loadImage(file);
  const { naturalWidth: w, naturalHeight: h } = img;

  const scale = Math.min(1, maxSide / Math.max(w, h));
  const tw = Math.round(w * scale);
  const th = Math.round(h * scale);

  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, tw, th);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas toBlob returned null'))),
      'image/jpeg',
      quality
    );
  });
}

// ── Base64 encoding ───────────────────────────────────────────────────────────

export async function imageToBase64(blob: Blob): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // result = "data:image/jpeg;base64,XXXX"
      const [header, base64] = result.split(',');
      const mimeType = header.replace('data:', '').replace(';base64', '');
      resolve({ base64, mimeType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ── Image dimensions ──────────────────────────────────────────────────────────

export async function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  const img = await loadImage(file);
  return { width: img.naturalWidth, height: img.naturalHeight };
}

// ── Internal helper ───────────────────────────────────────────────────────────

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
    img.src = url;
  });
}
