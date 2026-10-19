import { useMemo, useRef, useState } from "react";
import { ArrowDownWideNarrow, FolderOpen, ImagePlus, Images, Search, Unlink, ClipboardPaste, Download, Plus, Trash2, Upload, Users, X, AlertTriangle, Eye, PackageOpen } from "lucide-react";
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
import { autoLink, linkReport, newImageId, readTeamImage, reportText, unlinkImage, type TeamImage } from "@/lib/team-images";
import { DEFAULT_TEAM_TEMPLATE, TEAM_DPIS, cmToPx, fitDpi, type TeamFormat } from "@/lib/team-export";

export type TeamExportView = "frente" | "costas" | "mangaEsq" | "mangaDir";
const VIEW_LABEL: Record<TeamExportView, string> = { frente: "Frente", costas: "Costas", mangaEsq: "Manga esquerda", mangaDir: "Manga direita" };
export type TeamExportOpts = { players: Player[]; views: TeamExportView[]; hideTechnical: boolean; template: string; format: TeamFormat; dpi: number; quality: number };
type TeamExportResult = { players: number; files: number; warnings: string[] } | null;

type Props = {
  open: boolean;
  onClose: () => void;
  roster: Player[];
  setRoster: (r: Player[]) => void;
  options: readonly RosterSizeOption[];
  garment: string;
  labelOf: (s: RosterSize) => string;
  viewingId?: string | null;
  onView?: (p: Player) => void;
  teamViews?: TeamExportView[];
  onExportTeam?: (o: TeamExportOpts, onProgress: (done: number, total: number) => void, signal: { cancelled: boolean }) => Promise<TeamExportResult>;
  measurePieces?: (players: Player[], views: TeamExportView[]) => { cmW: number; cmH: number };
  images?: TeamImage[];
  setImages?: (i: TeamImage[]) => void;
  /** Espaços marcados no molde mãe (avisar imagem faltando). */
  slotNeeds?: { nome: boolean; numero: boolean };
};

