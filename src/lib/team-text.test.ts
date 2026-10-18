import { describe, expect, it } from "vitest";
import { resolveTeamText, teamScale } from "./team-text";

const dims = (w: number, h: number) => ({ bodyWidth: w, bodyHeight: h, sleeveWidth: w / 2, sleeveHeight: h / 2 });
const table = { M: dims(50, 70), G: dims(55, 77) };
// 1 cm por caractere a cada 1 cm de fonte
const measure = (s: string, f: { size: number }) => s.length * f.size;
const base = { text: "NOME", x: 2, y: 10, fontSize: 30, fontFamily: "Arial", bold: true, italic: false };

describe("team-text", () => {
  it("escala da vista", () => {
    const s = teamScale(table, "M", "G", "costas");
    expect(s.sx).toBeCloseTo(1.1);
    expect(s.sy).toBeCloseTo(1.1);
  });
  it("texto fixo não muda", () => {
    expect(resolveTeamText(base, { value: "x", sx: 2, sy: 2, measure })).toEqual({ text: "NOME", x: 2, y: 10, fontSize: 30 });
  });
  it("vazio some; maiúsculas e escala", () => {
    const t = { ...base, field: "nome" as const, upper: true, scaleWithSize: true };
    expect(resolveTeamText(t, { value: "", sx: 1, sy: 1, measure })).toBeNull();
    expect(resolveTeamText(t, { value: "joão", sx: 1.1, sy: 1.2, measure })).toMatchObject({ text: "JOÃO", fontSize: 33 });
  });
  it("encolhe para caber e nunca aumenta", () => {
    const t = { ...base, field: "nome" as const, fitWidth: 25 };
    expect(resolveTeamText(t, { value: "Alexandre Junior", sx: 1, sy: 1, measure })!.fontSize).toBeCloseTo((30 * 25) / 48);
    expect(resolveTeamText(t, { value: "Zé", sx: 1, sy: 1, measure })!.fontSize).toBe(30);
  });
});
