import { useEffect, useRef } from "react";

type TextAlign = "left" | "center" | "right";

export type DirectTextEditorStyle = {
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: TextAlign;
  color: string;
};

type DirectTextEditorProps = {
  value: string;
  x: number;
  y: number;
  width?: number;
  minHeight?: number;
  scale?: number;
  embedded?: boolean;
  style: DirectTextEditorStyle;
  autoFocus?: boolean;
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
  onCancel?: () => void;
};

const alignmentTransform: Record<TextAlign, string> = {
  left: "translateX(0)",
  center: "translateX(-50%)",
  right: "translateX(-100%)",
};

function placeCaretAtEnd(element: HTMLDivElement) {
  element.focus();
  const selection = window.getSelection();
  if (!selection) return;

  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function DirectTextEditor({
  value,
  x,
  y,
  width = 420,
  minHeight = 32,
  scale = 1,
  embedded = false,
  style,
  autoFocus = true,
  onChange,
  onCommit,
  onCancel,
}: DirectTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const committedRef = useRef(false);
  const initializedRef = useRef(false);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || initializedRef.current) return;

    initializedRef.current = true;
    editor.innerText = value;

    if (!autoFocus) return;
    // Foca depois do clique que criou o editor: o mousedown padrão do navegador
    // tiraria o foco na mesma hora e o texto vazio seria descartado.
    requestAnimationFrame(() => {
      if (editor.isConnected) placeCaretAtEnd(editor);
    });
  }, [autoFocus, value]);

  // innerText preserva as quebras de linha (Shift+Enter); textContent as descarta.
  const readValue = (editor: HTMLDivElement) => editor.innerText.replace(/\n$/, "");

  const commit = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    const nextValue = editorRef.current ? readValue(editorRef.current) : value;
    onCommit(nextValue);
  };

  const cancel = () => {
    committedRef.current = true;
    onCancel?.();
  };

  const handleInput = (event: React.FormEvent<HTMLDivElement>) => {
    onChange(readValue(event.currentTarget));
  };

  return (
    <div
      className={embedded ? "pointer-events-auto relative" : "pointer-events-auto absolute z-20"}
      style={{
        left: x,
        top: y,
        width,
        minHeight,
        transform: `${alignmentTransform[style.align]} scale(${scale})`,
        transformOrigin: "top left",
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label="Texto no canvas"
        spellCheck={false}
        className="min-h-8 w-full select-text whitespace-pre-wrap break-words border-0 bg-transparent p-0 outline-none caret-cyan selection:bg-cyan/20"
        style={{
          color: style.color,
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          fontWeight: style.bold ? 700 : 400,
          fontStyle: style.italic ? "italic" : "normal",
          textDecoration: style.underline ? "underline" : "none",
          textAlign: style.align,
          lineHeight: 1.15,
        }}
        onInput={handleInput}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            cancel();
          }
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            commit();
            event.currentTarget.blur();
          }
        }}
      />
    </div>
  );
}
