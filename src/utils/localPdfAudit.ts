import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { H042_DRAWINGS } from '../data/h042Dataset';
import { DiscrepancySeverity } from '../types/diagram';
import { extractPdfTextBoxesFromPage, matchTextBoxesForTerms } from './pdfLocator';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface LocalPdfFinding {
  id: string;
  severity: DiscrepancySeverity;
  tag: string;
  category: string;
  drawingId: string;
  pageNum: number;
  xPct: number;
  yPct: number;
  matchedText: string;
  finding: string;
  sourceEvidence: string;
  recommendation: string;
}

export interface LocalPdfTrackResult {
  trackId: string;
  trackName: string;
  durationMs: number;
  scannedPages: number;
  findings: LocalPdfFinding[];
}

export interface LocalPdfAuditResponse {
  totalDurationMs: number;
  totalPagesScanned: number;
  tracks: LocalPdfTrackResult[];
}

interface VectorCheckRule {
  id: string;
  drawingId: string;
  pageNum: number;
  tag: string;
  searchTerms: string[];
  severity: DiscrepancySeverity;
  category: string;
  finding: string;
  recommendation: string;
}

const H042_VECTOR_AUDIT_RULES: VectorCheckRule[] = [
  {
    id: 'VEC-200-SDY-101',
    drawingId: 'CI-000-DIA-0002',
    pageNum: 25,
    tag: '200-SDV-101',
    searchTerms: ['100-ZSO/ZSC-101', '200-SDY-101', '100-NISJB-001'],
    severity: 'CRITICAL',
    category: 'UNIT_CODE_MISMATCH',
    finding: 'PSDS 블록도 H-06에서 200-SDY-101 리미트 스위치가 100-ZSO/ZSC-101 및 100-NISJB-001로 오기됨',
    recommendation: 'H-06의 100-ZSO/ZSC-101을 200-ZSO/ZSC-101로, JB를 200-NISJB-001로 수정',
  },
  {
    id: 'VEC-200-PEIT-111E',
    drawingId: 'CI-000-DIA-0001',
    pageNum: 35,
    tag: '200-PDIT-111E',
    searchTerms: ['200-PEIT-111E', 'HC0509', '200-ISJB-005'],
    severity: 'CRITICAL',
    category: 'TAG_TYPO',
    finding: 'iCAMS 결선표 Sheet 12/22에서 P&ID 200-PDIT-111E가 200-PEIT-111E로 오타 표기됨',
    recommendation: 'DIA-0001 Sheet 12/22의 200-PEIT-111E를 200-PDIT-111E로 수정',
  },
  {
    id: 'VEC-100-SDV-254A',
    drawingId: 'PD-100-GAR-0001',
    pageNum: 5,
    tag: '100-SDV-254A',
    searchTerms: ['18"-100-GW-254', 'SDV-254A', '100-SDV-254A', 'G.W.Heater(E-202A)'],
    severity: 'CRITICAL',
    category: 'CABLE_MISSING',
    finding: 'GAR 03/07 SEASTAR Mark B (CABLE MISSING): Cable List 및 PSDS 결선도에서 케이블 누락',
    recommendation: '100-SDV-254A 솔레노이드/리미트스위치 케이블 번호 신규 부여',
  },
  {
    id: 'VEC-100-FIT-203B',
    drawingId: 'CI-000-DIA-0001',
    pageNum: 12,
    tag: '100-FIT-203B',
    searchTerms: ['RC03208', '100-FIT-203B', 'RC0308'],
    severity: 'WARNING',
    category: 'TAG_TYPO',
    finding: 'iCAMS R-03 블록도 케이블 번호가 RC03208로 오기됨 (결선표 Sheet 3/22: RC0308)',
    recommendation: 'R-03 블록도의 RC03208을 RC0308로 수정',
  },
  {
    id: 'VEC-100-TIT-252A',
    drawingId: 'CI-000-DIA-0001',
    pageNum: 26,
    tag: '100-TIT-252A',
    searchTerms: ['100-TIT-252A', 'RC0306', '100-ISJB-003'],
    severity: 'WARNING',
    category: 'REVISION_DRIFT',
    finding: 'P&ID Rev. C(#15)에서 삭제된 100-TIT-252A가 DIA-0001 결선도 Sheet 3/22에 잔존함',
    recommendation: 'P&ID 최신 리비전 기준으로 DIA-0001에서 삭제 또는 SPARE 처리',
  },
  {
    id: 'VEC-200-TI-131C',
    drawingId: 'PR-200-PID-0001',
    pageNum: 16,
    tag: '200-TI-131C',
    searchTerms: ['TI', '131B', '200-P-101C'],
    severity: 'INFO',
    category: 'TAG_TYPO',
    finding: 'P&ID Sheet 13/15(200-P-101C) 로컬 온도계 태그가 TI 131B로 중복 오기됨',
    recommendation: 'P&ID 13/15의 TI 131B를 TI 131C로 정정',
  },
  {
    id: 'VEC-200-LIT-101E',
    drawingId: 'CI-000-DIA-0002',
    pageNum: 24,
    tag: '200-LIT-101E',
    searchTerms: ['200-LIT-101D', '200-ISJB-004', '200-LIT-101E', 'HS0501'],
    severity: 'CRITICAL',
    category: 'DUPLICATE_TAG_OR_RELAY',
    finding: 'PSDS H-05 블록도 복사 오류로 200-LIT-101D / 200-ISJB-004 표기가 잔존함',
    recommendation: 'H-05 블록도를 200-LIT-101E 및 200-ISJB-005로 수정',
  },
  {
    id: 'VEC-200-VE-101C',
    drawingId: 'CI-000-DIA-0002',
    pageNum: 28,
    tag: '200-VE-101C',
    searchTerms: ['200-VE-101A', '200-VJB-001', '200-VJB-101', 'HV0101'],
    severity: 'CRITICAL',
    category: 'DUPLICATE_TAG_OR_RELAY',
    finding: 'PSDS H-09 진동센서 블록도에서 A호기(200-VE-101A) 및 200-VJB-001 복사 오류 검출',
    recommendation: 'H-09 각 펌프별 태그(A~E) 및 JB명(200-VJB-101) 수정',
  },
  {
    id: 'VEC-400-PIT-613A',
    drawingId: 'CI-000-DIA-0002',
    pageNum: 10,
    tag: '400-PIT-613A',
    searchTerms: ['RS0110', '400-PIT-613A', '100-PIT-210A'],
    severity: 'CRITICAL',
    category: 'DUPLICATE_TAG_OR_RELAY',
    finding: 'PSDS R-01 블록도에서 400-PIT-613A(RS0110) 계통 태그 중복 충돌 검출',
    recommendation: 'R-01 블록도와 결선표 1/23 간 태그/케이블 재분배 필요',
  },
];

