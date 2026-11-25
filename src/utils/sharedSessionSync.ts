export type SharedParticipantKind = 'LOCAL' | 'SIMULATED_PEER' | 'REMOTE_TAB';

export type SharedSessionPresetMode = 'SAME_LEFT' | 'SAME_RIGHT' | 'SPLIT_PANES';

export interface PaneDrawingTarget {
  drawingId: string;
  pageNum: number;
  paneSide?: 'LEFT' | 'RIGHT';
}

export interface SharedPointerState {
  participantId: string;
  kind: SharedParticipantKind;
  name: string;
  roleLabel: string;
  color: string;
  drawingId: string;
  pageNum: number;
  paneSide?: 'LEFT' | 'RIGHT';
  xPct: number;
  yPct: number;
  updatedAt: number;
  pingedAt?: number;
  statusMessage?: string;
}

export interface VisiblePanePointer extends SharedPointerState {
  isPingActive: boolean;
}

export type SharedSessionEvent =
  | {
      type: 'session:join';
      participant: SharedPointerState;
    }
  | {
      type: 'cursor:move';
      participantId: string;
      drawingId: string;
      pageNum: number;
      paneSide?: 'LEFT' | 'RIGHT';
      xPct: number;
      yPct: number;
      updatedAt: number;
      statusMessage?: string;
      name?: string;
      roleLabel?: string;
      color?: string;
      kind?: SharedParticipantKind;
    }
  | {
      type: 'cursor:ping';
      participantId: string;
      drawingId: string;
      pageNum: number;
      paneSide?: 'LEFT' | 'RIGHT';
      xPct: number;
      yPct: number;
      pingedAt: number;
      updatedAt: number;
      statusMessage?: string;
    }
  | {
      type: 'session:leave';
      participantId: string;
      updatedAt: number;
    };

export interface BroadcastSessionEnvelope {
  channelTag: 'H042_PDF_SHARED_SESSION';
  sessionId: string;
  senderTabId: string;
  event: SharedSessionEvent;
}

export const SHARED_POINTER_STALE_MS = 12_000;
export const SHARED_PING_DURATION_MS = 2_400;

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 50;
  const clamped = Math.max(0, Math.min(100, value));
  return Math.round(clamped * 10) / 10;
}

interface SimulatedPeerBlueprint {
  participantId: string;
  name: string;
  roleLabel: string;
  color: string;
  defaultPane: 'LEFT' | 'RIGHT';
  waypoints: Array<{ xPct: number; yPct: number; statusMessage: string }>;
}

const SIMULATED_PEER_BLUEPRINTS: SimulatedPeerBlueprint[] = [
  {
    participantId: 'sim-peer-kim',
    name: '김배관',
    roleLabel: '배관설계',
    color: '#0284C7',
    defaultPane: 'LEFT',
    waypoints: [
      { xPct: 27.4, yPct: 33.8, statusMessage: 'P&ID 주배관 분기점 확인' },
      { xPct: 36.2, yPct: 46.5, statusMessage: '밸브 태그 표기 대조' },
      { xPct: 22.8, yPct: 58.2, statusMessage: '노즐 연결 사양 검토' },
      { xPct: 41.5, yPct: 39.0, statusMessage: 'Rev. 변경 구름 마크 확인' },
    ],
  },
  {
    participantId: 'sim-peer-lee',
    name: '이전장',
    roleLabel: '전장설계',
    color: '#7C3AED',
    defaultPane: 'LEFT',
    waypoints: [
      { xPct: 71.6, yPct: 62.4, statusMessage: '동일 도면 계장 신호선 대조' },
      { xPct: 63.8, yPct: 29.5, statusMessage: '인터락 루프 접점 확인' },
      { xPct: 78.2, yPct: 47.8, statusMessage: 'JB 인입 케이블 번호 검토' },
      { xPct: 58.4, yPct: 71.2, statusMessage: 'Fail-Safe 동작 조건 확인' },
    ],
  },
  {
    participantId: 'sim-peer-park',
    name: '박계장',
    roleLabel: '계장검증',
    color: '#059669',
    defaultPane: 'RIGHT',
    waypoints: [
      { xPct: 48.2, yPct: 28.4, statusMessage: 'iCAMS 터미널 블록 대조' },
      { xPct: 61.5, yPct: 54.6, statusMessage: 'DI/DO 채널 할당 확인' },
      { xPct: 34.8, yPct: 66.2, statusMessage: '전원 루프 결선도 점검' },
      { xPct: 55.0, yPct: 41.8, statusMessage: '중복 태그 여부 검토' },
    ],
  },
];

