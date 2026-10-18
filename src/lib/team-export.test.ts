import { describe, expect, it } from "vitest";
import { DEFAULT_TEAM_TEMPLATE, MAX_PIXELS, MAX_SIDE_PX, cmToPx, fitDpi, teamFileName, uniqueName } from "./team-export";

describe("team-export", () => {
  it("nome padrão sem acentos e em maiúsculas", () => {
    expect(teamFileName(DEFAULT_TEAM_TEMPLATE, { numero: "10", nome: "João", tamanho: "G", vista: "costas" }, "png")).toBe("10_JOAO_G_costas.png");
  });
  it("extensão segue o formato", () => {
    expect(teamFileName(DEFAULT_TEAM_TEMPLATE, { numero: "10", nome: "João", tamanho: "G", vista: "costas" }, "jpg")).toBe("10_JOAO_G_costas.jpg");
    expect(teamFileName("{numero}_{vista}.svg", { numero: "10", nome: "", tamanho: "G", vista: "costas" }, "pdf")).toBe("10_costas.pdf");
  });
  it("espaços viram _ e inválidos somem", () => {
    expect(teamFileName(DEFAULT_TEAM_TEMPLATE, { numero: "7", nome: "Ana Lú/*", tamanho: "BL M", vista: "frente" }, "png")).toBe("7_ANA_LU_BL_M_frente.png");
  });
  it("nome vazio é omitido", () => {
    expect(teamFileName(DEFAULT_TEAM_TEMPLATE, { numero: "9", nome: "", tamanho: "M", vista: "costas" }, "png")).toBe("9_M_costas.png");
  });
  it("repetidos ganham sufixo", () => {
    const used = new Set<string>();
    expect(uniqueName("a.png", used)).toBe("a.png");
    expect(uniqueName("a.png", used)).toBe("a-2.png");
    expect(uniqueName("a.png", used)).toBe("a-3.png");
  });
  it("px = cm / 2,54 * DPI", () => {
    expect(cmToPx(2.54, 150)).toBe(150);
  });
  it("DPI mantido quando cabe; reduzido acima de 16384 px ou 100 Mpx", () => {
    expect(fitDpi(60, 80, 300)).toBe(300);
    const d = fitDpi(150, 150, 300);
    expect(d).toBeLessThan(300);
    expect(cmToPx(150, d)).toBeLessThanOrEqual(MAX_SIDE_PX);
    expect(cmToPx(150, d) ** 2).toBeLessThanOrEqual(MAX_PIXELS + 2 * cmToPx(150, d) + 1);
  });
});
