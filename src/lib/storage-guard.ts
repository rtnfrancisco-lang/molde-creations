/* Proteção do armazenamento local: modo seguro, aba editora única e acesso controlado. */
import * as idb from "./idb";

export const SAFE_KEY = "moldecore.seguro";
const HB_KEY = "moldecore.abaEditora";
const LOCK = "moldecore-editor";

export type TabState = "pending" | "editor" | "secondary";
let tab: TabState = "pending";
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());
export const subscribeGuard = (f: () => void) => {
  listeners.add(f);
  return () => void listeners.delete(f);
};

export const isSafeMode = () => {
  try {
    return sessionStorage.getItem(SAFE_KEY) === "1";
  } catch {
    return false;
  }
};
export const setSafeMode = (on: boolean) => {
  try {
    if (on) sessionStorage.setItem(SAFE_KEY, "1");
    else sessionStorage.removeItem(SAFE_KEY);
  } catch {
    /* sem sessionStorage */
  }
};
export const tabState = () => tab;
/** Leitura bloqueada só no modo seguro; gravação também na aba secundária. */
export const canRead = () => !isSafeMode();
export const canWrite = () => !isSafeMode() && tab === "editor";

export const lsGet = (k: string): string | null => {
  if (!canRead()) return null;
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
export const lsSet = (k: string, v: string): boolean => {
  if (!canWrite()) return true;
  try {
    localStorage.setItem(k, v);
    return true;
  } catch {
    return false;
  }
};

let claimP: Promise<TabState> | null = null;
/** Tenta tornar esta aba a editora. Resolve com o estado final. */
export function claimEditor(): Promise<TabState> {
  if (claimP) return claimP;
  claimP = new Promise<TabState>((resolve) => {
    const done = (s: TabState) => {
      tab = s;
      emit();
      resolve(s);
    };
    const locks = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
    if (locks?.request) {
      locks
        .request(LOCK, { ifAvailable: true }, (lock) => {
          if (!lock) {
            done("secondary");
            return undefined;
          }
          done("editor");
          return new Promise<void>(() => {}); // segura o bloqueio enquanto a aba existir
        })
        .catch(() => done("editor"));
      return;
    }
    // Sem Web Locks: heartbeat no localStorage.
    const id = Math.random().toString(36).slice(2);
    try {
      const raw = localStorage.getItem(HB_KEY);
      const o = raw ? (JSON.parse(raw) as { id?: string; t?: number }) : null;
      if (o && o.id !== id && typeof o.t === "number" && Date.now() - o.t < 5000) return done("secondary");
      const beat = () => localStorage.setItem(HB_KEY, JSON.stringify({ id, t: Date.now() }));
      beat();
      setInterval(beat, 2000);
      addEventListener("beforeunload", () => localStorage.removeItem(HB_KEY));
    } catch {
      /* sem localStorage */
    }
    done("editor");
  });
  return claimP;
}

/** Cópia de tudo (IndexedDB + localStorage "moldecore.*"). */
export async function dumpAll(): Promise<Record<string, unknown>> {
  const out: { indexedDB: Record<string, unknown>; localStorage: Record<string, string> } = { indexedDB: {}, localStorage: {} };
  try {
    for (const k of await idb.keys()) out.indexedDB[String(k)] = await idb.get(String(k));
  } catch {
    /* sem IndexedDB */
  }
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("moldecore.")) out.localStorage[k] = localStorage.getItem(k) ?? "";
    }
  } catch {
    /* sem localStorage */
  }
  return { app: "moldecore-backup", savedAt: new Date().toISOString(), ...out };
}

export async function wipeAll() {
  try {
    await idb.clear();
  } catch {
    /* sem IndexedDB */
  }
  try {
    const ks: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("moldecore.")) ks.push(k);
    }
    ks.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* sem localStorage */
  }
}