function resolveSimulatedTargetForPeer(
  blueprint: SimulatedPeerBlueprint,
  leftTarget: PaneDrawingTarget,
  rightTarget: PaneDrawingTarget,
  mode: SharedSessionPresetMode
): { drawingId: string; pageNum: number; paneSide: 'LEFT' | 'RIGHT' } {
  if (mode === 'SAME_LEFT') {
    return {
      drawingId: leftTarget.drawingId,
      pageNum: leftTarget.pageNum,
      paneSide: 'LEFT',
    };
  }
  if (mode === 'SAME_RIGHT') {
    return {
      drawingId: rightTarget.drawingId,
      pageNum: rightTarget.pageNum,
      paneSide: 'RIGHT',
    };
  }
  // SPLIT_PANES: 김배관 & 이전장 view LEFT simultaneously, 박계장 views RIGHT
  if (blueprint.defaultPane === 'RIGHT') {
    return {
      drawingId: rightTarget.drawingId,
      pageNum: rightTarget.pageNum,
      paneSide: 'RIGHT',
    };
  }
  return {
    drawingId: leftTarget.drawingId,
    pageNum: leftTarget.pageNum,
    paneSide: 'LEFT',
  };
}

export function createInitialSimulatedPeers(
  leftTarget: PaneDrawingTarget,
  rightTarget: PaneDrawingTarget,
  nowMs: number,
  mode: SharedSessionPresetMode = 'SPLIT_PANES'
): SharedPointerState[] {
  return SIMULATED_PEER_BLUEPRINTS.map((bp, idx) => {
    const target = resolveSimulatedTargetForPeer(bp, leftTarget, rightTarget, mode);
    const wp = bp.waypoints[0];
    // Slightly offset x/y in SAME_LEFT / SAME_RIGHT so 3 cursors never overlap
    const offsetX = mode !== 'SPLIT_PANES' && idx === 2 ? -14 : 0;
    const offsetY = mode !== 'SPLIT_PANES' && idx === 2 ? 12 : 0;
    return {
      participantId: bp.participantId,
      kind: 'SIMULATED_PEER',
      name: bp.name,
      roleLabel: bp.roleLabel,
      color: bp.color,
      drawingId: target.drawingId,
      pageNum: target.pageNum,
      paneSide: target.paneSide,
      xPct: clampPercent(wp.xPct + offsetX),
      yPct: clampPercent(wp.yPct + offsetY),
      updatedAt: nowMs,
      statusMessage: wp.statusMessage,
    };
  });
}

export function advanceSimulatedPeers(
  existingParticipants: Record<string, SharedPointerState>,
  leftTarget: PaneDrawingTarget,
  rightTarget: PaneDrawingTarget,
  tick: number,
  nowMs: number,
  mode: SharedSessionPresetMode = 'SPLIT_PANES'
): Record<string, SharedPointerState> {
  const next = { ...existingParticipants };
  const safeTick = Math.max(0, Math.floor(tick));

  SIMULATED_PEER_BLUEPRINTS.forEach((bp, idx) => {
    const target = resolveSimulatedTargetForPeer(bp, leftTarget, rightTarget, mode);
    const wp = bp.waypoints[(safeTick + idx) % bp.waypoints.length];
    const jitterX = ((safeTick % 3) - 1) * 1.4;
    const jitterY = (((safeTick + idx) % 3) - 1) * 1.1;
    const modeOffsetX = mode !== 'SPLIT_PANES' && idx === 2 ? -11 : 0;
    const modeOffsetY = mode !== 'SPLIT_PANES' && idx === 2 ? 10 : 0;
    const prev = next[bp.participantId];

    next[bp.participantId] = {
      participantId: bp.participantId,
      kind: 'SIMULATED_PEER',
      name: bp.name,
      roleLabel: bp.roleLabel,
      color: bp.color,
      drawingId: target.drawingId,
      pageNum: target.pageNum,
      paneSide: target.paneSide,
      xPct: clampPercent(wp.xPct + jitterX + modeOffsetX),
      yPct: clampPercent(wp.yPct + jitterY + modeOffsetY),
      updatedAt: nowMs,
      pingedAt: prev?.pingedAt,
      statusMessage: wp.statusMessage,
    };
  });

  return next;
}

