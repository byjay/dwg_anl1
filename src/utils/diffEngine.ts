import {
  CrossLayerDiffItem,
  CustomDiffPairResult,
  DiagramLoopEntry,
  DiffFieldDelta,
  DrawingPinNote,
} from '../types/diagram';
import { evaluateLoopEntry, normalizeTag } from './diagramMatcher.ts';

export function resolvePidPage(unitCode: string, sheet: string): number {
  const m = sheet.match(/^(\d+)\//);
  if (!m) return 1;
  const sheetNo = Number(m[1]);
  // PR-100-PID-0001 and PR-200-PID-0001 both have 3 front-matter pages (Plan History A-B + Index C)
  return sheetNo + 3;
}

export function resolveGarPage(sheet: string): number {
  const m = sheet.match(/^(\d+)\//);
  if (!m) return 1;
  const sheetNo = Number(m[1]);
  // PD-100/200-GAR-0001 have 2 front-matter pages before 01/07
  return sheetNo + 2;
}

export function resolveDiaPage(system: string, sheet: string): number {
  // Connection sheets in DIA-0001 (starts around p.24) / DIA-0002 (starts around p.29)
  const connMatch = sheet.match(/^(\d+)\/(\d+)$/);
  if (connMatch) {
    const idx = Number(connMatch[1]);
    return system === 'PSDS' ? 28 + idx : 23 + idx;
  }
  const rMatch = sheet.match(/^R-(\d+)$/);
  if (rMatch) {
    return 9 + Number(rMatch[1]);
  }
  const hMatch = sheet.match(/^H-(\d+)$/);
  if (hMatch) {
    return system === 'PSDS' ? 19 + Number(hMatch[1]) : 16 + Number(hMatch[1]);
  }
  if (sheet === 'E-01') return 22;
  if (sheet === 'E-02') return 23;
  return 1;
}

export interface LoopPdfTargetPair {
  left: { drawingId: string; pageNum: number; label: string };
  right: { drawingId: string; pageNum: number; label: string };
}

export function resolveLoopPdfTargets(entry: DiagramLoopEntry): LoopPdfTargetPair {
  const useGarLeft =
    entry.gar &&
    (entry.gar.markupCode === 'B' ||
      entry.gar.markupCode === 'C' ||
      entry.gar.markupCode === 'D' ||
      Boolean(entry.gar.equipmentLabelOnGar));

  const pidDrawingId = entry.unitCode === '100' ? 'PR-100-PID-0001' : 'PR-200-PID-0001';
  const garDrawingId = entry.unitCode === '100' ? 'PD-100-GAR-0001' : 'PD-200-GAR-0001';

  const left = useGarLeft && entry.gar
    ? {
        drawingId: garDrawingId,
        pageNum: resolveGarPage(entry.gar.sheet),
        label: `${garDrawingId} (${entry.gar.sheet})`,
      }
    : {
        drawingId: pidDrawingId,
        pageNum: resolvePidPage(entry.unitCode, entry.pid.sheet),
        label: `${pidDrawingId} (${entry.pid.sheet})`,
      };

  const primaryElec = entry.electricalPaths[0];
  if (!primaryElec) {
    const fallbackGarPage = entry.gar ? resolveGarPage(entry.gar.sheet) : 1;
    return {
      left: {
        drawingId: pidDrawingId,
        pageNum: resolvePidPage(entry.unitCode, entry.pid.sheet),
        label: `${pidDrawingId} (${entry.pid.sheet})`,
      },
      right: entry.gar
        ? {
            drawingId: garDrawingId,
            pageNum: fallbackGarPage,
            label: `${garDrawingId} (${entry.gar.sheet})`,
          }
        : {
            drawingId: 'CI-000-DIA-0001',
            pageNum: 1,
            label: 'CI-000-DIA-0001 (미연결)',
          },
    };
  }

  const elecDrawingId =
    primaryElec.system === 'PSDS' || (primaryElec.system === 'ESD_MCC' && entry.unitCode !== '100')
      ? 'CI-000-DIA-0002'
      : 'CI-000-DIA-0001';

  const mentionsConnectionSheet =
    primaryElec.electricalTag.includes(primaryElec.connectionSheet) ||
    (primaryElec.blockDiagramTagNote?.includes(primaryElec.connectionSheet) ?? false);
  const hasBlockIssue = Boolean(
    primaryElec.blockDiagramTagNote ||
      primaryElec.blockDiagramJbNote ||
      primaryElec.blockDiagramCableNote
  );
  const targetSheet =
    hasBlockIssue && !mentionsConnectionSheet
      ? primaryElec.blockSheet
      : primaryElec.connectionSheet;

  return {
    left,
    right: {
      drawingId: elecDrawingId,
      pageNum: resolveDiaPage(primaryElec.system, targetSheet),
      label: `${elecDrawingId} (${targetSheet})`,
    },
  };
}

/**
 * Generates structured field-level Diff records comparing P&ID, GAR, Electrical Block Diagrams,
 * Connection Tables, and Revision History across all loop entries.
 */
export function buildCrossLayerDiffs(entries: DiagramLoopEntry[]): CrossLayerDiffItem[] {
  const diffs: CrossLayerDiffItem[] = [];

  for (const entry of entries) {
    const evaluated = evaluateLoopEntry(entry);
    const pidDrawingId =
      entry.unitCode === '100' ? 'PR-100-PID-0001' : 'PR-200-PID-0001';
    const garDrawingId =
      entry.unitCode === '100' ? 'PD-100-GAR-0001' : 'PD-200-GAR-0001';
    const pidPage = resolvePidPage(entry.unitCode, entry.pid.sheet);
    const garPage = entry.gar ? resolveGarPage(entry.gar.sheet) : 1;

    const primaryElec = entry.electricalPaths[0];
    const elecDrawingId =
      primaryElec?.system === 'PSDS' || primaryElec?.system === 'ESD_MCC'
        ? primaryElec.system === 'ESD_MCC' && entry.unitCode === '100'
          ? 'CI-000-DIA-0001'
          : 'CI-000-DIA-0002'
        : 'CI-000-DIA-0001';

    // 1. P&ID vs GAR diffs (equipment callout mismatches, missing cables, unassigned circuits, P&ID-only)
    if (entry.gar?.equipmentLabelOnGar) {
      diffs.push({
        id: `DIFF-PID-GAR-${entry.id}`,
        loopId: entry.id,
        canonicalTag: entry.canonicalTag,
        unitCode: entry.unitCode,
        scope: 'PID_VS_GAR',
        scopeLabelKo: 'P&ID ↔ GAR 배치도',
        changeKind: 'CHANGED',
        severity: 'WARNING',
        title: `GAR 장비 태그 불일치 (${entry.equipmentTag} ↔ ${entry.gar.equipmentLabelOnGar})`,
        summary: `P&ID 기준 장비 태그는 ${entry.equipmentTag}이나, GAR(${entry.gar.sheet}) 도면에 ${entry.gar.equipmentLabelOnGar}로 오기되어 있습니다.`,
        deltas: [
          {
            fieldLabel: '장비 태그',
            leftSourceLabel: `P&ID (${entry.pid.sheet})`,
            leftValue: entry.equipmentTag,
            rightSourceLabel: `GAR (${entry.gar.sheet})`,
            rightValue: entry.gar.equipmentLabelOnGar,
          },
        ],
        leftJump: { drawingId: pidDrawingId, pageNum: pidPage, label: `${pidDrawingId} p.${pidPage}` },
        rightJump: { drawingId: garDrawingId, pageNum: garPage, label: `${garDrawingId} p.${garPage}` },
        recommendedFix: `GAR(${entry.gar.sheet}) 콜아웃을 ${entry.equipmentTag}로 통일하세요.`,
      });
    }

    if (entry.gar?.markupCode === 'B' || entry.gar?.markupCode === 'C' || entry.gar?.markupCode === 'D') {
      const kindMap = {
        B: 'MISSING_TARGET' as const,
        C: 'MISSING_TARGET' as const,
        D: 'MISSING_TARGET' as const,
      };
      const labelMap = {
        B: 'CABLE MISSING (NO. T.B.D)',
        C: 'CIRCUIT UNASSIGNED (RC****)',
        D: 'NOT IN LIS / CABLE LIST',
      };
      diffs.push({
        id: `DIFF-GAR-DIA-${entry.id}`,
        loopId: entry.id,
        canonicalTag: entry.canonicalTag,
        unitCode: entry.unitCode,
        scope: 'PID_VS_DIA',
        scopeLabelKo: 'P&ID/GAR ↔ 전장 결선도',
        changeKind: kindMap[entry.gar.markupCode],
        severity: entry.gar.markupCode === 'B' ? 'CRITICAL' : 'WARNING',
        title: `${entry.canonicalTag} — SEASTAR Mark ${entry.gar.markupCode} (${labelMap[entry.gar.markupCode]})`,
        summary:
          entry.gar.note ||
          `GAR(${entry.gar.sheet}) 마크업 ${entry.gar.markupCode}: 전장 케이블 리스트 또는 결선도 반영 누락/미확정 상태입니다.`,
        deltas: [
          {
            fieldLabel: '케이블 배정 상태',
            leftSourceLabel: `GAR Markup ${entry.gar.markupCode}`,
            leftValue: entry.gar.annotatedCableNo || labelMap[entry.gar.markupCode],
            rightSourceLabel: primaryElec ? `${primaryElec.system} (${primaryElec.connectionSheet})` : '전장 결선도',
            rightValue: primaryElec ? primaryElec.fieldCableNo : '결선 기록 없음',
          },
        ],
        leftJump: { drawingId: garDrawingId, pageNum: garPage, label: `${garDrawingId} p.${garPage}` },
        rightJump: primaryElec
          ? {
              drawingId: elecDrawingId,
              pageNum: resolveDiaPage(primaryElec.system, primaryElec.connectionSheet),
              label: `${elecDrawingId} (${primaryElec.connectionSheet})`,
            }
          : undefined,
        recommendedFix:
          entry.gar.markupCode === 'B'
            ? 'Cable List에 누락된 케이블 번호를 추가하고 결선 시트와 동기화하세요.'
            : entry.gar.markupCode === 'C'
              ? 'RC**** 미확정 회로에 정식 케이블 번호를 부여하세요.'
              : '로컬 MCC 패키지 내부 결선 여부를 확인해 Mark D 항목을 해소하세요.',
      });
    }

    // 2. P&ID vs Electrical Tag / Revision diffs (only when P&ID note indicates removal/obsolete)
    if (
      entry.pid.pidRevisionNote &&
      /REMOVED|DELETED|삭제/i.test(entry.pid.pidRevisionNote) &&
      entry.electricalPaths.length > 0
    ) {
      diffs.push({
        id: `DIFF-REV-${entry.id}`,
        loopId: entry.id,
        canonicalTag: entry.canonicalTag,
        unitCode: entry.unitCode,
        scope: 'REVISION_VS_ACTIVE',
        scopeLabelKo: 'P&ID 리비전 이력 ↔ 현행 전장도',
        changeKind: 'ORPHAN_TARGET',
        severity: 'WARNING',
        title: `P&ID Rev. C 삭제 태그(${entry.canonicalTag}) 전장도 잔존`,
        summary: entry.pid.pidRevisionNote,
        deltas: [
          {
            fieldLabel: '태그 유효 상태',
            leftSourceLabel: `P&ID (${entry.pid.sheet})`,
            leftValue: 'DELETED IN REV. C (#15)',
            rightSourceLabel: `${primaryElec!.system} (${primaryElec!.blockSheet} / ${primaryElec!.connectionSheet})`,
            rightValue: `ACTIVE (${primaryElec!.fieldCableNo})`,
          },
        ],
        leftJump: { drawingId: pidDrawingId, pageNum: 1, label: `${pidDrawingId} Rev 이력` },
        rightJump: {
          drawingId: elecDrawingId,
          pageNum: resolveDiaPage(primaryElec!.system, primaryElec!.connectionSheet),
          label: `${elecDrawingId} (${primaryElec!.connectionSheet})`,
        },
        recommendedFix: 'P&ID 최신 리비전에 맞춰 전장 결선도에서 삭제 또는 SPARE 처리하세요.',
      });
    }

    // 3. Electrical tag typos, unit code mismatch & Block Diagram vs Connection Table diffs
    for (const ep of entry.electricalPaths) {
      const deltas: DiffFieldDelta[] = [];

      if (ep.blockDiagramTagNote) {
        const rightTagOrNote =
          ep.electricalTag.toUpperCase() === entry.canonicalTag.toUpperCase()
            ? ep.blockDiagramTagNote
            : ep.electricalTag;
        deltas.push({
          fieldLabel: '태그 표기',
          leftSourceLabel: `P&ID / 결선표 (${ep.connectionSheet})`,
          leftValue: entry.canonicalTag,
          rightSourceLabel: `전장 블록도 (${ep.blockSheet})`,
          rightValue: rightTagOrNote,
        });
      }
      if (ep.blockDiagramJbNote) {
        deltas.push({
          fieldLabel: 'Junction Box',
          leftSourceLabel: `블록도 (${ep.blockSheet})`,
          leftValue: ep.blockDiagramJbNote.split('→')[0].trim(),
          rightSourceLabel: `결선표 (${ep.connectionSheet})`,
          rightValue: ep.junctionBox,
        });
      }
      if (ep.blockDiagramCableNote) {
        deltas.push({
          fieldLabel: '필드 케이블',
          leftSourceLabel: `블록도 (${ep.blockSheet})`,
          leftValue: ep.blockDiagramCableNote,
          rightSourceLabel: `결선표 (${ep.connectionSheet})`,
          rightValue: ep.fieldCableNo,
        });
      }

      if (deltas.length > 0 || evaluated.discrepancies.some((d) => d.category === 'DUPLICATE_TAG_OR_RELAY' || d.category === 'TAG_TYPO')) {
        const topIssue = evaluated.discrepancies.find(
          (d) =>
            d.category === 'UNIT_CODE_MISMATCH' ||
            d.category === 'TAG_TYPO' ||
            d.category === 'DUPLICATE_TAG_OR_RELAY' ||
            d.category === 'JB_NAMING_CONFLICT'
        );

        if (deltas.length === 0 && topIssue) {
          deltas.push({
            fieldLabel: '결선 / 릴레이 검증',
            leftSourceLabel: `P&ID (${entry.pid.sheet})`,
            leftValue: entry.canonicalTag,
            rightSourceLabel: `${ep.system} (${ep.connectionSheet})`,
            rightValue: ep.cabinetTerminalOrBarrier || ep.electricalTag,
          });
        }

        if (deltas.length > 0) {
          diffs.push({
            id: `DIFF-BLK-CONN-${entry.id}-${ep.blockSheet}`,
            loopId: entry.id,
            canonicalTag: entry.canonicalTag,
            unitCode: entry.unitCode,
            scope: ep.blockDiagramTagNote || ep.blockDiagramJbNote || ep.blockDiagramCableNote
              ? 'BLOCK_VS_CONNECTION'
              : 'PID_VS_DIA',
            scopeLabelKo:
              ep.blockDiagramTagNote || ep.blockDiagramJbNote || ep.blockDiagramCableNote
                ? '전장 블록도 ↔ 결선 테이블'
                : 'P&ID ↔ 전장 결선도',
            changeKind:
              topIssue?.category === 'DUPLICATE_TAG_OR_RELAY' ? 'DUPLICATE_COLLISION' : 'CHANGED',
            severity: topIssue?.severity || 'CRITICAL',
            title: topIssue?.title || `${entry.canonicalTag} 블록도-결선표 불일치`,
            summary: topIssue?.description || ep.blockDiagramTagNote || ep.blockDiagramCableNote || '',
            deltas,
            leftJump: {
              drawingId: elecDrawingId,
              pageNum: resolveDiaPage(ep.system, ep.blockSheet),
              label: `${elecDrawingId} (${ep.blockSheet})`,
            },
            rightJump: {
              drawingId: elecDrawingId,
              pageNum: resolveDiaPage(ep.system, ep.connectionSheet),
              label: `${elecDrawingId} (${ep.connectionSheet})`,
            },
            recommendedFix:
              topIssue?.recommendedAction || '블록 다이어그램과 결선 테이블 간 태그·케이블·JB를 동기화하세요.',
          });
        }
      }
    }

    // 4. P&ID local typo (e.g. TI 131B on 200-P-101C sheet)
    if (entry.pid.rawTag.includes('Should be')) {
      diffs.push({
        id: `DIFF-PID-INTERNAL-${entry.id}`,
        loopId: entry.id,
        canonicalTag: entry.canonicalTag,
        unitCode: entry.unitCode,
        scope: 'PID_VS_GAR',
        scopeLabelKo: 'P&ID 내부 표기 ↔ GAR 정합',
        changeKind: 'CHANGED',
        severity: 'INFO',
        title: `P&ID(${entry.pid.sheet}) 계기 태그 오기: ${entry.pid.rawTag}`,
        summary: `P&ID ${entry.pid.sheet}에서 장비 ${entry.equipmentTag}에 연결된 계기가 오기되어 GAR(${entry.gar?.tag || entry.canonicalTag})과 상이합니다.`,
        deltas: [
          {
            fieldLabel: '계기 태그',
            leftSourceLabel: `P&ID (${entry.pid.sheet})`,
            leftValue: entry.pid.rawTag,
            rightSourceLabel: `GAR (${entry.gar?.sheet || '-'})`,
            rightValue: entry.gar?.tag || entry.canonicalTag,
          },
        ],
        leftJump: { drawingId: pidDrawingId, pageNum: pidPage, label: `${pidDrawingId} p.${pidPage}` },
        rightJump: entry.gar
          ? { drawingId: garDrawingId, pageNum: garPage, label: `${garDrawingId} p.${garPage}` }
          : undefined,
        recommendedFix: `P&ID ${entry.pid.sheet} 태그를 ${entry.canonicalTag} 기준으로 정정하세요.`,
      });
    }
  }

  return diffs;
}

interface ParsedTagRow {
  canonicalTag: string;
  cableNo: string;
  jb: string;
  rawLine: string;
}

function parseTagListText(text: string): Map<string, ParsedTagRow> {
  const map = new Map<string, ParsedTagRow>();
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  for (const line of lines) {
    const parts = line.split(/[,\t|]+/).map((p) => p.trim());
    const rawTag = parts[0] || '';
    if (!rawTag) continue;
    const canonical = normalizeTag(rawTag);
    map.set(canonical, {
      canonicalTag: canonical,
      cableNo: (parts[1] || '').toUpperCase(),
      jb: (parts[2] || '').toUpperCase(),
      rawLine: line,
    });
  }
  return map;
}

/**
 * Runs a parallel pairwise diff check between a piping tag list and an electrical tag list.
 */
export async function runParallelCustomDiff(
  pipingText: string,
  electricalText: string
): Promise<CustomDiffPairResult[]> {
  const [pipingMap, elecMap] = await Promise.all([
    Promise.resolve(parseTagListText(pipingText)),
    Promise.resolve(parseTagListText(electricalText)),
  ]);

  const allTags = Array.from(new Set([...pipingMap.keys(), ...elecMap.keys()])).sort();

  // Partition tags into chunks and evaluate concurrently
  const chunkSize = Math.max(1, Math.ceil(allTags.length / 4));
  const chunks: string[][] = [];
  for (let i = 0; i < allTags.length; i += chunkSize) {
    chunks.push(allTags.slice(i, i + chunkSize));
  }

  const evaluatedChunks = await Promise.all(
    chunks.map(async (chunk) =>
      chunk.map((tag): CustomDiffPairResult => {
        const p = pipingMap.get(tag);
        const e = elecMap.get(tag);

        if (p && !e) {
          return {
            tag,
            status: 'MISSING_IN_ELECTRICAL',
            pipingLine: p.rawLine,
            pipingCable: p.cableNo || '-',
            pipingJb: p.jb || '-',
            detail: '배관(P&ID/GAR) 목록에는 존재하나 전장 목록에서 누락되었습니다.',
          };
        }
        if (!p && e) {
          return {
            tag,
            status: 'MISSING_IN_PIPING',
            electricalLine: e.rawLine,
            electricalCable: e.cableNo || '-',
            electricalJb: e.jb || '-',
            detail: '전장 목록에는 존재하나 배관(P&ID/GAR) 목록에 없습니다 (삭제 태그 또는 태그 오타 확인).',
          };
        }

        const cableDiff = Boolean(p!.cableNo && e!.cableNo && p!.cableNo !== e!.cableNo);
        const jbDiff = Boolean(p!.jb && e!.jb && p!.jb !== e!.jb);

        if (cableDiff || jbDiff) {
          const reasons: string[] = [];
          if (cableDiff) reasons.push(`케이블(${p!.cableNo} ≠ ${e!.cableNo})`);
          if (jbDiff) reasons.push(`JB(${p!.jb} ≠ ${e!.jb})`);
          return {
            tag,
            status: 'VALUE_DIFF',
            pipingLine: p!.rawLine,
            electricalLine: e!.rawLine,
            pipingCable: p!.cableNo || '-',
            electricalCable: e!.cableNo || '-',
            pipingJb: p!.jb || '-',
            electricalJb: e!.jb || '-',
            detail: `속성 불일치: ${reasons.join(', ')}`,
          };
        }

        return {
          tag,
          status: 'MATCHED',
          pipingLine: p!.rawLine,
          electricalLine: e!.rawLine,
          pipingCable: p!.cableNo || '-',
          electricalCable: e!.cableNo || '-',
          pipingJb: p!.jb || '-',
          electricalJb: e!.jb || '-',
          detail: '태그 및 케이블·JB 정합성 일치',
        };
      })
    )
  );

  return evaluatedChunks.flat();
}

export function normalizeNoteCoordinates(
  offsetX: number,
  offsetY: number,
  canvasWidth: number,
  canvasHeight: number
): { xPct: number; yPct: number } {
  if (canvasWidth <= 0 || canvasHeight <= 0) {
    return { xPct: 50, yPct: 50 };
  }
  const xPct = Math.max(2, Math.min(98, +((offsetX / canvasWidth) * 100).toFixed(2)));
  const yPct = Math.max(2, Math.min(98, +((offsetY / canvasHeight) * 100).toFixed(2)));
  return { xPct, yPct };
}

export function exportNotesToCsv(notes: DrawingPinNote[]): string {
  const headers = ['Note ID', 'Drawing', 'Page', 'X(%)', 'Y(%)', 'Tag Ref', 'Severity', 'Status', 'Author', 'Content', 'Created At'];
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = notes.map((n) => [
    n.id,
    n.drawingId,
    n.pageNum,
    n.xPct,
    n.yPct,
    n.tagRef,
    n.severity,
    n.status,
    n.author,
    n.content,
    n.createdAt,
  ]);
  return [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
}
