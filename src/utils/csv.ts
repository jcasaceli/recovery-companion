// Tiny CSV helpers for member import/export. Web-first: download + file pick
// use browser APIs so there's no native dependency. Parsing/serialising are
// pure JS and work anywhere.

export function toCsv(headers: string[], rows: (string | number | undefined | null)[][]): string {
  const esc = (v: string | number | undefined | null) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map((r) => r.map(esc).join(',')).join('\n');
}

/** Parse CSV text into rows of string cells (handles quotes, commas, newlines). */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQ = false; }
      } else field += c;
      continue;
    }
    if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  row.push(field);
  rows.push(row);
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** Trigger a CSV download in the browser. */
export function downloadCsv(filename: string, csv: string) {
  const g: any = globalThis;
  if (!g.document) throw new Error('Download is available on the web app.');
  const blob = new g.Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = g.URL.createObjectURL(blob);
  const a = g.document.createElement('a');
  a.href = url;
  a.download = filename;
  g.document.body.appendChild(a);
  a.click();
  g.document.body.removeChild(a);
  g.URL.revokeObjectURL(url);
}

/** Open a file picker and return the chosen CSV's text (web). */
export function pickCsvText(): Promise<string | null> {
  const g: any = globalThis;
  if (!g.document) return Promise.reject(new Error('Import is available on the web app.'));
  return new Promise((resolve) => {
    const input = g.document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv,text/plain';
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) { resolve(null); return; }
      const reader = new g.FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => resolve(null);
      reader.readAsText(f);
    };
    input.click();
  });
}

export interface ParsedMember { firstName: string; lastName?: string; phone?: string; email?: string }

/** Map a parsed CSV (with or without a header row) to member rows. Only a name
 *  is required; phone/email are optional. Flexible header detection so sheets
 *  exported from other tools (OneStep, etc.) import cleanly. */
export function rowsToMembers(rows: string[][]): ParsedMember[] {
  if (!rows.length) return [];
  const norm = (s: string) => s.trim().toLowerCase();
  const header = rows[0].map(norm);
  const has = (...keys: string[]) => header.some((h) => keys.includes(h));
  const looksLikeHeader = has('name', 'first name', 'firstname', 'first', 'full name', 'phone', 'email', 'e-mail');

  const idx = (keys: string[]) => header.findIndex((h) => keys.some((k) => h === k || h.includes(k)));
  const out: ParsedMember[] = [];

  if (looksLikeHeader) {
    const iFirst = idx(['first name', 'firstname', 'first']);
    const iLast = idx(['last name', 'lastname', 'last', 'surname']);
    const iName = idx(['full name', 'name', 'client', 'member', 'resident']);
    const iPhone = idx(['phone', 'mobile', 'cell', 'telephone']);
    const iEmail = idx(['email', 'e-mail']);
    for (const r of rows.slice(1)) {
      const m = buildMember({
        first: iFirst >= 0 ? r[iFirst] : undefined,
        last: iLast >= 0 ? r[iLast] : undefined,
        name: iName >= 0 ? r[iName] : undefined,
        phone: iPhone >= 0 ? r[iPhone] : undefined,
        email: iEmail >= 0 ? r[iEmail] : undefined,
      });
      if (m) out.push(m);
    }
  } else {
    // No header — assume columns: name, phone, email.
    for (const r of rows) {
      const m = buildMember({ name: r[0], phone: r[1], email: r[2] });
      if (m) out.push(m);
    }
  }
  return out;
}

function buildMember(v: { first?: string; last?: string; name?: string; phone?: string; email?: string }): ParsedMember | null {
  let firstName = (v.first || '').trim();
  let lastName = (v.last || '').trim();
  if (!firstName && v.name) {
    const parts = v.name.trim().split(/\s+/);
    firstName = parts.shift() || '';
    lastName = lastName || parts.join(' ');
  }
  if (!firstName) return null;
  const phone = (v.phone || '').trim();
  const email = (v.email || '').trim();
  return { firstName, lastName: lastName || undefined, phone: phone || undefined, email: email || undefined };
}
