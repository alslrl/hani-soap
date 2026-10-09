import { describe, expect, it } from "vitest";
import { DrawingInput, type CanvasPointer } from "./drawing-input";

const event = (values: Partial<CanvasPointer> = {}): CanvasPointer => ({ pointerId: 1, pointerType: "pen", isPrimary: true, button: 0, clientX: 420, clientY: 600, timeStamp: 1000, width: 1, height: 1, ...values });
const point = (x = 420, y = 600, pressure = .4) => ({ x, y, t: 1000, pressure });

describe("pen-first tablet drawing input", () => {
  it("keeps pen ink when a palm touches, moves, cancels or lifts", () => {
    const input = new DrawingInput();
    expect(input.down(event(), point(), false)).toBe("ink");
    const palm = event({ pointerId: 2, pointerType: "touch", width: 70, height: 50 });
    expect(input.down(palm, point(), false)).toBeNull();
    expect(input.move(palm, point(440, 610))).toBeNull();
    expect(input.cancel(2)).toBeNull();
    expect(input.up(palm, point())).toBeNull();
    expect(input.drawing).toBe(true);
    input.move(event({ timeStamp: 1020 }), point(430, 610, .7));
    const result = input.up(event({ timeStamp: 1040 }), point(440, 620, .2));
    expect(result).toMatchObject({ kind: "ink", points: [point(), point(430, 610, .7), point(440, 620, .2)] });
  });
  it("allows a non-primary pen and gives it priority over a pending touch selection", () => {
    const input = new DrawingInput();
    const touch = event({ pointerId: 2, pointerType: "touch", width: 12, height: 12 });
    expect(input.down(touch, point(), false)).toBe("tap");
    expect(input.down(event({ isPrimary: false }), point(), true)).toBe("ink");
    expect(input.up(touch, point())).toBeNull();
    expect(input.owns(1)).toBe(true);
  });
  it("selects on a short finger tap, while a drag or resting palm never opens a picker", () => {
    const input = new DrawingInput();
    const touch = event({ pointerType: "touch", width: 12, height: 12 });
    expect(input.down(touch, point(), false)).toBe("tap");
    expect(input.up(event({ ...touch, timeStamp: 1100 }), point())).toEqual({ kind: "select", point: point() });
    input.down(touch, point(), false);
    input.move(event({ ...touch, clientY: 660, timeStamp: 1050 }), point(420, 660));
    expect(input.up(event({ ...touch, timeStamp: 1150 }), point())).toBeNull();
    input.down(touch, point(), false);
    expect(input.up(event({ ...touch, timeStamp: 1600 }), point())).toBeNull();
    expect(input.down(event({ ...touch, width: 55 }), point(), false)).toBeNull();
  });
  it("suppresses leftover palm taps immediately after a pen stroke", () => {
    const input = new DrawingInput();
    input.down(event(), point(), false); input.up(event({ timeStamp: 1100 }), point(430, 610));
    const touch = event({ pointerType: "touch", width: 12, height: 12, timeStamp: 1200 });
    expect(input.down(touch, point(), false)).toBeNull();
    expect(input.down(event({ ...touch, timeStamp: 1800 }), point(), false)).toBe("tap");
  });
  it("preserves partial ink on its own capture loss, without classifying an interrupted check", () => {
    const input = new DrawingInput();
    input.down(event(), point(), false); input.move(event(), point(430, 610));
    expect(input.cancel(1)).toEqual([point(), point(430, 610)]);
    expect(input.drawing).toBe(false);
    expect(input.cancel(1)).toBeNull();
    input.down(event(), point(), false);
    expect(input.cancel(1)).toBeNull();
  });
  it("honors explicit direct selection for a deliberate larger finger tap after writing", () => {
    const input = new DrawingInput();
    input.down(event(), point(), false); input.up(event({ timeStamp: 1100 }), point(430, 610));
    const finger = event({ pointerType: "touch", width: 32, height: 30, timeStamp: 1200 });
    expect(input.down(finger, point(), true)).toBe("tap");
    expect(input.up(event({ ...finger, timeStamp: 1250 }), point())).toEqual({ kind: "select", point: point() });
  });
  it("retains desktop drawing and explicit direct selection, excluding secondary mouse buttons", () => {
    const input = new DrawingInput();
    const mouse = event({ pointerType: "mouse" });
    expect(input.down(mouse, point(), true)).toBe("select");
    expect(input.down(event({ ...mouse, button: 2 }), point(), false)).toBeNull();
    expect(input.down(mouse, point(), false)).toBe("ink");
    input.reset();
    expect(input.owns(1)).toBe(false); expect(input.drawing).toBe(false);
  });
});
