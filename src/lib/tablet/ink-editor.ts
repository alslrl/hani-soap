import type { AnnotationStroke } from "@/lib/types";
import type { InkPoint } from "./geometry";

export type DrawingTool = "select" | "pen" | "eraser";
export type InkEditorState = { strokes: AnnotationStroke[]; undoStack: AnnotationStroke[][]; lastGestureId: string | null };
export const initialInkEditor = (strokes: AnnotationStroke[] = []): InkEditorState => ({ strokes, undoStack: [], lastGestureId: null });

/** All edits within one eraser contact share one undo snapshot. */
export function editInk<T extends InkEditorState>(state: T, strokes: AnnotationStroke[], gestureId: string): T {
  if (strokes.length === state.strokes.length && strokes.every((stroke, i) => stroke === state.strokes[i])) return state;
  return { ...state, strokes, undoStack: state.lastGestureId === gestureId ? state.undoStack : [...state.undoStack.slice(-49), state.strokes], lastGestureId: gestureId };
}
export function undoInk<T extends InkEditorState>(state: T): T {
  const previous = state.undoStack.at(-1);
  if (!previous && !state.strokes.length) return state;
  return { ...state, strokes: previous ?? state.strokes.slice(0, -1), undoStack: state.undoStack.slice(0, -1), lastGestureId: null };
}
function pointSegmentDistance(p: InkPoint, a: InkPoint, b: InkPoint) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const ratio = dx || dy ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(p.x - a.x - ratio * dx, p.y - a.y - ratio * dy);
}
const cross = (a: InkPoint, b: InkPoint, c: InkPoint) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
function segmentDistance(a: InkPoint, b: InkPoint, c: InkPoint, d: InkPoint) {
  if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return 0;
  return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d), pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b));
}

/** Erase only original annotation strokes. Reference dots and treatments are not inputs. */
export function eraseInkAlongPath(strokes: AnnotationStroke[], path: InkPoint[], radius: number): AnnotationStroke[] {
  if (!path.length || !Number.isFinite(radius) || radius <= 0) return strokes;
  const hit = (points: InkPoint[]) => {
    if (!points.length) return false;
    for (let p = 0; p < Math.max(1, path.length - 1); p++) {
      const a = path[p], b = path[p + 1] ?? a;
      for (let s = 0; s < Math.max(1, points.length - 1); s++) {
        if (segmentDistance(a, b, points[s], points[s + 1] ?? points[s]) <= radius) return true;
      }
    }
    return false;
  };
  return strokes.filter(stroke => !hit(stroke.points));
}