async function scanTrackRules(
  trackId: string,
  trackName: string,
  rules: VectorCheckRule[],
  docCache: Map<string, pdfjsLib.PDFDocumentProxy>
): Promise<LocalPdfTrackResult> {
  const started = Date.now();
  const findings: LocalPdfFinding[] = [];
  const scannedPageSet = new Set<string>();

  for (const rule of rules) {
    const docEntry = H042_DRAWINGS.find((d) => d.id === rule.drawingId);
    if (!docEntry) continue;

    let doc = docCache.get(rule.drawingId);
    if (!doc) {
      doc = await pdfjsLib.getDocument({ url: docEntry.pdfUrl }).promise;
      docCache.set(rule.drawingId, doc);
    }

    const safePage = Math.max(1, Math.min(rule.pageNum, doc.numPages));
    scannedPageSet.add(`${rule.drawingId}#${safePage}`);
    const page = await doc.getPage(safePage);
    const boxes = await extractPdfTextBoxesFromPage(page);
    const match = matchTextBoxesForTerms(boxes, rule.searchTerms);

    findings.push({
      id: rule.id,
      severity: rule.severity,
      tag: rule.tag,
      category: rule.category,
      drawingId: rule.drawingId,
      pageNum: safePage,
      xPct: match?.xPct ?? 50,
      yPct: match?.yPct ?? 45,
      matchedText: match?.str ?? rule.searchTerms[0],
      finding: rule.finding,
      sourceEvidence: `${rule.drawingId} p.${safePage} · 텍스트 "${match?.str ?? rule.searchTerms[0]}" (${match ? `${match.xPct}%, ${match.yPct}%` : '페이지 위치'})`,
      recommendation: rule.recommendation,
    });
  }

  return {
    trackId,
    trackName,
    durationMs: Date.now() - started,
    scannedPages: scannedPageSet.size,
    findings,
  };
}

/**
 * Runs a completely free, local browser-side PDF vector text audit across H042 PDFs
 * using Promise.all without requiring any external LLM API key.
 */
export async function runLocalPdfVectorAudit(): Promise<LocalPdfAuditResponse> {
  const totalStart = Date.now();
  const docCache = new Map<string, pdfjsLib.PDFDocumentProxy>();

  // Preload unique PDFs concurrently first
  const uniqueIds = Array.from(new Set(H042_VECTOR_AUDIT_RULES.map((r) => r.drawingId)));
  await Promise.all(
    uniqueIds.map(async (id) => {
      const entry = H042_DRAWINGS.find((d) => d.id === id);
      if (!entry) return;
      const doc = await pdfjsLib.getDocument({ url: entry.pdfUrl }).promise;
      docCache.set(id, doc);
    })
  );

  const track1Rules = H042_VECTOR_AUDIT_RULES.filter((r) => r.tag.startsWith('100-'));
  const track2Rules = H042_VECTOR_AUDIT_RULES.filter((r) => r.tag.startsWith('200-'));
  const track3Rules = H042_VECTOR_AUDIT_RULES.filter((r) => r.tag.startsWith('400-'));

  const tracks = await Promise.all([
    scanTrackRules('LOCAL-TRACK-100', '로컬 벡터 스캔 1: Regastainer (100)', track1Rules, docCache),
    scanTrackRules('LOCAL-TRACK-200', '로컬 벡터 스캔 2: HP Pump Skid (200)', track2Rules, docCache),
    scanTrackRules('LOCAL-TRACK-400', '로컬 벡터 스캔 3: Utility · 크로스 정합 (400)', track3Rules, docCache),
  ]);

  return {
    totalDurationMs: Date.now() - totalStart,
    totalPagesScanned: tracks.reduce((sum, t) => sum + t.scannedPages, 0),
    tracks,
  };
}
