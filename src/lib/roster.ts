/* Lista do Time — funções puras (sem React, sem DOM). */

export const ROSTER_SIZES = ["PP", "P", "M", "G", "GG", "XG", "XG2"] as const;
export type RosterSize = (typeof ROSTER_SIZES)[number];
export type RosterSizeOption = { id: RosterSize; label: string };
export type Player = { id: string; numero: string; nome: string; tamanho: RosterSize };

export const newPlayerId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const norm = (s: string) => s.normalize("NFC").trim().replace(/\s+/g, "").toUpperCase();

/** Converte rótulo (M, BL M, 6ANOS) ou id (PP..XG2) em id. */
export function matchSize(token: string, options: readonly RosterSizeOption[]): { id: RosterSize; inGarment: boolean } | null {
  const t = norm(token);
  if (!t) return null;
  const byLabel = options.find((o) => norm(o.label) === t);
  if (byLabel) return { id: byLabel.id, inGarment: true };
  const byId = options.find((o) => o.id === t);
  if (byId) return { id: byId.id, inGarment: true };
  const any = ROSTER_SIZES.find((s) => s === t);
  return any ? { id: any, inGarment: false } : null;
}

/** Tamanho disponível mais próximo na ordem da grade. */
export function nearestSize(size: RosterSize, options: readonly RosterSizeOption[]): RosterSizeOption | null {
  if (!options.length) return null;
  const i = ROSTER_SIZES.indexOf(size);
  let best = options[0]!;
  let bd = Infinity;
  for (const o of options) {
    const d = Math.abs(ROSTER_SIZES.indexOf(o.id) - i);
    if (d < bd) {
      bd = d;
      best = o;
    }
  }
  return best;
}

export function detectSeparator(text: string): string {
  const line = text.split(/\r?\n/).find((l) => l.trim()) ?? "";
  if (line.includes("\t")) return "\t";
  if (line.includes(";")) return ";";
  return ",";
}

/** Divide uma linha respeitando aspas ("a;b"). */
export function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"' && !cur.trim()) {
      q = true;
      cur = "";
    } else if (c === sep) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const isHeader = (cols: string[]) => {
  const a = (cols[0] ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const c = (cols[2] ?? "").toLowerCase().trim();
  return /^(numero|n[ºo°.]?|#|num)$/.test(a) || c === "tamanho";
};

export type PasteRow =
  | { ok: true; line: number; numero: string; nome: string; tamanho: RosterSize; warn?: string }
  | { ok: false; line: number; raw: string; reason: string };

export function parseRoster(text: string, options: readonly RosterSizeOption[], garment = "peça atual"): PasteRow[] {
  const clean = text.replace(/^\uFEFF/, "");
  const sep = detectSeparator(clean);
  const lines = clean.split(/\r?\n/);
  const rows: PasteRow[] = [];
  let first = true;
  lines.forEach((raw, idx): void => {
    if (!raw.trim()) return;
    const cols = splitLine(raw, sep);
    if (first) {
      first = false;
      if (isHeader(cols)) return;
    }
    const line = idx + 1;
    const [numero = "", nome = "", tam = ""] = cols;
    if (!numero) { rows.push({ ok: false, line, raw, reason: "Sem número" }); return; }
    if (!tam) { rows.push({ ok: false, line, raw, reason: "Sem tamanho" }); return; }
    const m = matchSize(tam, options);
    if (!m) { rows.push({ ok: false, line, raw, reason: `Tamanho "${tam}" desconhecido` }); return; }
    rows.push({ ok: true, line, numero, nome, tamanho: m.id, ...(m.inGarment ? {} : { warn: `${m.id} não existe em ${garment}` }) });
  });
  return rows;
}

const csvCell = (s: string) => (/[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function rosterToCsv(players: Player[], label: (s: RosterSize) => string): string {
  const lines = ["Numero;Nome;Tamanho", ...players.map((p) => [p.numero, p.nome, label(p.tamanho)].map(csvCell).join(";"))];
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

const numKey = (n: string) => (/^\d+$/.test(n.trim()) ? Number(n) : NaN);
export function sortByNumber(players: Player[]): Player[] {
  return [...players].sort((a, b) => {
    const x = numKey(a.numero);
    const y = numKey(b.numero);
    if (!isNaN(x) && !isNaN(y)) return x - y || a.numero.length - b.numero.length;
    if (!isNaN(x)) return -1;
    if (!isNaN(y)) return 1;
    return a.numero.localeCompare(b.numero, "pt-BR");
  });
}

export type RowIssue = { semNumero?: boolean; repetido?: boolean; tamanhoInvalido?: boolean; sugestao?: RosterSizeOption | null };
export function rosterIssues(players: Player[], options: readonly RosterSizeOption[]): Record<string, RowIssue> {
  const count = new Map<string, number>();
  players.forEach((p) => {
    const k = p.numero.trim();
    if (k) count.set(k, (count.get(k) ?? 0) + 1);
  });
  const out: Record<string, RowIssue> = {};
  for (const p of players) {
    const k = p.numero.trim();
    const inv = !options.some((o) => o.id === p.tamanho);
    const r: RowIssue = {};
    if (!k) r.semNumero = true;
    if (k && (count.get(k) ?? 0) > 1) r.repetido = true;
    if (inv) {
      r.tamanhoInvalido = true;
      r.sugestao = nearestSize(p.tamanho, options);
    }
    if (Object.keys(r).length) out[p.id] = r;
  }
  return out;
}

/** Contagem por tamanho na ordem da grade (inclui tamanhos fora da peça no fim). */
export function sizeSummary(players: Player[]): { size: RosterSize; n: number }[] {
  return ROSTER_SIZES.map((size) => ({ size, n: players.filter((p) => p.tamanho === size).length })).filter((x) => x.n > 0);
}

export function sanitizeRoster(v: unknown): Player[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .filter((p) => (ROSTER_SIZES as readonly string[]).includes(String(p["tamanho"])))
    .map((p) => ({
      id: typeof p["id"] === "string" && p["id"] ? (p["id"] as string) : newPlayerId(),
      numero: String(p["numero"] ?? ""),
      nome: String(p["nome"] ?? ""),
      tamanho: p["tamanho"] as RosterSize,
    }));
}
