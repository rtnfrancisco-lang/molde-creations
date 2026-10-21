import { describe, expect, it } from "vitest";
import { resolveTeamText, teamScale } from "./team-text";

const dims = (w: number, h: number) => ({
  bodyWidth: w,
  bodyHeight: h,
  sleeveWidth: w / 2,
  sleeveHeight: h / 2,
});
const table = { M: dims(50, 70), G: dims(55, 77) };
// 1 cm por caractere a cada 1 cm de fonte
const measure = (s: string, f: { size: number }) => s.length * f.size;
const base = {
  text: "NOME",
  x: 2,
  y: 10,
  fontSize: 30,
  fontFamily: "Arial",
  bold: true,
  italic: false,
};

describe("team-text", () => {
  it("escala da vista", () => {
    const s = teamScale(table, "M", "G", "costas");
    expect(s.sx).toBeCloseTo(1.1);
    expect(s.sy).toBeCloseTo(1.1);
  });
  it("texto fixo não muda", () => {
    expect(resolveTeamText(base, { value: "x", sx: 2, sy: 2, measure })).toEqual({
      text: "NOME",
      x: 2,
      y: 10,
      fontSize: 30,
    });
  });
  it("vazio some; maiúsculas e escala", () => {
    const t = { ...base, field: "nome" as const, upper: true, scaleWithSize: true };
    expect(resolveTeamText(t, { value: "", sx: 1, sy: 1, measure })).toBeNull();
    expect(resolveTeamText(t, { value: "joão", sx: 1.1, sy: 1.2, measure })).toMatchObject({
      text: "JOÃO",
      fontSize: 33,
    });
  });
  it("encolhe para caber e nunca aumenta", () => {
    const t = { ...base, field: "nome" as const, fitWidth: 25 };
    expect(
      resolveTeamText(t, { value: "Alexandre Junior", sx: 1, sy: 1, measure })!.fontSize,
    ).toBeCloseTo((30 * 25) / 48);
    expect(resolveTeamText(t, { value: "Zé", sx: 1, sy: 1, measure })!.fontSize).toBe(30);
  });
  it("ponto fixo centro: centraliza no eixo do exemplo alinhado à esquerda", () => {
    // exemplo "NOME" a 3 cm => largura 12, de 2 a 14, centro 8
    const t = { ...base, align: "left" as const, field: "nome" as const };
    const a = resolveTeamText(t, { value: "Zé", sx: 1, sy: 1, measure })!;
    const b = resolveTeamText(t, { value: "PEDRO RAIMUNDO", sx: 1, sy: 1, measure })!;
    expect(a).toMatchObject({ x: 8, align: "center", left: 5, right: 11 });
    expect(b.x).toBe(8);
    expect(
      resolveTeamText({ ...t, scaleWithSize: true }, { value: "Zé", sx: 1.1, sy: 1, measure })!.x,
    ).toBeCloseTo(8.8);
  });
  it("ponto fixo esquerda e direita", () => {
    const t = { ...base, align: "left" as const, field: "nome" as const };
    expect(
      resolveTeamText(
        { ...t, fieldAnchor: "esquerda" },
        { value: "ABCDEFGH", sx: 1, sy: 1, measure },
      ),
    ).toMatchObject({ x: 2, align: "left", left: 2, right: 26 });
    expect(
      resolveTeamText({ ...t, fieldAnchor: "direita" }, { value: "AB", sx: 1, sy: 1, measure }),
    ).toMatchObject({ x: 14, align: "right", left: 8 });
  });
  it("ao encolher mantém a linha de base", () => {
    const t = { ...base, field: "nome" as const, fitWidth: 12 };
    const r = resolveTeamText(t, { value: "ABCDEFGH", sx: 1, sy: 1, measure })!;
    expect(r.fontSize).toBeCloseTo(15);
    expect(r.y + r.fontSize / 10).toBeCloseTo(10 + 3);
  });
});
