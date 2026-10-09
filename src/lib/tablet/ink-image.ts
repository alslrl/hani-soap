import type { AnnotationStroke } from "@/lib/types";

/** Render only original memo ink, without UI labels, diagram, or check commands. */
export function memoImage(strokes: AnnotationStroke[]): string | null {
  const memo = strokes.filter(s => s.kind === "memo" && s.points.length);
  if (!memo.length) return null;
  const points = memo.flatMap(s => s.points);
  const x1 = Math.max(0, Math.min(...points.map(p => p.x)) - 20);
  const y1 = Math.max(0, Math.min(...points.map(p => p.y)) - 20);
  const x2 = Math.max(...points.map(p => p.x)) + 20;
  const y2 = Math.max(...points.map(p => p.y)) + 20;
  const canvas = document.createElement("canvas");
  const scale = Math.min(2, 1600 / Math.max(x2 - x1, y2 - y1));
  canvas.width = Math.ceil((x2 - x1) * scale);
  canvas.height = Math.ceil((y2 - y1) * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale); ctx.translate(-x1, -y1);
  ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#233941"; ctx.lineWidth = 2.5;
  for (const stroke of memo) {
    ctx.beginPath();
    stroke.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.stroke();
  }
  return canvas.toDataURL("image/png");
}
