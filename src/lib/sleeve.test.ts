import { describe, expect, it } from "vitest";
import {
  isOldSleeve,
  migrateSleeveShapes,
  migrateSleeveWidths,
  mirrorShape,
  safetyOffsetFor,
  sleeveShape,
} from "./sleeve";

const old = [
  [0, 0.32],
  [0.22, 0.1],
  [0.5, 0],
  [0.78, 0.1],
  [1, 0.32],
  [0.9, 1],
  [0.1, 1],
].map(([x, y]) => ({ x: x!, y: y!, smooth: false }));

describe("sleeve", () => {
  it("migrates untouched old sleeves only", () => {
    const edited = old.map((n, i) => (i === 2 ? { ...n, y: 0.05 } : n));
    const r = migrateSleeveShapes({ mangaEsq: old, mangaDir: edited });
    expect(r.mangaEsq).toEqual(sleeveShape());
    expect(r.mangaDir).toBe(edited);
    expect(
      isOldSleeve(
        old.map((n) => ({ ...n, x: 1 - n.x })),
        true,
      ),
    ).toBe(true);
  });
  it("mirror reverses order", () => {
    const m = mirrorShape(sleeveShape());
    expect(m[0]).toMatchObject({ x: 0.935, y: 0.82 });
    expect(m).toHaveLength(11);
  });
  it("updates width only for untouched rows", () => {
    const oldT = { M: { bodyHeight: 72, bodyWidth: 52, sleeveHeight: 22, sleeveWidth: 20 } };
    const newT = { M: { ...oldT.M, sleeveWidth: 40 } };
    expect(migrateSleeveWidths(oldT, oldT, newT).M.sleeveWidth).toBe(40);
    expect(
      migrateSleeveWidths({ M: { ...oldT.M, sleeveWidth: 21 } }, oldT, newT).M.sleeveWidth,
    ).toBe(21);
  });
  it("safety shrinks on small pieces but stays 4 cm on body", () => {
    expect(safetyOffsetFor(52, 72)).toBe(-4);
    expect(safetyOffsetFor(24.5, 13)).toBeCloseTo(-1.95);
  });
});
