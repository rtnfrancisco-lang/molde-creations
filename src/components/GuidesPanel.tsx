import { useEffect, useState } from "react";
import { BLEED_MAX, DEFAULT_GUIDE, SAFETY_MAX, fmtCm, isDefaultGuide, parseCm, type Guide, type GuideView, type Guides } from "@/lib/guides";

export type GuideGroup = { id: string; label: string; views: GuideView[] };

const allOn = (groups: GuideGroup[], on: boolean) => Object.fromEntries(groups.map((g) => [g.id, on])) as Record<string, boolean>;

export function GuidesPanel({
  guides,
  view,
  groups,
  names,
  failures,
  onApply,
}: {
  guides: Guides;
  view: GuideView;
  /** Grupos do tipo de peça atual (vistas ocultas não aparecem). */
  groups: GuideGroup[];
  /** Rótulos curtos das vistas. */
  names: Record<GuideView, string>;
  /** Ex.: "Manga Esq. (PP, P)" — onde a segurança não pôde ser gerada. */
  failures: string[];
  onApply: (views: GuideView[], g: Guide) => void;
}) {
  const [bleed, setBleed] = useState(fmtCm(guides[view].bleed));
  const [safety, setSafety] = useState(fmtCm(guides[view].safety));
  const [sel, setSel] = useState<Record<string, boolean>>(() => allOn(groups, true));
  const groupKey = groups.map((g) => g.id).join("|");
  useEffect(() => {
    setSel(allOn(groups, true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupKey]);
  useEffect(() => {
    setBleed(fmtCm(guides[view].bleed));
    setSafety(fmtCm(guides[view].safety));
    // Só ao abrir/trocar de vista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const b = parseCm(bleed, BLEED_MAX);
  const s = parseCm(safety, SAFETY_MAX);
  const all = groups.every((g) => sel[g.id]);
  const targets = groups.filter((g) => sel[g.id]).flatMap((g) => g.views);
  const canApply = b !== null && s !== null && targets.length > 0;
  const field = (bad: boolean) =>
    "w-full bg-panel2 border rounded-md px-2 py-1.5 text-sm font-mono focus:outline-none " + (bad ? "border-destructive text-destructive" : "border-line focus:border-cyan/60");
  const check = (key: string, label: string, on: boolean, toggle: () => void) => (
    <label key={key} className="flex items-center gap-2 text-[11px] cursor-pointer">
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
        {check("__all", "Tudo", all, () => setSel(allOn(groups, !all)))}
        {groups.map((g) => check(g.id, g.label, !!sel[g.id], () => setSel((c) => ({ ...c, [g.id]: !c[g.id] }))))}
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
        {groups.flatMap((grp) =>
          grp.views.map((v) => {
            const g = guides[v];
            const diff = !isDefaultGuide(g);
            return (
              <button
                key={v}
                onClick={() => {
                  setBleed(fmtCm(g.bleed));
                  setSafety(fmtCm(g.safety));
                  setSel(Object.fromEntries(groups.map((x) => [x.id, x.id === grp.id])));
                }}
                className={"w-full flex justify-between px-1.5 py-0.5 rounded text-[10px] font-mono hover:bg-panel2 " + (diff ? "text-cyan font-semibold" : "text-muted-foreground")}
              >
                <span>{names[v]}</span>
                <span>
                  {fmtCm(g.bleed)} / {fmtCm(g.safety)} cm
                </span>
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}
