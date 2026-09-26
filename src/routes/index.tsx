import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Plus,
  Shirt,
  Wand2,
  Ruler,
  Table2,
  Save,
  RotateCcw,
  Layers,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MoldeCore — Motor de Moldes" },
      {
        name: "description",
        content:
          "MoldeCore é um sistema de automação de moldes de roupa para sublimação. Crie, gradue e edite moldes vetoriais.",
      },
      { property: "og:title", content: "MoldeCore — Motor de Moldes" },
      {
        property: "og:description",
        content: "Automação de moldes de roupa para sublimação — frente, costas e mangas vetoriais.",
      },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "pt_BR" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

/* ================= Tipos e padrões ================= */

type Field = "bodyHeight" | "bodyWidth" | "sleeveHeight" | "sleeveWidth";
type Measurements = Record<Field, number>;
const SIZES = ["PP", "P", "M", "G", "GG", "XG"] as const;
type Size = (typeof SIZES)[number];
type Grading = Record<Size, Measurements>;
type View = "frente" | "costas" | "mangaEsq" | "mangaDir";
type Node = { x: number; y: number; smooth: boolean };
type Shapes = { frente: Node[]; costas: Node[] };
type ClothingType = "Camiseta" | "Moletom" | "Regata" | "Manga Longa";

const FIELDS: { key: Field; label: string; group: string }[] = [
  { key: "bodyHeight", label: "Altura do Corpo", group: "Corpo" },
  { key: "bodyWidth", label: "Largura do Corpo", group: "Corpo" },
  { key: "sleeveHeight", label: "Altura da Manga", group: "Manga" },
  { key: "sleeveWidth", label: "Largura da Manga", group: "Manga" },
];

const d = (a: number, b: number, c: number, e: number): Measurements => ({
  bodyHeight: a,
  bodyWidth: b,
  sleeveHeight: c,
  sleeveWidth: e,
});

const DEFAULT_GRADING: Grading = {
  PP: d(-4, -4, -2, -2),
  P: d(-2, -2, -1, -1),
  M: d(0, 0, 0, 0),
  G: d(2, 2, 1, 1),
  GG: d(4, 4, 2, 2),
  XG: d(6, 6, 3, 3),
};

const bodyShape = (neckDepth: number): Node[] => [
  { x: 0.33, y: 0, smooth: false },
  { x: 0.4, y: neckDepth * 0.7, smooth: true },
  { x: 0.5, y: neckDepth, smooth: true },
  { x: 0.6, y: neckDepth * 0.7, smooth: true },
  { x: 0.67, y: 0, smooth: false },
  { x: 0.92, y: 0.05, smooth: false },
  { x: 0.89, y: 0.15, smooth: true },
  { x: 0.92, y: 0.24, smooth: true },
  { x: 1, y: 0.28, smooth: false },
  { x: 1, y: 1, smooth: false },
  { x: 0, y: 1, smooth: false },
  { x: 0, y: 0.28, smooth: false },
  { x: 0.08, y: 0.24, smooth: true },
  { x: 0.11, y: 0.15, smooth: true },
  { x: 0.08, y: 0.05, smooth: false },
];

const DEFAULT_SHAPES: Shapes = { frente: bodyShape(0.12), costas: bodyShape(0.04) };

const LS_GRADING = "moldecore.tabelaTamanhos";
const LS_SHAPES = "moldecore.formas";

const LIBRARY = [
  { name: "Camiseta Clássica — Sublimação", size: "M", active: true },
  { name: "Moletom Oversized", size: "G" },
  { name: "Regata Nadador", size: "P" },
  { name: "Gola Careca — Manga Longa", size: "GG" },
];

const fmt = (n: number) => n.toFixed(1).replace(".", ",");

/* ================= Página ================= */

