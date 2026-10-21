import { describe, expect, it } from "vitest";
import { resolveTeamSlot, slotDpi } from "./team-slot";
import type { Layer, LayerSlot } from "./importers";

// Espaço 20 × 10 cm centrado em (0, 30) numa peça 50 × 70.
const L = (slot: Partial<LayerSlot> = {}): Layer => ({
  id: "s",
  name: "s",
  kind: "imagem",
  src: "ex",
  cx: 0.5,
  cy: 30 / 70,
  w: 20 / 50,
  ratio: 0.5,
  rot: 0,
  slot: { kind: "numero", h: "centro", v: "centro", scale: true, ...slot },
});
const box = (l: Layer | null, W = 50, H = 70) => {
  const aw = l!.w * W,
    ah = aw * l!.ratio,
    cx = (l!.cx - 0.5) * W,
    cy = l!.cy * H;
  return { aw: +aw.toFixed(4), ah: +ah.toFixed(4), cx: +cx.toFixed(4), cy: +cy.toFixed(4) };
};

describe("resolveTeamSlot", () => {
  it("fits a tall image by height without distortion, aligned to the base", () => {
    const r = resolveTeamSlot(L({ v: "base" }), {
      img: { src: "n", w: 100, h: 200 },
      W: 50,
      H: 70,
      Wm: 50,
    });
    expect(box(r)).toEqual({ aw: 5, ah: 10, cx: 0, cy: 30 });
    expect(r!.src).toBe("n");
    expect(r!.slot).toBeUndefined();
  });
  it("fits a wide image by width and anchors to the left/bottom", () => {
    const r = resolveTeamSlot(L({ h: "esquerda", v: "base" }), {
      img: { src: "n", w: 400, h: 100 },
      W: 50,
      H: 70,
      Wm: 50,
    });
    expect(box(r)).toEqual({ aw: 20, ah: 5, cx: 0, cy: 32.5 });
  });
  it("right anchor puts the image on the right edge", () => {
    const r = resolveTeamSlot(L({ h: "direita" }), {
      img: { src: "n", w: 100, h: 100 },
      W: 50,
      H: 70,
      Wm: 50,
    });
    expect(box(r)).toEqual({ aw: 10, ah: 10, cx: 5, cy: 30 });
  });
  it("without scaling keeps the mother size in cm", () => {
    const r = resolveTeamSlot(L({ scale: false }), {
      img: { src: "n", w: 200, h: 100 },
      W: 60,
      H: 70,
      Wm: 50,
    });
    expect(box(r, 60).aw).toBe(20);
  });
  it("missing image hides the slot", () => {
    expect(resolveTeamSlot(L(), { img: null, W: 50, H: 70, Wm: 50 })).toBeNull();
  });
  it("dpi from pixels and cm", () => {
    expect(Math.round(slotDpi(1181, 10))).toBe(300);
  });
});
