import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeMakerDrawingProfile,
  buildUniversalDiagramMatches,
  classifyDrawingDocument,
  extractCablesFromBoxes,
  extractEquipmentFromBoxes,
} from './universalDrawingAnalyzer.ts';
import { extractEntitiesFromBoxes } from './drawingContentAnalyzer.ts';
import { PdfTextBox } from './pdfLocator.ts';

function box(str: string, xPct: number, yPct: number): PdfTextBox {
  return {
    str,
    xPct,
    yPct,
    leftPct: Math.max(0, xPct - 2),
    topPct: Math.max(0, yPct - 1),
    widthPct: 6,
    heightPct: 2,
  };
}

describe('Universal Drawing Analyzer (Arbitrary Drawings, Equipment, Cables, Maker & Matching)', () => {
  it('auto-classifies arbitrary uploaded drawings into PID, CABLE_SCHEDULE, ELECTRICAL_DIA, and MAKER_DRAWING', () => {
    const makerClass = classifyDrawingDocument({
      drawingId: 'CUSTOM-1',
      displayName: 'Skid_Control_Panel_Rev1.pdf',
      pageBoxes: [
        [
          box('VENDOR: ACME SKID CO.', 20, 10),
          box('TERMINAL BLOCK TB1-01 BY YARD', 20, 25),
          box('SOLENOID BY MAKER', 20, 35),
          box('YARD TAG: 500-PIT-301A MAKER TAG: PT-301', 20, 45),
        ],
      ],
    });
    assert.equal(makerClass.docClass, 'MAKER_DRAWING');
    assert.equal(makerClass.vendorHint, 'ACME SKID CO.');

    const cableSchedClass = classifyDrawingDocument({
      drawingId: 'CUSTOM-2',
      displayName: 'ProjectX_Cable_Schedule_Rev2.pdf',
      pageBoxes: [[box('CABLE NO FROM TO SPEC CORE SIZE', 15, 15)]],
    });
    assert.equal(cableSchedClass.docClass, 'CABLE_SCHEDULE');

    const pidClass = classifyDrawingDocument({
      drawingId: 'CUSTOM-3',
      displayName: 'Process_Area500_PID.pdf',
      pageBoxes: [[box('PIPING & INSTRUMENTATION DIAGRAM', 15, 15)]],
    });
    assert.equal(pidClass.docClass, 'PID');

    const elecClass = classifyDrawingDocument({
      drawingId: 'CUSTOM-4',
      displayName: 'Panel_Wiring_DIA-01.pdf',
      pageBoxes: [[box('BLOCK DIAGRAM ISJB TERMINATION', 15, 15)]],
    });
    assert.equal(elecClass.docClass, 'ELECTRICAL_DIA');
  });

  it('extracts arbitrary equipment tags, categories, and electrical/process ratings', () => {
    const boxes: PdfTextBox[] = [
      box('500-P-301A', 15, 20),
      box('BOOSTER PUMP 132kW 440VAC 60Hz', 35, 20.5),
      box('VFD-101', 15, 40),
      box('VARIABLE FREQUENCY DRIVE 440VAC', 35, 40.3),
      box('TK-201', 15, 60),
      box('GLYCOL STORAGE TANK 50m3/h', 35, 60.2),
    ];

    const records = extractEquipmentFromBoxes(boxes, 'CUSTOM-PID', 1, 'VECTOR');
    assert.equal(records.length, 3);

    const pump = records.find((r) => r.normalizedTag === '500-P-301A');
    assert.ok(pump);
    assert.equal(pump.category, 'PUMP');
    assert.match(pump.ratingSpec, /132kW/);
    assert.match(pump.ratingSpec, /440VAC/);

    const vfd = records.find((r) => r.normalizedTag === 'VFD-101');
    assert.ok(vfd);
    assert.equal(vfd.category, 'PANEL_SKID');

    const tank = records.find((r) => r.normalizedTag === 'TK-201');
    assert.ok(tank);
    assert.equal(tank.category, 'VESSEL_TANK');
  });

  it('extracts arbitrary cable numbers, specs, signal categories, and From/To endpoints', () => {
    const boxes: PdfTextBox[] = [
      box('CBL-501', 12, 25),
      box('2x1.5mm2 TPYC', 28, 25.2),
      box('FROM JB-501 TO TB1-01', 50, 25.1),
      box('IC-1002', 12, 45),
      box('4-20mA ANALOG', 30, 45.2),
      box('500-PIT-301A', 52, 45.1),
      box('LCP-501', 70, 45.0),
      box('PW-901', 12, 65),
      box('3x25mm2 XLPE 440VAC MOTOR', 35, 65.1),
    ];

    const cables = extractCablesFromBoxes(boxes, 'CUSTOM-CBL', 2, 'VECTOR');
    assert.equal(cables.length, 3);

    const cbl501 = cables.find((c) => c.normalizedCableNo === 'CBL-501');
    assert.ok(cbl501);
    assert.match(cbl501.cableSpec, /2x1\.5mm2/i);
    assert.match(cbl501.cableSpec, /TPYC/i);
    assert.equal(cbl501.fromEndpoint, 'JB-501');
    assert.equal(cbl501.toEndpoint, 'TB1-01');

    const ic1002 = cables.find((c) => c.normalizedCableNo === 'IC-1002');
    assert.ok(ic1002);
    assert.equal(ic1002.signalCategory, 'INSTRUMENT_IS');
    assert.equal(ic1002.fromEndpoint, '500-PIT-301A');
    assert.equal(ic1002.toEndpoint, 'LCP-501');

    const pw901 = cables.find((c) => c.normalizedCableNo === 'PW-901');
    assert.ok(pw901);
    assert.equal(pw901.signalCategory, 'POWER');
  });

  it('analyzes Maker/Vendor drawings for Yard-to-Maker mappings, Terminal/IO points, and scope boundaries', () => {
    const makerBoxes: PdfTextBox[] = [
      box('VENDOR: ACME SKID CO.', 20, 10),
      box('POWER SUPPLY: 440VAC 3PH 60Hz / 24VDC', 20, 18),
      box('YARD TAG: 500-PIT-301A MAKER TAG: M-PT301', 20, 28),
      box('TB1-01 AI-01 4-20mA HART BY YARD 500-PIT-301A', 20, 38),
      box('TB1-02 DO-01 24VDC SOLENOID BY MAKER', 20, 48),
      box('HOLD TBD PRESSURE LIMIT', 20, 58),
    ];

    const profile = analyzeMakerDrawingProfile({
      drawingId: 'CUSTOM-MAKER',
      displayName: 'Acme_Skid_Vendor.pdf',
      docClass: 'MAKER_DRAWING',
      vendorHint: 'ACME SKID CO.',
      pageBoxes: [makerBoxes],
    });

    assert.equal(profile.isMakerDrawing, true);
    assert.equal(profile.vendorOrPackageHint, 'ACME SKID CO.');
    assert.ok(profile.powerSpecs.some((p) => p.includes('440VAC')));
    assert.ok(profile.signalStandards.some((s) => s.includes('4-20MA')));
    assert.ok(profile.signalStandards.some((s) => s.includes('HART')));
    assert.ok(
      profile.yardToMakerMappings.some(
        (m) => m.yardTag === '500-PIT-301A' && m.makerTag === 'M-PT301'
      )
    );
    assert.ok(
      profile.interfacePoints.some(
        (pt) => pt.terminalOrPin === 'TB1-01' && pt.scopeOwner === 'BY_YARD' && pt.ioType === 'AI'
      )
    );
    assert.ok(
      profile.interfacePoints.some(
        (pt) => pt.terminalOrPin === 'TB1-02' && pt.scopeOwner === 'BY_MAKER' && pt.ioType === 'DO'
      )
    );
    assert.ok(profile.scopeNotes.some((n) => n.owner === 'HOLD'));
  });

  it('builds universal cross-diagram matches across arbitrary PID and Maker drawings', () => {
    const pidBoxes: PdfTextBox[] = [
      box('500-P-301A', 20, 20),
      box('132kW 440VAC', 35, 20),
      box('500-PIT-301A', 20, 35),
      box('CBL-501', 20, 50),
      box('400-TK-901', 20, 65),
    ];
    const makerBoxes: PdfTextBox[] = [
      box('VENDOR: ACME SKID CO.', 20, 10),
      box('400-P-301A', 20, 20), // variant conflict vs 500-P-301A
      box('CBL-501', 20, 35),
      box('2x1.5mm2 TPYC', 35, 35),
      box('FROM JB-501 TO TB1-01', 55, 35),
      box('YARD TAG: 500-PIT-301A MAKER TAG: M-PT301', 20, 50),
      box('TB1-01 AI-01 4-20mA BY YARD 500-PIT-301A', 20, 60),
    ];

    const pidEntities = extractEntitiesFromBoxes(pidBoxes, 'CUSTOM-PID', 1, 'VECTOR');
    const makerEntities = extractEntitiesFromBoxes(makerBoxes, 'CUSTOM-MAKER', 1, 'VECTOR');
    const pidEquip = extractEquipmentFromBoxes(pidBoxes, 'CUSTOM-PID', 1, 'VECTOR');
    const makerEquip = extractEquipmentFromBoxes(makerBoxes, 'CUSTOM-MAKER', 1, 'VECTOR');
    const pidCables = extractCablesFromBoxes(pidBoxes, 'CUSTOM-PID', 1, 'VECTOR');
    const makerCables = extractCablesFromBoxes(makerBoxes, 'CUSTOM-MAKER', 1, 'VECTOR');

    const makerProfile = analyzeMakerDrawingProfile({
      drawingId: 'CUSTOM-MAKER',
      displayName: 'Acme_Skid_Vendor.pdf',
      docClass: 'MAKER_DRAWING',
      vendorHint: 'ACME SKID CO.',
      pageBoxes: [makerBoxes],
    });

    const profiles = [
      {
        drawingId: 'CUSTOM-PID',
        displayName: 'Area500_PID.pdf',
        docClass: 'PID' as const,
        docClassLabelKo: '배관 계장도 (P&ID)',
        pageCount: 1,
        equipmentCount: pidEquip.length,
        cableCount: pidCables.length,
        tagCount: 1,
        jbCount: 0,
        isMakerDrawing: false,
      },
      {
        drawingId: 'CUSTOM-MAKER',
        displayName: 'Acme_Skid_Vendor.pdf',
        docClass: 'MAKER_DRAWING' as const,
        docClassLabelKo: '메이커 / 벤더 도면',
        pageCount: 1,
        equipmentCount: makerEquip.length,
        cableCount: makerCables.length,
        tagCount: 1,
        jbCount: 0,
        isMakerDrawing: true,
        detectedVendorHint: 'ACME SKID CO.',
      },
    ];

    const matches = buildUniversalDiagramMatches({
      profiles,
      entities: [...pidEntities, ...makerEntities],
      equipmentRecords: [...pidEquip, ...makerEquip],
      cableRecords: [...pidCables, ...makerCables],
      makerProfiles: [makerProfile],
    });

    const pumpConflict = matches.find(
      (m) => m.entityCategory === 'EQUIPMENT' && m.coreKey === 'P-301A'
    );
    assert.ok(pumpConflict);
    assert.equal(pumpConflict.matchStatus, 'VARIANT_CONFLICT');
    assert.equal(pumpConflict.severity, 'CRITICAL');

    const singleTank = matches.find(
      (m) => m.entityCategory === 'EQUIPMENT' && m.coreKey === 'TK-901'
    );
    assert.ok(singleTank);
    assert.equal(singleTank.matchStatus, 'SINGLE_DRAWING_ONLY');

    const makerIfMatch = matches.find(
      (m) => m.entityCategory === 'MAKER_INTERFACE'
    );
    assert.ok(makerIfMatch);
    assert.equal(makerIfMatch.matchStatus, 'UNRESOLVED_ATTENTION');

    // Cross-matched cable when both drawings carry it with spec or attention check
    const cableMatch = matches.find(
      (m) => m.entityCategory === 'CABLE' && m.coreKey === 'CBL-501'
    );
    assert.ok(cableMatch);
    assert.ok(cableMatch.pidOrLayoutDrawings.includes('CUSTOM-PID'));
    assert.ok(cableMatch.makerDrawings.includes('CUSTOM-MAKER'));
  });
});
