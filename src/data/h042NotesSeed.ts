import { DrawingPinNote } from '../types/diagram';

export const NOTES_STORAGE_KEY = 'h042_diagram_pin_notes_v1';

export const H042_SEED_PIN_NOTES: DrawingPinNote[] = [
  {
    id: 'SEED-NOTE-1',
    drawingId: 'CI-000-DIA-0002',
    pageNum: 25,
    xPct: 77.5,
    yPct: 37.5,
    tagRef: '200-SDY-101 / 100-ZSO-101',
    severity: 'CRITICAL',
    status: 'OPEN',
    author: 'SEASTAR Audit',
    content: '유닛코드 오기: 200-SDY-101 리미트 스위치가 100-ZSO/ZSC-101 및 "LNG DRAIN PUMP"로 잘못 기재됨. 200-ZSO/ZSC-101로 수정 필요.',
    createdAt: '2026-11-23T05:30:00Z',
    source: 'SEED_DIFF',
  },
  {
    id: 'SEED-NOTE-2',
    drawingId: 'CI-000-DIA-0002',
    pageNum: 25,
    xPct: 55.0,
    yPct: 68.0,
    tagRef: '200-NISJB-001',
    severity: 'CRITICAL',
    status: 'OPEN',
    author: 'SEASTAR Audit',
    content: 'JB 명칭 중복: H-06 블록도에 100-NISJB-001로 표기됨 (결선표 Sheet 15/23은 200-NISJB-001).',
    createdAt: '2026-11-23T05:32:00Z',
    source: 'SEED_DIFF',
  },
  {
    id: 'SEED-NOTE-3',
    drawingId: 'PR-200-PID-0001',
    pageNum: 18,
    xPct: 48.0,
    yPct: 42.0,
    tagRef: '200-PDIT-111E',
    severity: 'CRITICAL',
    status: 'OPEN',
    author: 'Diff Check',
    content: 'P&ID(15/15)는 PDIT-111E이나 iCAMS 결선표(DIA-0001 12/22)에 200-PEIT-111E로 오타 기재됨.',
    createdAt: '2026-11-23T05:35:00Z',
    source: 'SEED_DIFF',
  },
  {
    id: 'SEED-NOTE-4',
    drawingId: 'PR-200-PID-0001',
    pageNum: 16,
    xPct: 62.0,
    yPct: 54.0,
    tagRef: '200-TI-131C',
    severity: 'INFO',
    status: 'IN_REVIEW',
    author: 'Diff Check',
    content: 'P&ID 13/15 (200-P-101C) 로컬 온도계 태그가 TI 131B로 중복 오기됨 (정품: TI 131C).',
    createdAt: '2026-11-23T05:40:00Z',
    source: 'SEED_DIFF',
  },
  {
    id: 'SEED-NOTE-5',
    drawingId: 'PD-100-GAR-0001',
    pageNum: 5,
    xPct: 38.0,
    yPct: 46.0,
    tagRef: '100-SDV-254A',
    severity: 'CRITICAL',
    status: 'OPEN',
    author: 'SEASTAR Markup',
    content: 'Mark B (CABLE MISSING): LIS I/O 목록에는 있으나 Cable List 및 PSDS 결선도에서 케이블 번호 누락.',
    createdAt: '2026-11-23T05:42:00Z',
    source: 'SEED_DIFF',
  },
];

export function loadStoredPinNotes(): DrawingPinNote[] {
  if (typeof window === 'undefined') return H042_SEED_PIN_NOTES;
  try {
    const raw = window.localStorage.getItem(NOTES_STORAGE_KEY);
    if (!raw) return H042_SEED_PIN_NOTES;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : H042_SEED_PIN_NOTES;
  } catch {
    return H042_SEED_PIN_NOTES;
  }
}

export function saveStoredPinNotes(notes: DrawingPinNote[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
  } catch {
    // ignore quota error
  }
}
