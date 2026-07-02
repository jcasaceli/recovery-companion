// Native stub — PDF-to-image conversion runs in the browser (web CRM) only.
export async function pdfToImage(_dataUrl: string): Promise<string> {
  throw new Error('Uploading a PDF is available on the web app. On the phone, upload a photo or scan.');
}
