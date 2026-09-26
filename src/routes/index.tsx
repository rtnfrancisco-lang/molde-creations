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
  ImagePlus,
  Download,
  Crown,
  Trash2,
  Undo2,
  Redo2,
  Palette,
  PanelRightClose,
  X,
  Crop,
  MousePointer2,
  Spline,
  PenTool,
  ZoomIn,
  Maximize,
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
type Node = { x: number; y: number; smooth: boolean; hIn?: { x: number; y: number }; hOut?: { x: number; y: number } };
type Shapes = Record<View, Node[]>;
type Artwork = { src: string; cx: number; cy: number; w: number; ratio: number; clipped?: boolean };
type Artworks = Record<View, Artwork | null>;
type ColorTarget = "contorno" | "preenchimento";
type PartStyle = { stroke: string | null; fill: string | null };
type Styles = Record<View, PartStyle>;
const NO_ART: Artworks = { frente: null, costas: null, mangaEsq: null, mangaDir: null };
const NO_STYLE: PartStyle = { stroke: null, fill: null };
const DEFAULT_STYLES: Styles = { frente: NO_STYLE, costas: NO_STYLE, mangaEsq: NO_STYLE, mangaDir: NO_STYLE };
type Tool = "selecao" | "forma" | "caneta" | "zoom" | "fita";
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

