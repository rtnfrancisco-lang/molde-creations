import { useState } from "react";
import { AlertTriangle, Download, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dumpAll, setSafeMode, wipeAll } from "@/lib/storage-guard";

/** Tela mostrada quando a página principal quebra: oferece saídas que não dependem dos dados salvos. */
export function RecoveryScreen({ error }: { error: unknown }) {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      const data = await dumpAll();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `moldecore-dados-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } finally {
      setBusy(false);
    }
  };
  const safe = () => {
    setSafeMode(true);
    location.reload();
  };
  const wipe = async () => {
    if (!confirm("Apagar TODOS os dados salvos neste navegador e recomeçar? Isso não pode ser desfeito. Baixe uma cópia antes, se precisar.")) return;
    setBusy(true);
    await wipeAll();
    setSafeMode(false);
    location.reload();
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          <h1 className="text-lg font-semibold text-foreground">O MoldeCore encontrou um problema com os dados salvos</h1>
        </div>
        <p className="mb-5 text-sm text-muted-foreground">
          Seus dados continuam guardados neste navegador. Escolha uma opção abaixo para continuar.
        </p>
        <div className="flex flex-col gap-2">
          <Button onClick={() => void download()} disabled={busy} variant="outline" className="justify-start"><Download className="mr-2 h-4 w-4" />Baixar cópia dos dados</Button>
          <Button onClick={safe} disabled={busy} className="justify-start"><ShieldCheck className="mr-2 h-4 w-4" />Abrir sem os dados salvos (modo seguro)</Button>
          <Button onClick={() => location.reload()} disabled={busy} variant="ghost" className="justify-start"><RotateCcw className="mr-2 h-4 w-4" />Tentar novamente</Button>
          <Button onClick={() => void wipe()} disabled={busy} variant="destructive" className="justify-start"><Trash2 className="mr-2 h-4 w-4" />Apagar dados locais e recomeçar</Button>
        </div>
        {error instanceof Error && <p className="mt-4 break-words font-mono text-xs text-muted-foreground">{error.message}</p>}
      </div>
    </div>
  );
}