export function TeamPanel({ open, onClose, roster, setRoster, options, garment, labelOf, viewingId, onView, teamViews = [], onExportTeam, measurePieces, images = [], setImages, slotNeeds = { nome: false, numero: false } }: Props) {
  const [trimPng, setTrimPng] = useState(true);
  const [imgReport, setImgReport] = useState("");
  const [imgBusy, setImgBusy] = useState(false);
  const [libOpen, setLibOpen] = useState(false);
  const [picker, setPicker] = useState<{ pid: string; kind: "imgNome" | "imgNumero" } | null>(null);
  const [pickQ, setPickQ] = useState("");
  const imgFilesRef = useRef<HTMLInputElement>(null);
  const imgDirRef = useRef<HTMLInputElement>(null);
  const imgOneRef = useRef<HTMLInputElement>(null);
  const imgById = useMemo(() => new Map(images.map((i) => [i.id, i])), [images]);
  /** Lê arquivos, evita duplicar imagens iguais e devolve as imagens (novas ou existentes). */
  const addFiles = async (files: File[]) => {
    const list = files.filter((f) => /\.(png|jpe?g)$/i.test(f.name) || /image\/(png|jpeg)/.test(f.type));
    const lib = [...images];
    const got: TeamImage[] = [];
    const errs: string[] = [];
    setImgBusy(true);
    for (const f of list) {
      try {
        const r = await readTeamImage(f, trimPng);
        const same = lib.find((i) => i.src === r.src);
        if (same) got.push(same);
        else {
          const img = { id: newImageId(), ...r };
          lib.push(img);
          got.push(img);
        }
      } catch (e) {
        errs.push(e instanceof Error ? e.message : f.name);
      }
    }
    setImgBusy(false);
    setImages?.(lib);
    return { got, errs };
  };
  const importMany = async (files: File[]) => {
    const { got, errs } = await addFiles(files);
    const { roster: next, used } = autoLink(roster, got);
    setRoster(next);
    setImgReport([reportText(linkReport(next, got, used)), ...errs.map((e) => `rejeitado: ${e}`)].join(" · "));
  };
  const deleteImage = (img: TeamImage) => {
    const linked = roster.some((p) => p.imgNome === img.id || p.imgNumero === img.id);
    if (linked && !window.confirm(`"${img.nome}" está vinculada a jogadores. Excluir e remover os vínculos?`)) return;
    setImages?.(images.filter((i) => i.id !== img.id));
    if (linked) setRoster(unlinkImage(roster, img.id));
  };
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const csvRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const issues = useMemo(() => rosterIssues(roster, options), [roster, options]);
  const preview: PasteRow[] = useMemo(() => (pasteText.trim() ? parseRoster(pasteText, options, garment) : []), [pasteText, options, garment]);
  const validRows = preview.filter((r): r is Extract<PasteRow, { ok: true }> => r.ok);
  const summary = sizeSummary(roster);
  const defaultSize = (options.find((o) => o.id === "M") ?? options[0])?.id ?? "M";

  const [expOpen, setExpOpen] = useState(false);
  const [expViews, setExpViews] = useState<TeamExportView[]>([]);
  const [expTech, setExpTech] = useState(true);
  const [expTpl, setExpTpl] = useState(DEFAULT_TEAM_TEMPLATE);
  const [expProg, setExpProg] = useState<{ done: number; total: number } | null>(null);
  const [expMsg, setExpMsg] = useState("");
  const [expWarn, setExpWarn] = useState<string[]>([]);
  const [expFmt, setExpFmt] = useState<TeamFormat>("png");
  const [expDpi, setExpDpi] = useState(150);
  const [expQ, setExpQ] = useState(92);
  const sigRef = useRef<{ cancelled: boolean } | null>(null);

  if (!open) return null;

  const badIds = new Set(Object.entries(issues).filter(([, i]) => i.repetido || i.tamanhoInvalido || i.semNumero).map(([id]) => id));
  const openExport = () => {
    setExpViews(teamViews.length ? teamViews : []);
    setExpMsg("");
    setExpWarn([]);
    setExpProg(null);
    setExpOpen(true);
  };
  const exportPlayers = (skipBad: boolean) => (skipBad ? roster.filter((p) => !badIds.has(p.id)) : roster);
  const runTeamExport = async (skipBad: boolean) => {
    if (!onExportTeam) return;
    const players = exportPlayers(skipBad);
    if (!players.length || !expViews.length) return;
    const sig = { cancelled: false };
    sigRef.current = sig;
    setExpMsg("");
    setExpWarn([]);
    setExpProg({ done: 0, total: players.length * expViews.length });
    try {
      const r = await onExportTeam(
        { players, views: expViews, hideTechnical: !expTech, template: expTpl, format: expFmt, dpi: expDpi, quality: expQ },
        (done, total) => setExpProg({ done, total }),
        sig,
      );
      if (!r) setExpMsg("Exportação cancelada. Nenhum ZIP foi gerado.");
      else {
        setExpMsg(`${r.players} jogador(es) · ${r.files} arquivo(s) · ${expFmt.toUpperCase()} ${expDpi} DPI`);
        setExpWarn(r.warnings);
      }
    } catch {
      setExpMsg("Não foi possível gerar o ZIP.");
    } finally {
      sigRef.current = null;
      setExpProg(null);
    }
  };

  const expPlayers = exportPlayers(badIds.size > 0);
  const fileCount = expPlayers.length * expViews.length;
  const bigJob = expDpi >= 300 && fileCount > 40;
  const piece = expOpen && measurePieces && expViews.length ? measurePieces(expPlayers, expViews) : null;
  const maxPx = piece && piece.cmW > 0 ? (() => { const d = fitDpi(piece.cmW, piece.cmH, expDpi); return `${cmToPx(piece.cmW, d)} × ${cmToPx(piece.cmH, d)} px${d < expDpi ? ` (${d} DPI)` : ""}`; })() : null;

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
      className="fixed right-0 top-0 bottom-0 z-40 w-[540px] max-w-full bg-panel border-l border-border shadow-xl flex flex-col"
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
        {setImages && (
          <>
            <Btn onClick={() => imgFilesRef.current?.click()} disabled={imgBusy}><ImagePlus className="size-3.5" /> Importar imagens…</Btn>
            <Btn onClick={() => imgDirRef.current?.click()} disabled={imgBusy}><FolderOpen className="size-3.5" /> Importar pasta…</Btn>
            <Btn onClick={() => setLibOpen((v) => !v)}><Images className="size-3.5" /> Biblioteca ({images.length})</Btn>
            <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <input type="checkbox" checked={trimPng} onChange={(e) => setTrimPng(e.target.checked)} className="accent-[var(--color-cyan)]" /> Remover margens transparentes
            </label>
            <input ref={imgFilesRef} type="file" multiple accept="image/png,image/jpeg" className="hidden" onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ""; void importMany(f); }} />
            <input
              ref={(el) => { imgDirRef.current = el; el?.setAttribute("webkitdirectory", ""); }}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ""; void importMany(f); }}
            />
            <input
              ref={imgOneRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={async (e) => {
                const f = [...(e.target.files ?? [])];
                e.target.value = "";
                if (!picker) return;
                const { got, errs } = await addFiles(f);
                if (errs.length) setImgReport(errs.map((x) => `rejeitado: ${x}`).join(" · "));
                if (got[0]) update(picker.pid, { [picker.kind]: got[0].id });
                setPicker(null);
              }}
            />
          </>
        )}
        <Btn onClick={openExport} disabled={!roster.length || !onExportTeam} primary><PackageOpen className="size-3.5" /> Exportar time</Btn>
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

      {expOpen && (
        <div className="px-4 py-3 border-b border-border space-y-2 bg-muted/40 text-[11px]" data-testid="exportar-time">
          <div className="flex items-center"><strong className="text-foreground flex-1 text-xs">Exportar time</strong>
            <button onClick={() => setExpOpen(false)} aria-label="Fechar exportação" className="p-0.5 rounded hover:bg-muted"><X className="size-3.5" /></button></div>
          {!teamViews.length && (
            <div className="flex gap-1 text-destructive"><AlertTriangle className="size-3 mt-px shrink-0" />Nenhum texto do desenho está marcado como campo do time (nome ou número). Os arquivos sairão sem nome e número.</div>
          )}
          <div>
            <div className="text-muted-foreground mb-1">Vistas a incluir</div>
            <div className="grid grid-cols-2 gap-1">
              {(Object.keys(VIEW_LABEL) as TeamExportView[]).map((v) => (
                <label key={v} className="flex items-center gap-1.5 text-foreground">
                  <input type="checkbox" checked={expViews.includes(v)} onChange={(e) => setExpViews(e.target.checked ? [...expViews, v] : expViews.filter((x) => x !== v))} />
                  {VIEW_LABEL[v]}{teamViews.includes(v) && <span className="text-cyan">•</span>}
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-16">Formato</span>
            {(["png", "jpeg", "pdf"] as TeamFormat[]).map((f) => (
              <label key={f} className="flex items-center gap-1 text-foreground">
                <input type="radio" name="exp-fmt" checked={expFmt === f} onChange={() => setExpFmt(f)} /> {f.toUpperCase()}
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-16">Resolução</span>
            <select value={expDpi} onChange={(e) => setExpDpi(Number(e.target.value))} aria-label="Resolução" className="rounded border border-border bg-background px-1 py-0.5 text-foreground">
              {TEAM_DPIS.map((d) => <option key={d} value={d}>{d} DPI</option>)}
            </select>
            {maxPx && <span className="text-faint" data-testid="maior-peca">maior peça: {maxPx}</span>}
          </div>
          {expFmt !== "png" && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground w-16">Qualidade</span>
              <input type="range" min={60} max={100} value={expQ} onChange={(e) => setExpQ(Number(e.target.value))} aria-label="Qualidade" className="flex-1" />
              <span className="w-9 text-right text-foreground">{expQ}%</span>
            </div>
          )}
          <label className="flex items-center gap-1.5 text-foreground">
            <input type="checkbox" checked={expTech} onChange={(e) => setExpTech(e.target.checked)} /> Incluir linhas técnicas
          </label>
          <label className="block">
            <span className="text-muted-foreground">Modelo do nome do arquivo</span>
            <input value={expTpl} onChange={(e) => setExpTpl(e.target.value)} className="mt-0.5 w-full rounded border border-border bg-background px-1.5 py-1 font-mono text-foreground" />
          </label>
          {badIds.size > 0 && (
            <div className="flex gap-1 text-destructive"><AlertTriangle className="size-3 mt-px shrink-0" />{badIds.size} jogador(es) com número repetido, sem número ou tamanho inexistente em {garment}.</div>
          )}
          {expProg && (
            <div className="h-1.5 rounded bg-border overflow-hidden"><div className="h-full bg-cyan transition-all" style={{ width: `${(expProg.done / expProg.total) * 100}%` }} /></div>
          )}
          {bigJob && (
            <div className="flex gap-1 text-destructive"><AlertTriangle className="size-3 mt-px shrink-0" />{fileCount} arquivos em 300 DPI: pode demorar e usar muita memória.</div>
          )}
          {expProg && <div className="text-muted-foreground">Arquivo {Math.min(expProg.done + 1, expProg.total)} de {expProg.total}</div>}
          {expMsg && <div className="text-foreground font-medium" data-testid="resumo-exportacao">{expMsg}</div>}
          {expWarn.map((w) => <div key={w} className="text-destructive">{w}</div>)}
          <div className="flex justify-end gap-2">
            <Btn onClick={() => (expProg && sigRef.current ? (sigRef.current.cancelled = true) : setExpOpen(false))}>Cancelar</Btn>
            {badIds.size > 0 ? (
              <Btn onClick={() => void runTeamExport(true)} disabled={!!expProg || !expViews.length || badIds.size === roster.length} primary>Continuar sem esses jogadores</Btn>
            ) : (
              <Btn onClick={() => void runTeamExport(false)} disabled={!!expProg || !expViews.length} primary>{teamViews.length ? "Gerar ZIP" : "Gerar mesmo assim"}</Btn>
            )}
          </div>
        </div>
      )}

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

      {(imgBusy || imgReport) && (
        <div className="flex items-start gap-2 px-4 py-1.5 border-b border-border text-[11px] text-foreground bg-cyan/5" data-testid="relatorio-imagens">
          <span className="flex-1">{imgBusy ? "Lendo imagens…" : imgReport}</span>
          {!imgBusy && <button onClick={() => setImgReport("")} aria-label="Fechar relatório" className="text-muted-foreground"><X className="size-3" /></button>}
        </div>
      )}
      {libOpen && (
        <div className="max-h-56 overflow-auto border-b border-border px-4 py-2 space-y-1">
          {!images.length && <p className="text-[11px] text-faint">Biblioteca vazia. Use "Importar imagens…" ou "Importar pasta…".</p>}
          {images.map((img) => (
            <div key={img.id} className="flex items-center gap-2">
              <Thumb img={img} />
              <input
                value={img.nome}
                onChange={(e) => setImages?.(images.map((i) => (i.id === img.id ? { ...i, nome: e.target.value } : i)))}
                aria-label="Nome da imagem"
                className="flex-1 min-w-0 rounded border border-border bg-background px-1.5 py-0.5 text-xs text-foreground"
              />
              <span className="text-[10px] font-mono text-faint">{img.w}×{img.h}</span>
              <button onClick={() => deleteImage(img)} aria-label="Excluir imagem" className="p-1 rounded text-muted-foreground hover:text-destructive"><Trash2 className="size-3.5" /></button>
            </div>
          ))}
        </div>
      )}
      {picker && (
        <div className="absolute inset-x-3 top-24 z-10 max-h-[60%] flex flex-col rounded-md border border-cyan/40 bg-panel shadow-xl">
          <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
            <Search className="size-3.5 text-muted-foreground" />
            <input autoFocus value={pickQ} onChange={(e) => setPickQ(e.target.value)} placeholder="Buscar imagem" className="flex-1 bg-transparent text-xs text-foreground outline-none" />
            <button onClick={() => setPicker(null)} aria-label="Fechar seletor" className="text-muted-foreground"><X className="size-3.5" /></button>
          </div>
          <div className="flex-1 overflow-auto p-2 grid grid-cols-4 gap-2">
            {images
              .filter((i) => i.nome.toLowerCase().includes(pickQ.toLowerCase()))
              .map((img) => (
                <button
                  key={img.id}
                  onClick={() => { update(picker.pid, { [picker.kind]: img.id }); setPicker(null); }}
                  className="flex flex-col items-center gap-1 rounded border border-border p-1 hover:border-cyan"
                >
                  <Thumb img={img} big />
                  <span className="w-full truncate text-[10px] text-muted-foreground">{img.nome}</span>
                </button>
              ))}
          </div>
          <div className="flex gap-2 border-t border-border px-2 py-1.5">
            <Btn onClick={() => imgOneRef.current?.click()}><Upload className="size-3.5" /> Enviar arquivo…</Btn>
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
              {setImages && <th className="text-left px-1 py-1.5 w-14">Nome (img)</th>}
              {setImages && <th className="text-left px-1 py-1.5 w-14">Nº (img)</th>}
              <th className="w-16" />
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
                  {setImages &&
                    (["imgNome", "imgNumero"] as const).map((k) => {
                      const img = p[k] ? imgById.get(p[k]!) : undefined;
                      const need = (k === "imgNome" ? slotNeeds.nome : slotNeeds.numero) && !img;
                      return (
                        <td key={k} className="px-1 py-1">
                          <div className="flex items-center gap-0.5">
                            <button
                              onClick={() => { setPickQ(""); setPicker({ pid: p.id, kind: k }); }}
                              title={img ? img.nome : "Escolher imagem"}
                              aria-label={k === "imgNome" ? "Imagem do nome" : "Imagem do número"}
                              className="rounded hover:ring-1 hover:ring-cyan"
                            >
                              {img ? <Thumb img={img} /> : <span className="block size-7 rounded border border-dashed border-border" />}
                            </button>
                            {img && (
                              <button onClick={() => update(p.id, { [k]: undefined })} title="Remover vínculo" aria-label="Remover vínculo" className="text-muted-foreground hover:text-destructive"><Unlink className="size-3" /></button>
                            )}
                            {need && (
                              <span title={k === "imgNome" ? "Falta a imagem do nome" : "Falta a imagem do número"}><AlertTriangle className="size-3 text-destructive" /></span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  <td className="py-1 pr-2 whitespace-nowrap">
                    <button
                      onClick={() => onView?.(p)}
                      disabled={!!sizeInvalid}
                      title={sizeInvalid ? "Tamanho não existe neste tipo de peça" : "Ver no molde"}
                      aria-label="Ver"
                      className={`p-1 rounded disabled:opacity-30 ${viewingId === p.id ? "text-cyan bg-cyan/10" : "text-muted-foreground hover:text-cyan hover:bg-cyan/10"}`}
                    >
                      <Eye className="size-3.5" />
                    </button>
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

function Thumb({ img, big }: { img: TeamImage; big?: boolean }) {
  return (
    <span className={`grid place-items-center rounded border border-border bg-muted ${big ? "size-14" : "size-7"}`}>
      <img src={img.src} alt={img.nome} className="max-h-full max-w-full object-contain" />
    </span>
  );
}
