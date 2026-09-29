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
