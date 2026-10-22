/* Desktop: imprime a página segura (SVG como <img>, CSP, sem script) num iframe oculto. */
export function printInIframe(html: string): Promise<boolean> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const f = document.createElement("iframe");
    f.setAttribute("aria-hidden", "true");
    f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      resolve(ok);
      setTimeout(() => {
        f.remove();
        URL.revokeObjectURL(url);
      }, 60_000);
    };
    f.onload = () => {
      try {
        const doc = f.contentDocument;
        const img = doc?.querySelector("img");
        const go = () => {
          try {
            f.contentWindow!.focus();
            f.contentWindow!.print();
            finish(true);
          } catch {
            finish(false);
          }
        };
        if (!img || img.complete) setTimeout(go, 300);
        else {
          img.addEventListener("load", () => setTimeout(go, 300));
          img.addEventListener("error", () => finish(false));
        }
      } catch {
        finish(false);
      }
    };
    setTimeout(() => finish(false), 30_000);
    f.src = url;
    document.body.appendChild(f);
  });
}