function Index() {
  const [clothingType, setClothingType] = useState<ClothingType>("Camiseta");
  const [base, setBase] = useState<Measurements>(d(72, 52, 22, 20));
  const [grading, setGrading] = useState<Grading>(DEFAULT_GRADING);
  const [draftGrading, setDraftGrading] = useState<Grading>(DEFAULT_GRADING);
  const [shapes, setShapes] = useState<Shapes>(DEFAULT_SHAPES);
  const [size, setSize] = useState<Size>("M");
  const [view, setView] = useState<View>("frente");
  const [panel, setPanel] = useState<"medidas" | "tabela">("medidas");
  const [overlay, setOverlay] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  // Carregar do armazenamento local
  useEffect(() => {
    try {
      const g = localStorage.getItem(LS_GRADING);
      if (g) {
        const parsed = JSON.parse(g) as Grading;
        setGrading(parsed);
        setDraftGrading(parsed);
      }
      const s = localStorage.getItem(LS_SHAPES);
      if (s) setShapes(JSON.parse(s));
    } catch {
      /* ignora dados corrompidos */
    }
  }, []);

  const updateShapes = (next: Shapes) => {
    setShapes(next);
    localStorage.setItem(LS_SHAPES, JSON.stringify(next));
  };

  const graded = useMemo(() => {
    const out = {} as Record<Size, Measurements>;
    for (const s of SIZES) {
      out[s] = {
        bodyHeight: base.bodyHeight + grading[s].bodyHeight,
        bodyWidth: base.bodyWidth + grading[s].bodyWidth,
        sleeveHeight: base.sleeveHeight + grading[s].sleeveHeight,
        sleeveWidth: base.sleeveWidth + grading[s].sleeveWidth,
      };
    }
    return out;
  }, [base, grading]);

  const saveGrading = () => {
    setGrading(draftGrading);
    localStorage.setItem(LS_GRADING, JSON.stringify(draftGrading));
    setSavedMsg("Padrão salvo neste navegador");
    setTimeout(() => setSavedMsg(""), 2500);
  };

  const VIEWS: { key: View; label: string }[] = [
    { key: "frente", label: "Frente" },
    { key: "costas", label: "Costas" },
    { key: "mangaEsq", label: "Manga Esquerda" },
    { key: "mangaDir", label: "Manga Direita" },
  ];

  return (
    <div className="min-h-screen w-full bg-ink text-foreground font-display antialiased flex">
      {/* ============ SIDEBAR ============ */}
      <aside className="w-64 shrink-0 bg-panel border-r border-line flex flex-col">
        <div className="px-5 pt-6 pb-5 border-b border-line">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-cyan/10 border border-cyan/40 grid place-items-center shrink-0">
              <Shirt className="size-5 text-cyan" strokeWidth={2} />
            </div>
            <div>
              <div className="text-lg font-bold tracking-tight text-white leading-none">
                Molde<span className="text-cyan">Core</span>
              </div>
              <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-faint mt-1.5">
                Motor de Moldes
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 py-5 border-b border-line">
          <label className="block text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-2">
            Tipo de Peça
          </label>
          <div className="relative">
            <select
              value={clothingType}
              onChange={(e) => setClothingType(e.target.value as ClothingType)}
              className="w-full appearance-none bg-panel2 border border-line rounded-md pl-3 pr-9 py-2.5 text-sm text-white font-medium focus:outline-none focus:border-cyan/60 cursor-pointer"
            >
              <option>Camiseta</option>
              <option>Moletom</option>
              <option>Regata</option>
              <option>Manga Longa</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-cyan size-4" />
          </div>
        </div>

        <div className="px-5 py-5">
          <button className="w-full flex items-center justify-center gap-2 bg-cyan text-ink font-semibold text-sm rounded-md py-3 hover:bg-cyan/90 transition-colors">
            <Plus className="size-4" strokeWidth={2.5} />
            Criar Novo Molde
          </button>
        </div>

        <div className="px-5 pb-2 text-[10px] font-mono uppercase tracking-[0.18em] text-faint">
          Biblioteca
        </div>
        <nav className="px-3 pb-4 space-y-1">
          {LIBRARY.map((item) => (
            <a
              key={item.name}
              href="#"
              className={
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors " +
                (item.active
                  ? "bg-cyan/10 border border-cyan/25 text-white"
                  : "text-muted-foreground hover:bg-panel2 hover:text-white")
              }
            >
              <span className={"size-1.5 rounded-full " + (item.active ? "bg-cyan" : "bg-faint")} />
              <span className="flex-1">{item.name}</span>
              <span className={"text-[10px] font-mono " + (item.active ? "text-cyan" : "text-faint")}>
                {item.size}
              </span>
            </a>
          ))}
        </nav>

        <div className="mt-auto px-5 py-4 border-t border-line">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-full bg-panel2 border border-line grid place-items-center text-xs font-semibold text-cyan">
              AV
            </div>
            <div className="min-w-0">
              <div className="text-sm text-white truncate">Aria Vance</div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-faint">Modelista</div>
            </div>
          </div>
        </div>
      </aside>

      {/* ============ PRINCIPAL ============ */}
      <main className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 shrink-0 border-b border-line bg-panel/60 flex items-center justify-between px-6 gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-faint">Área de Trabalho</span>
            <span className="text-faint">/</span>
            <span className="text-sm font-medium text-white truncate">{clothingType} — Sublimação</span>
          </div>
          <div className="flex items-center gap-1 bg-panel2 border border-line rounded-md p-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-faint px-2">Tamanho</span>
            {SIZES.map((s) => (
              <button
                key={s}
                onClick={() => setSize(s)}
                className={
                  "px-2 py-1 rounded text-xs font-mono font-semibold transition-colors " +
                  (s === size ? "bg-cyan text-ink" : "text-muted-foreground hover:text-white")
                }
              >
                {s}
              </button>
            ))}
          </div>
        </header>

        <div className="flex-1 min-h-0 flex">
          <section className="flex-1 min-w-0 flex flex-col">
            {/* Abas de vista */}
            <div className="h-12 shrink-0 border-b border-line bg-panel/40 flex items-center justify-between px-4">
              <div className="flex items-center gap-1">
                {VIEWS.map((v) => (
                  <button
                    key={v.key}
                    onClick={() => setView(v.key)}
                    className={
                      "px-3 py-1.5 rounded-md text-xs font-medium transition-colors border " +
                      (view === v.key
                        ? "bg-cyan/10 border-cyan/40 text-cyan"
                        : "border-transparent text-muted-foreground hover:text-white")
                    }
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={overlay}
                  onChange={(e) => setOverlay(e.target.checked)}
                  className="accent-[var(--color-cyan)]"
                />
                Sobrepor todos os tamanhos
              </label>
            </div>

            <div className="flex-1 min-h-0 relative blueprint-grid blueprint-grid-fine overflow-hidden">
              <PatternCanvas
                view={view}
                size={size}
                graded={graded}
                overlay={overlay}
                shapes={shapes}
                onShapesChange={updateShapes}
              />
              {(view === "frente" || view === "costas") && (
                <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-[10px] font-mono text-faint">
                  <span>Arraste os pontos · duplo clique adiciona ponto · Alt+clique remove · Shift+clique alterna curva/canto</span>
                  <button
                    onClick={() => updateShapes({ ...shapes, [view]: DEFAULT_SHAPES[view] })}
                    className="flex items-center gap-1 text-muted-foreground hover:text-cyan"
                  >
                    <RotateCcw className="size-3" /> Restaurar forma
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* ============ PAINEL DIREITO ============ */}
          <aside className="w-80 shrink-0 bg-panel border-l border-line flex flex-col">
            <div className="grid grid-cols-2 border-b border-line">
              {(
                [
                  ["medidas", "Medidas", Ruler],
                  ["tabela", "Tabela de Tamanhos", Table2],
                ] as const
              ).map(([k, label, Icon]) => (
                <button
                  key={k}
                  onClick={() => setPanel(k)}
                  className={
                    "flex items-center justify-center gap-1.5 py-3 text-xs font-medium border-b-2 transition-colors " +
                    (panel === k ? "border-cyan text-white" : "border-transparent text-muted-foreground hover:text-white")
                  }
                >
                  <Icon className="size-3.5" /> {label}
                </button>
              ))}
            </div>

            {panel === "medidas" ? (
              <>
                <div className="px-5 py-4 border-b border-line">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-white">Dimensões do Molde Base</h2>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-cyan bg-cyan/10 border border-cyan/25 rounded px-1.5 py-0.5">
                      Tamanho M
                    </span>
                  </div>
                  <p className="text-[11px] text-faint mt-1 font-mono">Os demais tamanhos são calculados · cm</p>
                </div>
                <div className="px-5 py-5 space-y-5 overflow-y-auto">
                  {["Corpo", "Manga"].map((group) => (
                    <div key={group} className="space-y-3">
                      <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-cyan">{group}</div>
                      {FIELDS.filter((f) => f.group === group).map((f) => (
                        <DimensionInput
                          key={f.key}
                          label={`${f.label} (cm)`}
                          value={base[f.key]}
                          onChange={(v) => setBase((b) => ({ ...b, [f.key]: v }))}
                        />
                      ))}
                    </div>
                  ))}
                  <div className="pt-3 border-t border-line">
                    <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-2">
                      Tamanho {size} calculado
                    </div>
                    {FIELDS.map((f) => (
                      <div key={f.key} className="flex justify-between text-[11px] font-mono py-0.5">
                        <span className="text-faint">{f.label}</span>
                        <span className="text-white">{fmt(graded[size][f.key])} cm</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="px-5 py-4 border-t border-line mt-auto">
                  <button
                    onClick={() => setSize("M")}
                    className="w-full flex items-center justify-center gap-2 bg-cyan text-ink font-semibold text-sm rounded-md py-3 hover:bg-cyan/90 transition-colors"
                  >
                    <Wand2 className="size-4" strokeWidth={2.5} />
                    Gerar Molde Base
                  </button>
                  <p className="text-[10px] font-mono text-faint text-center mt-2.5">
                    Graduação automática em {SIZES.length} tamanhos
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="px-5 py-4 border-b border-line">
                  <h2 className="text-sm font-semibold text-white">Configurar Tabela de Tamanhos</h2>
                  <p className="text-[11px] text-faint mt-1 font-mono">
                    cm a somar ou subtrair em relação ao M
                  </p>
                </div>
                <div className="px-3 py-4 overflow-y-auto">
                  <table className="w-full text-[11px] font-mono">
                    <thead>
                      <tr className="text-faint">
                        <th className="text-left font-normal pb-2 pl-2">Tam.</th>
                        <th className="font-normal pb-2">Alt. corpo</th>
                        <th className="font-normal pb-2">Larg. corpo</th>
                        <th className="font-normal pb-2">Alt. manga</th>
                        <th className="font-normal pb-2">Larg. manga</th>
                      </tr>
                    </thead>
                    <tbody>
                      {SIZES.map((s) => (
                        <tr key={s}>
                          <td className={"pl-2 font-semibold " + (s === "M" ? "text-cyan" : "text-white")}>{s}</td>
                          {FIELDS.map((f) => (
                            <td key={f.key} className="p-0.5">
                              <input
                                type="number"
                                step="0.5"
                                disabled={s === "M"}
                                value={draftGrading[s][f.key]}
                                onChange={(e) =>
                                  setDraftGrading((g) => ({
                                    ...g,
                                    [s]: { ...g[s], [f.key]: parseFloat(e.target.value) || 0 },
                                  }))
                                }
                                className="w-full bg-panel2 border border-line rounded px-1.5 py-1.5 text-center text-white disabled:opacity-40 focus:outline-none focus:border-cyan/60"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-5 py-4 border-t border-line mt-auto space-y-2">
                  <button
                    onClick={saveGrading}
                    className="w-full flex items-center justify-center gap-2 bg-cyan text-ink font-semibold text-sm rounded-md py-3 hover:bg-cyan/90 transition-colors"
                  >
                    <Save className="size-4" /> Salvar Padrão
                  </button>
                  <button
                    onClick={() => setDraftGrading(DEFAULT_GRADING)}
                    className="w-full text-[11px] font-mono text-muted-foreground hover:text-cyan"
                  >
                    Restaurar valores sugeridos
                  </button>
                  <p className="text-[10px] font-mono text-center text-cyan h-3">{savedMsg}</p>
                </div>
              </>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}

/* ================= Canvas SVG ================= */

function buildPath(pts: { x: number; y: number; smooth: boolean }[]) {
  const n = pts.length;
  if (n < 2) return "";
  let path = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    if (p1.smooth || p2.smooth) {
      const c1 = p1.smooth ? { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 } : p1;
      const c2 = p2.smooth ? { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 } : p2;
      path += ` C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p2.x} ${p2.y}`;
    } else {
      path += ` L ${p2.x} ${p2.y}`;
    }
  }
  return path + " Z";
}

function sleevePath(w: number, h: number) {
  const c = h * 0.32;
  return `M ${-w / 2} ${c} C ${-w / 3} ${c * 0.9} ${-w / 5} 0 0 0 C ${w / 5} 0 ${w / 3} ${c * 0.9} ${w / 2} ${c} L ${w * 0.4} ${h} L ${-w * 0.4} ${h} Z`;
}

function PatternCanvas({
  view,
  size,
  graded,
  overlay,
  shapes,
  onShapesChange,
}: {
  view: View;
  size: Size;
  graded: Record<Size, Measurements>;
  overlay: boolean;
  shapes: Shapes;
  onShapesChange: (s: Shapes) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const isBody = view === "frente" || view === "costas";
  const m = graded[size];
  const W = isBody ? m.bodyWidth : m.sleeveWidth;
  const H = isBody ? m.bodyHeight : m.sleeveHeight;
  const maxW = Math.max(...SIZES.map((s) => (isBody ? graded[s].bodyWidth : graded[s].sleeveWidth)));
  const maxH = Math.max(...SIZES.map((s) => (isBody ? graded[s].bodyHeight : graded[s].sleeveHeight)));
  const pad = Math.max(maxW, maxH) * 0.18;
  const viewBox = `${-maxW / 2 - pad} ${-pad} ${maxW + pad * 2} ${maxH + pad * 2}`;
  const unit = Math.max(maxW, maxH) / 60;

  const nodes = isBody ? shapes[view] : [];
  const toSvg = (n: Node, w = W, h = H) => ({ x: (n.x - 0.5) * w, y: n.y * h, smooth: n.smooth });

  const pointerToNorm = (e: React.PointerEvent | React.MouseEvent) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    const clamp = (v: number) => Math.min(1.3, Math.max(-0.3, v));
    return { x: clamp(p.x / W + 0.5), y: clamp(p.y / H) };
  };

  const setNodes = (next: Node[]) => {
    if (view === "frente" || view === "costas") onShapesChange({ ...shapes, [view]: next });
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (!isBody) return;
    const p = pointerToNorm(e);
    let best = 0;
    let bestD = Infinity;
    nodes.forEach((a, i) => {
      const b = nodes[(i + 1) % nodes.length];
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const dd = (mx - p.x) ** 2 + (my - p.y) ** 2;
      if (dd < bestD) {
        bestD = dd;
        best = i;
      }
    });
    const next = [...nodes];
    next.splice(best + 1, 0, { ...p, smooth: true });
    setNodes(next);
  };

  const others = overlay ? SIZES.filter((s) => s !== size) : [];
  const title = { frente: "FRENTE", costas: "COSTAS", mangaEsq: "MANGA ESQUERDA", mangaDir: "MANGA DIREITA" }[view];

  return (
    <svg
      ref={svgRef}
      viewBox={viewBox}
      className="absolute inset-0 w-full h-full select-none"
      onPointerMove={(e) => {
        if (drag === null) return;
        const p = pointerToNorm(e);
        setNodes(nodes.map((n, i) => (i === drag ? { ...n, ...p } : n)));
      }}
      onPointerUp={() => setDrag(null)}
      onPointerLeave={() => setDrag(null)}
      onDoubleClick={onDoubleClick}
    >
      <text x={-maxW / 2 - pad * 0.7} y={-pad * 0.5} fontSize={unit * 1.6} className="fill-faint font-mono">
        {title} · TAMANHO {size}
      </text>

      {others.map((s) => {
        const g = graded[s];
        const d = isBody
          ? buildPath(nodes.map((n) => toSvg(n, g.bodyWidth, g.bodyHeight)))
          : sleevePath(g.sleeveWidth, g.sleeveHeight);
        return (
          <path
            key={s}
            d={d}
            className="fill-none stroke-faint"
            strokeWidth={1}
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}

      <path
        d={isBody ? buildPath(nodes.map((n) => toSvg(n))) : sleevePath(W, H)}
        transform={view === "mangaDir" ? "scale(-1,1)" : undefined}
        className="fill-cyan/5 stroke-cyan"
        strokeWidth={1.75}
        vectorEffect="non-scaling-stroke"
      />

      {/* Cotas */}
      <line
        x1={-W / 2}
        x2={W / 2}
        y1={H + unit * 3}
        y2={H + unit * 3}
        className="stroke-amber"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      <text x={0} y={H + unit * 6} textAnchor="middle" fontSize={unit * 1.5} className="fill-amber font-mono">
        LARGURA {fmt(W)} cm
      </text>
      <line
        x1={W / 2 + unit * 3}
        x2={W / 2 + unit * 3}
        y1={0}
        y2={H}
        className="stroke-amber"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      <text
        x={W / 2 + unit * 5}
        y={H / 2}
        fontSize={unit * 1.5}
        className="fill-amber font-mono"
        transform={`rotate(90 ${W / 2 + unit * 5} ${H / 2})`}
        textAnchor="middle"
      >
        ALTURA {fmt(H)} cm
      </text>

      {/* Pontos editáveis */}
      {isBody &&
        nodes.map((n, i) => {
          const p = toSvg(n);
          return (
            <g key={i}>
              {n.smooth ? (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={unit * 0.9}
                  className={"stroke-cyan cursor-move " + (drag === i ? "fill-cyan" : "fill-ink")}
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                  onPointerDown={(e) => handleNodeDown(e, i)}
                />
              ) : (
                <rect
                  x={p.x - unit * 0.8}
                  y={p.y - unit * 0.8}
                  width={unit * 1.6}
                  height={unit * 1.6}
                  className={"stroke-cyan cursor-move " + (drag === i ? "fill-cyan" : "fill-ink")}
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                  onPointerDown={(e) => handleNodeDown(e, i)}
                />
              )}
            </g>
          );
        })}
      {!isBody && nodes.length === 0 && null}
      {!isBody && (
        <g>
          <text x={0} y={H * 0.6} textAnchor="middle" fontSize={unit * 1.4} className="fill-faint font-mono">
            <tspan>
              <Layers />
            </tspan>
            CAVA DA MANGA
          </text>
        </g>
      )}
    </svg>
  );

  function handleNodeDown(e: React.PointerEvent, i: number) {
    e.stopPropagation();
    if (e.altKey) {
      if (nodes.length > 4) setNodes(nodes.filter((_, j) => j !== i));
      return;
    }
    if (e.shiftKey) {
      setNodes(nodes.map((n, j) => (j === i ? { ...n, smooth: !n.smooth } : n)));
      return;
    }
    svgRef.current?.setPointerCapture(e.pointerId);
    setDrag(i);
  }
}

function DimensionInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <label className="block text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground mb-1.5">
        {label}
      </label>
      <div className="relative">
        <input
          type="number"
          step="0.1"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-full bg-panel2 border border-line rounded-md pl-3 pr-12 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-cyan/60 focus:ring-1 focus:ring-cyan/30"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-mono text-faint">cm</span>
      </div>
    </div>
  );
}
