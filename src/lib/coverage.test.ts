import { describe, expect, it } from "vitest";
import { alignDeltas, objectsRef, rotatedBox } from "./align";
import { BLEED_MAX, DEFAULT_GUIDES, parseCm, SAFETY_MAX, sanitizeGuides } from "./guides";
import { slugPart, teamFileName, uniqueName } from "./team-export";
import { teamScale } from "./team-text";

describe("alinhamento com rotação", () => {
  it("caixa girada 90° troca largura e altura", () => {
    const b = rotatedBox(0, 0, 4, 2, 90);
    expect(b.x1 - b.x0).toBeCloseTo(2);
    expect(b.y1 - b.y0).toBeCloseTo(4);
  });
  it("entre objetos: alinha à esquerda do último selecionado (girado 45°)", () => {
    const a = rotatedBox(5, 5, 2, 2);
    const p = rotatedBox(0, 0, 2, 2, 45);
    const ref = objectsRef([a, p], "last")!;
    const [da] = alignDeltas([a, p], "left", "objects", ref);
    expect(da!.dx).toBeCloseTo(-Math.SQRT2 - 4);
    expect(da!.dy).toBe(0);
  });
  it("ao molde: centraliza no retângulo do molde", () => {
    const mold = { x0: -25, y0: 0, x1: 25, y1: 70 };
    const [d] = alignDeltas([rotatedBox(10, 10, 4, 4, 30)], "center", "mold", mold);
    expect(d).toEqual({ dx: -10, dy: 25 });
  });
});

describe("guias: sanitização e limites", () => {
  it("aceita exatamente os máximos e zero, rejeita acima", () => {
    const g = sanitizeGuides({
      frente: { bleed: BLEED_MAX, safety: SAFETY_MAX },
      costas: { bleed: 0, safety: 0 },
      mangaEsq: { bleed: BLEED_MAX + 0.01, safety: -1 },
    });
    expect(g.frente).toEqual({ bleed: 10, safety: 20 });
    expect(g.costas).toEqual({ bleed: 0, safety: 0 });
    expect(g.mangaEsq).toEqual(DEFAULT_GUIDES.mangaEsq);
    expect(g.mangaDir).toEqual(DEFAULT_GUIDES.mangaDir);
    expect(sanitizeGuides(null)).toEqual(DEFAULT_GUIDES);
  });
  it("parseCm nos limites", () => {
    expect(parseCm("10", BLEED_MAX)).toBe(10);
    expect(parseCm("10,01", BLEED_MAX)).toBeNull();
    expect(parseCm("0", BLEED_MAX)).toBe(0);
    expect(parseCm("-1", BLEED_MAX)).toBeNull();
  });
});

describe("nomes de arquivo de exportação", () => {
  it("sem acento e únicos", () => {
    expect(slugPart("Perna Esquerda Ação")).toBe("Perna_Esquerda_Acao");
    const used = new Set<string>();
    const v = { numero: "10", nome: "João Ção", tamanho: "G", vista: "perna-esquerda" };
    const a = uniqueName(teamFileName("", v, "png"), used);
    const b = uniqueName(teamFileName("", v, "png"), used);
    expect(a).toBe("10_JOAO_CAO_G_perna-esquerda.png");
    expect(b).toBe("10_JOAO_CAO_G_perna-esquerda-2.png");
    expect(/[^\x20-\x7e]/.test(a + b)).toBe(false);
  });
});

describe("escala de textos por tamanho", () => {
  const m = (bw: number, bh: number, sw = 20, sh = 20) => ({
    bodyWidth: bw,
    bodyHeight: bh,
    sleeveWidth: sw,
    sleeveHeight: sh,
  });
  it("camiseta: frente e manga usam as próprias medidas", () => {
    const t = { M: m(50, 70, 20, 18), G: m(55, 77, 22, 18) };
    expect(teamScale(t, "M", "G", "frente")).toEqual({ sx: 1.1, sy: 1.1 });
    expect(teamScale(t, "M", "G", "mangaEsq").sx).toBeCloseTo(1.1);
    expect(teamScale(t, "M", "M", "frente")).toEqual({ sx: 1, sy: 1 });
  });
  it("short: pernas escalam pela largura/altura da perna", () => {
    const t = { M: m(40, 30), XG2: m(52, 37.5) };
    const s = teamScale(t, "M", "XG2", "frente");
    expect(s.sx).toBeCloseTo(1.3);
    expect(s.sy).toBeCloseTo(1.25);
  });
});
