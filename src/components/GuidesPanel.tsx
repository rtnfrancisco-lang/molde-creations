import { useEffect, useState } from "react";
import { BLEED_MAX, DEFAULT_GUIDE, GUIDE_VIEWS, SAFETY_MAX, fmtCm, isDefaultGuide, parseCm, type Guide, type GuideView, type Guides } from "@/lib/guides";

const NAMES: Record<GuideView, string> = { frente: "Frente", costas: "Costas", mangaEsq: "Manga Esq.", mangaDir: "Manga Dir." };
type Group = "frente" | "costas" | "mangas";
const GROUP_VIEWS: Record<Group, GuideView[]> = { frente: ["frente"], costas: ["costas"], mangas: ["mangaEsq", "mangaDir"] };

export function GuidesPanel({
  guides,
  view,
  failures,
  onApply,
}: {
  guides: Guides;
  view: GuideView;
  /** Ex.: "Manga Esq. (PP, P)" — onde a segurança não pôde ser gerada. */
  failures: string[];
  onApply: (views: GuideView[], g: Guide) => void;
}) {
  const [bleed, setBleed] = useState(fmtCm(guides[view].bleed));
  const [safety, setSafety] = useState(fmtCm(guides[view].safety));
  const [sel, setSel] = useState<Record<Group, boolean>>({ frente: true, costas: true, mangas: true });
  useEffect(() => {
    setBleed(fmtCm(guides[view].bleed));
    setSafety(fmtCm(guides[view].safety));
    // Só ao abrir/trocar de vista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const b = parseCm(bleed, BLEED_MAX);
  const s = parseCm(safety, SAFETY_MAX);
  const all = sel.frente && sel.costas && sel.mangas;
  const targets = (Object.keys(sel) as Group[]).filter((k) => sel[k]).flatMap((k) => GROUP_VIEWS[k]);
  const canApply = b !== null && s !== null && targets.length > 0;
  const field = (bad: boolean) =>
    "w-full bg-panel2 border rounded-md px-2 py-1.5 text-sm font-mono focus:outline-none " + (bad ? "border-destructive text-destructive" : "border-line focus:border-cyan/60");
  const check = (label: string, on: boolean, toggle: () => void) => (
    <label className="flex items-center gap-2 text-[11px] cursor-pointer">
      <input type="checkbox" checked={on} onChange={toggle} className="accent-[var(--color-cyan)]" />
      {label}
    </label>
  );

  return (
    <div className="mt-2 rounded-md border border-line bg-panel2/50 p-3 space-y-3">
      <div className="text-[11px] font-semibold text-foreground">Distâncias das linhas-guia</div>
      <label className="block text-[10px] text-muted-foreground">
        Sangria (para fora) · cm
        <input inputMode="decimal" value={bleed} onChange={(e) => setBleed(e.target.value)} className={field(b === null)} aria-invalid={b === null} />
      </label>
      <label className="block text-[10px] text-muted-foreground">
        Segurança (para dentro) · cm
        <input inputMode="decimal" value={safety} onChange={(e) => setSafety(e.target.value)} className={field(s === null)} aria-invalid={s === null} />
      </label>
      {failures.length > 0 && (
        <p className="text-[10px] text-destructive leading-snug">⚠ Linha de segurança não gerada (distância maior que a peça): {failures.join("; ")}</p>
      )}
      <div className="space-y-1">
        <div className="text-[10px] text-muted-foreground">Aplicar em</div>
        {check("Tudo", all, () => setSel(all ? { frente: false, costas: false, mangas: false } : { frente: true, costas: true, mangas: true }))}
        {check("Frente", sel.frente, () => setSel((c) => ({ ...c, frente: !c.frente })))}
        {check("Costas", sel.costas, () => setSel((c) => ({ ...c, costas: !c.costas })))}
        {check("Mangas (esquerda e direita)", sel.mangas, () => setSel((c) => ({ ...c, mangas: !c.mangas })))}
      </div>
      <div className="flex gap-2">
        <button
          disabled={!canApply}
          onClick={() => canApply && onApply(targets, { bleed: b!, safety: s! })}
          className="flex-1 bg-cyan text-primary-foreground text-xs font-semibold rounded-md py-1.5 disabled:opacity-40"
        >
          Aplicar
        </button>
        <button
          disabled={!targets.length}
          onClick={() => {
            setBleed(fmtCm(DEFAULT_GUIDE.bleed));
            setSafety(fmtCm(DEFAULT_GUIDE.safety));
            onApply(targets, { ...DEFAULT_GUIDE });
          }}
          className="flex-1 border border-line text-xs rounded-md py-1.5 hover:bg-panel2 disabled:opacity-40"
        >
          Restaurar padrão
        </button>
      </div>
      <div className="space-y-0.5 border-t border-line pt-2">
        {GUIDE_VIEWS.map((v) => {
          const g = guides[v];
          const diff = !isDefaultGuide(g);
          return (
            <button
              key={v}
              onClick={() => {
                setBleed(fmtCm(g.bleed));
                setSafety(fmtCm(g.safety));
                setSel({ frente: v === "frente", costas: v === "costas", mangas: v === "mangaEsq" || v === "mangaDir" });
              }}
              className={"w-full flex justify-between px-1.5 py-0.5 rounded text-[10px] font-mono hover:bg-panel2 " + (diff ? "text-cyan font-semibold" : "text-muted-foreground")}
            >
              <span>{NAMES[v]}</span>
              <span>
                {fmtCm(g.bleed)} / {fmtCm(g.safety)} cm
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
