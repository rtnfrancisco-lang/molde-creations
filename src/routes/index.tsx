import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronDown, Plus, Shirt, Wand2, Ruler, Layers } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MoldeCore — Motor de Moldes" },
      {
        name: "description",
        content:
          "MoldeCore é um sistema de automação de moldes de roupa para sublimação. Crie, dimensione e gere moldes base.",
      },
      { property: "og:title", content: "MoldeCore — Motor de Moldes" },
      {
        property: "og:description",
        content:
          "Automação de moldes de roupa para sublimação — crie e gere moldes base.",
      },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "pt_BR" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Measurements = {
  totalHeight: string;
  chestWidth: string;
  sleeveLength: string;
  shoulderWidth: string;
};

type ClothingType = "Camiseta" | "Moletom" | "Regata" | "Manga Longa";

const LIBRARY: { name: string; size: string; active?: boolean }[] = [
  { name: "Camiseta Clássica — Sublimação", size: "M", active: true },
  { name: "Moletom Oversized", size: "L" },
  { name: "Regata Nadador", size: "S" },
  { name: "Gola Careca — Manga Longa", size: "GG" },
];

function Index() {
  const [clothingType, setClothingType] = useState<ClothingType>("Camiseta");
  const [measurements, setMeasurements] = useState<Measurements>({
    totalHeight: "78.0",
    chestWidth: "52.0",
    sleeveLength: "22.5",
    shoulderWidth: "44.0",
  });
  const [blueprint, setBlueprint] = useState<Measurements | null>(null);

  const handleGenerate = () => {
    setBlueprint({ ...measurements });
  };

  return (
    <div className="min-h-screen w-full bg-ink text-foreground font-display antialiased flex">
      {/* ============ SIDEBAR ESQUERDA ============ */}
      <aside className="w-72 shrink-0 bg-panel border-r border-line flex flex-col">
        {/* Marca */}
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

        {/* Seletor de tipo de peça */}
        <div className="px-5 py-5 border-b border-line">
          <label className="block text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-2">
            Tipo de Peça
          </label>
          <div className="relative">
            <select
              value={clothingType}
              onChange={(e) => setClothingType(e.target.value as ClothingType)}
              className="w-full appearance-none bg-panel2 border border-line rounded-md pl-3 pr-9 py-2.5 text-sm text-white font-medium focus:outline-none focus:border-cyan/60 focus:ring-1 focus:ring-cyan/30 cursor-pointer"
            >
              <option>Camiseta</option>
              <option>Moletom</option>
              <option>Regata</option>
              <option>Manga Longa</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-cyan size-4" />
          </div>
        </div>

        {/* Criar novo molde */}
        <div className="px-5 py-5">
          <button className="w-full flex items-center justify-center gap-2 bg-cyan text-ink font-semibold text-sm rounded-md py-3 hover:bg-cyan/90 transition-colors">
            <Plus className="size-4" strokeWidth={2.5} />
            Criar Novo Molde
          </button>
        </div>

        {/* Biblioteca */}
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
              <span
                className={
                  "size-1.5 rounded-full " +
                  (item.active ? "bg-cyan" : "bg-faint")
                }
              />
              <span className="flex-1">{item.name}</span>
              <span
                className={
                  "text-[10px] font-mono " +
                  (item.active ? "text-cyan" : "text-faint")
                }
              >
                {item.size}
              </span>
            </a>
          ))}
        </nav>

        {/* Rodapé do usuário */}
        <div className="mt-auto px-5 py-4 border-t border-line">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-full bg-panel2 border border-line grid place-items-center text-xs font-semibold text-cyan">
              AV
            </div>
            <div className="min-w-0">
              <div className="text-sm text-white truncate">Aria Vance</div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-faint">
                Modelista
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* ============ CONTEÚDO PRINCIPAL ============ */}
      <main className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 shrink-0 border-b border-line bg-panel/60 flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-faint">
              Área de Trabalho
            </span>
            <span className="text-faint">/</span>
            <span className="text-sm font-medium text-white">
              {clothingType} — Sublimação
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 bg-panel2 border border-line rounded-md px-3 py-1.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-faint">
                Tamanho
              </span>
              <span className="text-sm font-semibold text-cyan">M</span>
            </div>
            <div className="flex items-center gap-2 bg-panel2 border border-line rounded-md px-3 py-1.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-faint">
                Escala
              </span>
              <span className="text-sm font-mono text-white">1:1</span>
            </div>
            <span className="hidden md:inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              <span className="size-1.5 rounded-full bg-amber" /> Rascunho
            </span>
          </div>
        </header>

        <div className="flex-1 min-h-0 flex">
          {/* Área do canvas */}
          <section className="flex-1 min-w-0 relative blueprint-grid blueprint-grid-fine overflow-hidden">
            <div className="absolute top-4 left-4 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.15em] text-faint">
              <span className="size-1.5 rounded-full bg-cyan" /> Molde · grade de
              28px
            </div>
            <div className="absolute bottom-4 left-4 text-[10px] font-mono text-faint">
              X 0.00 · Y 0.00 · 100%
            </div>

            {blueprint ? (
              <div className="absolute inset-0 grid place-items-center p-8">
                <div className="relative w-full max-w-[420px] aspect-[3/4]">
                  <div className="absolute inset-0 rounded-xl border border-cyan/30 bg-cyan/[0.02]" />
                  {/* marcas de canto */}
                  <div className="absolute -top-1.5 -left-1.5 size-3 border-t-2 border-l-2 border-cyan" />
                  <div className="absolute -top-1.5 -right-1.5 size-3 border-t-2 border-r-2 border-cyan" />
                  <div className="absolute -bottom-1.5 -left-1.5 size-3 border-b-2 border-l-2 border-cyan" />
                  <div className="absolute -bottom-1.5 -right-1.5 size-3 border-b-2 border-r-2 border-cyan" />

                  {/* silhueta da peça */}
                  <div className="absolute inset-0 grid place-items-center">
                    <div className="relative w-[70%] h-[82%]">
                      <div className="absolute left-1/2 top-0 -translate-x-1/2 w-[46%] h-[9%] rounded-t-[40%] border border-cyan/50" />
                      <div className="absolute left-1/2 top-[7%] -translate-x-1/2 w-[88%] h-[86%] border border-cyan/50 rounded-b-[18%]" />
                      <div className="absolute left-0 top-[9%] w-[16%] h-[26%] border border-cyan/50 rounded-l-[40%]" />
                      <div className="absolute right-0 top-[9%] w-[16%] h-[26%] border border-cyan/50 rounded-r-[40%]" />
                      <div className="absolute left-1/2 top-[9%] -translate-x-1/2 w-[30%] h-[14%] border-b border-dashed border-amber/70" />
                      <div className="absolute left-1/2 top-[9%] -translate-x-1/2 w-[30%] h-[14%] grid place-items-center">
                        <span className="text-[9px] font-mono text-amber">
                          GOLA
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* cotas de medida */}
                  <div className="absolute -left-8 top-1/2 -translate-y-1/2 -rotate-90 origin-center text-[10px] font-mono text-cyan/80 whitespace-nowrap">
                    ALTURA {blueprint.totalHeight} cm
                  </div>
                  <div className="absolute -right-8 top-1/2 -translate-y-1/2 rotate-90 origin-center text-[10px] font-mono text-cyan/80 whitespace-nowrap">
                    OMBRO {blueprint.shoulderWidth} cm
                  </div>
                  <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-[10px] font-mono text-cyan/80">
                    TÓRAX {blueprint.chestWidth}
                  </div>
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 grid place-items-center">
                <div className="text-center">
                  <div className="mx-auto mb-4 size-12 rounded-xl bg-panel/60 border border-line grid place-items-center">
                    <Layers className="size-5 text-faint" />
                  </div>
                  <div className="text-sm font-medium text-white">
                    Área de trabalho pronta
                  </div>
                  <div className="mt-1 text-[11px] font-mono text-faint">
                    Gere um molde base para começar
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* ============ PAINEL DIREITO ============ */}
          <aside className="w-80 shrink-0 bg-panel border-l border-line flex flex-col">
            <div className="px-5 py-4 border-b border-line">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Ruler className="size-3.5 text-cyan" />
                  Dimensões do Molde Base
                </h2>
                <span className="text-[10px] font-mono uppercase tracking-wider text-cyan bg-cyan/10 border border-cyan/25 rounded px-1.5 py-0.5">
                  Tamanho M
                </span>
              </div>
              <p className="text-[11px] text-faint mt-1 font-mono">
                Medidas principais · cm
              </p>
            </div>

            <div className="px-5 py-5 space-y-4 overflow-y-auto">
              <DimensionInput
                label="Altura Total"
                value={measurements.totalHeight}
                onChange={(v) =>
                  setMeasurements((m) => ({ ...m, totalHeight: v }))
                }
              />
              <DimensionInput
                label="Tórax / Largura"
                value={measurements.chestWidth}
                onChange={(v) =>
                  setMeasurements((m) => ({ ...m, chestWidth: v }))
                }
              />
              <DimensionInput
                label="Comprimento da Manga"
                value={measurements.sleeveLength}
                onChange={(v) =>
                  setMeasurements((m) => ({ ...m, sleeveLength: v }))
                }
              />
              <DimensionInput
                label="Largura do Ombro"
                value={measurements.shoulderWidth}
                onChange={(v) =>
                  setMeasurements((m) => ({ ...m, shoulderWidth: v }))
                }
              />

              <div className="pt-2 border-t border-line">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-faint">Sangria de sublimação</span>
                  <span className="text-cyan">+ 0,5 cm</span>
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono mt-2">
                  <span className="text-faint">Margem de costura</span>
                  <span className="text-cyan">+ 1,0 cm</span>
                </div>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-line mt-auto">
              <button
                onClick={handleGenerate}
                className="w-full flex items-center justify-center gap-2 bg-cyan text-ink font-semibold text-sm rounded-md py-3 hover:bg-cyan/90 transition-colors"
              >
                <Wand2 className="size-4" strokeWidth={2.5} />
                Gerar Molde Base
              </button>
              <p className="text-[10px] font-mono text-faint text-center mt-2.5">
                {blueprint
                  ? "Molde salvo · tela atualizada"
                  : "Salvo no estado reativo · pronto para a tela"}
              </p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function DimensionInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
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
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-panel2 border border-line rounded-md pl-3 pr-12 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-cyan/60 focus:ring-1 focus:ring-cyan/30"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-mono text-faint">
          cm
        </span>
      </div>
    </div>
  );
}
