import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';

// pdf.js worker — Vite handles this URL pattern
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export async function extractText(file) {
  const name = file.name.toLowerCase();

  if (name.endsWith('.txt') || name.endsWith('.md')) {
    return await file.text();
  }

  if (name.endsWith('.docx')) {
    const buf = await file.arrayBuffer();
    const { value } = await mammoth.extractRawText({ arrayBuffer: buf });
    return value;
  }

  if (name.endsWith('.pdf')) {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map((it) => it.str).join(' '));
    }
    return pages.join('\n\n');
  }

  throw new Error(`Unsupported file type: ${file.name}. Use .txt, .docx, or .pdf`);
}
