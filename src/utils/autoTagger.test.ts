import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { suggestLoopReferences } from './autoTagger.ts';

describe('Auto-Tagging & Drawing Reference Suggestion Engine', () => {
  it('suggests HP Pump B PSDS drawings, sheets, tags, and NISJB for Booster Pump B shutdown valve', () => {
    const s = suggestLoopReferences('200', 'LNG Booster Pump B Discharge Shutdown Valve');
    assert.equal(s.pidDrawingNo, 'H042-PR-200-PID-0001');
    assert.equal(s.pidSheet, '12/15');
    assert.equal(s.garDrawingNo, 'H042-PD-200-GAR-0001');
    assert.equal(s.electricalSystem, 'PSDS');
    assert.equal(s.electricalDrawingNo, 'H042-CI-000-DIA-0002');
    assert.equal(s.blockSheet, 'H-06');
    assert.equal(s.connectionSheet, '15/23');
    assert.equal(s.suggestedPidTag, 'SDV-112B');
    assert.equal(s.suggestedElectricalTag, '200-SDY-112B / 200-ZSO-112B / 200-ZSC-112B');
    assert.equal(s.suggestedEquipmentTag, '200-P-101B');
    assert.equal(s.suggestedJunctionBox, '200-NISJB-001');
    assert.equal(s.confidence, 'HIGH');
  });

  it('suggests Regastainer Vaporizer C iCAMS drawings and ISJB for flow transmitter service', () => {
    const s = suggestLoopReferences('100', 'Vaporizer C NG Outlet Flow Transmitter');
    assert.equal(s.pidDrawingNo, 'H042-PR-100-PID-0001');
    assert.equal(s.pidSheet, '12/17');
    assert.equal(s.electricalSystem, 'ICAMS');
    assert.equal(s.electricalDrawingNo, 'H042-CI-000-DIA-0001');
    assert.equal(s.blockSheet, 'R-03');
    assert.equal(s.connectionSheet, '3/22');
    assert.equal(s.suggestedPidTag, 'FIT-201C');
    assert.equal(s.suggestedEquipmentTag, '100-E-201C');
    assert.equal(s.suggestedJunctionBox, '100-ISJB-003');
  });

  it('suggests GW Heater 100-E-202A sheet 16/17 and GAR 06/07 for Glycol Water Heater service', () => {
    const s = suggestLoopReferences('100', 'Glycol Water Heater A Outlet Temperature Control Valve');
    assert.equal(s.pidSheet, '16/17');
    assert.equal(s.garSheet, '06/07');
    assert.equal(s.suggestedEquipmentTag, '100-E-202A');
    assert.equal(s.electricalSystem, 'ICAMS');
    assert.equal(s.suggestedPidTag, 'TCV-252A');
    assert.equal(s.suggestedElectricalTag, '100-TCV-252A / 100-TVI-252A');
  });

  it('suggests PSDS H-09 / 23/23 and VJB-101 for HP Pump C vibration sensor', () => {
    const s = suggestLoopReferences('200', 'HP Pump C Motor Vibration Sensor');
    assert.equal(s.pidSheet, '13/15');
    assert.equal(s.electricalSystem, 'PSDS');
    assert.equal(s.blockSheet, 'H-09');
    assert.equal(s.connectionSheet, '23/23');
    assert.equal(s.suggestedJunctionBox, '200-VJB-101');
  });

  it('uses user-supplied rawTag to derive expected electrical tags while preserving unit/service suggestions', () => {
    const s = suggestLoopReferences('200', 'Pump E Strainer Differential Pressure', 'PDIT-111E');
    assert.equal(s.pidSheet, '15/15');
    assert.equal(s.suggestedPidTag, 'PDIT-111E');
    assert.equal(s.suggestedElectricalTag, '200-PDIT-111E');
    assert.equal(s.suggestedJunctionBox, '200-ISJB-005');
  });
});