const DEFAULT_TABLE: Grading = {
  PP: d(68, 48, 20, 18),
  P: d(70, 50, 21, 19),
  M: d(72, 52, 22, 20),
  G: d(74, 54, 23, 21),
  GG: d(76, 56, 24, 22),
  XG: d(78, 58, 25, 23),
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

const sleeveShape = (): Node[] => [
  { x: 0, y: 0.32, smooth: false },
  { x: 0.22, y: 0.1, smooth: true },
  { x: 0.5, y: 0, smooth: true },
  { x: 0.78, y: 0.1, smooth: true },
  { x: 1, y: 0.32, smooth: false },
  { x: 0.9, y: 1, smooth: false },
  { x: 0.1, y: 1, smooth: false },
];

const DEFAULT_SHAPES: Shapes = {
  frente: bodyShape(0.12),
  costas: bodyShape(0.04),
  mangaEsq: sleeveShape(),
  mangaDir: sleeveShape().map((n) => ({ ...n, x: 1 - n.x })),
};

const TOOLS: { k: Tool; label: string; icon: typeof Ruler; key: string }[] = [
  { k: "selecao", label: "Ferramenta Seleção", icon: MousePointer2, key: "V" },
  { k: "forma", label: "Ferramenta Forma / Editar Nós", icon: Spline, key: "F" },
  { k: "caneta", label: "Ferramenta Caneta", icon: PenTool, key: "P" },
  { k: "zoom", label: "Ferramenta Zoom", icon: ZoomIn, key: "Z" },
  { k: "fita", label: "Fita Métrica Digital", icon: Ruler, key: "M" },
];

const TOOL_HINTS: Record<Tool, string> = {
  selecao: "Arraste o contorno ou a estampa para mover · arraste a alça do canto para escalar",
  forma: "Arraste nós e alças · duplo clique adiciona nó · Alt+clique remove · Shift+clique alterna reta/curva",
  caneta: "Clique para criar nós · clique e arraste para curvas · clique no 1º nó ou Enter fecha · Esc cancela",
  zoom: "Clique para aproximar · Alt+clique afasta · arraste para mover a vista · roda do mouse também dá zoom",
  fita: "Clique em dois pontos para medir a distância real em cm",
};

const LS_GRADING = "moldecore.tabelaMedidas";
const LS_MOTHER = "moldecore.moldeMae";
const LS_ART = "moldecore.estampas";
const LS_STYLES = "moldecore.cores";
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
  const [table, setTable] = useState<Grading>(DEFAULT_TABLE);
  const [mother, setMother] = useState<Size>("M");
  const [artworks, setArtworks] = useState<Artworks>(NO_ART);
  const [styles, setStyles] = useState<Styles>(DEFAULT_STYLES);
  const [colorTarget, setColorTarget] = useState<ColorTarget>("preenchimento");
  const [pcEdit, setPcEdit] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [shapes, setShapes] = useState<Shapes>(DEFAULT_SHAPES);
  const [size, setSize] = useState<Size>("M");
  const [view, setView] = useState<View>("frente");
  const [panel, setPanel] = useState<"medidas" | "tabela">("medidas");
  const [overlay, setOverlay] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [tool, setTool] = useState<Tool>("forma");
  const [fitSignal, setFitSignal] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "SELECT" || e.ctrlKey || e.metaKey) return;
      const t = TOOLS.find((x) => x.key === e.key.toUpperCase());
      if (t) setTool(t.k);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Carregar do armazenamento local
  useEffect(() => {
    try {
      const g = localStorage.getItem(LS_GRADING);
      if (g) setTable(JSON.parse(g) as Grading);
      const mm = localStorage.getItem(LS_MOTHER) as Size | null;
      if (mm && SIZES.includes(mm)) setMother(mm);
      const a = localStorage.getItem(LS_ART);
      if (a) setArtworks({ ...NO_ART, ...JSON.parse(a) });
      const st = localStorage.getItem(LS_STYLES);
      if (st) setStyles({ ...DEFAULT_STYLES, ...JSON.parse(st) });
      const s = localStorage.getItem(LS_SHAPES);
      if (s) setShapes({ ...DEFAULT_SHAPES, ...JSON.parse(s) });
    } catch {
      /* ignora dados corrompidos */
    }
  }, []);

  /* ---------- Histórico (Desfazer / Refazer) ---------- */
  type Snap = { table: Grading; shapes: Shapes; artworks: Artworks; styles: Styles };
  const snapRef = useRef<Snap>({ table, shapes, artworks, styles });
  snapRef.current = { table, shapes, artworks, styles };
  const [past, setPast] = useState<Snap[]>([]);
  const [future, setFuture] = useState<Snap[]>([]);
  const lastCp = useRef({ key: "", t: 0 });

  const checkpoint = (key: string) => {
    const now = Date.now();
    if (lastCp.current.key === key && now - lastCp.current.t < 700) {
      lastCp.current.t = now;
      return;
    }
    lastCp.current = { key, t: now };
    const snap = snapRef.current;
    setPast((p) => [...p.slice(-99), snap]);
    setFuture([]);
  };

  const restore = (sn: Snap) => {
    setTable(sn.table);
    setShapes(sn.shapes);
    setArtworks(sn.artworks);
    setStyles(sn.styles);
    localStorage.setItem(LS_GRADING, JSON.stringify(sn.table));
    localStorage.setItem(LS_SHAPES, JSON.stringify(sn.shapes));
    localStorage.setItem(LS_STYLES, JSON.stringify(sn.styles));
    try {
      localStorage.setItem(LS_ART, JSON.stringify(sn.artworks));
    } catch {
      /* ignora */
    }
    lastCp.current = { key: "", t: 0 };
  };

  const undo = () => {
    if (!past.length) return;
    const prev = past[past.length - 1]!;
    setPast(past.slice(0, -1));
    setFuture((f) => [snapRef.current, ...f]);
    restore(prev);
  };

  const redo = () => {
    if (!future.length) return;
    const next = future[0]!;
    setFuture(future.slice(1));
    setPast((p) => [...p, snapRef.current]);
    restore(next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (k === "y" || (k === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const updateShapes = (next: Shapes) => {
    checkpoint("shapes");
    setShapes(next);
    localStorage.setItem(LS_SHAPES, JSON.stringify(next));
  };

  const graded = table;

  const updateTable = (sz: Size, key: Field, v: number) => {
    checkpoint(`table:${sz}:${key}`);
    setTable((t) => {
      const next = { ...t, [sz]: { ...t[sz], [key]: v } };
      localStorage.setItem(LS_GRADING, JSON.stringify(next));
      return next;
    });
  };

  const changeMother = (m: Size) => {
    setMother(m);
    setSize(m);
    localStorage.setItem(LS_MOTHER, m);
  };

  const updateArtworks = (next: Artworks) => {
    checkpoint("art");
    setArtworks(next);
    try {
      localStorage.setItem(LS_ART, JSON.stringify(next));
    } catch {
      /* imagem grande demais para o armazenamento local */
    }
  };

  const saveGrading = () => {
    localStorage.setItem(LS_GRADING, JSON.stringify(table));
    setSavedMsg("Tabela salva neste navegador");
    setTimeout(() => setSavedMsg(""), 2500);
  };

  const artView: View = view;
  const art = artworks[view];

  useEffect(() => setPcEdit(false), [view]);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menu]);

  const applyColor = (t: ColorTarget, hex: string | null) => {
    checkpoint("color:" + Date.now());
    const next = { ...styles, [view]: { ...styles[view], [t === "contorno" ? "stroke" : "fill"]: hex } };
    setStyles(next);
    localStorage.setItem(LS_STYLES, JSON.stringify(next));
  };

  const setArt = (a: Artwork | null) => updateArtworks({ ...artworks, [view]: a });
  const pcApply = () => {
    if (art) setArt({ ...art, clipped: true });
    setPcEdit(false);
  };
  const pcEditStart = () => {
    setSize(mother);
    setTool("selecao");
    setPcEdit(true);
  };
  const pcExtract = () => {
    if (art) setArt({ ...art, clipped: false });
    setPcEdit(false);
  };
  const pcState = !art ? "none" : art.clipped === false ? "free" : pcEdit ? "editing" : "locked";

  const onUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      const img = new Image();
      img.onload = () => {
        updateArtworks({
          ...artworks,
          [artView]: { src, cx: 0.5, cy: 0.35, w: 0.3, ratio: img.naturalHeight / img.naturalWidth, clipped: false },
        });
        setPcEdit(false);
        setSize(mother);
        setTool("selecao");
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  const exportAll = () => {
    const isBody = view === "frente" || view === "costas";
    const st = styles[view];
    SIZES.forEach((sz, idx) => {
      const m = table[sz];
      const W = isBody ? m.bodyWidth : m.sleeveWidth;
      const H = isBody ? m.bodyHeight : m.sleeveHeight;
      const path = buildPath(shapes[view], W, H);
      let img = "";
      if (art) {
        const aw = art.w * W;
        const ah = aw * art.ratio;
        const x = (art.cx - 0.5) * W - aw / 2;
        const y = art.cy * H - ah / 2;
        img = `<clipPath id="c"><path d="${path}"/></clipPath><image href="${art.src}" x="${x}" y="${y}" width="${aw}" height="${ah}" ${art.clipped === false ? "" : 'clip-path="url(#c)"'} preserveAspectRatio="none"/>`;
      }
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W + 2}cm" height="${H + 2}cm" viewBox="${-W / 2 - 1} -1 ${W + 2} ${H + 2}"><path d="${path}" fill="${st.fill ?? "none"}"/>${img}<path d="${path}" fill="none" stroke="${st.stroke ?? "#000"}" stroke-width="0.05"/></svg>`;
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      setTimeout(() => {
        const el = document.createElement("a");
        el.href = url;
        el.download = `moldecore-${view}-${sz}.svg`;
        el.click();
        URL.revokeObjectURL(url);
      }, idx * 250);
    });
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
          <div className="flex items-center gap-3">
          <div className="flex items-center bg-panel2 border border-line rounded-md p-1">
            {(
              [
                ["Desfazer", Undo2, undo, past.length === 0, "Ctrl+Z"],
                ["Refazer", Redo2, redo, future.length === 0, "Ctrl+Y"],
              ] as const
            ).map(([label, Icon, run, disabled, kbd]) => (
              <button
                key={label}
                onClick={run}
                disabled={disabled}
                title={`${label} (${kbd})`}
                aria-label={label}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium text-muted-foreground hover:text-cyan hover:bg-cyan/10 disabled:opacity-30 disabled:pointer-events-none"
              >
                <Icon className="size-3.5" /> <span className="hidden lg:inline">{label}</span>
              </button>
            ))}
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
                {s === mother && <Crown className="inline size-2.5 ml-0.5 -mt-0.5" />}
              </button>
            ))}
          </div>
          </div>
        </header>

        <div className="flex-1 min-h-0 flex">
          <section className="flex-1 min-w-0 flex flex-col">
            {/* Abas de vista */}
            <div className="h-12 shrink-0 border-b border-line bg-panel/40 flex items-center justify-between gap-3 px-4 overflow-x-auto">
              <div className="flex items-center gap-1">
                {VIEWS.map((v) => (
                  <button
                    key={v.key}
                    onClick={() => setView(v.key)}
                    className={
                      "px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors border " +
                      (view === v.key
                        ? "bg-cyan/10 border-cyan/40 text-cyan"
                        : "border-transparent text-muted-foreground hover:text-white")
                    }
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUpload(f);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap border border-cyan/40 text-cyan hover:bg-cyan/10"
              >
                <ImagePlus className="size-3.5" /> Carregar Estampa
              </button>
              {art && (
                <>
                  <button
                    onClick={pcState === "free" ? pcApply : pcState === "locked" ? pcEditStart : pcApply}
                    className={
                      "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap border " +
                      (pcState === "editing" ? "border-amber/60 text-amber bg-amber/10" : "border-line text-muted-foreground hover:text-white")
                    }
                  >
                    <Crop className="size-3.5" />
                    {pcState === "free" ? "Aplicar PowerClip" : pcState === "locked" ? "Editar Conteúdo do PowerClip" : "Concluir Edição"}
                  </button>
                  <button
                    onClick={() => setArt(null)}
                    aria-label="Remover estampa"
                    className="p-1.5 rounded-md text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </>
              )}
              <button
                onClick={exportAll}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap border border-line text-muted-foreground hover:text-white"
              >
                <Download className="size-3.5" /> Exportar Tamanhos
              </button>
              <label className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={overlay}
                  onChange={(e) => setOverlay(e.target.checked)}
                  className="accent-[var(--color-cyan)]"
                />
                Sobrepor
              </label>
              </div>
            </div>

            <div className="flex-1 min-h-0 flex">
              <div className="w-12 shrink-0 bg-panel border-r border-line flex flex-col items-center py-2 gap-1 z-10">
                {TOOLS.map((t) => (
                  <button
                    key={t.k}
                    onClick={() => setTool(t.k)}
                    aria-label={t.label}
                    className={
                      "group relative size-9 grid place-items-center rounded-md border transition-colors " +
                      (tool === t.k
                        ? "bg-cyan/15 border-cyan/50 text-cyan"
                        : "border-transparent text-muted-foreground hover:bg-panel2 hover:text-white")
                    }
                  >
                    <t.icon className="size-4" />
                    <span className="pointer-events-none absolute left-full ml-2 whitespace-nowrap rounded bg-panel2 border border-line px-2 py-1 text-[11px] text-white opacity-0 group-hover:opacity-100 transition-opacity">
                      {t.label} <span className="font-mono text-faint ml-1">{t.key}</span>
                    </span>
                  </button>
                ))}
                <div className="mt-auto" />
                <button
                  onClick={() => setFitSignal((n) => n + 1)}
                  aria-label="Ajustar à tela"
                  className="group relative size-9 grid place-items-center rounded-md text-muted-foreground hover:bg-panel2 hover:text-white"
                >
                  <Maximize className="size-4" />
                  <span className="pointer-events-none absolute left-full ml-2 whitespace-nowrap rounded bg-panel2 border border-line px-2 py-1 text-[11px] text-white opacity-0 group-hover:opacity-100 transition-opacity">
                    Ajustar à tela
                  </span>
                </button>
              </div>
              <div className="flex-1 min-w-0 relative blueprint-grid blueprint-grid-fine overflow-hidden">
                <PatternCanvas
                  view={view}
                  size={size}
                  graded={graded}
                  overlay={overlay}
                  shapes={shapes}
                  onShapesChange={updateShapes}
                  tool={tool}
                  fitSignal={fitSignal}
                  artwork={art}
                  onArtworkChange={setArt}
                  mother={mother}
                  pcEdit={pcEdit}
                  partStyle={styles[view]}
                  onMenu={(x, y) => setMenu({ x, y })}
                />
                <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between gap-4 text-[10px] font-mono text-faint pointer-events-none">
                  <span>{pcState === "editing" ? "Editando conteúdo do PowerClip · arraste a estampa e a alça do canto · clique em Concluir Edição para travar" : TOOL_HINTS[tool]}</span>
                  <button
                    onClick={() => updateShapes({ ...shapes, [view]: DEFAULT_SHAPES[view] })}
                    className="pointer-events-auto flex items-center gap-1 text-muted-foreground hover:text-cyan whitespace-nowrap"
                  >
                    <RotateCcw className="size-3" /> Restaurar forma
                  </button>
                </div>
              </div>
            </div>
          </section>

          <PaletteDock target={colorTarget} onTarget={setColorTarget} onApply={applyColor} current={styles[view]} />

          {menu && (
            <div
              className="fixed z-50 min-w-56 rounded-md border border-line bg-panel2 py-1 shadow-xl text-xs"
              style={{ left: menu.x, top: menu.y }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-faint">PowerClip</div>
              {[
                { label: `Aplicar PowerClip em ${VIEWS.find((v) => v.key === view)?.label}`, show: pcState === "free", run: pcApply },
                { label: "Editar Conteúdo do PowerClip", show: pcState === "locked", run: pcEditStart },
                { label: "Concluir Edição", show: pcState === "editing", run: pcApply },
                { label: "Extrair Conteúdo", show: pcState === "locked" || pcState === "editing", run: pcExtract },
                { label: "Carregar Estampa…", show: pcState === "none", run: () => fileRef.current?.click() },
                { label: "Remover Estampa", show: pcState !== "none", run: () => setArt(null) },
              ]
                .filter((i) => i.show)
                .map((i) => (
                  <button
                    key={i.label}
                    onClick={() => {
                      i.run();
                      setMenu(null);
                    }}
                    className="w-full text-left px-3 py-1.5 text-white hover:bg-cyan/15 hover:text-cyan"
                  >
                    {i.label}
                  </button>
                ))}
            </div>
          )}

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
                    <label className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-cyan bg-cyan/10 border border-cyan/25 rounded px-1.5 py-0.5">
                      <Crown className="size-3" /> Molde Mãe
                      <select
                        value={mother}
                        onChange={(e) => changeMother(e.target.value as Size)}
                        className="bg-transparent text-cyan font-semibold focus:outline-none cursor-pointer"
                      >
                        {SIZES.map((s) => (
                          <option key={s} value={s} className="bg-panel">{s}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <p className="text-[11px] text-faint mt-1 font-mono">Medidas do Tamanho {mother} · estampas são ancoradas aqui</p>
                </div>
                <div className="px-5 py-5 space-y-5 overflow-y-auto">
                  {["Corpo", "Manga"].map((group) => (
                    <div key={group} className="space-y-3">
                      <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-cyan">{group}</div>
                      {FIELDS.filter((f) => f.group === group).map((f) => (
                        <DimensionInput
                          key={f.key}
                          label={`${f.label} (cm)`}
                          value={table[mother][f.key]}
                          onChange={(v) => updateTable(mother, f.key, v)}
                        />
                      ))}
                    </div>
                  ))}
                  <div className="pt-3 border-t border-line">
                    <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-2">
                      Tamanho {size} em exibição
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
                    onClick={() => setSize(mother)}
                    className="w-full flex items-center justify-center gap-2 bg-cyan text-ink font-semibold text-sm rounded-md py-3 hover:bg-cyan/90 transition-colors"
                  >
                    <Wand2 className="size-4" strokeWidth={2.5} />
                    Gerar Molde Base
                  </button>
                  <p className="text-[10px] font-mono text-faint text-center mt-2.5">
                    Graduação pela Tabela de Tamanhos · {SIZES.length} tamanhos
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="px-5 py-4 border-b border-line">
                  <h2 className="text-sm font-semibold text-white">Configurar Tabela de Tamanhos</h2>
                  <p className="text-[11px] text-faint mt-1 font-mono">
                    Medidas finais de cada tamanho em cm · aplicadas na hora
                  </p>
                </div>
                <div className="px-3 py-4 overflow-y-auto">
                  <table className="w-full text-[11px] font-mono">
                    <thead>
                      <tr className="text-faint">
                        <th className="text-left font-normal pb-2 pl-2 align-bottom">Tamanho</th>
                        <th className="font-normal pb-2 leading-tight">Altura do Corpo (cm)</th>
                        <th className="font-normal pb-2 leading-tight">Largura do Corpo (cm)</th>
                        <th className="font-normal pb-2 leading-tight">Altura da Manga (cm)</th>
                        <th className="font-normal pb-2 leading-tight">Largura da Manga (cm)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {SIZES.map((s) => (
                        <tr key={s}>
                          <td className={"pl-2 font-semibold whitespace-nowrap " + (s === mother ? "text-cyan" : "text-white")}>
                            {s}
                            {s === mother && <Crown className="inline size-3 ml-1 -mt-0.5" />}
                          </td>
                          {FIELDS.map((f) => (
                            <td key={f.key} className="p-0.5">
                              <input
                                type="number"
                                step="0.5"
                                value={table[s][f.key]}
                                onChange={(e) => updateTable(s, f.key, parseFloat(e.target.value) || 0)}
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
                    onClick={() => {
                      checkpoint("table-reset:" + Date.now());
                      setTable(DEFAULT_TABLE);
                      localStorage.setItem(LS_GRADING, JSON.stringify(DEFAULT_TABLE));
                    }}
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

type Pt = { x: number; y: number };
type Drag =
  | { k: "node"; i: number }
  | { k: "hOut"; i: number }
  | { k: "hIn"; i: number }
  | { k: "pen"; i: number }
  | { k: "art"; start: Pt; orig: Artwork }
  | { k: "artScale"; orig: Artwork }
  | { k: "move"; start: Pt; orig: Node[] }
  | { k: "scale"; start: Pt; orig: Node[]; box: { x0: number; y0: number } }
  | { k: "pan"; sx: number; sy: number; orig: Pt; alt: boolean; at: Pt };

function buildPath(nodes: Node[], w: number, h: number, closed = true) {
  const n = nodes.length;
  if (!n) return "";
  const P = (q: Pt) => ({ x: (q.x - 0.5) * w, y: q.y * h });
  const at = (i: number) => nodes[((i % n) + n) % n]!;
  const s = P(at(0));
  let d = `M ${s.x} ${s.y}`;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = at(i);
    const b = at(i + 1);
    const a0 = at(i - 1);
    const b1 = at(i + 2);
    let c1: Pt | null = null;
    let c2: Pt | null = null;
    if (a.hOut) c1 = { x: a.x + a.hOut.x, y: a.y + a.hOut.y };
    else if (a.smooth) c1 = { x: a.x + (b.x - a0.x) / 6, y: a.y + (b.y - a0.y) / 6 };
    if (b.hIn) c2 = { x: b.x + b.hIn.x, y: b.y + b.hIn.y };
    else if (b.smooth) c2 = { x: b.x - (b1.x - a.x) / 6, y: b.y - (b1.y - a.y) / 6 };
    const pb = P(b);
    if (c1 || c2) {
      const q1 = P(c1 ?? a);
      const q2 = P(c2 ?? b);
      d += ` C ${q1.x} ${q1.y} ${q2.x} ${q2.y} ${pb.x} ${pb.y}`;
    } else d += ` L ${pb.x} ${pb.y}`;
  }
  return closed ? d + " Z" : d;
}

function PatternCanvas({
  view,
  size,
  graded,
  overlay,
  shapes,
  onShapesChange,
  tool,
  fitSignal,
  artwork,
  onArtworkChange,
  mother,
  pcEdit,
  partStyle,
  onMenu,
}: {
  view: View;
  size: Size;
  graded: Record<Size, Measurements>;
  overlay: boolean;
  shapes: Shapes;
  onShapesChange: (s: Shapes) => void;
  tool: Tool;
  fitSignal: number;
  artwork: Artwork | null;
  onArtworkChange: (a: Artwork | null) => void;
  mother: Size;
  pcEdit: boolean;
  partStyle: PartStyle;
  onMenu: (x: number, y: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [draft, setDraft] = useState<Node[] | null>(null);
  const [zoom, setZoom] = useState({ k: 1, px: 0, py: 0 });
  const [tape, setTape] = useState<{ a: Pt | null; b: Pt | null }>({ a: null, b: null });
  const [hover, setHover] = useState<Pt | null>(null);

  const isBody = view === "frente" || view === "costas";
  const dims = (g: Measurements) =>
    isBody ? { w: g.bodyWidth, h: g.bodyHeight } : { w: g.sleeveWidth, h: g.sleeveHeight };
  const { w: W, h: H } = dims(graded[size]);
  const maxW = Math.max(...SIZES.map((s) => dims(graded[s]).w));
  const maxH = Math.max(...SIZES.map((s) => dims(graded[s]).h));
  const pad = Math.max(maxW, maxH) * 0.18;
  const bw = maxW + pad * 2;
  const bh = maxH + pad * 2;
  const bcx = 0;
  const bcy = maxH / 2;
  const vw = bw / zoom.k;
  const vh = bh / zoom.k;
  const vx = bcx + zoom.px - vw / 2;
  const vy = bcy + zoom.py - vh / 2;
  const unit = Math.max(maxW, maxH) / 60 / zoom.k;

  useEffect(() => setZoom({ k: 1, px: 0, py: 0 }), [fitSignal, view]);
  useEffect(() => {
    setDraft(null);
    setTape({ a: null, b: null });
  }, [tool, view]);

  const nodes = shapes[view];
  const setNodes = (next: Node[]) => onShapesChange({ ...shapes, [view]: next });
  const toSvg = (q: Pt): Pt => ({ x: (q.x - 0.5) * W, y: q.y * H });
  const toNorm = (p: Pt): Pt => ({ x: p.x / W + 0.5, y: p.y / H });
  const svgPoint = (e: { clientX: number; clientY: number }): Pt => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  };
  const capture = (e: React.PointerEvent) => svgRef.current?.setPointerCapture(e.pointerId);

  const commitDraft = () => {
    if (draft && draft.length >= 3) setNodes(draft);
    setDraft(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (tool !== "caneta" || !draft) return;
      if (e.key === "Enter") commitDraft();
      if (e.key === "Escape") setDraft(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const box = {
    x0: Math.min(...nodes.map((n) => n.x)),
    y0: Math.min(...nodes.map((n) => n.y)),
    x1: Math.max(...nodes.map((n) => n.x)),
    y1: Math.max(...nodes.map((n) => n.y)),
  };

  const onBgDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = svgPoint(e);
    if (tool === "zoom") {
      capture(e);
      setDrag({ k: "pan", sx: e.clientX, sy: e.clientY, orig: { x: zoom.px, y: zoom.py }, alt: e.altKey, at: p });
    } else if (tool === "fita") {
      setTape((t) => (!t.a || t.b ? { a: p, b: null } : { a: t.a, b: p }));
    } else if (tool === "caneta") {
      if (draft && draft.length >= 3) {
        const f = toSvg(draft[0]!);
        if (Math.hypot(f.x - p.x, f.y - p.y) < unit * 1.5) {
          commitDraft();
          return;
        }
      }
      const n = toNorm(p);
      const next = [...(draft ?? []), { x: n.x, y: n.y, smooth: false }];
      setDraft(next);
      capture(e);
      setDrag({ k: "pen", i: next.length - 1 });
    }
  };

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = svgPoint(e);
    setHover(p);
    if (!drag) return;
    const n = toNorm(p);
    switch (drag.k) {
      case "art":
        onArtworkChange({ ...drag.orig, cx: drag.orig.cx + n.x - drag.start.x, cy: drag.orig.cy + n.y - drag.start.y });
        break;
      case "artScale":
        onArtworkChange({ ...drag.orig, w: Math.max(0.03, Math.abs(n.x - drag.orig.cx) * 2) });
        break;
      case "node":
        setNodes(nodes.map((q, i) => (i === drag.i ? { ...q, x: n.x, y: n.y } : q)));
        break;
      case "hOut":
      case "hIn":
        setNodes(
          nodes.map((q, i) => {
            if (i !== drag.i) return q;
            const o = { x: n.x - q.x, y: n.y - q.y };
            const m = { x: -o.x, y: -o.y };
            return drag.k === "hOut" ? { ...q, hOut: o, hIn: m } : { ...q, hIn: o, hOut: m };
          }),
        );
        break;
      case "pen":
        if (!draft) break;
        setDraft(
          draft.map((q, i) => {
            if (i !== drag.i) return q;
            const o = { x: n.x - q.x, y: n.y - q.y };
            if (Math.hypot(o.x * W, o.y * H) < 0.3) return q;
            return { ...q, smooth: true, hOut: o, hIn: { x: -o.x, y: -o.y } };
          }),
        );
        break;
      case "move": {
        const dx = n.x - drag.start.x;
        const dy = n.y - drag.start.y;
        setNodes(drag.orig.map((q) => ({ ...q, x: q.x + dx, y: q.y + dy })));
        break;
      }
      case "scale": {
        const b = drag.box;
        const sx = Math.max(0.05, (n.x - b.x0) / (drag.start.x - b.x0 || 1));
        const sy = Math.max(0.05, (n.y - b.y0) / (drag.start.y - b.y0 || 1));
        setNodes(
          drag.orig.map((q) => {
            const r: Node = { ...q, x: b.x0 + (q.x - b.x0) * sx, y: b.y0 + (q.y - b.y0) * sy };
            if (q.hIn) r.hIn = { x: q.hIn.x * sx, y: q.hIn.y * sy };
            if (q.hOut) r.hOut = { x: q.hOut.x * sx, y: q.hOut.y * sy };
            return r;
          }),
        );
        break;
      }
      case "pan": {
        const svg = svgRef.current!;
        const s = Math.max(vw / svg.clientWidth, vh / svg.clientHeight);
        setZoom((z) => ({
          ...z,
          px: drag.orig.x - (e.clientX - drag.sx) * s,
          py: drag.orig.y - (e.clientY - drag.sy) * s,
        }));
        break;
      }
    }
  };

  const onUp = (e: React.PointerEvent) => {
    if (drag?.k === "pan" && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) {
      const f = drag.alt ? 1 / 1.6 : 1.6;
      const at = drag.at;
      setZoom((z) => ({ k: Math.min(12, Math.max(0.3, z.k * f)), px: at.x - bcx, py: at.y - bcy }));
    }
    setDrag(null);
  };

  const onWheel = (e: React.WheelEvent) => {
    const p = svgPoint(e);
    const f = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setZoom((z) => {
      const k = Math.min(12, Math.max(0.3, z.k * f));
      const r = k / z.k;
      const cx = bcx + z.px;
      const cy = bcy + z.py;
      return { k, px: p.x + (cx - p.x) / r - bcx, py: p.y + (cy - p.y) / r - bcy };
    });
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (tool !== "forma") return;
    const p = toNorm(svgPoint(e));
    let best = 0;
    let bestD = Infinity;
    nodes.forEach((a, i) => {
      const b = nodes[(i + 1) % nodes.length]!;
      const dd = ((a.x + b.x) / 2 - p.x) ** 2 + ((a.y + b.y) / 2 - p.y) ** 2;
      if (dd < bestD) {
        bestD = dd;
        best = i;
      }
    });
    const next = [...nodes];
    next.splice(best + 1, 0, { ...p, smooth: true });
    setNodes(next);
  };

  const onNodeDown = (e: React.PointerEvent, i: number) => {
    e.stopPropagation();
    if (tool === "forma") {
      if (e.altKey) {
        if (nodes.length > 3) setNodes(nodes.filter((_, j) => j !== i));
        return;
      }
      if (e.shiftKey) {
        setNodes(
          nodes.map((q, j) => {
            if (j !== i) return q;
            const { hIn: _a, hOut: _b, ...rest } = q;
            return { ...rest, smooth: !q.smooth };
          }),
        );
        return;
      }
    }
    capture(e);
    setDrag({ k: "node", i });
  };

  const others = overlay ? SIZES.filter((s) => s !== size) : [];
  const title = { frente: "FRENTE", costas: "COSTAS", mangaEsq: "MANGA ESQUERDA", mangaDir: "MANGA DIREITA" }[view];
  const showNodes = tool === "forma" || tool === "caneta";
  const nodesInteractive = tool === "forma" || (tool === "caneta" && !draft);
  const cursor = { selecao: "cursor-default", forma: "cursor-crosshair", caneta: "cursor-crosshair", zoom: "cursor-zoom-in", fita: "cursor-crosshair" }[tool];
  const tapeEnd = tape.b ?? (tape.a ? hover : null);
  const sw = { strokeWidth: 1.5, vectorEffect: "non-scaling-stroke" as const };

  const square = (p: Pt, key: string | number, cls: string, onDown?: (e: React.PointerEvent) => void) => (
    <rect
      key={key}
      x={p.x - unit * 0.7}
      y={p.y - unit * 0.7}
      width={unit * 1.4}
      height={unit * 1.4}
      className={cls}
      {...sw}
      style={{ pointerEvents: onDown ? "auto" : "none" }}
      onPointerDown={onDown}
    />
  );

  return (
    <svg
      ref={svgRef}
      viewBox={`${vx} ${vy} ${vw} ${vh}`}
      className={"absolute inset-0 w-full h-full select-none touch-none " + cursor}
      onPointerDown={onBgDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={() => setHover(null)}
      onWheel={onWheel}
      onDoubleClick={onDoubleClick}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu(e.clientX, e.clientY);
      }}
    >
      <text x={-maxW / 2 - pad * 0.7} y={-pad * 0.5} fontSize={(Math.max(maxW, maxH) / 60) * 1.6} className="fill-faint font-mono">
        {title} · TAMANHO {size}
      </text>

      {others.map((s) => {
        const g = dims(graded[s]);
        return (
          <path
            key={s}
            d={buildPath(nodes, g.w, g.h)}
            className="fill-none stroke-faint pointer-events-none"
            strokeWidth={1}
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}

      <path
        d={buildPath(nodes, W, H)}
        className={"fill-cyan/5 stroke-cyan " + (tool === "selecao" ? "cursor-move" : "")}
        strokeWidth={1.75}
        vectorEffect="non-scaling-stroke"
        style={{
          pointerEvents: tool === "selecao" ? "all" : "none",
          ...(partStyle.fill ? { fill: partStyle.fill } : {}),
          ...(partStyle.stroke ? { stroke: partStyle.stroke } : {}),
        }}
        onPointerDown={(e) => {
          if (tool !== "selecao") return;
          e.stopPropagation();
          capture(e);
          setDrag({ k: "move", start: toNorm(svgPoint(e)), orig: nodes });
        }}
      />

      {artwork && (() => {
        const aw = artwork.w * W;
        const ah = aw * artwork.ratio;
        const c = toSvg({ x: artwork.cx, y: artwork.cy });
        const clipped = artwork.clipped !== false;
        const editingNow = clipped && pcEdit && size === mother;
        const movable = size === mother && tool === "selecao" && (!clipped || editingNow);
        const imgProps = {
          href: artwork.src,
          x: c.x - aw / 2,
          y: c.y - ah / 2,
          width: aw,
          height: ah,
          preserveAspectRatio: "none",
        };
        const down = (e: React.PointerEvent) => {
          e.stopPropagation();
          capture(e);
          setDrag({ k: "art", start: toNorm(svgPoint(e)), orig: artwork });
        };
        return (
          <g>
            <clipPath id="outline-clip">
              <path d={buildPath(nodes, W, H)} />
            </clipPath>
            {(!clipped || editingNow) && (
              <image
                {...imgProps}
                opacity={editingNow ? 0.3 : 1}
                className={movable ? "cursor-move" : ""}
                style={{ pointerEvents: movable ? "all" : "none" }}
                onPointerDown={movable ? down : undefined}
              />
            )}
            {clipped && <image {...imgProps} clipPath="url(#outline-clip)" style={{ pointerEvents: "none" }} />}
            {movable && (
              <>
                <rect x={c.x - aw / 2} y={c.y - ah / 2} width={aw} height={ah} className="fill-none stroke-amber pointer-events-none" strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
                {square({ x: c.x + aw / 2, y: c.y + ah / 2 }, "artScale", "fill-amber stroke-amber cursor-nwse-resize", (e) => {
                  e.stopPropagation();
                  capture(e);
                  setDrag({ k: "artScale", orig: artwork });
                })}
              </>
            )}
            {(movable || !clipped) && (
              <text x={c.x} y={c.y - ah / 2 - unit} textAnchor="middle" fontSize={unit * 1.2} className="fill-amber font-mono pointer-events-none">
                {fmt(aw)} × {fmt(ah)} cm · {Math.round(artwork.w * 100)}% da largura{size !== mother ? ` · auto de ${mother}` : ""}
              </text>
            )}
          </g>
        );
      })()}

      {/* Contorno sobre a estampa */}
      <path
        d={buildPath(nodes, W, H)}
        className="fill-none stroke-cyan pointer-events-none"
        strokeWidth={1.75}
        vectorEffect="non-scaling-stroke"
        style={partStyle.stroke ? { stroke: partStyle.stroke } : undefined}
      />
      {artwork && artwork.clipped !== false && !pcEdit && (
        <text x={-W / 2} y={-unit * 1.5} fontSize={unit * 1.2} className="fill-cyan font-mono pointer-events-none">
          POWERCLIP · {size === mother ? "MOLDE MÃE" : `AUTO DE ${mother}`}
        </text>
      )}

      {/* Cotas */}
      <g className="pointer-events-none">
        <line x1={-W / 2} x2={W / 2} y1={H + unit * 3} y2={H + unit * 3} className="stroke-amber" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <text x={0} y={H + unit * 6} textAnchor="middle" fontSize={unit * 1.5} className="fill-amber font-mono">
          LARGURA {fmt(W)} cm
        </text>
        <line x1={W / 2 + unit * 3} x2={W / 2 + unit * 3} y1={0} y2={H} className="stroke-amber" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <text x={W / 2 + unit * 5} y={H / 2} fontSize={unit * 1.5} className="fill-amber font-mono" transform={`rotate(90 ${W / 2 + unit * 5} ${H / 2})`} textAnchor="middle">
          ALTURA {fmt(H)} cm
        </text>
      </g>

      {/* Seleção: caixa + alça de escala */}
      {tool === "selecao" && (() => {
        const a = toSvg({ x: box.x0, y: box.y0 });
        const b = toSvg({ x: box.x1, y: box.y1 });
        return (
          <g>
            <rect x={a.x} y={a.y} width={b.x - a.x} height={b.y - a.y} className="fill-none stroke-cyan/60 pointer-events-none" strokeWidth={1} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
            {[a, { x: b.x, y: a.y }, { x: a.x, y: b.y }].map((p, i) => square(p, "c" + i, "fill-ink stroke-cyan/60"))}
            {square(b, "scale", "fill-cyan stroke-cyan cursor-nwse-resize", (e) => {
              e.stopPropagation();
              capture(e);
              setDrag({ k: "scale", start: toNorm(svgPoint(e)), orig: nodes, box: { x0: box.x0, y0: box.y0 } });
            })}
          </g>
        );
      })()}

      {/* Nós e alças */}
      {showNodes &&
        nodes.map((n, i) => {
          const p = toSvg(n);
          const handles = tool === "forma" ? ([["hIn", n.hIn], ["hOut", n.hOut]] as const) : [];
          return (
            <g key={i} style={{ opacity: draft ? 0.35 : 1 }}>
              {handles.map(([k, h]) => {
                if (!h) return null;
                const hp = toSvg({ x: n.x + h.x, y: n.y + h.y });
                return (
                  <g key={k}>
                    <line x1={p.x} y1={p.y} x2={hp.x} y2={hp.y} className="stroke-amber/70 pointer-events-none" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                    <circle
                      cx={hp.x}
                      cy={hp.y}
                      r={unit * 0.6}
                      className="fill-amber stroke-amber cursor-move"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        capture(e);
                        setDrag({ k, i });
                      }}
                    />
                  </g>
                );
              })}
              {square(
                p,
                "n",
                "stroke-cyan " + (nodesInteractive ? "cursor-move " : "") + (drag?.k === "node" && drag.i === i ? "fill-cyan" : n.smooth ? "fill-cyan/30" : "fill-ink"),
                nodesInteractive ? (e) => onNodeDown(e, i) : undefined,
              )}
            </g>
          );
        })}

      {/* Rascunho da caneta */}
      {draft && (
        <g className="pointer-events-none">
          <path d={buildPath(draft, W, H, false)} className="fill-none stroke-amber" strokeWidth={1.75} vectorEffect="non-scaling-stroke" />
          {hover && (() => {
            const l = toSvg(draft[draft.length - 1]!);
            return <line x1={l.x} y1={l.y} x2={hover.x} y2={hover.y} className="stroke-amber/40" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />;
          })()}
          {draft.map((n, i) => {
            const p = toSvg(n);
            return (
              <g key={i}>
                {n.hOut && n.hIn && (() => {
                  const o = toSvg({ x: n.x + n.hOut.x, y: n.y + n.hOut.y });
                  const m = toSvg({ x: n.x + n.hIn.x, y: n.y + n.hIn.y });
                  return <line x1={m.x} y1={m.y} x2={o.x} y2={o.y} className="stroke-amber/60" strokeWidth={1} vectorEffect="non-scaling-stroke" />;
                })()}
                {square(p, "d", i === 0 ? "fill-amber stroke-amber" : "fill-ink stroke-amber")}
              </g>
            );
          })}
        </g>
      )}

      {/* Fita métrica */}
      {tape.a && tapeEnd && (
        <g className="pointer-events-none">
          <line x1={tape.a.x} y1={tape.a.y} x2={tapeEnd.x} y2={tapeEnd.y} className="stroke-amber" strokeWidth={1.5} strokeDasharray={tape.b ? undefined : "4 3"} vectorEffect="non-scaling-stroke" />
          <circle cx={tape.a.x} cy={tape.a.y} r={unit * 0.5} className="fill-amber" />
          <circle cx={tapeEnd.x} cy={tapeEnd.y} r={unit * 0.5} className="fill-amber" />
          <rect
            x={(tape.a.x + tapeEnd.x) / 2 - unit * 5}
            y={(tape.a.y + tapeEnd.y) / 2 - unit * 3.2}
            width={unit * 10}
            height={unit * 2.4}
            rx={unit * 0.4}
            className="fill-panel2 stroke-amber/60"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          <text x={(tape.a.x + tapeEnd.x) / 2} y={(tape.a.y + tapeEnd.y) / 2 - unit * 1.5} textAnchor="middle" fontSize={unit * 1.4} className="fill-amber font-mono">
            {fmt(Math.hypot(tapeEnd.x - tape.a.x, tapeEnd.y - tape.a.y))} cm
          </text>
        </g>
      )}
    </svg>
  );
}

/* ================= Paleta de cores ================= */

const cmykToHex = (c: number, m: number, y: number, k: number) => {
  const ch = (v: number) =>
    Math.round(255 * (1 - v / 100) * (1 - k / 100))
      .toString(16)
      .padStart(2, "0");
  return ("#" + ch(c) + ch(m) + ch(y)).toUpperCase();
};

const RGB_PALETTE = [
  "#FFFFFF", "#E6E6E6", "#BFBFBF", "#808080", "#404040", "#000000",
  "#FF0000", "#FF5A00", "#FF9900", "#FFCC00", "#FFFF00", "#99FF00",
  "#00CC00", "#00FF99", "#00FFFF", "#0099FF", "#0033FF", "#6600FF",
  "#9900CC", "#FF00FF", "#FF3399", "#990033", "#663300", "#996633",
  "#003366", "#006666", "#336600", "#CC9966", "#FFCCCC", "#CCE5FF",
];

const CMYK_PALETTE: [number, number, number, number][] = [
  [0, 0, 0, 0], [0, 0, 0, 20], [0, 0, 0, 40], [0, 0, 0, 60], [0, 0, 0, 80], [0, 0, 0, 100],
  [0, 100, 100, 0], [0, 60, 100, 0], [0, 40, 100, 0], [0, 20, 100, 0], [0, 0, 100, 0], [40, 0, 100, 0],
  [100, 0, 100, 0], [100, 0, 60, 0], [100, 0, 0, 0], [100, 40, 0, 0], [100, 80, 0, 0], [100, 100, 0, 0],
  [60, 100, 0, 0], [0, 100, 0, 0], [0, 80, 20, 0], [0, 100, 60, 40], [0, 60, 100, 60], [100, 60, 0, 40],
  [100, 0, 40, 40], [60, 0, 100, 40], [0, 20, 40, 20], [0, 30, 10, 0], [20, 0, 0, 0], [0, 0, 20, 0],
];

type Swatch = { hex: string; label: string };

function PaletteDock({
  target,
  onTarget,
  onApply,
  current,
}: {
  target: ColorTarget;
  onTarget: (t: ColorTarget) => void;
  onApply: (t: ColorTarget, hex: string | null) => void;
  current: PartStyle;
}) {
  const [open, setOpen] = useState(true);
  const [mode, setMode] = useState<"rgb" | "cmyk">("cmyk");
  const [info, setInfo] = useState<Swatch | null>(null);
  const swatches: Swatch[] =
    mode === "rgb"
      ? RGB_PALETTE.map((hex) => ({ hex, label: hex }))
      : CMYK_PALETTE.map(([c, m, y, k]) => ({ hex: cmykToHex(c, m, y, k), label: `C:${c} M:${m} Y:${y} K:${k}` }));

  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Abrir paleta de cores"
        className="w-8 shrink-0 bg-panel border-l border-line flex flex-col items-center gap-2 pt-3 text-muted-foreground hover:text-cyan"
      >
        <Palette className="size-4" />
        <span className="[writing-mode:vertical-rl] text-[10px] font-mono uppercase tracking-[0.2em]">Paleta</span>
      </button>
    );

  return (
    <div className="w-44 shrink-0 bg-panel border-l border-line flex flex-col">
      <div className="h-12 shrink-0 border-b border-line flex items-center justify-between px-3">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-white">
          <Palette className="size-3.5 text-cyan" /> Paleta
        </span>
        <button onClick={() => setOpen(false)} aria-label="Recolher paleta" className="text-muted-foreground hover:text-cyan">
          <PanelRightClose className="size-3.5" />
        </button>
      </div>
      <div className="p-3 space-y-3 overflow-y-auto">
        <div className="grid grid-cols-2 bg-panel2 border border-line rounded-md p-0.5 text-[10px] font-mono">
          {(["rgb", "cmyk"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={"py-1 rounded " + (mode === m ? "bg-cyan text-ink font-semibold" : "text-muted-foreground")}
            >
              Paleta {m.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="space-y-1">
          {(
            [
              ["contorno", "Contorno"],
              ["preenchimento", "Preenchimento do Molde"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => onTarget(k)}
              className={
                "w-full flex items-center gap-2 px-2 py-1.5 rounded border text-[11px] text-left " +
                (target === k ? "border-cyan/50 bg-cyan/10 text-white" : "border-line text-muted-foreground hover:text-white")
              }
            >
              <span
                className={"size-4 shrink-0 rounded-sm border border-line " + (k === "contorno" ? "border-2" : "")}
                style={
                  k === "contorno"
                    ? { borderColor: current.stroke ?? "var(--color-cyan)" }
                    : { background: current.fill ?? "transparent" }
                }
              />
              <span className="leading-tight">{label}</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-5 gap-1" onMouseLeave={() => setInfo(null)}>
          <button
            onClick={() => onApply(target, null)}
            onContextMenu={(e) => {
              e.preventDefault();
              onApply("contorno", null);
            }}
            onMouseEnter={() => setInfo({ hex: "", label: "Sem cor" })}
            aria-label="Sem cor"
            className="aspect-square rounded-sm border border-line grid place-items-center text-destructive hover:ring-1 hover:ring-cyan"
          >
            <X className="size-3" />
          </button>
          {swatches.map((s) => (
            <button
              key={s.label}
              onClick={() => onApply(target, s.hex)}
              onContextMenu={(e) => {
                e.preventDefault();
                onApply("contorno", s.hex);
              }}
              onMouseEnter={() => setInfo(s)}
              aria-label={s.label}
              className="aspect-square rounded-sm border border-line hover:ring-1 hover:ring-cyan hover:scale-110 transition-transform"
              style={{ background: s.hex }}
            />
          ))}
        </div>

        <div className="rounded-md border border-line bg-panel2 p-2 min-h-[64px]">
          {info ? (
            <div className="flex items-start gap-2">
              <span className="size-8 shrink-0 rounded border border-line" style={{ background: info.hex || "transparent" }} />
              <div className="text-[10px] font-mono leading-snug min-w-0">
                <div className="text-white break-words">{info.label}</div>
                {mode === "cmyk" && info.hex && <div className="text-faint">{info.hex}</div>}
              </div>
            </div>
          ) : (
            <p className="text-[10px] font-mono text-faint leading-snug">
              Clique: aplica em {target === "contorno" ? "Contorno" : "Preenchimento"} · botão direito: Contorno
            </p>
          )}
        </div>
        {mode === "cmyk" && (
          <p className="text-[9px] font-mono text-faint leading-snug">Prévia de tela convertida de CMYK · confira a prova de impressão</p>
        )}
      </div>
    </div>
  );
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
