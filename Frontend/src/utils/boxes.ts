/**
 * Convert Gemini's normalised box format [ymin, xmin, ymax, xmax] (0–1000)
 * to pixel coordinates on the displayed image canvas.
 */

export interface NormBox {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

export interface PixelBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Convert a Gemini normalised box (0–1000) to pixel box on a canvas of
 * the given display dimensions.
 *
 * Returns null if the box is invalid (out of range, zero area, etc.).
 */
export function normToPixelBox(
  box: [number, number, number, number] | null | undefined,
  displayWidth: number,
  displayHeight: number
): PixelBox | null {
  if (!box) return null;
  const [ymin, xmin, ymax, xmax] = box;

  // Validate ranges
  if (
    ymin < 0 || xmin < 0 || ymax > 1000 || xmax > 1000 ||
    ymin >= ymax || xmin >= xmax
  ) {
    return null;
  }

  const scaleX = displayWidth / 1000;
  const scaleY = displayHeight / 1000;

  return {
    x:      xmin * scaleX,
    y:      ymin * scaleY,
    width:  (xmax - xmin) * scaleX,
    height: (ymax - ymin) * scaleY,
  };
}

/** Clamp a value to [min, max]. */
function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/** Convert raw tuple to typed object (after validation). */
export function tupleToNormBox(
  box: [number, number, number, number]
): NormBox {
  return {
    ymin: clamp(box[0], 0, 1000),
    xmin: clamp(box[1], 0, 1000),
    ymax: clamp(box[2], 0, 1000),
    xmax: clamp(box[3], 0, 1000),
  };
}
