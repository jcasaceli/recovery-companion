import React, { useEffect, useRef } from 'react';
import { colors } from '../theme';

/**
 * Word-style rich-text editor for the web CRM. Built on a contentEditable
 * surface + document.execCommand (no dependency). Supports font size,
 * bold/italic/underline, alignment, bullet & numbered lists, pasting from Word,
 * and inserting Signature / Initials / Date / Text fields the resident fills in
 * — by clicking a chip or dragging it onto the document.
 */

const FIELD_TYPES: { type: string; label: string }[] = [
  { type: 'signature', label: '✍️ Signature' },
  { type: 'initials', label: '🅰️ Initials' },
  { type: 'date', label: '📅 Date' },
  { type: 'text', label: '🔤 Text' },
];

const fieldLabel = (type: string) => FIELD_TYPES.find((f) => f.type === type)?.label || 'Field';

/** Inline, non-editable token inserted into the document for a fillable field. */
function fieldTokenHtml(type: string) {
  const key = `f_${type}_${Math.random().toString(36).slice(2, 8)}`;
  const style = 'display:inline-block;background:#FCE8A6;border:1px solid #E0B33A;border-radius:4px;padding:0 8px;margin:0 2px;font-weight:700;color:#7a5b00;';
  return `<span data-sl-field="${type}" data-sl-key="${key}" contenteditable="false" style="${style}">${fieldLabel(type)}</span>&nbsp;`;
}

