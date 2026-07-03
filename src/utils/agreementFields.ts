// Inline fillable fields embedded in a rich-text agreement body (body_html).
// The CRM editor inserts <span data-sl-field="signature" data-sl-key="..."> tokens;
// these helpers read them back for rendering and signing.

export interface InlineField { key: string; type: string }

// Match a whole field span regardless of attribute order; pull field/key out
// of each match separately (contentEditable can reorder attributes).
const SPAN_RE = /<span\b[^>]*\bdata-sl-field=[^>]*>[\s\S]*?<\/span>/g;
const attr = (frag: string, name: string) => {
  const m = frag.match(new RegExp(`${name}="([^"]+)"`));
  return m ? m[1] : '';
};

export function hasInlineFields(html?: string): boolean {
  return !!html && /data-sl-field=/.test(html);
}

export function parseAgreementFields(html?: string): InlineField[] {
  if (!html) return [];
  const out: InlineField[] = [];
  let m: RegExpExecArray | null;
  SPAN_RE.lastIndex = 0;
  while ((m = SPAN_RE.exec(html))) {
    const type = attr(m[0], 'data-sl-field');
    const key = attr(m[0], 'data-sl-key');
    if (type && key) out.push({ type, key });
  }
  return out;
}

/** Pull labeled answers out of a signed rich-text agreement: each field's value
 *  paired with the text that precedes it (e.g. "Guest name:" -> "John"). */
export function extractLabeledValues(html: string, values: Record<string, any>): { label: string; type: string; value: string }[] {
  if (!html) return [];
  const out: { label: string; type: string; value: string }[] = [];
  let m: RegExpExecArray | null;
  SPAN_RE.lastIndex = 0;
  while ((m = SPAN_RE.exec(html))) {
    const frag = m[0];
    const type = attr(frag, 'data-sl-field');
    const key = attr(frag, 'data-sl-key');
    if (!type || !key) continue;
    // Label = the text since the last block boundary before this token.
    const before = html.slice(0, m.index);
    const bIdx = Math.max(
      before.lastIndexOf('</p>'), before.lastIndexOf('</div>'), before.lastIndexOf('</li>'),
      before.lastIndexOf('</h'), before.lastIndexOf('<br'), before.lastIndexOf('</tr>'),
    );
    const seg = bIdx >= 0 ? before.slice(bIdx) : before;
    let label = seg.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
    label = label.replace(/[:\-–]\s*$/, '').trim();
    const v = values?.[key];
    let value = '';
    if (type === 'signature') value = v && Array.isArray(v.paths) && v.paths.length ? 'Signed' : '';
    else if (type === 'checkbox') value = v === 'checked' || v === true ? 'Yes' : '';
    else value = v != null && String(v).trim() ? String(v).trim() : '';
    if (value) out.push({ label: label || agreementFieldLabel(type).replace(/^\S+\s/, ''), type, value });
  }
  return out;
}

// Parse a rich-text agreement into blocks of inline runs (plain text + field
// tokens) so native can render the fields tappable IN the document flow.
export interface DocRun { kind: 'text' | 'field'; text?: string; key?: string; type?: string }
export interface DocBlock { bullet: boolean; runs: DocRun[] }

function stripToText(s: string): string {
  return s.replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

export function parseInlineDoc(html: string): DocBlock[] {
  if (!html) return [];
  const chunks = html
    .replace(/<li[^>]*>/gi, '[[BULLET]]')
    .split(/<\/(?:p|div|li|h[1-6]|tr)>|<br\s*\/?>/i);
  const blocks: DocBlock[] = [];
  for (let raw of chunks) {
    const bullet = raw.indexOf('[[BULLET]]') >= 0;
    raw = raw.split('[[BULLET]]').join('');
    const runs: DocRun[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    SPAN_RE.lastIndex = 0;
    while ((m = SPAN_RE.exec(raw))) {
      const pre = stripToText(raw.slice(last, m.index));
      if (pre) runs.push({ kind: 'text', text: pre });
      const type = attr(m[0], 'data-sl-field');
      const key = attr(m[0], 'data-sl-key');
      if (type && key) runs.push({ kind: 'field', key, type });
      last = m.index + m[0].length;
    }
    const tail = stripToText(raw.slice(last));
    if (tail) runs.push({ kind: 'text', text: tail });
    if (runs.length) blocks.push({ bullet, runs });
  }
  return blocks;
}

export function agreementFieldLabel(type: string): string {
  switch (type) {
    case 'signature': return '✍️ Signature';
    case 'initials': return '🅰️ Initials';
    case 'date': return '📅 Date';
    case 'number': return '🔢 Number';
    case 'phone': return '📞 Phone';
    case 'email': return '✉️ Email';
    case 'checkbox': return '☑️ Checkbox';
    default: return '🔤 Text';
  }
}

export function isFieldFilled(type: string, value: any): boolean {
  if (type === 'signature') return !!(value && Array.isArray(value.paths) && value.paths.length);
  if (type === 'checkbox') return value === 'checked' || value === true;
  return !!(value && String(value).trim());
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Rewrite each field token's contents/colour to reflect its current value, and
 *  make it clickable in sign mode. Returns HTML ready for dangerouslySetInnerHTML. */
export function decorateAgreementHtml(html: string, values: Record<string, any>, mode: 'sign' | 'read'): string {
  return html.replace(SPAN_RE, (full) => {
    const type = attr(full, 'data-sl-field');
    const key = attr(full, 'data-sl-key');
    if (!type || !key) return full;
    const val = values?.[key];
    const filled = isFieldFilled(type, val);
    const inner = type === 'signature'
      ? (filled ? '✓ Signed' : '✍️ Sign here')
      : type === 'checkbox'
      ? (filled ? '☑ Checked' : '☐ Check')
      : (filled ? escapeHtml(String(val)) : agreementFieldLabel(type));
    const bg = filled ? '#CDE9D6' : '#FCE8A6';
    const bd = filled ? '#5FA877' : '#E0B33A';
    const col = filled ? '#1f5130' : '#7a5b00';
    const cursor = mode === 'sign' ? 'pointer' : 'default';
    return `<span data-sl-field="${type}" data-sl-key="${key}" contenteditable="false" style="display:inline-block;background:${bg};border:1px solid ${bd};border-radius:4px;padding:0 8px;margin:0 2px;font-weight:700;color:${col};cursor:${cursor};">${inner}</span>`;
  });
}
