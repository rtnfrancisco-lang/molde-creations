import { Square, RectangleHorizontal, Circle, Triangle, Diamond, Pentagon, Hexagon, Star, ArrowRight, Minus } from "lucide-react";
import { SHAPE_LABELS, type DrawOpts, type ShapeKind } from "@/lib/drawing";

const ICONS: Record<ShapeKind, typeof Square> = {
  retangulo: Square,
  arredondado: RectangleHorizontal,
  elipse: Circle,
  triangulo: Triangle,
  losango: Diamond,
  pentagono: Pentagon,
  hexagono: Hexagon,
  estrela: Star,
  seta: ArrowRight,
  linha: Minus,
};

export function DrawOptionsPanel({ mode, opts, onChange }: { mode: "caneta" | "formas"; opts: DrawOpts; onChange: (o: DrawOpts) => void }) {
  const set = (p: Partial<DrawOpts>) => onChange({ ...opts, ...p });
  const isPen = mode === "caneta";
  const stroke = isPen ? opts.penStroke : opts.shapeStroke;
  const width = isPen ? opts.penWidth : opts.shapeWidth;
  const btn = (on: boolean) =>
    "rounded border px-2 py-1 text-xs transition-colors " + (on ? "border-primary bg-primary text-primary-foreground" : "border-line bg-panel text-foreground hover:bg-secondary");
  return (
    <div
      className="absolute left-3 top-3 z-20 w-60 space-y-2 rounded-md border border-line bg-panel p-3 text-xs shadow-lg"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="font-semibold text-foreground">{isPen ? "Opções da Caneta" : "Opções de Formas"}</div>
      {isPen ? (
        <div className="grid grid-cols-2 gap-1">
          <button type="button" className={btn(opts.penMode === "livre")} onClick={() => set({ penMode: "livre" })}>Mão livre</button>
          <button type="button" className={btn(opts.penMode === "bezier")} onClick={() => set({ penMode: "bezier" })}>Bézier</button>
        </div>
      ) : (
        <div className="grid grid-cols-5 gap-1">
          {(Object.keys(ICONS) as ShapeKind[]).map((k) => {
            const I = ICONS[k];
            return (
              <button key={k} type="button" title={SHAPE_LABELS[k]} aria-label={SHAPE_LABELS[k]} className={btn(opts.shape === k) + " flex items-center justify-center"} onClick={() => set({ shape: k })}>
                <I className="h-4 w-4" />
              </button>
            );
          })}
        </div>
      )}
      <label className="flex items-center justify-between gap-2 text-muted-foreground">
        Cor do contorno
        <input type="color" value={stroke} onChange={(e) => set(isPen ? { penStroke: e.target.value } : { shapeStroke: e.target.value })} className="h-6 w-10 cursor-pointer rounded border border-line bg-panel" />
      </label>
      <label className="flex items-center justify-between gap-2 text-muted-foreground">
        Espessura (cm)
        <input
          type="number"
          min={0}
          step={0.05}
          value={width}
          onChange={(e) => {
            const v = Math.max(0, parseFloat(e.target.value.replace(",", ".")) || 0);
            set(isPen ? { penWidth: v } : { shapeWidth: v });
          }}
          className="w-20 rounded border border-line bg-panel px-1.5 py-0.5 text-right text-foreground"
        />
      </label>
      {!isPen && (
        <div className="flex items-center justify-between gap-2 text-muted-foreground">
          Preenchimento
          <div className="flex items-center gap-1">
            <button type="button" className={btn(opts.shapeFill === null)} onClick={() => set({ shapeFill: null })}>Sem</button>
            <input type="color" value={opts.shapeFill ?? "#ffffff"} onChange={(e) => set({ shapeFill: e.target.value })} className="h-6 w-10 cursor-pointer rounded border border-line bg-panel" />
          </div>
        </div>
      )}
    </div>
  );
}
