// Web-only: render an uploaded PDF into per-page JPEGs so the member can read it
// one legible page at a time (and the facilitator can place fields per page).
// pdf.js is loaded from a CDN at runtime (no bundler dependency).

const PDFJS_VER = '3.11.174';
const PDFJS_SRC = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VER}/pdf.min.js`;
const PDFJS_WORKER = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VER}/pdf.worker.min.js`;

const MAX_PAGES = 25;

function ensurePdfjs(): Promise<any> {
  const g: any = globalThis;
  if (g.pdfjsLib) return Promise.resolve(g.pdfjsLib);
  return new Promise((resolve, reject) => {
    const s = g.document.createElement('script');
    s.src = PDFJS_SRC;
    s.onload = () => {
      try { g.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; } catch {}
      resolve(g.pdfjsLib);
    };
    s.onerror = () => reject(new Error('Could not load the PDF engine.'));
    g.document.head.appendChild(s);
  });
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.split(',')[1] || '';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Render each PDF page to its OWN JPEG data URL. Returns one entry per page,
 *  so the document can be read + signed one legible page at a time. */
export async function pdfToPages(dataUrl: string): Promise<string[]> {
  const g: any = globalThis;
  const pdfjs = await ensurePdfjs();
  const pdf = await pdfjs.getDocument({ data: dataUrlToBytes(dataUrl) }).promise;
  const scale = 2.0; // crisp enough to read on a phone
  const pages: string[] = [];
  const n = Math.min(pdf.numPages, MAX_PAGES);
  for (let p = 1; p <= n; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale });
    const c = g.document.createElement('canvas');
    c.width = Math.ceil(viewport.width);
    c.height = Math.ceil(viewport.height);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    pages.push(c.toDataURL('image/jpeg', 0.85));
  }
  return pages;
}

/** Back-compat: first page only (single thumbnail). */
export async function pdfToImage(dataUrl: string): Promise<string> {
  const pages = await pdfToPages(dataUrl);
  return pages[0] || '';
}
