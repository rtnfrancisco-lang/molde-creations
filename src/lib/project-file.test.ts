import { describe, expect, it } from "vitest";
import { buildProjectFile, nameFromFile, parseProjectFile, PROJECT_VERSION, type ProjectData } from "./project-file";

const data: ProjectData = {
  grading: { M: { bodyWidth: 50 } }, mother: "M", clothingType: "Short", shapes: {}, artworks: {}, styles: {},
  layers: { frente: [] }, texts: {}, profiles: [], activeProfile: "Padrão", roster: [{ id: "1", nome: "João" }], guides: { frente: { bleed: 1, safety: 4 } },
};

describe("project-file", () => {
  it("ida e volta mantém nome e dados", () => {
    const p = parseProjectFile(buildProjectFile("Time A", data));
    expect(p).toEqual({ ok: true, name: "Time A", data });
  });
  it("rejeita JSON inválido, outro app, versão nova e dados ausentes", () => {
    expect(parseProjectFile("{").ok).toBe(false);
    expect(parseProjectFile(JSON.stringify({ app: "x", version: 1, data: {} })).ok).toBe(false);
    expect(parseProjectFile(JSON.stringify({ app: "moldecore", version: PROJECT_VERSION + 1, data: {} })).ok).toBe(false);
    expect(parseProjectFile(JSON.stringify({ app: "moldecore", version: 1 })).ok).toBe(false);
  });
  it("nome a partir do arquivo", () => {
    expect(nameFromFile("Meu Time.moldecore")).toBe("Meu Time");
    expect(nameFromFile(".moldecore")).toBe("Sem título");
  });
});
