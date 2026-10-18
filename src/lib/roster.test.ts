import { describe, expect, it } from "vitest";
import { parseRoster, rosterToCsv, rosterIssues, sizeSummary, sortByNumber, type RosterSizeOption } from "./roster";

const ADULT: RosterSizeOption[] = ["PP", "P", "M", "G", "GG", "XG"].map((id) => ({ id: id as never, label: id }));
const KIDS: RosterSizeOption[] = ["2ANOS", "4ANOS", "6ANOS", "8ANOS", "10ANOS", "12ANOS", "14ANOS"].map((label, i) => ({
  id: (["PP", "P", "M", "G", "GG", "XG", "XG2"] as const)[i]!,
  label,
}));

describe("roster", () => {
  it("cola do Excel com TAB e cabeçalho", () => {
    const r = parseRoster("Número\tNome\tTamanho\n10\tJoão\t m \n7\tAna\tZZ", ADULT);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ ok: true, numero: "10", nome: "João", tamanho: "M" });
    expect(r[1]!.ok).toBe(false);
  });
  it("aceita rótulo infantil e ponto e vírgula", () => {
    const r = parseRoster("00;Léo;6 anos", KIDS);
    expect(r[0]).toMatchObject({ ok: true, numero: "00", tamanho: "M" });
  });
  it("CSV exportado reimporta idêntico", () => {
    const ps = [{ id: "a", numero: "9", nome: "José; \"Zé\"", tamanho: "GG" as const }];
    const back = parseRoster(rosterToCsv(ps, (s) => s), ADULT);
    expect(back[0]).toMatchObject({ ok: true, numero: "9", nome: "José; \"Zé\"", tamanho: "GG" });
  });
  it("avisa número repetido e tamanho inválido", () => {
    const ps = [
      { id: "a", numero: "1", nome: "", tamanho: "XG2" as const },
      { id: "b", numero: "1", nome: "", tamanho: "M" as const },
    ];
    const i = rosterIssues(ps, ADULT);
    expect(i["a"]).toMatchObject({ repetido: true, tamanhoInvalido: true });
    expect(i["a"]!.sugestao!.id).toBe("XG");
    expect(i["b"]!.tamanhoInvalido).toBeUndefined();
  });
  it("ordena e resume", () => {
    const ps = sortByNumber([
      { id: "a", numero: "10", nome: "", tamanho: "M" },
      { id: "b", numero: "2", nome: "", tamanho: "G" },
      { id: "c", numero: "3", nome: "", tamanho: "M" },
    ]);
    expect(ps.map((p) => p.numero)).toEqual(["2", "3", "10"]);
    expect(sizeSummary(ps)).toEqual([{ size: "M", n: 2 }, { size: "G", n: 1 }]);
  });
});
