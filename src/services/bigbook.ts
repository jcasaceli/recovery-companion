/**
 * Big Book reader storage.
 *
 * IMPORTANT: this app does NOT ship the text of any copyrighted book. The reader
 * loads text that the user supplies themselves (e.g. a public-domain edition they
 * paste in). We persist that user-provided text and their bookmarks locally on the
 * device via AsyncStorage.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const PAGES_KEY = 'bigbook:pages';
const STARS_KEY = 'bigbook:stars';

/** Split raw user-provided text into readable "pages".
 *  - Honors explicit page breaks: form-feed (\f) or a line that is just "---".
 *  - Otherwise packs paragraphs into ~1500-character pages. */
export function paginate(raw: string): string[] {
  const text = raw.replace(/\r\n/g, '\n').trim();
  if (!text) return [];

  if (text.includes('\f') || /\n-{3,}\n/.test(text)) {
    return text.split(/\f|\n-{3,}\n/).map((p) => p.trim()).filter(Boolean);
  }

  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const pages: string[] = [];
  let buf = '';
  for (const p of paras) {
    if (buf && (buf.length + p.length) > 1500) { pages.push(buf.trim()); buf = ''; }
    buf += (buf ? '\n\n' : '') + p;
  }
  if (buf.trim()) pages.push(buf.trim());
  return pages;
}

export async function loadPages(): Promise<string[]> {
  try { const raw = await AsyncStorage.getItem(PAGES_KEY); return raw ? JSON.parse(raw) : []; }
  catch { return []; }
}

export async function savePages(pages: string[]): Promise<void> {
  await AsyncStorage.setItem(PAGES_KEY, JSON.stringify(pages));
}

/** Import raw text: paginate, persist, and return the pages. */
export async function importText(raw: string): Promise<string[]> {
  const pages = paginate(raw);
  await savePages(pages);
  return pages;
}

export async function clearPages(): Promise<void> {
  await AsyncStorage.multiRemove([PAGES_KEY, STARS_KEY]);
}

export async function loadStars(): Promise<number[]> {
  try { const raw = await AsyncStorage.getItem(STARS_KEY); return raw ? JSON.parse(raw) : []; }
  catch { return []; }
}

export async function saveStars(stars: number[]): Promise<void> {
  await AsyncStorage.setItem(STARS_KEY, JSON.stringify(stars));
}
