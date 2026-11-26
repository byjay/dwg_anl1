import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { EvidencePanelSpec } from './electricalCommentEngine';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const snapshotCache = new Map<string, string>();
const pdfDocCache = new Map<string, Promise<pdfjsLib.PDFDocumentProxy>>();

async function getCachedPdfDocument(pdfUrl: string): Promise<pdfjsLib.PDFDocumentProxy> {
  const existing = pdfDocCache.get(pdfUrl);
  if (existing) return existing;
  const promise = pdfjsLib.getDocument({ url: pdfUrl }).promise.catch((err) => {
    pdfDocCache.delete(pdfUrl);
    throw err;
  });
  pdfDocCache.set(pdfUrl, promise);
  return promise;
}

/**
 * Renders the exact evidence page & crop region from a PDF into a high-DPI PNG data URL,
 * drawing crisp red/blue engineering callout highlights matching the attached report template.
 */
export async function renderEvidencePanelSnapshot(
  panel: EvidencePanelSpec
): Promise<string> {
  const cacheKey = `${panel.id}:${panel.pdfUrl}:${panel.pageNum}`;
  const cached = snapshotCache.get(cacheKey);
  if (cached) return cached;
  if (!panel.pdfUrl) return '';

  const doc = await getCachedPdfDocument(panel.pdfUrl);
  const safePage = Math.max(1, Math.min(panel.pageNum, doc.numPages));
  const page = await doc.getPage(safePage);

  // Render at crisp resolution (~1180-2000px wide) so cropped tables & tags remain legible while capturing fast
  const baseViewport = page.getViewport({ scale: 1 });
  const targetScale = Math.min(1.85, Math.max(0.85, 1180 / baseViewport.width));
  const viewport = page.getViewport({ scale: targetScale });

  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = Math.floor(viewport.width);
  fullCanvas.height = Math.floor(viewport.height);
  const fullCtx = fullCanvas.getContext('2d');
  if (!fullCtx) return '';

  fullCtx.fillStyle = '#ffffff';
  fullCtx.fillRect(0, 0, fullCanvas.width, fullCanvas.height);

  await page.render({
    canvasContext: fullCtx,
    viewport,
    canvas: fullCanvas,
  }).promise;

  const cropX = Math.max(
    0,
    Math.floor((panel.cropPct.left / 100) * fullCanvas.width)
  );
  const cropY = Math.max(
    0,
    Math.floor((panel.cropPct.top / 100) * fullCanvas.height)
  );
  const cropW = Math.max(
    60,
    Math.min(
      fullCanvas.width - cropX,
      Math.floor((panel.cropPct.width / 100) * fullCanvas.width)
    )
  );
  const cropH = Math.max(
    60,
    Math.min(
      fullCanvas.height - cropY,
      Math.floor((panel.cropPct.height / 100) * fullCanvas.height)
    )
  );

  const outCanvas = document.createElement('canvas');
  outCanvas.width = cropW;
  outCanvas.height = cropH;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) return '';

  outCtx.fillStyle = '#ffffff';
  outCtx.fillRect(0, 0, cropW, cropH);
  outCtx.drawImage(fullCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  // Draw crisp red/blue callout rectangles & labels matching the attached template style
  for (const box of panel.annotations) {
    const bx = (box.leftPct / 100) * cropW;
    const by = (box.topPct / 100) * cropH;
    const bw = (box.widthPct / 100) * cropW;
    const bh = (box.heightPct / 100) * cropH;

    const strokeColor = box.color === 'red' ? '#dc2626' : '#0284c7';
    const fillColor =
      box.color === 'red' ? 'rgba(220, 38, 38, 0.10)' : 'rgba(2, 132, 199, 0.12)';

    outCtx.save();
    outCtx.fillStyle = fillColor;
    outCtx.fillRect(bx, by, bw, bh);
    outCtx.strokeStyle = strokeColor;
    outCtx.lineWidth = Math.max(2, Math.round(cropW / 320));
    outCtx.strokeRect(bx, by, bw, bh);

    if (box.label) {
      const fontSize = Math.max(11, Math.min(15, Math.round(cropW / 48)));
      outCtx.font = `700 ${fontSize}px "Malgun Gothic", "Noto Sans KR", sans-serif`;
      const textWidth = outCtx.measureText(box.label).width;
      const padX = 6;
      const tagH = fontSize + 8;
      const tagY = by > tagH + 4 ? by - tagH - 2 : by + 2;
      const tagX = Math.max(4, Math.min(cropW - textWidth - padX * 2 - 4, bx));

      outCtx.fillStyle = strokeColor;
      outCtx.fillRect(tagX, tagY, textWidth + padX * 2, tagH);
      outCtx.fillStyle = '#ffffff';
      outCtx.fillText(box.label, tagX + padX, tagY + fontSize + 1);
    }
    outCtx.restore();
  }

  const dataUrl = outCanvas.toDataURL('image/png');
  snapshotCache.set(cacheKey, dataUrl);
  return dataUrl;
}

export async function renderAllEvidenceSnapshots(
  panels: EvidencePanelSpec[],
  onProgress?: (completed: number, total: number, panelId: string, dataUrl: string) => void
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  if (panels.length === 0) return result;

  const concurrency = Math.min(4, panels.length);
  let nextIndex = 0;
  let completedCount = 0;

  const worker = async () => {
    while (nextIndex < panels.length) {
      const idx = nextIndex++;
      const panel = panels[idx];
      let url = '';
      try {
        url = await renderEvidencePanelSnapshot(panel);
        if (url) {
          result[panel.id] = url;
        }
      } catch {
        url = '';
      }
      completedCount += 1;
      onProgress?.(completedCount, panels.length, panel.id, url);
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return result;
}
