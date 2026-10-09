import type { InkPoint } from "./geometry";

export type CanvasViewBox = { x: number; y: number; width: number; height: number };
/** Cropping changes only the viewport. Ink still uses the original 1000-square plane. */
export function bodyCanvasViewBox(portrait: boolean, zoomAnchor: InkPoint | null = null, options: { originalPlane?: boolean } = {}): CanvasViewBox {
  if (zoomAnchor) return { x: Math.max(0, Math.min(640, zoomAnchor.x - 180)), y: Math.max(0, Math.min(640, zoomAnchor.y - 180)), width: 360, height: 360 };
  return portrait && !options.originalPlane ? { x: 230, y: 0, width: 540, height: 1000 } : { x: 0, y: 0, width: 1000, height: 1000 };
}
export function svgViewBox(box: CanvasViewBox): string { return `${box.x} ${box.y} ${box.width} ${box.height}`; }