// Small inline SVG icons so toolbar buttons render identically in every browser
// (the previous unicode arrows showed as missing-glyph boxes).
const Icon = ({ d, lines }: { d?: string; lines?: [number, number][] }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={colors.textPrimary} strokeWidth="1.6" strokeLinecap="round">
    {lines ? lines.map(([x1, x2], i) => <line key={i} x1={x1} y1={3 + i * 3} x2={x2} y2={3 + i * 3} />) : <path d={d} />}
  </svg>
);
const AlignLeft = () => <Icon lines={[[2, 14], [2, 9], [2, 12], [2, 8]]} />;
const AlignCenter = () => <Icon lines={[[2, 14], [4, 12], [3, 13], [5, 11]]} />;
const AlignRight = () => <Icon lines={[[2, 14], [7, 14], [4, 14], [8, 14]]} />;
const UndoIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={colors.textPrimary} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4 3 7l3 3" /><path d="M3 7h6a4 4 0 0 1 0 8H7" /></svg>
);
const RedoIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={colors.textPrimary} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 4l3 3-3 3" /><path d="M13 7H7a4 4 0 0 0 0 8h2" /></svg>
);

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

  useEffect(() => {
    if (ref.current && valueHtml && ref.current.innerHTML !== valueHtml) {
      ref.current.innerHTML = valueHtml;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sync = () => { if (ref.current) onChangeHtml(ref.current.innerHTML); };

  const exec = (cmd: string, value?: string) => {
    try { (document as any).execCommand(cmd, false, value); } catch {}
    ref.current?.focus();
    sync();
  };

  const insertHtml = (html: string) => {
    ref.current?.focus();
    try { (document as any).execCommand('insertHTML', false, html); } catch {}
    sync();
  };

  const hold = (e: any) => e.preventDefault();

  const onDrop = (e: any) => {
    const type = e.dataTransfer?.getData('text/sl-field');
    if (!type) return;
    e.preventDefault();
    // Move the caret to the drop point, then insert the field there.
    try {
      const doc: any = document;
      const range = doc.caretRangeFromPoint ? doc.caretRangeFromPoint(e.clientX, e.clientY) : null;
      if (range) {
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    } catch {}
    insertHtml(fieldTokenHtml(type));
  };

  const Btn = ({ children, onPress, title, bold }: { children: React.ReactNode; onPress: () => void; title: string; bold?: boolean }) => (
    <button type="button" title={title} onMouseDown={hold} onClick={onPress} style={{ ...btn, fontWeight: bold ? 800 : 600 }}>{children}</button>
  );

  return (
    <div style={wrap}>
      <div style={toolbar}>
        <select title="Text size" onMouseDown={hold} onChange={(e) => { exec('fontSize', e.target.value); e.target.selectedIndex = 0; }} style={select}>
          <option value="">Size</option>
          <option value="2">Small</option>
          <option value="3">Normal</option>
          <option value="5">Large</option>
          <option value="7">Huge</option>
        </select>
        <Btn title="Bold" bold onPress={() => exec('bold')}>B</Btn>
        <Btn title="Italic" onPress={() => exec('italic')}><span style={{ fontStyle: 'italic' }}>I</span></Btn>
        <Btn title="Underline" onPress={() => exec('underline')}><span style={{ textDecoration: 'underline' }}>U</span></Btn>
        <span style={divider} />
        <Btn title="Align left" onPress={() => exec('justifyLeft')}><AlignLeft /></Btn>
        <Btn title="Align center" onPress={() => exec('justifyCenter')}><AlignCenter /></Btn>
        <Btn title="Align right" onPress={() => exec('justifyRight')}><AlignRight /></Btn>
        <span style={divider} />
        <Btn title="Bulleted list" onPress={() => exec('insertUnorderedList')}>• List</Btn>
        <Btn title="Numbered list" onPress={() => exec('insertOrderedList')}>1. List</Btn>
        <span style={divider} />
        <Btn title="Undo" onPress={() => exec('undo')}><UndoIcon /></Btn>
        <Btn title="Redo" onPress={() => exec('redo')}><RedoIcon /></Btn>
        <Btn title="Clear formatting" onPress={() => exec('removeFormat')}>Clear</Btn>
      </div>

      <div style={paletteBar}>
        <span style={{ fontSize: 12, color: colors.textSecondary, fontWeight: 700, marginRight: 4 }}>Insert / drag a field →</span>
        {FIELD_TYPES.map((f) => (
          <span
            key={f.type}
            draggable
            onDragStart={(e) => { e.dataTransfer.setData('text/sl-field', f.type); e.dataTransfer.effectAllowed = 'copy'; }}
            onMouseDown={hold}
            onClick={() => insertHtml(fieldTokenHtml(f.type))}
            title={`Click to insert, or drag onto the document`}
            style={chip}
          >
            {f.label}
          </span>
        ))}
      </div>

      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder || 'Type or paste your agreement here…'}
        onInput={sync}
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        style={editor}
      />
    </div>
  );
}

const wrap: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff' };
const toolbar: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', padding: 8, backgroundColor: colors.surfaceAlt, borderBottom: `1px solid ${colors.border}` };
const paletteBar: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', padding: '6px 8px', backgroundColor: '#FFFBEF', borderBottom: `1px solid ${colors.border}` };
const btn: React.CSSProperties = { minWidth: 32, height: 30, padding: '0 8px', borderRadius: 6, border: `1px solid ${colors.border}`, background: '#fff', color: colors.textPrimary, cursor: 'pointer', fontSize: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };
const chip: React.CSSProperties = { background: '#FCE8A6', border: '1px solid #E0B33A', color: '#7a5b00', borderRadius: 999, padding: '3px 10px', fontSize: 13, fontWeight: 700, cursor: 'grab', userSelect: 'none' };
const select: React.CSSProperties = { height: 30, borderRadius: 6, border: `1px solid ${colors.border}`, background: '#fff', color: colors.textPrimary, padding: '0 6px', cursor: 'pointer' };
const divider: React.CSSProperties = { width: 1, height: 22, background: colors.border, margin: '0 4px' };
const editor: React.CSSProperties = { minHeight: 240, maxHeight: 440, overflowY: 'auto', padding: 14, fontSize: 15, lineHeight: 1.6, color: colors.textPrimary, outline: 'none' };
