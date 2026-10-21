<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Imported files live as per-view layers (src/lib/importers.ts): SVG parsed to editable nodes, PDF rasterized page 1 via pdfjs-dist — keeps canvas one SVG coordinate system.
- MoldeCore uses semantic light-workspace tokens, including canvas and garment surfaces, in src/styles.css; this keeps vector tools and panels visually consistent without changing saved artwork colors.
- Render technical outlines and plotter bounds from the same vector-offset generator used for export, so node bisectors and centimeter distances cannot diverge between screen and output.
- Team roster logic lives as pure functions in src/lib/roster.ts (tested in roster.test.ts); UI in src/components/TeamPanel.tsx — keeps parsing/validation testable apart from the 4k-line page.
- Team-field text substitution/fitting lives in src/lib/team-text.ts (pure, tested); preview and future team export must both call resolveTeamText so screen and output match.
- Large drawing data (layers, artworks, texts, shapes, styles, roster) persists in IndexedDB via src/lib/idb.ts through saveLS, gated until initial async load; small prefs stay in localStorage — localStorage's ~5 MB quota silently dropped big print PNGs.
- Team player image library (name/number PNG/JPEG) matching and unlinking are pure functions in src/lib/team-images.ts (tested); players reference images by id so one image can serve many rows.
- Guide-line distances (bleed/safety) are per-view state computed via guidePaths in src/lib/guides.ts (tested); canvas, PowerClip frame and all exports must call it so screen and output match.
- Per-garment views, labels, measurement fields and default shapes come from GARMENT_CONFIG in src/routes/index.tsx; per-view data keeps the four view ids so new garment families only hide views instead of migrating data.
- Project data from files or storage passes through pure sanitizers in src/lib/sanitize.ts (tested) before any state is set or saved; broken input must never crash the screen or repeat on reload.
- All string-built SVG goes through src/lib/svg-safe.ts (n/nf for numbers, attr, safeSrc, color, fixed enum lists); the vector print window shows the SVG only as a data-URL <img> under a no-script CSP, so project files cannot run code.
- Storage access goes through src/lib/storage-guard.ts (lsGet/lsSet, canRead/canWrite): safe mode (sessionStorage flag) blocks reads and writes, a non-editor tab (Web Locks, localStorage heartbeat fallback) blocks writes; big keys flush together via idb.setMany in one transaction.
- Desktop (Tauri) static build lives in desktop/ + vite.desktop.config.ts (output dist-tauri), rendering the named Index export without the router; keeps the published TanStack/Cloudflare build untouched.
