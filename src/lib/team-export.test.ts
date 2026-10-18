import { describe, expect, it } from "vitest";
import { DEFAULT_TEAM_TEMPLATE, teamFileName, uniqueName } from "./team-export";

describe("team-export", () => {
  it("nome padrão sem acentos e em maiúsculas", () => {
    expect(teamFileName(DEFAULT_TEAM_TEMPLATE, { numero: "10", nome: "João", tamanho: "G", vista: "costas" })).toBe("10_JOAO_G_costas.svg");
  });
  it("espaços viram _ e inválidos somem", () => {
    expect(teamFileName(DEFAULT_TEAM_TEMPLATE, { numero: "7", nome: "Ana Lú/*", tamanho: "BL M", vista: "frente" })).toBe("7_ANA_LU_BL_M_frente.svg");
  });
  it("nome vazio é omitido", () => {
    expect(teamFileName(DEFAULT_TEAM_TEMPLATE, { numero: "9", nome: "", tamanho: "M", vista: "costas" })).toBe("9_M_costas.svg");
  });
  it("repetidos ganham sufixo", () => {
    const used = new Set<string>();
    expect(uniqueName("a.svg", used)).toBe("a.svg");
    expect(uniqueName("a.svg", used)).toBe("a-2.svg");
    expect(uniqueName("a.svg", used)).toBe("a-3.svg");
  });
});
