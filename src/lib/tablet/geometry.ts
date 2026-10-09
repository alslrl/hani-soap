/** A local, deliberately conservative checkmark detector. Coordinates are in the
 * original 1000 × 1000 drawing space; a check opens a region, never a treatment. */
export type InkPoint = { x: number; y: number; t?: number; pressure?: number };
export type CheckMatch = { anchor: InkPoint; confidence: number; turningIndex: number };
export type NearbyInk = { points: InkPoint[]; created_at?: string; kind?: string };

const distance = (a: InkPoint, b: InkPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const length = (p: InkPoint[]) => p.slice(1).reduce((n, q, i) => n + distance(p[i], q), 0);

export function simplifyInk(points: InkPoint[], minimumDistance = 1.2): InkPoint[] {
  const result: InkPoint[] = [];
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    if (!result.length || distance(result[result.length - 1], p) >= minimumDistance) result.push(p);
  }
  const last = points[points.length - 1];
  if (last && Number.isFinite(last.x) && Number.isFinite(last.y) && result.length && distance(result[result.length - 1], last) > 0) result.push(last);
  return result;
}

export function recognizeCheck(points: InkPoint[], nearby: NearbyInk[] = []): CheckMatch | null {
  const p = simplifyInk(points);
  if (p.length < 4) return null;
  const start = p[0], end = p[p.length - 1];
  const xs = p.map(q => q.x), ys = p.map(q => q.y);
  const width = Math.max(...xs) - Math.min(...xs), height = Math.max(...ys) - Math.min(...ys);
  // Tiny punctuation and oversized writing stay as original ink.
  if (width < 13 || height < 13 || width > 175 || height > 175 || width / height < 0.35 || width / height > 2.8) return null;
  const total = length(p);
  if (!total || distance(start, end) / total < 0.45) return null; // circles, 0, ㅇ
  const turningIndex = p.reduce((best, q, i) => q.y > p[best].y ? i : best, 0);
  if (turningIndex < 1 || turningIndex >= p.length - 2) return null;
  const anchor = p[turningIndex];
  const first = distance(start, anchor), second = distance(anchor, end);
  if (second < first * 1.25 || second > first * 6 || first < 7) return null;
  if (anchor.x - start.x < 5 || end.x - anchor.x < 7) return null;
  if (anchor.y - start.y < 6 || anchor.y - end.y < 12) return null; // ㄴ, horizontal strokes
  if ((anchor.y - end.y) / (end.x - anchor.x) < 0.65) return null;
  const firstLength = length(p.slice(0, turningIndex + 1));
  const secondLength = length(p.slice(turningIndex));
  if (firstLength / first > 1.18 || secondLength / second > 1.18) return null;
  const backtracking = p.slice(1).reduce((n, q, i) => n + Math.max(0, p[i].x - q.x), 0);
  if (backtracking > width * 0.12) return null;
  const a = { x: start.x - anchor.x, y: start.y - anchor.y };
  const b = { x: end.x - anchor.x, y: end.y - anchor.y };
  const angle = Math.acos(Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y) / (first * second)))) * 180 / Math.PI;
  if (angle < 35 || angle > 125) return null;
  // A mark next to existing writing is more likely part of a word.
  if (nearby.some(stroke => stroke.kind !== "check" && stroke.points.some(q => distance(q, anchor) < 30))) return null;
  return { anchor, confidence: Math.min(0.98, 0.82 + (1 - Math.abs(angle - 75) / 90) * 0.12), turningIndex };
}

export function inkPath(points: InkPoint[]): string {
  return points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
}

/** Invert a scale/translation transform without coupling gesture logic to DOM. */
export function toOriginalPoint(point: InkPoint, transform: { scale: number; translateX: number; translateY: number }): InkPoint {
  if (!Number.isFinite(transform.scale) || transform.scale <= 0) throw new Error("Invalid drawing scale");
  return { ...point, x: (point.x - transform.translateX) / transform.scale, y: (point.y - transform.translateY) / transform.scale };
}