export function applySharedSessionEvent(
  stateMap: Record<string, SharedPointerState>,
  event: SharedSessionEvent
): Record<string, SharedPointerState> {
  if (event.type === 'session:leave') {
    if (!stateMap[event.participantId]) return stateMap;
    const existing = stateMap[event.participantId];
    if (event.updatedAt < existing.updatedAt) return stateMap;
    const next = { ...stateMap };
    delete next[event.participantId];
    return next;
  }

  if (event.type === 'session:join') {
    const existing = stateMap[event.participant.participantId];
    if (existing && event.participant.updatedAt < existing.updatedAt) {
      return stateMap;
    }
    return {
      ...stateMap,
      [event.participant.participantId]: {
        ...event.participant,
        xPct: clampPercent(event.participant.xPct),
        yPct: clampPercent(event.participant.yPct),
      },
    };
  }

  if (event.type === 'cursor:move') {
    const existing = stateMap[event.participantId];
    if (existing && event.updatedAt < existing.updatedAt) {
      return stateMap;
    }
    return {
      ...stateMap,
      [event.participantId]: {
        participantId: event.participantId,
        kind: event.kind ?? existing?.kind ?? 'REMOTE_TAB',
        name: event.name ?? existing?.name ?? '공동 검토자',
        roleLabel: event.roleLabel ?? existing?.roleLabel ?? '원격 탭',
        color: event.color ?? existing?.color ?? '#D97706',
        drawingId: event.drawingId,
        pageNum: Math.max(1, Math.floor(event.pageNum)),
        paneSide: event.paneSide ?? existing?.paneSide,
        xPct: clampPercent(event.xPct),
        yPct: clampPercent(event.yPct),
        updatedAt: event.updatedAt,
        pingedAt: existing?.pingedAt,
        statusMessage: event.statusMessage ?? existing?.statusMessage,
      },
    };
  }

  if (event.type === 'cursor:ping') {
    const existing = stateMap[event.participantId];
    if (existing && event.updatedAt < existing.updatedAt) {
      return stateMap;
    }
    return {
      ...stateMap,
      [event.participantId]: {
        participantId: event.participantId,
        kind: existing?.kind ?? 'REMOTE_TAB',
        name: existing?.name ?? '공동 검토자',
        roleLabel: existing?.roleLabel ?? '원격 탭',
        color: existing?.color ?? '#D97706',
        drawingId: event.drawingId,
        pageNum: Math.max(1, Math.floor(event.pageNum)),
        paneSide: event.paneSide ?? existing?.paneSide,
        xPct: clampPercent(event.xPct),
        yPct: clampPercent(event.yPct),
        updatedAt: event.updatedAt,
        pingedAt: event.pingedAt,
        statusMessage: event.statusMessage ?? existing?.statusMessage ?? '위치 Ping 전송',
      },
    };
  }

  return stateMap;
}

export interface FilterVisiblePointersOptions {
  includeLocalPreview?: boolean;
  staleTimeoutMs?: number;
  pingDurationMs?: number;
}

export function filterVisiblePointersForPane(
  participants: Record<string, SharedPointerState> | SharedPointerState[],
  localParticipantId: string,
  drawingId: string,
  pageNum: number,
  nowMs: number,
  options: FilterVisiblePointersOptions = {}
): VisiblePanePointer[] {
  const {
    includeLocalPreview = false,
    staleTimeoutMs = SHARED_POINTER_STALE_MS,
    pingDurationMs = SHARED_PING_DURATION_MS,
  } = options;

  const list = Array.isArray(participants) ? participants : Object.values(participants);

  return list
    .filter((p) => {
      if (!includeLocalPreview && p.participantId === localParticipantId) return false;
      if (p.drawingId !== drawingId || p.pageNum !== pageNum) return false;
      if (nowMs - p.updatedAt > staleTimeoutMs) return false;
      return true;
    })
    .sort((a, b) => a.participantId.localeCompare(b.participantId))
    .map((p) => ({
      ...p,
      isPingActive: Boolean(p.pingedAt && nowMs - p.pingedAt <= pingDurationMs),
    }));
}

export function buildBroadcastMessage(
  sessionId: string,
  senderTabId: string,
  event: SharedSessionEvent
): BroadcastSessionEnvelope {
  return {
    channelTag: 'H042_PDF_SHARED_SESSION',
    sessionId,
    senderTabId,
    event,
  };
}

export function parseBroadcastMessage(
  raw: unknown,
  expectedSessionId: string,
  selfTabId: string
): SharedSessionEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const msg = raw as Partial<BroadcastSessionEnvelope>;
  if (msg.channelTag !== 'H042_PDF_SHARED_SESSION') return null;
  if (msg.sessionId !== expectedSessionId) return null;
  if (!msg.senderTabId || msg.senderTabId === selfTabId) return null;
  if (!msg.event || typeof msg.event !== 'object' || !('type' in msg.event)) return null;
  return msg.event as SharedSessionEvent;
}
