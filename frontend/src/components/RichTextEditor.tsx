"use client";

import { useRef, useCallback, useEffect } from "react";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  maxLength?: number;
}

/**
 * A simple rich text editor with formatting toolbar.
 * Stores content as HTML string.
 */
export default function RichTextEditor({
  value,
  onChange,
  placeholder = "Type here...",
  maxLength = 5000,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalChange = useRef(false);

  // Sync external value changes to the editor
  useEffect(() => {
    if (editorRef.current && !isInternalChange.current) {
      if (editorRef.current.innerHTML !== value) {
        editorRef.current.innerHTML = value || "";
      }
    }
    isInternalChange.current = false;
  }, [value]);

  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    // Strip if exceeds max (based on text content length)
    const textLen = editorRef.current.textContent?.length ?? 0;
    if (textLen > maxLength) return;
    isInternalChange.current = true;
    onChange(html === "<br>" ? "" : html);
  }, [onChange, maxLength]);

  const execCommand = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    handleInput();
  }, [handleInput]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/html") || e.clipboardData.getData("text/plain");
    // Sanitize: only allow basic formatting tags
    const temp = document.createElement("div");
    temp.innerHTML = text;
    // Remove scripts, styles, etc.
    temp.querySelectorAll("script, style, iframe, object, embed").forEach((el) => el.remove());
    document.execCommand("insertHTML", false, temp.innerHTML);
    handleInput();
  }, [handleInput]);

  const textLength = editorRef.current?.textContent?.length ?? 0;

  return (
    <div className="rounded-lg border border-zinc-300 bg-white overflow-hidden focus-within:ring-2 focus-within:ring-zinc-900 focus-within:border-zinc-900 transition-all"
      style={{ background: "var(--cream, #fff)", borderColor: "var(--rule, #d4d4d8)" }}
    >
      {/* Toolbar */}
      <div
        className="flex items-center gap-0.5 px-2 py-1.5 border-b"
        style={{ borderColor: "var(--rule, #e4e4e7)", background: "var(--paper, #f4f4f5)" }}
      >
        <ToolbarButton
          onClick={() => execCommand("bold")}
          title="Bold"
          icon={<span className="font-bold text-[13px]">B</span>}
        />
        <ToolbarButton
          onClick={() => execCommand("italic")}
          title="Italic"
          icon={<span className="italic text-[13px]">I</span>}
        />
        <ToolbarButton
          onClick={() => execCommand("underline")}
          title="Underline"
          icon={<span className="underline text-[13px]">U</span>}
        />
        <div className="w-px h-4 mx-1" style={{ background: "var(--rule, #d4d4d8)" }} />
        <ToolbarButton
          onClick={() => execCommand("formatBlock", "h3")}
          title="Heading"
          icon={<span className="font-bold text-[11px]">H</span>}
        />
        <ToolbarButton
          onClick={() => execCommand("insertUnorderedList")}
          title="Bullet List"
          icon={
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
            </svg>
          }
        />
        <ToolbarButton
          onClick={() => execCommand("insertOrderedList")}
          title="Numbered List"
          icon={
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 6h13M8 12h13M8 18h13M3.5 6v-1h1v3m-1 0h2M3 11.5h1.5l-1.5 2h2M3 17v1h1.5a.5.5 0 000-1H3.5a.5.5 0 010-1H5" />
            </svg>
          }
        />
        <div className="w-px h-4 mx-1" style={{ background: "var(--rule, #d4d4d8)" }} />
        <ToolbarButton
          onClick={() => execCommand("hiliteColor", "#fef08a")}
          title="Highlight"
          icon={
            <span className="text-[12px] px-0.5 rounded" style={{ background: "#fef08a", color: "#000" }}>A</span>
          }
        />
        <ToolbarButton
          onClick={() => execCommand("foreColor", "#dc2626")}
          title="Red Text"
          icon={<span className="text-[13px] font-medium" style={{ color: "#dc2626" }}>A</span>}
        />
        <ToolbarButton
          onClick={() => execCommand("foreColor", "#2563eb")}
          title="Blue Text"
          icon={<span className="text-[13px] font-medium" style={{ color: "#2563eb" }}>A</span>}
        />
        <div className="w-px h-4 mx-1" style={{ background: "var(--rule, #d4d4d8)" }} />
        <ToolbarButton
          onClick={() => execCommand("removeFormat")}
          title="Clear Formatting"
          icon={
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          }
        />
      </div>

      {/* Editor area */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onPaste={handlePaste}
        data-placeholder={placeholder}
        className="rich-editor-content px-4 py-3 min-h-[120px] max-h-[300px] overflow-y-auto text-[14px] leading-relaxed outline-none"
        style={{ color: "var(--ink, #18181b)" }}
      />

      {/* Character count */}
      <div className="px-4 py-1.5 text-right border-t" style={{ borderColor: "var(--rule, #e4e4e7)" }}>
        <span className="text-[11px]" style={{ color: "var(--stone, #71717a)" }}>
          {editorRef.current?.textContent?.length ?? 0}/{maxLength}
        </span>
      </div>
    </div>
  );
}

function ToolbarButton({
  onClick,
  title,
  icon,
}: {
  onClick: () => void;
  title: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="w-7 h-7 flex items-center justify-center rounded hover:bg-zinc-200 transition-colors"
      style={{ color: "var(--ink, #18181b)" }}
    >
      {icon}
    </button>
  );
}
