import {
  OcrPageResult,
  OcrScanZone,
  OcrWordBox,
} from '../types/diagram';
import { extractEntitiesFromBoxes } from './drawingContentAnalyzer';
import { PdfTextBox } from './pdfLocator';

export interface ZoneCropPct {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function getZoneCropPct(zone: OcrScanZone): ZoneCropPct {
  switch (zone) {
    case 'TOP_LEFT':
      return { left: 0, top: 0, width: 55, height: 55 };
    case 'TOP_RIGHT':
      return { left: 45, top: 0, width: 55, height: 55 };
    case 'BOTTOM_LEFT':
      return { left: 0, top: 45, width: 55, height: 55 };
    case 'BOTTOM_RIGHT':
      return { left: 45, top: 45, width: 55, height: 55 };
    case 'TITLE_BLOCK':
      return { left: 55, top: 68, width: 45, height: 32 };
    case 'FULL_PAGE':
    default:
      return { left: 0, top: 0, width: 100, height: 100 };
  }
}

export interface RawTesseractWord {
  text: string;
  confidence: number;
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
}

/**
 * Pure coordinate converter: transforms Tesseract word pixel bounding boxes inside a cropped
 * zone canvas into normalized full-page percentages (`PdfTextBox[]` and `OcrWordBox[]`).
 */
export function parseTesseractWordsToBoxes(
  words: RawTesseractWord[],
  imgWidth: number,
  imgHeight: number,
  zoneCrop: ZoneCropPct = { left: 0, top: 0, width: 100, height: 100 }
): {
  boxes: PdfTextBox[];
  wordBoxes: OcrWordBox[];
  confidenceMap: Map<PdfTextBox, number>;
} {
  const safeW = Math.max(1, imgWidth);
  const safeH = Math.max(1, imgHeight);
  const boxes: PdfTextBox[] = [];
  const wordBoxes: OcrWordBox[] = [];
  const confidenceMap = new Map<PdfTextBox, number>();

  for (const w of words) {
    const cleaned = (w.text || '').trim();
    if (!cleaned) continue;

    const localLeftPct = (w.bbox.x0 / safeW) * 100;
    const localTopPct = (w.bbox.y0 / safeH) * 100;
    const localWidthPct = Math.max(0.5, ((w.bbox.x1 - w.bbox.x0) / safeW) * 100);
    const localHeightPct = Math.max(0.5, ((w.bbox.y1 - w.bbox.y0) / safeH) * 100);

    const pageLeftPct = +(zoneCrop.left + (localLeftPct / 100) * zoneCrop.width).toFixed(2);
    const pageTopPct = +(zoneCrop.top + (localTopPct / 100) * zoneCrop.height).toFixed(2);
    const pageWidthPct = +((localWidthPct / 100) * zoneCrop.width).toFixed(2);
    const pageHeightPct = +((localHeightPct / 100) * zoneCrop.height).toFixed(2);

    const xPct = Math.max(1, Math.min(99, +(pageLeftPct + pageWidthPct / 2).toFixed(2)));
    const yPct = Math.max(1, Math.min(99, +(pageTopPct + pageHeightPct / 2).toFixed(2)));

    const box: PdfTextBox = {
      str: cleaned,
      xPct,
      yPct,
      leftPct: pageLeftPct,
      topPct: pageTopPct,
      widthPct: pageWidthPct,
      heightPct: pageHeightPct,
    };
    boxes.push(box);
    confidenceMap.set(box, Math.round(w.confidence || 0));

    wordBoxes.push({
      text: cleaned,
      confidence: Math.round(w.confidence || 0),
      xPct,
      yPct,
      leftPct: +localLeftPct.toFixed(2),
      topPct: +localTopPct.toFixed(2),
      widthPct: +localWidthPct.toFixed(2),
      heightPct: +localHeightPct.toFixed(2),
    });
  }

  return { boxes, wordBoxes, confidenceMap };
}

/**
 * Renders a PDF page onto an offscreen high-DPI canvas, crops to the requested zone,
 * and runs local Tesseract.js OCR (`eng`) without any external API keys.
 */
export async function runCanvasOcrOnPdfPage(
  pdfUrl: string,
  drawingId: string,
  pageNum: number,
  opts?: {
    zone?: OcrScanZone;
    onProgress?: (status: string, progress: number) => void;
  }
): Promise<OcrPageResult> {
  const started = Date.now();
  const zone = opts?.zone ?? 'FULL_PAGE';
  const zoneCrop = getZoneCropPct(zone);

  opts?.onProgress?.('PDF 페이지 렌더링 중...', 0.08);
  const pdfjsLib = await import('pdfjs-dist');
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    const workerMod = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerMod.default;
  }

