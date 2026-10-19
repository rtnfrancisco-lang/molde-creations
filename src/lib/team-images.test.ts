import { describe, expect, it } from "vitest";
import { autoLink, linkReport, numberKey, reportText, unlinkImage, type TeamImage } from "./team-images";
import type { Player } from "./roster";

const P = (id: string, numero: string, nome: string): Player => ({ id, numero, nome, tamanho: "M" });
const I = (id: string, nome: string): TeamImage => ({ id, nome, src: "x", w: 1, h: 1 });

describe("team images", () => {
  it("number key strips optional prefixes", () => {
    expect(numberKey("10")).toBe("10");
    expect(numberKey("N_7")).toBe("7");
    expect(numberKey("camisa-25")).toBe("25");
    expect(numberKey("RAFAEL")).toBeNull();
  });
  it("links names and numbers by file name, ignoring accents and separators", () => {
    const roster = [P("a", "10", "RAFAEL"), P("b", "7", "ZÉ"), P("c", "25", "PEDRO RAIMUNDO")];
    const imgs = ["10", "7", "25", "RAFAEL", "ZE", "PEDRO_RAIMUNDO", "foto"].map((n) => I(n, n));
    const { roster: r, used } = autoLink(roster, imgs);
    expect(r.map((p) => [p.imgNumero, p.imgNome])).toEqual([["10", "RAFAEL"], ["7", "ZE"], ["25", "PEDRO_RAIMUNDO"]]);
    expect(reportText(linkReport(r, imgs, used))).toBe("3 nomes e 3 números vinculados · arquivos sem uso: foto");
  });
  it("reports what is missing", () => {
    const { roster: r, used } = autoLink([P("a", "10", "RAFAEL"), P("b", "7", "ZÉ")], [I("10", "10"), I("ze", "ZE")]);
    expect(reportText(linkReport(r, [], used))).toBe("1 nomes e 1 números vinculados · faltam: RAFAEL (nome), 7 (número)");
  });
  it("deleting an image removes its links", () => {
    const r = unlinkImage([{ ...P("a", "1", "A"), imgNome: "x", imgNumero: "y" }], "x");
    expect(r[0]!.imgNome).toBeUndefined();
    expect(r[0]!.imgNumero).toBe("y");
  });
});
