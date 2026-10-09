import type { AnnotationStroke } from "@/lib/types";

/** The interactive SVG uses a fixed 1000-square plane; the API stores 0..1. */
export const BODY_CANVAS_SIZE = 1000;

export function normalizeStrokes(strokes: AnnotationStroke[]): AnnotationStroke[] {
  return strokes.map(stroke => ({
    ...stroke,
    points: stroke.points.map(point => ({
      ...point,
      x: Math.max(0, Math.min(1, point.x / BODY_CANVAS_SIZE)),
      y: Math.max(0, Math.min(1, point.y / BODY_CANVAS_SIZE)),
    })),
  }));
}

export function restoreCanvasStrokes(strokes: AnnotationStroke[]): AnnotationStroke[] {
  return strokes.map(stroke => ({
    ...stroke,
    points: stroke.points.map(point => ({
      ...point,
      x: point.x * BODY_CANVAS_SIZE,
      y: point.y * BODY_CANVAS_SIZE,
    })),
  }));
}
