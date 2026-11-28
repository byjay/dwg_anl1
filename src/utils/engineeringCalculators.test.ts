import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCableVoltageDrop,
  checkB313PressureTemp,
  convertEngineeringUnit,
  exportDexpiSummaryJson,
  parseConfigurableLineNumber,
  verifyCitationGuardrail,
  verifyIntrinsicSafetyLoop,
} from './engineeringCalculators.ts';
import { H042_LOOP_SEED_DATA } from '../data/h042Dataset.ts';
import { evaluateLoopEntry } from './diagramMatcher.ts';

describe('Engineering Calculators & Standards Engines (Directives #23/#25/#35/#48/#52/#61)', () => {
  it('converts SI and imperial units accurately (bar->kPa, C->K, DN->NPS, kW->HP)', () => {
    const p = convertEngineeringUnit(10, 'bar', 'kPa');
    assert.equal(p.outputValue, 1000);
    assert.equal(p.siCanonicalUnit, 'kPa');

    const t = convertEngineeringUnit(-163, 'C', 'K');
    assert.equal(t.outputValue, 110.15);

    const pipe = convertEngineeringUnit(150, 'DN', 'NPS');
    assert.equal(pipe.outputValue, 6);

    const pwr = convertEngineeringUnit(100, 'HP', 'kW');
    assert.ok(Math.abs(pwr.outputValue - 74.57) < 0.05);
  });

  it('parses configurable line numbers and checks ASME B31.3 P-T rating', () => {
    const parsed = parseConfigurableLineNumber('6"-300-LN-003-ZEA-C80');
    assert.equal(parsed.valid, true);
    assert.equal(parsed.unitCode, '300');
    assert.equal(parsed.fluidCode, 'LN');
    assert.equal(parsed.pipeSpec, 'ZEA');
    assert.equal(parsed.insulationCode, 'C80');

    const okCheck = checkB313PressureTemp('ZEA', 45, -163);
    assert.equal(okCheck.compliant, true);

    const overPressure = checkB313PressureTemp('1GA', 25, 40);
    assert.equal(overPressure.compliant, false);
  });

  it('calculates IEC 60092 3-phase cable voltage drop and ampacity pass/fail', () => {
    const passRes = calculateCableVoltageDrop({
      systemVoltageV: 440,
      phases: 3,
      loadPowerKw: 15,
      powerFactor: 0.85,
      cableLengthM: 60,
      conductorAreaMm2: 16,
      ratedAmpacityA: 85,
      maxAllowedDropPct: 5,
    });
    assert.equal(passRes.overallPass, true);
    assert.ok(passRes.voltageDropPct < 5);

    const failDrop = calculateCableVoltageDrop({
      systemVoltageV: 24,
      phases: 1,
      loadPowerKw: 0.5,
      powerFactor: 1,
      cableLengthM: 120,
      conductorAreaMm2: 1.5,
      ratedAmpacityA: 24,
      maxAllowedDropPct: 5,
    });
    assert.equal(failDrop.dropPass, false);
    assert.equal(failDrop.overallPass, false);
  });

  it('verifies IEC 60079-11 Intrinsic Safety (Ex ia) entity parameters including cable Cc/Lc', () => {
    const passIs = verifyIntrinsicSafetyLoop(
      { uoV: 28, ioMa: 93, poW: 0.65, coNf: 83, loMh: 4.2 },
      { uiV: 30, iiMa: 100, piW: 0.75, ciNf: 12, liMh: 0.1 },
      { lengthM: 150, ccNfPerM: 0.2, lcMhPerM: 0.001 }
    );
    assert.equal(passIs.compliant, true);

    const failCap = verifyIntrinsicSafetyLoop(
      { uoV: 28, ioMa: 93, poW: 0.65, coNf: 83, loMh: 4.2 },
      { uiV: 30, iiMa: 100, piW: 0.75, ciNf: 20, liMh: 0.1 },
      { lengthM: 400, ccNfPerM: 0.2, lcMhPerM: 0.001 }
    );
    assert.equal(failCap.compliant, false);
    assert.equal(failCap.checks[3].pass, false);
  });

  it('audits citation guardrail compliance and exports valid DEXPI 2.0.1 JSON', () => {
    const citation = verifyCitationGuardrail([
      {
        trackId: 't1',
        trackName: 'Track 1',
        moduleCode: '100',
        drawingIds: ['CI-000-DIA-0001'],
        status: 'COMPLETED',
        durationMs: 100,
        findings: [
          {
            tag: '100-SDV-254A',
            severity: 'CRITICAL',
            category: 'CABLE_MISSING',
            finding: 'Missing cable',
            sourceEvidence: 'PD-100-GAR-0001 Sheet 03/07',
            recommendation: 'Assign cable',
          },
          {
            tag: '200-NO-REF',
            severity: 'WARNING',
            category: 'OTHER',
            finding: 'Ungrounded guess',
            sourceEvidence: 'unknown',
            recommendation: 'Verify',
          },
        ],
      },
    ]);
    assert.equal(citation.totalFindings, 2);
    assert.equal(citation.groundedCount, 1);
    assert.equal(citation.ungroundedCount, 1);

    const evaluated = H042_LOOP_SEED_DATA.slice(0, 3).map(evaluateLoopEntry);
    const json = exportDexpiSummaryJson(evaluated);
    const parsed = JSON.parse(json);
    assert.equal(parsed.schema, 'DEXPI-2.0.1-CFIHOS-Bridge');
    assert.equal(parsed.ProcessInstrumentationFunctions.length, 3);
  });
});
