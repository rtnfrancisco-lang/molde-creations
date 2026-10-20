import { describe, expect, it } from "vitest";
import { alignDeltas, objectsRef, rotatedBox } from "./align";

const a = { x0: 0, y0: 0, x1: 10, y1: 4 };
const b = { x0: 20, y0: 10, x1: 24, y1: 20 };

describe("align", () => {
  it("left aligns to the last selected, which does not move", () => {
    const ref = objectsRef([a, b], "last")!;
    expect(alignDeltas([a, b], "left", "objects", ref)).toEqual([{ dx: 20, dy: 0 }, { dx: 0, dy: 0 }]);
  });
  it("first selected reference", () => {
    const ref = objectsRef([a, b], "first")!;
    expect(alignDeltas([a, b], "bottom", "objects", ref)[1]).toEqual({ dx: 0, dy: -16 });
  });
  it("group reference moves both to the group edge", () => {
    const ref = objectsRef([a, b], "group")!;
    expect(alignDeltas([a, b], "right", "objects", ref).map((d) => d.dx)).toEqual([14, 0]);
  });
  it("centers on the mold rectangle in both axes", () => {
    const mold = { x0: -25, y0: 0, x1: 25, y1: 70 };
    expect(alignDeltas([a], "center", "mold", mold)).toEqual([{ dx: -5, dy: 33 }]);
  });
  it("rotated box covers a 90° turn", () => {
    const r = rotatedBox(0, 0, 10, 4, 90);
    expect(r.x1 - r.x0).toBeCloseTo(4);
    expect(r.y1 - r.y0).toBeCloseTo(10);
  });
});
