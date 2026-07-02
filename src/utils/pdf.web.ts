// Web-only: render an uploaded PDF into a single tall JPEG so it can flow through
// the same image-based field placement + signing pipeline as photos/scans.
// pdf.js is loaded from a CDN at runtime (no bundler dependency).

const PDFJS_VER = '3.11.174';
const PDFJS_SRC = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VER}/pdf.min.js`;
const PDFJS_WORKER = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VER}/pdf.worker.min.js`;

const MAX_PAGES = 15;
const GAP = 10; // white gap between pages in the composite

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

/** Render every page of the PDF stacked vertically into one JPEG data URL. */
export async function pdfToImage(dataUrl: string): Promise<string> {
  const g: any = globalThis;
  const pdfjs = await ensurePdfjs();
  const pdf = await pdfjs.getDocument({ data: dataUrlToBytes(dataUrl) }).promise;
  const scale = 1.5;
  const pages: HTMLCanvasElement[] = [];
  let width = 0;
  let totalH = 0;
  const n = Math.min(pdf.numPages, MAX_PAGES);
  for (let p = 1; p <= n; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale });
    const c = g.document.createElement('canvas');
    c.width = Math.ceil(viewport.width);
    c.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: c.getContext('2d'), viewport }).promise;
    pages.push(c);
    width = Math.max(width, c.width);
    totalH += c.height + GAP;
  }
  const out = g.document.createElement('canvas');
  out.width = width;
  out.height = totalH;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, totalH);
  let y = 0;
  for (const c of pages) { ctx.drawImage(c, 0, y); y += c.height + GAP; }
  return out.toDataURL('image/jpeg', 0.82);
}
