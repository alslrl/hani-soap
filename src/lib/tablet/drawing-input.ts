import type { AnnotationStroke } from "@/lib/types";
type CanvasInkPoint = AnnotationStroke["points"][number];

export type CanvasPointer = {
  pointerId: number; pointerType: string; isPrimary: boolean; button: number;
  clientX: number; clientY: number; timeStamp: number; width: number; height: number;
};
type Result = { kind: "ink"; points: CanvasInkPoint[] } | { kind: "select"; point: CanvasInkPoint } | null;
type TouchTap = { id: number; x: number; y: number; at: number; moved: number; point: CanvasInkPoint };

/** One stroke owns its pointer. Palm events never finish/cancel another pointer. */
export class DrawingInput {
  private stroke: { id: number; type: string; points: CanvasInkPoint[] } | null = null;
  private tap: TouchTap | null = null;
  private lastPenAt = -Infinity;

  owns(id: number) { return this.stroke?.id === id || this.tap?.id === id; }
  get drawing() { return this.stroke !== null; }

  down(event: CanvasPointer, point: CanvasInkPoint, selectMode: boolean): "ink" | "select" | "tap" | null {
    const pen = event.pointerType === "pen";
    // Pen contacts may be non-primary while another device is already active.
    if (pen ? ![0, -1].includes(event.button) : event.button !== 0 || !event.isPrimary) return null;
    if (this.stroke) return null;
    if (pen) { this.lastPenAt = event.timeStamp; this.tap = null; }
    if (event.pointerType === "touch") {
      if (!selectMode && (event.timeStamp - this.lastPenAt < 650 || Math.max(event.width, event.height) > 28)) return null;
      // Delay selection until a short tap ends, so a resting palm cannot open a sheet.
      this.tap = { id: event.pointerId, x: event.clientX, y: event.clientY, at: event.timeStamp, moved: 0, point };
      return "tap";
    }
    if (selectMode) return "select";
    this.stroke = { id: event.pointerId, type: event.pointerType, points: [point] };
    return "ink";
  }

  move(event: CanvasPointer, point: CanvasInkPoint): CanvasInkPoint[] | null {
    if (this.tap?.id === event.pointerId) {
      this.tap.moved = Math.max(this.tap.moved, Math.hypot(event.clientX - this.tap.x, event.clientY - this.tap.y));
      return null;
    }
    if (this.stroke?.id !== event.pointerId) return null;
    if (this.stroke.type === "pen") this.lastPenAt = event.timeStamp;
    this.stroke.points.push(point);
    return this.stroke.points;
  }

  up(event: CanvasPointer, point: CanvasInkPoint): Result {
    if (this.stroke?.id === event.pointerId) {
      const stroke = this.stroke;
      this.stroke = null;
      if (stroke.type === "pen") this.lastPenAt = event.timeStamp;
      stroke.points.push(point);
      return { kind: "ink", points: stroke.points };
    }
    if (this.tap?.id !== event.pointerId) return null;
    const tap = this.tap; this.tap = null;
    const moved = Math.max(tap.moved, Math.hypot(event.clientX - tap.x, event.clientY - tap.y));
    return event.timeStamp - tap.at <= 350 && moved <= 8 ? { kind: "select", point: tap.point } : null;
  }

  cancel(id: number): CanvasInkPoint[] | null {
    if (this.tap?.id === id) this.tap = null;
    if (this.stroke?.id !== id) return null;
    const points = this.stroke.points;
    this.stroke = null;
    // Interrupted real ink is kept as a memo; a down-only contact is not a stroke.
    return points.length > 1 ? points : null;
  }

  reset() { this.stroke = null; this.tap = null; }
}
