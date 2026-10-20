import { describe, expect, it } from "vitest";
import { fmtCm, guidePaths, parseCm, sanitizeGuides } from "./guides";

const rect = (w: number, h: number) => `M ${-w / 2} 0 L ${w / 2} 0 L ${w / 2} ${h} L ${-w / 2} ${h} Z`;

describe("guides", () => {
  it("parses comma or dot, rejects invalid", () => {
    expect(parseCm("1,5", 10)).toBe(1.5);
    expect(parseCm("2.25", 10)).toBe(2.25);
    expect(parseCm("", 10)).toBeNull();
    expect(parseCm("-1", 10)).toBeNull();
    expect(parseCm("abc", 10)).toBeNull();
    expect(parseCm("11", 10)).toBeNull();
  });
  it("formats with decimal comma", () => {
    expect(fmtCm(1.5)).toBe("1,5");
    expect(fmtCm(4)).toBe("4");
  });
  it("defaults old files to 1 / 4", () => {
    expect(sanitizeGuides(undefined).costas).toEqual({ bleed: 1, safety: 4 });
    expect(sanitizeGuides({ frente: { bleed: 2, safety: 2 } }).frente).toEqual({ bleed: 2, safety: 2 });
  });
  it("zero distances draw nothing; frame follows seam", () => {
    const r = guidePaths(rect(40, 20), 40, 20, { bleed: 0, safety: 0 });
    expect(r.bleed).toBe("");
    expect(r.safety).toBe("");
    expect(r.frameSrc).toBe(rect(40, 20));
  });
  it("safety larger than piece fails instead of overlapping the seam", () => {
    const r = guidePaths(rect(40, 20), 40, 20, { bleed: 1, safety: 15 });
    expect(r.safety).toBe("");
    expect(r.safetyFailed).toBe(true);
  });
});
