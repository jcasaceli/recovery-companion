import React, { useEffect, useRef } from 'react';
import { colors } from '../theme';

/**
 * Word-style rich-text editor for the web CRM. Built on a contentEditable
 * surface + document.execCommand so it needs no dependency. Supports font size,
 * bold/italic/underline, alignment, bullet & numbered lists, and pasting
 * formatted text from Word/Google Docs (the browser keeps the formatting).
 *
 * A separate RichTextEditor.tsx provides a plain-text fallback on native.
 */
export function RichTextEditor({
  valueHtml,
  onChangeHtml,
  placeholder,
}: {
  valueHtml: string;
  onChangeHtml: (html: string) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Seed the editor once; afterwards the DOM is the source of truth so the
  // caret doesn't jump while typing.
  useEffect(() => {
    if (ref.current && valueHtml && ref.current.innerHTML !== valueHtml) {
      ref.current.innerHTML = valueHtml;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exec = (cmd: string, value?: string) => {
    try { (document as any).execCommand(cmd, false, value); } catch {}
    ref.current?.focus();
    if (ref.current) onChangeHtml(ref.current.innerHTML);
  };

  // Keep the selection when a toolbar button is pressed.
  const hold = (e: any) => e.preventDefault();

  const Btn = ({ label, onPress, title, bold }: { label: string; onPress: () => void; title: string; bold?: boolean }) => (
    <button type="button" title={title} onMouseDown={hold} onClick={onPress} style={{ ...btn, fontWeight: bold ? 800 : 600 }}>{label}</button>
  );

  return (
    <div style={wrap}>
      <div style={toolbar}>
        <select
          title="Text size"
          onMouseDown={hold}
          onChange={(e) => { exec('fontSize', e.target.value); e.target.selectedIndex = 0; }}
          style={select}
        >
          <option value="">Size</option>
          <option value="2">Small</option>
          <option value="3">Normal</option>
          <option value="5">Large</option>
          <option value="7">Huge</option>
        </select>
        <Btn label="B" title="Bold" bold onPress={() => exec('bold')} />
        <Btn label="I" title="Italic" onPress={() => exec('italic')} />
        <Btn label="U" title="Underline" onPress={() => exec('underline')} />
        <span style={divider} />
        <Btn label="⯇" title="Align left" onPress={() => exec('justifyLeft')} />
        <Btn label="≡" title="Align center" onPress={() => exec('justifyCenter')} />
        <Btn label="⯈" title="Align right" onPress={() => exec('justifyRight')} />
        <span style={divider} />
        <Btn label="• List" title="Bulleted list" onPress={() => exec('insertUnorderedList')} />
        <Btn label="1. List" title="Numbered list" onPress={() => exec('insertOrderedList')} />
        <span style={divider} />
        <Btn label="⟲" title="Undo" onPress={() => exec('undo')} />
        <Btn label="⟳" title="Redo" onPress={() => exec('redo')} />
        <Btn label="Clear" title="Clear formatting" onPress={() => exec('removeFormat')} />
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder || 'Type or paste your agreement here…'}
        onInput={(e) => onChangeHtml((e.target as HTMLDivElement).innerHTML)}
        style={editor}
      />
    </div>
  );
}

const wrap: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff' };
const toolbar: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', padding: 8, backgroundColor: colors.surfaceAlt, borderBottom: `1px solid ${colors.border}` };
const btn: React.CSSProperties = { minWidth: 30, height: 30, padding: '0 8px', borderRadius: 6, border: `1px solid ${colors.border}`, background: '#fff', color: colors.textPrimary, cursor: 'pointer', fontSize: 14 };
const select: React.CSSProperties = { height: 30, borderRadius: 6, border: `1px solid ${colors.border}`, background: '#fff', color: colors.textPrimary, padding: '0 6px', cursor: 'pointer' };
const divider: React.CSSProperties = { width: 1, height: 22, background: colors.border, margin: '0 4px' };
const editor: React.CSSProperties = { minHeight: 220, maxHeight: 420, overflowY: 'auto', padding: 14, fontSize: 15, lineHeight: 1.6, color: colors.textPrimary, outline: 'none' };
