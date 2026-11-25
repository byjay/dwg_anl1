import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceSimulatedPeers,
  applySharedSessionEvent,
  buildBroadcastMessage,
  clampPercent,
  createInitialSimulatedPeers,
  filterVisiblePointersForPane,
  parseBroadcastMessage,
  SharedPointerState,
} from './sharedSessionSync.ts';

test('clampPercent normalizes out-of-range and non-finite coordinates cleanly', () => {
  assert.equal(clampPercent(-5.4), 0);
  assert.equal(clampPercent(104.2), 100);
  assert.equal(clampPercent(42.36), 42.4);
  assert.equal(clampPercent(Number.NaN), 50);
});

test('createInitialSimulatedPeers places multiple peers on the same drawing at distinct coordinates', () => {
  const now = 1_700_000_000_000;
  const peers = createInitialSimulatedPeers(
    { drawingId: 'PR-100-PID-0001', pageNum: 13 },
    { drawingId: 'CI-000-DIA-0001', pageNum: 12 },
    now,
    'SPLIT_PANES'
  );

  assert.equal(peers.length, 3);
  const leftPeers = peers.filter(
    (p) => p.drawingId === 'PR-100-PID-0001' && p.pageNum === 13
  );
  assert.equal(leftPeers.length, 2);
  assert.notEqual(leftPeers[0].xPct, leftPeers[1].xPct);
  assert.notEqual(leftPeers[0].yPct, leftPeers[1].yPct);

  const rightPeers = peers.filter(
    (p) => p.drawingId === 'CI-000-DIA-0001' && p.pageNum === 12
  );
  assert.equal(rightPeers.length, 1);
});

test('filterVisiblePointersForPane returns only non-stale peers viewing the exact same drawing and page', () => {
  const now = 2_000_000;
  const state: Record<string, SharedPointerState> = {
    local: {
      participantId: 'local',
      kind: 'LOCAL',
      name: '나',
      roleLabel: '검토자',
      color: '#0F766E',
      drawingId: 'PR-100-PID-0001',
      pageNum: 13,
      xPct: 50,
      yPct: 50,
      updatedAt: now - 100,
    },
    samePagePeer: {
      participantId: 'sim-1',
      kind: 'SIMULATED_PEER',
      name: '김배관',
      roleLabel: '배관설계',
      color: '#0284C7',
      drawingId: 'PR-100-PID-0001',
      pageNum: 13,
      xPct: 25,
      yPct: 35,
      updatedAt: now - 500,
      pingedAt: now - 300,
    },
    differentPagePeer: {
      participantId: 'sim-2',
      kind: 'SIMULATED_PEER',
      name: '이전장',
      roleLabel: '전장설계',
      color: '#7C3AED',
      drawingId: 'PR-100-PID-0001',
      pageNum: 19,
      xPct: 60,
      yPct: 70,
      updatedAt: now - 500,
    },
    stalePeer: {
      participantId: 'remote-stale',
      kind: 'REMOTE_TAB',
      name: '외부탭',
      roleLabel: '원격',
      color: '#D97706',
      drawingId: 'PR-100-PID-0001',
      pageNum: 13,
      xPct: 80,
      yPct: 80,
      updatedAt: now - 25_000,
    },
  };

  const visible = filterVisiblePointersForPane(state, 'local', 'PR-100-PID-0001', 13, now);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].participantId, 'sim-1');
  assert.equal(visible[0].isPingActive, true);
});

test('applySharedSessionEvent is idempotent, prevents stale timestamp rollbacks, and handles leave', () => {
  let state: Record<string, SharedPointerState> = {};

  state = applySharedSessionEvent(state, {
    type: 'cursor:move',
    participantId: 'tab-2',
    name: '외부 검토자',
    drawingId: 'CI-000-DIA-0002',
    pageNum: 24,
    xPct: 44.2,
    yPct: 52.8,
    updatedAt: 1000,
  });

  // Out-of-order older move event must be ignored
  state = applySharedSessionEvent(state, {
    type: 'cursor:move',
    participantId: 'tab-2',
    drawingId: 'CI-000-DIA-0002',
    pageNum: 24,
    xPct: 10,
    yPct: 10,
    updatedAt: 900,
  });
  assert.equal(state['tab-2'].xPct, 44.2);

  // Ping updates pingedAt cleanly
  state = applySharedSessionEvent(state, {
    type: 'cursor:ping',
    participantId: 'tab-2',
    drawingId: 'CI-000-DIA-0002',
    pageNum: 24,
    xPct: 44.2,
    yPct: 52.8,
    pingedAt: 1200,
    updatedAt: 1200,
  });
  assert.equal(state['tab-2'].pingedAt, 1200);

  // Leave removes participant
  state = applySharedSessionEvent(state, {
    type: 'session:leave',
    participantId: 'tab-2',
    updatedAt: 1300,
  });
  assert.equal(state['tab-2'], undefined);
});

test('advanceSimulatedPeers updates waypoints deterministically within bounds', () => {
  let state: Record<string, SharedPointerState> = {};
  state = advanceSimulatedPeers(
    state,
    { drawingId: 'PR-100-PID-0001', pageNum: 1 },
    { drawingId: 'CI-000-DIA-0001', pageNum: 1 },
    2,
    5000,
    'SAME_LEFT'
  );

  const peers = Object.values(state);
  assert.equal(peers.length, 3);
  for (const p of peers) {
    assert.equal(p.drawingId, 'PR-100-PID-0001');
    assert.equal(p.pageNum, 1);
    assert.ok(p.xPct >= 0 && p.xPct <= 100);
    assert.ok(p.yPct >= 0 && p.yPct <= 100);
  }
});

test('BroadcastChannel envelope serializer filters self-echo and mismatched session IDs', () => {
  const envelope = buildBroadcastMessage('H042-SYNC-01', 'tab-A', {
    type: 'cursor:move',
    participantId: 'tab-A',
    drawingId: 'PR-100-PID-0001',
    pageNum: 1,
    xPct: 12.3,
    yPct: 45.6,
    updatedAt: 5000,
  });

  // Self tab ignores own echo
  assert.equal(parseBroadcastMessage(envelope, 'H042-SYNC-01', 'tab-A'), null);
  // Different session ignores message
  assert.equal(parseBroadcastMessage(envelope, 'H042-SYNC-99', 'tab-B'), null);
  // Another tab in same session receives event
  const parsed = parseBroadcastMessage(envelope, 'H042-SYNC-01', 'tab-B');
  assert.ok(parsed && parsed.type === 'cursor:move');
});