  const doc = await pdfjsLib.getDocument({ url: pdfUrl }).promise;
  const safePage = Math.max(1, Math.min(pageNum, doc.numPages));
  const page = await doc.getPage(safePage);

  const scale = zone === 'FULL_PAGE' ? 1.85 : 2.6;
  const viewport = page.getViewport({ scale });

  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = Math.round(viewport.width);
  fullCanvas.height = Math.round(viewport.height);
  const fullCtx = fullCanvas.getContext('2d');
  if (!fullCtx) {
    throw new Error('2D Canvas 컨텍스트를 초기화할 수 없습니다.');
  }
  await page.render({ canvasContext: fullCtx, viewport, canvas: fullCanvas }).promise;

  // Crop to selected zone
  const sx = Math.round((zoneCrop.left / 100) * fullCanvas.width);
  const sy = Math.round((zoneCrop.top / 100) * fullCanvas.height);
  const sw = Math.max(10, Math.round((zoneCrop.width / 100) * fullCanvas.width));
  const sh = Math.max(10, Math.round((zoneCrop.height / 100) * fullCanvas.height));

  const targetCanvas = document.createElement('canvas');
  targetCanvas.width = sw;
  targetCanvas.height = sh;
  const targetCtx = targetCanvas.getContext('2d');
  if (!targetCtx) {
    throw new Error('OCR 크롭 Canvas 생성에 실패했습니다.');
  }
  targetCtx.drawImage(fullCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

  const previewDataUrl = targetCanvas.toDataURL('image/png');

  opts?.onProgress?.('Tesseract OCR 엔진 초기화 및 문자 인식 중...', 0.2);
  const Tesseract = await import('tesseract.js');
  const worker = await Tesseract.createWorker('eng', Tesseract.OEM.DEFAULT, {
    logger: (m: { status?: string; progress?: number }) => {
      if (typeof m.progress === 'number') {
        opts?.onProgress?.(
          m.status ? `OCR: ${m.status}` : '문자 인식 진행 중...',
          0.2 + m.progress * 0.78
        );
      }
    },
  });

  let recognized;
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT,
    });
    recognized = await worker.recognize(
      targetCanvas,
      {},
      { text: true, blocks: true }
    );
  } finally {
    await worker.terminate();
  }

  // Extract flat word list from Tesseract blocks->paragraphs->lines->words
  const rawData = recognized.data as unknown as {
    text?: string;
    confidence?: number;
    words?: RawTesseractWord[];
    blocks?: Array<{
      paragraphs?: Array<{
        lines?: Array<{
          words?: RawTesseractWord[];
        }>;
      }>;
    }> | null;
  };

  let rawWords: RawTesseractWord[] = rawData.words || [];
  if (rawWords.length === 0 && rawData.blocks) {
    const collected: RawTesseractWord[] = [];
    for (const block of rawData.blocks) {
      for (const para of block.paragraphs || []) {
        for (const line of para.lines || []) {
          for (const w of line.words || []) {
            collected.push(w);
          }
        }
      }
    }
    rawWords = collected;
  }

  const { boxes, wordBoxes, confidenceMap } = parseTesseractWordsToBoxes(
    rawWords,
    targetCanvas.width,
    targetCanvas.height,
    zoneCrop
  );

  // Also run line-level extraction from raw fullText so split OCR tokens still parse cleanly
  const extractedFromBoxes = extractEntitiesFromBoxes(
    boxes,
    drawingId,
    safePage,
    'OCR',
    confidenceMap
  );

  // Fallback synthetic line boxes for multi-word patterns in fullText not captured as single box
  const lines = (rawData.text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length >= 3);
  const lineBoxes: PdfTextBox[] = lines.map((line, idx) => ({
    str: line,
    xPct: +(zoneCrop.left + zoneCrop.width / 2).toFixed(2),
    yPct: +(
      zoneCrop.top +
      ((idx + 0.5) / Math.max(1, lines.length)) * zoneCrop.height
    ).toFixed(2),
    leftPct: zoneCrop.left,
    topPct: zoneCrop.top,
    widthPct: zoneCrop.width,
    heightPct: 3,
  }));
  const extractedFromLines = extractEntitiesFromBoxes(lineBoxes, drawingId, safePage, 'OCR');

  // Merge unique entities preferring word-level exact bbox positions
  const merged = [...extractedFromBoxes];
  for (const le of extractedFromLines) {
    if (
      !merged.some(
        (me) => me.kind === le.kind && me.normalized === le.normalized
      )
    ) {
      merged.push(le);
    }
  }

  opts?.onProgress?.('OCR 완료', 1);

  return {
    drawingId,
    pageNum: safePage,
    zone,
    durationMs: Date.now() - started,
    averageConfidence: Math.round(rawData.confidence || 0),
    fullText: rawData.text || '',
    previewDataUrl,
    words: wordBoxes,
    extractedEntities: merged,
  };
}
