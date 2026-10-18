import { useMemo, useRef, useState } from "react";
import { ArrowDownWideNarrow, ClipboardPaste, Download, Plus, Trash2, Upload, Users, X, AlertTriangle } from "lucide-react";
import {
  newPlayerId,
  parseRoster,
  rosterIssues,
  rosterToCsv,
  sizeSummary,
  sortByNumber,
  type PasteRow,
  type Player,
  type RosterSize,
  type RosterSizeOption,
} from "@/lib/roster";

type Props = {
  open: boolean;
  onClose: () => void;
  roster: Player[];
  setRoster: (r: Player[]) => void;
  options: readonly RosterSizeOption[];
  garment: string;
  labelOf: (s: RosterSize) => string;
};

export function TeamPanel({ open, onClose, roster, setRoster, options, garment, labelOf }: Props) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const csvRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const issues = useMemo(() => rosterIssues(roster, options), [roster, options]);
  const preview: PasteRow[] = useMemo(() => (pasteText.trim() ? parseRoster(pasteText, options, garment) : []), [pasteText, options, garment]);
  const validRows = preview.filter((r): r is Extract<PasteRow, { ok: true }> => r.ok);
  const summary = sizeSummary(roster);
  const defaultSize = (options.find((o) => o.id === "M") ?? options[0])?.id ?? "M";

  if (!open) return null;

  const update = (id: string, patch: Partial<Player>) => setRoster(roster.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const add = () => {
    const last = roster[roster.length - 1];
    setRoster([...roster, { id: newPlayerId(), numero: "", nome: "", tamanho: last?.tamanho ?? defaultSize }]);
    requestAnimationFrame(() => {
      const ins = tableRef.current?.querySelectorAll<HTMLInputElement>("input[data-num]");
      ins?.[ins.length - 1]?.focus();
    });
  };
  const fromRows = (rows: typeof validRows) => rows.map((r) => ({ id: newPlayerId(), numero: r.numero, nome: r.nome, tamanho: r.tamanho }));
  const confirmPaste = (mode: "replace" | "append") => {
    const ps = fromRows(validRows);
    setRoster(mode === "replace" ? ps : [...roster, ...ps]);
    setPasteText("");
    setPasteOpen(false);
  };
  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([rosterToCsv(roster, labelOf)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "lista-do-time.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };
  const importCsv = async (f: File) => {
    setPasteText(await f.text());
    setPasteOpen(true);
  };

  return (
    <aside
      className="fixed right-0 top-0 bottom-0 z-40 w-[420px] max-w-full bg-panel border-l border-border shadow-xl flex flex-col"
      aria-label="Lista do Time"
      onKeyDown={(e) => e.stopPropagation()}
    >
      <header className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Users className="size-4 text-cyan" />
        <h2 className="text-sm font-semibold text-foreground flex-1">Lista do Time</h2>
        <span className="text-[11px] text-faint">{garment}</span>
        <button onClick={onClose} aria-label="Fechar" className="p-1 rounded hover:bg-muted text-muted-foreground">
          <X className="size-4" />
        </button>
      </header>

      <div className="flex flex-wrap gap-1.5 px-4 py-2 border-b border-border">
        <Btn onClick={add}><Plus className="size-3.5" /> Jogador</Btn>
        <Btn onClick={() => setRoster(sortByNumber(roster))} disabled={roster.length < 2}><ArrowDownWideNarrow className="size-3.5" /> Ordenar</Btn>
        <Btn onClick={() => setPasteOpen((v) => !v)}><ClipboardPaste className="size-3.5" /> Colar lista</Btn>
        <Btn onClick={() => csvRef.current?.click()}><Upload className="size-3.5" /> Importar CSV</Btn>
        <Btn onClick={exportCsv} disabled={!roster.length}><Download className="size-3.5" /> Exportar CSV</Btn>
        <input
          ref={csvRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importCsv(f);
            e.target.value = "";
          }}
        />
      </div>

      {pasteOpen && (
        <div className="px-4 py-3 border-b border-border space-y-2 bg-muted/40">
          <p className="text-[11px] text-muted-foreground">Cole do Excel ou Planilhas: Número, Nome, Tamanho (TAB, ";" ou ",").</p>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={5}
            placeholder={"10\tJoão\tM\n7\tAna\tG"}
            className="w-full text-xs font-mono rounded-md border border-border bg-background p-2 text-foreground"
            aria-label="Colar lista"
          />
          {preview.length > 0 && (
            <div className="max-h-40 overflow-auto rounded border border-border bg-background text-[11px]">
              {preview.map((r) =>
                r.ok ? (
                  <div key={r.line} className="flex gap-2 px-2 py-0.5">
                    <span className="w-8 text-faint">L{r.line}</span>
                    <span className="w-10 font-medium">{r.numero}</span>
                    <span className="flex-1 truncate">{r.nome || "—"}</span>
                    <span className={r.warn ? "text-destructive" : ""} title={r.warn}>{labelOf(r.tamanho)}</span>
                  </div>
                ) : (
                  <div key={r.line} className="flex gap-2 px-2 py-0.5 bg-destructive/10 text-destructive">
                    <span className="w-8">L{r.line}</span>
                    <span className="flex-1 truncate">{r.raw.replace(/\t/g, " · ")}</span>
                    <span>{r.reason}</span>
                  </div>
                ),
              )}
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground flex-1">
              {validRows.length} válida(s){preview.length - validRows.length > 0 && ` · ${preview.length - validRows.length} inválida(s)`}
            </span>
            <Btn onClick={() => confirmPaste("replace")} disabled={!validRows.length}>Substituir lista</Btn>
            <Btn onClick={() => confirmPaste("append")} disabled={!validRows.length} primary>Adicionar à lista</Btn>
          </div>
        </div>
      )}

      <div ref={tableRef} className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-panel text-[11px] text-muted-foreground">
            <tr className="border-b border-border">
              <th className="text-left px-3 py-1.5 w-16">Nº</th>
              <th className="text-left px-1 py-1.5">Nome</th>
              <th className="text-left px-1 py-1.5 w-28">Tamanho</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {roster.map((p, i) => {
              const iss = issues[p.id];
              const sizeInvalid = iss?.tamanhoInvalido;
              const onEnter = (e: React.KeyboardEvent) => {
                if (e.key === "Enter" && i === roster.length - 1) {
                  e.preventDefault();
                  add();
                }
              };
              return (
                <tr key={p.id} className="border-b border-border/60 align-top">
                  <td className="px-3 py-1">
                    <input
                      data-num
                      value={p.numero}
                      onChange={(e) => update(p.id, { numero: e.target.value })}
                      onKeyDown={onEnter}
                      aria-label="Número"
                      className={`w-full rounded border bg-background px-1.5 py-1 text-foreground ${iss?.repetido || iss?.semNumero ? "border-destructive" : "border-border"}`}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      value={p.nome}
                      onChange={(e) => update(p.id, { nome: e.target.value })}
                      onKeyDown={onEnter}
                      aria-label="Nome"
                      className="w-full rounded border border-border bg-background px-1.5 py-1 text-foreground"
                    />
                    {iss && (
                      <div className="mt-0.5 flex items-start gap-1 text-[10px] text-destructive">
                        <AlertTriangle className="size-3 shrink-0 mt-px" />
                        <span>
                          {[
                            iss.semNumero && "Sem número",
                            iss.repetido && "Número repetido",
                            sizeInvalid && `${p.tamanho} não existe em ${garment}${iss.sugestao ? ` — sugestão: ${iss.sugestao.label}` : ""}`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        {sizeInvalid && iss.sugestao && (
                          <button className="underline" onClick={() => update(p.id, { tamanho: iss.sugestao!.id })}>usar</button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-1 py-1">
                    <select
                      value={p.tamanho}
                      onChange={(e) => update(p.id, { tamanho: e.target.value as RosterSize })}
                      onKeyDown={onEnter}
                      aria-label="Tamanho"
                      className={`w-full rounded border bg-background px-1 py-1 ${sizeInvalid ? "border-destructive text-destructive" : "border-border text-foreground"}`}
                    >
                      {sizeInvalid && <option value={p.tamanho}>{p.tamanho} (inválido)</option>}
                      {options.map((o) => (
                        <option key={o.id} value={o.id}>{o.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1 pr-2">
                    <button onClick={() => setRoster(roster.filter((x) => x.id !== p.id))} aria-label="Remover jogador" className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!roster.length && <p className="px-4 py-6 text-center text-xs text-faint">Nenhum jogador. Adicione ou cole uma lista.</p>}
      </div>

      <footer className="px-4 py-2.5 border-t border-border text-[11px] text-muted-foreground space-y-0.5">
        <div className="text-foreground" data-testid="resumo-tamanhos">
          {summary.length
            ? summary.map((s) => `${options.some((o) => o.id === s.size) ? labelOf(s.size) : s.size} × ${s.n}`).join(" · ")
            : "—"}
        </div>
        <div>Total: <strong className="text-foreground">{roster.length}</strong> peça(s)</div>
      </footer>
    </aside>
  );
}

function Btn({ children, onClick, disabled, primary }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium whitespace-nowrap disabled:opacity-40 ${primary ? "bg-cyan text-primary-foreground hover:bg-cyan/90" : "border border-border text-foreground hover:bg-muted"}`}
    >
      {children}
    </button>
  );
}
