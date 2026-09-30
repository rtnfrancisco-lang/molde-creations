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

export function DirectTextEditor({
  value,
  x,
  y,
  width = 420,
  minHeight = 32,
  scale = 1,
  style,
  autoFocus = true,
  onChange,
  onCommit,
  onCancel,
}: DirectTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const committedRef = useRef(false);

  useEffect(() => {
    if (!autoFocus || !editorRef.current) return;
    editorRef.current.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editorRef.current);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [autoFocus]);

  const commit = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    const nextValue = editorRef.current?.textContent ?? value;
    onCommit(nextValue);
  };

  const cancel = () => {
    committedRef.current = true;
    onCancel?.();
  };

  return (
    <div
      className="pointer-events-auto absolute z-20"
      style={{
        left: x,
        top: y,
        width,
        minHeight,
        transform: alignmentTransform[style.align],
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
        className="min-h-8 w-full whitespace-pre-wrap break-words border-0 bg-transparent p-0 outline-none caret-cyan selection:bg-cyan/20"
        style={{
          color: style.color,
          fontFamily: style.fontFamily,
          fontSize: style.fontSize * scale,
          fontWeight: style.bold ? 700 : 400,
          fontStyle: style.italic ? "italic" : "normal",
          textDecoration: style.underline ? "underline" : "none",
          textAlign: style.align,
          lineHeight: 1.15,
        }}
        onInput={(event) => onChange(event.currentTarget.textContent ?? "")}
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
      >
        {value}
      </div>
    </div>
  );
}
