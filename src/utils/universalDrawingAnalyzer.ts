import {
  CableSignalCategory,
  DiscrepancySeverity,
  DrawingDocumentClass,
  DrawingDocumentProfile,
  EquipmentCategory,
  ExtractedCableRecord,
  ExtractedEquipmentRecord,
  ExtractedPdfEntity,
  MakerDrawingProfile,
  MakerInterfacePoint,
  UniversalDiagramMatchItem,
} from '../types/diagram';
import { PdfTextBox } from './pdfLocator';

const DOC_CLASS_LABELS: Record<DrawingDocumentClass, string> = {
  PID: '배관 계장도 (P&ID)',
  GAR_LAYOUT: '배치도 / 마크업 (GAR)',
  ELECTRICAL_DIA: '전장·결선 다이어그램',
  CABLE_SCHEDULE: '케이블 스케줄 / 리스트',
  MAKER_DRAWING: '메이커 / 벤더 도면',
  UNKNOWN: '일반 도면',
};

const GENERAL_EQUIP_RE =
  /\b(?:(?:\d{1,4}|[A-Z]\d)-)?(P|PU|PUMP|E|HX|HE|V|TK|T|K|C|COMP|M|MTR|FAN|BL|SKID|PKG|VFD|MCC|UCP|LCP|SWBD|TR)-(\d{2,4}[A-Z0-9]{0,3})\b/gi;

const GENERAL_CABLE_RE =
  /\b(?:[RH][CSEV]\d{3,5}[A-Z]?|FR-[A-Z0-9-]{3,}|[RH][CS]\*{2,4}|(?:CBL|CAB|WIR|IC|PW|CTL|SIG|EM|LV|HV|MV|FD|TRK|PNL)-[A-Z0-9-]{2,14}|\d{1,3}-(?:IC|PW|CBL|EL|MV|LV)-\d{2,5}[A-Z]?|NO\.?\s*T\.?B\.?D\.?)\b/gi;

const CABLE_SPEC_RE =
  /\b(?:\d{1,2}\s*[CPx×]\s*[x×]?\s*\d+(?:\.\d+)?\s*(?:mm2|mm²|sq|SQ|AWG)|(?:TPYC|MPYC|DPYC|FPYC|MPR|TPY|XLPE|EPR|SHF\d?)(?:-[A-Z0-9.]+)?)\b/gi;

const RATING_SPEC_RE =
  /\b(?:\d+(?:\.\d+)?\s*(?:kW|MW|HP|VAC|VDC|kV|V|Hz|RPM|m3\/h|m³\/h|barg?|kPa|MPa|°C|A)\b)/gi;

const TERMINAL_RE =
  /\b(?:TB\d{1,3}[-:]\d{1,3}[A-Z]?|X\d{1,3}[-:]\d{1,3}|J\d{1,2}[-:]\d{1,3}|(?:AI|AO|DI|DO)-\d{1,3})\b/gi;

const POWER_STD_RE =
  /\b(?:\d{2,3}\s*V(?:AC|DC)?(?:\s*\/\s*\d{1,2}PH)?(?:\s*\d{2}Hz)?|3PH|1PH|24VDC|110VAC|220VAC|230VAC|440VAC|690VAC)\b/gi;

const SIGNAL_STD_RE =
  /\b(?:4\s*-\s*20\s*mA|4~20mA|HART|MODBUS(?:\s*(?:RTU|TCP))?|PROFIBUS|PROFINET|DRY\s*CONTACT|POTENTIAL\s*FREE|NO\/NC|RTD|PT100|NAMUR|RS-?485|ETHERNET)\b/gi;

const TAG_TOKEN_RE =
  /\b(?:\d{1,4}-|[A-Z]\d-)?(?:PD?IT|PEIT|TIT|FIT|LIT|LIC|TIC|PIC|FIC|AIC|TI|PI|FI|LI|TG|PG|SDV|SDY|BDV|ESV|XV|XY|MOV|SOV|FCV|TCV|PCV|LCV|RV|PSV|PRV|UV|UY|ZSO|ZSC|ZS|UZSO|UZSC|HS|GD|FD|VE|VT|PSHH|PSLL|PSL|PSH|LSHH|LSLL|TSHH|TSLL|PMSD)-[A-Z0-9_/-]{2,14}\b/gi;

const JB_OR_PANEL_RE =
  /\b(?:\d{1,4}-)?(?:N?IS|V|GD|LCP|UCP|VCP|MCC|RIO|PLC|TR)?(?:JB|TB|CP|PNL|CAB|RIO|PLC|MCC)-[A-Z0-9-]{1,10}\b/gi;

export function getDocClassLabelKo(docClass: DrawingDocumentClass): string {
  return DOC_CLASS_LABELS[docClass];
}

export function classifyDrawingDocument(params: {
  drawingId: string;
  displayName: string;
  pageBoxes: PdfTextBox[][];
  hintRole?: 'PID_GAR' | 'ELECTRICAL_DIA' | 'CABLE_SCHEDULE' | 'MAKER_VENDOR' | 'AUTO';
}): { docClass: DrawingDocumentClass; vendorHint?: string } {
  const { drawingId, displayName, pageBoxes, hintRole } = params;
  if (hintRole === 'MAKER_VENDOR') {
    return { docClass: 'MAKER_DRAWING', vendorHint: detectVendorHint(displayName, pageBoxes) };
  }
  if (hintRole === 'CABLE_SCHEDULE') {
    return { docClass: 'CABLE_SCHEDULE' };
  }
  if (hintRole === 'PID_GAR') {
    const upper = `${drawingId} ${displayName}`.toUpperCase();
    return { docClass: upper.includes('GAR') ? 'GAR_LAYOUT' : 'PID' };
  }
  if (hintRole === 'ELECTRICAL_DIA') {
    return { docClass: 'ELECTRICAL_DIA' };
  }

  const combinedName = `${drawingId} ${displayName}`.toUpperCase();
  const sampleText = pageBoxes
    .slice(0, 8)
    .flat()
    .map((b) => b.str.trim())
    .join(' ')
    .toUpperCase();

  // Explicit filename cues first
  if (
    combinedName.includes('MAKER') ||
    combinedName.includes('VENDOR') ||
    combinedName.includes('SUPPLIER') ||
    combinedName.includes('VDR')
  ) {
    return {
      docClass: 'MAKER_DRAWING',
      vendorHint: detectVendorHint(displayName, pageBoxes),
    };
  }
  if (combinedName.includes('CABLE') && (combinedName.includes('LIST') || combinedName.includes('SCHED'))) {
    return { docClass: 'CABLE_SCHEDULE' };
  }
  if (combinedName.includes('PID') || combinedName.includes('P&ID')) {
    return { docClass: 'PID' };
  }
  if (combinedName.includes('GAR') || combinedName.includes('ARRANGEMENT')) {
    return { docClass: 'GAR_LAYOUT' };
  }
  if (combinedName.includes('DIA-') || combinedName.includes('WIRING') || combinedName.includes('LOOP')) {
    return { docClass: 'ELECTRICAL_DIA' };
  }

  // Content-based scoring
  const makerSignals = [
    'VENDOR',
    'MAKER',
    'SUPPLIER',
    'BUYER TAG',
    'YARD TAG',
    'CUSTOMER TAG',
    'TERMINAL BLOCK',
    'BY YARD',
    'BY MAKER',
    'BY VENDOR',
    'FOR APPROVAL',
    'PACKAGE',
    'SKID',
    'CONTROL PANEL',
    'LCP',
    'UCP',
    'VFD',
    'PART NO',
    'MODEL NO',
  ];
  const makerHits = makerSignals.filter((kw) => sampleText.includes(kw)).length;

  const cableSchedSignals = ['CABLE NO', 'CABLE LIST', 'CABLE SCHEDULE', 'FROM', 'TO', 'SPEC', 'CORE', 'SIZE', 'LENGTH'];
  const cableSchedHits = cableSchedSignals.filter((kw) => sampleText.includes(kw)).length;

  const pidSignals = ['PIPING', 'INSTRUMENT', 'P&ID', 'LINE NO', 'SPEC BREAK'];
  const pidHits = pidSignals.filter((kw) => sampleText.includes(kw)).length;

  const elecSignals = ['BLOCK DIAGRAM', 'CONNECTION', 'TERMINATION', 'ISJB', 'NISJB', 'PSDS', 'ICAMS', 'RELAY', 'MARSHAL'];
  const elecHits = elecSignals.filter((kw) => sampleText.includes(kw)).length;

  const garSignals = ['GENERAL ARRANGEMENT', 'MARK A', 'MARK B', 'MARK C', 'DECK', 'PLAN VIEW', 'ELEVATION'];
  const garHits = garSignals.filter((kw) => sampleText.includes(kw)).length;

  if (makerHits >= 3) {
    return { docClass: 'MAKER_DRAWING', vendorHint: detectVendorHint(displayName, pageBoxes) };
  }
  if (cableSchedHits >= 4) {
    return { docClass: 'CABLE_SCHEDULE' };
  }
  if (elecHits >= 2) {
    return { docClass: 'ELECTRICAL_DIA' };
  }
  if (garHits >= 2) {
    return { docClass: 'GAR_LAYOUT' };
  }
  if (pidHits >= 1) {
    return { docClass: 'PID' };
  }

  // Heuristic fallback on extracted token distribution
  const flat = pageBoxes.slice(0, 5).flat().map((b) => b.str);
  const joined = flat.join(' ');
  const cableCount = (joined.match(GENERAL_CABLE_RE) || []).length;
  const specCount = (joined.match(CABLE_SPEC_RE) || []).length;
  const termCount = (joined.match(TERMINAL_RE) || []).length;
  if (specCount >= 4 && cableCount >= 4) return { docClass: 'CABLE_SCHEDULE' };
  if (termCount >= 4 || makerHits >= 2) {
    return { docClass: 'MAKER_DRAWING', vendorHint: detectVendorHint(displayName, pageBoxes) };
  }
  if (cableCount >= 4) return { docClass: 'ELECTRICAL_DIA' };
  return { docClass: 'PID' };
}

function detectVendorHint(displayName: string, pageBoxes: PdfTextBox[][]): string | undefined {
  const flat = pageBoxes
    .slice(0, 3)
    .flat()
    .map((b) => b.str.trim())
    .filter(Boolean);

  for (const line of flat) {
    const m = line.match(/(?:VENDOR|MAKER|SUPPLIER|MANUFACTURER)\s*[:\-]\s*([A-Za-z0-9 &.,-]{3,40})/i);
    if (m) return m[1].trim();
  }
  for (const line of flat) {
    const m = line.match(/\b([A-Z][A-Za-z0-9&-]{2,25}\s+(?:PUMP|COMPRESSOR|SKID|PACKAGE|SYSTEM|PANEL|VALVE|CORP|CO\.|LTD|GMBH|INC))\b/i);
    if (m) return m[1].trim();
  }
  const cleanName = displayName.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();
  return cleanName || undefined;
}

function inferEquipmentCategory(prefix: string, context: string): EquipmentCategory {
  const p = prefix.toUpperCase();
  const c = context.toUpperCase();
  if (p === 'P' || p === 'PU' || p === 'PUMP' || c.includes('PUMP')) return 'PUMP';
  if (p === 'E' || p === 'HX' || p === 'HE' || c.includes('HEATER') || c.includes('VAPORIZER') || c.includes('EXCHANGER')) {
    return 'HEAT_EXCHANGER';
  }
  if (p === 'V' || p === 'TK' || p === 'T' || c.includes('TANK') || c.includes('VESSEL') || c.includes('DRUM') || c.includes('POT')) {
    return 'VESSEL_TANK';
  }
  if (p === 'K' || p === 'C' || p === 'COMP' || p === 'FAN' || p === 'BL' || c.includes('COMPRESSOR') || c.includes('BLOWER')) {
    return 'COMPRESSOR';
  }
  if (p === 'M' || p === 'MTR' || c.includes('MOTOR')) return 'MOTOR';
  if (p === 'SKID' || p === 'PKG' || p === 'VFD' || p === 'MCC' || p === 'UCP' || p === 'LCP' || p === 'SWBD' || p === 'TR') {
    return 'PANEL_SKID';
  }
  return 'OTHER';
}

function groupBoxesIntoSpatialRows(boxes: PdfTextBox[], yTolerancePct = 2.0): PdfTextBox[][] {
  if (boxes.length === 0) return [];
  const sorted = [...boxes].sort((a, b) => a.yPct - b.yPct || a.xPct - b.xPct);
  const rows: PdfTextBox[][] = [];

  for (const box of sorted) {
    const lastRow = rows[rows.length - 1];
    if (lastRow && Math.abs(lastRow[0].yPct - box.yPct) <= yTolerancePct) {
      lastRow.push(box);
    } else {
      rows.push([box]);
    }
  }

  for (const row of rows) {
    row.sort((a, b) => a.xPct - b.xPct);
  }
  return rows;
}

/**
 * Extracts structured equipment records (tag, type, electrical/process ratings, description)
 * from arbitrary piping, GA, or vendor PDFs.
 */
export function extractEquipmentFromBoxes(
  boxes: PdfTextBox[],
  drawingId: string,
  pageNum: number,
  source: 'VECTOR' | 'OCR'
): ExtractedEquipmentRecord[] {
  const results: ExtractedEquipmentRecord[] = [];
  const seen = new Set<string>();
  const rows = groupBoxesIntoSpatialRows(boxes, 2.4);

  for (const row of rows) {
    const rowText = row.map((b) => b.str.trim()).filter(Boolean).join(' ');
    for (const box of row) {
      const str = box.str.trim();
      if (!str) continue;

      for (const m of str.matchAll(GENERAL_EQUIP_RE)) {
        const fullTag = m[0].toUpperCase();
        const prefix = (m[1] || '').toUpperCase();

        // Guard against matching piping line segments (e.g. inside 6"-200-LN-111) or cable specs
        const fullIdx = str.toUpperCase().indexOf(fullTag);
        const charBefore = fullIdx > 0 ? str[fullIdx - 1] : '';
        if (charBefore === '"' || charBefore === '”') continue;
        // Skip E-100-MCC style cable fragments
        if (str.toUpperCase().includes(`FR-${fullTag}`) || str.toUpperCase().includes(`${fullTag}-MCC`)) continue;

        const key = `${fullTag}:${Math.round(box.xPct / 3)}:${Math.round(box.yPct / 3)}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const nearbyText = boxes
          .filter(
            (nb) =>
              Math.abs(nb.yPct - box.yPct) <= 4.5 &&
              Math.abs(nb.xPct - box.xPct) <= 28
          )
          .map((nb) => nb.str.trim())
          .join(' ');

        const ratings = Array.from(
          new Set((`${rowText} ${nearbyText}`.match(RATING_SPEC_RE) || []).map((r) => r.trim()))
        ).slice(0, 4);

        const descCandidate = rowText
          .replace(fullTag, '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 110);

        results.push({
          id: `EQ-${drawingId}-P${pageNum}-${results.length + 1}`,
          drawingId,
          pageNum,
          tag: m[0],
          normalizedTag: fullTag,
          category: inferEquipmentCategory(prefix, `${rowText} ${nearbyText}`),
          ratingSpec: ratings.join(' · ') || '-',
          description: descCandidate || `${fullTag} (${prefix})`,
          xPct: box.xPct,
          yPct: box.yPct,
          source,
        });
      }
    }
  }

  return results;
}

function classifyCableSignal(cableNo: string, rowText: string): CableSignalCategory {
  const c = cableNo.toUpperCase();
  const r = rowText.toUpperCase();
  if (c.includes('****') || c.includes('TBD')) return 'UNASSIGNED';
  if (c.startsWith('PW') || c.startsWith('HV') || c.startsWith('LV') || c.startsWith('FR-') || r.includes('440V') || r.includes('POWER') || r.includes('MOTOR')) {
    return 'POWER';
  }
  if (r.includes('MODBUS') || r.includes('PROFIBUS') || r.includes('RS485') || r.includes('ETHERNET') || r.includes('COMM')) {
    return 'COMM_BUS';
  }
  if (c.startsWith('RS') || c.startsWith('RC') || c.startsWith('IC') || c.startsWith('SIG') || r.includes('4-20MA') || r.includes('ISJB') || r.includes('ANALOG')) {
    return 'INSTRUMENT_IS';
  }
  return 'CONTROL';
}

/**
 * Extracts structured cable schedule / diagram records (cable number, cable spec/core size,
 * signal type, and inferred From/To endpoints) from spatial rows on a PDF page.
 */
export function extractCablesFromBoxes(
  boxes: PdfTextBox[],
  drawingId: string,
  pageNum: number,
  source: 'VECTOR' | 'OCR'
): ExtractedCableRecord[] {
  const results: ExtractedCableRecord[] = [];
  const seen = new Set<string>();
  const rows = groupBoxesIntoSpatialRows(boxes, 2.0);

  for (const row of rows) {
    const rowText = row.map((b) => b.str.trim()).filter(Boolean).join(' ');
    for (const box of row) {
      const str = box.str.trim();
      if (!str) continue;

      for (const m of str.matchAll(GENERAL_CABLE_RE)) {
        const rawCable = m[0].trim();
        const normCable = rawCable.toUpperCase().replace(/\s+/g, '');
        if (normCable.length < 3) continue;

        const key = `${normCable}:${Math.round(box.xPct / 2)}:${Math.round(box.yPct / 2)}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const specs = Array.from(
          new Set((rowText.match(CABLE_SPEC_RE) || []).map((s) => s.trim()))
        );

        // Infer From / To endpoints from other tokens on the same row (JBs, Panels, Equipment, Tags)
        const endpointCandidates: string[] = [];
        const addEp = (val: string) => {
          const clean = val.trim().toUpperCase();
          if (clean && clean !== normCable && !endpointCandidates.includes(clean)) {
            endpointCandidates.push(clean);
          }
        };

        for (const epMatch of rowText.matchAll(JB_OR_PANEL_RE)) addEp(epMatch[0]);
        for (const tagMatch of rowText.matchAll(TAG_TOKEN_RE)) addEp(tagMatch[0]);
        for (const eqMatch of rowText.matchAll(GENERAL_EQUIP_RE)) addEp(eqMatch[0]);

        // Also check explicit "FROM X TO Y" phrasing
        let fromEndpoint = endpointCandidates[0] || '';
        let toEndpoint = endpointCandidates[1] || '';
        const fromToMatch = rowText.match(/FROM\s+([A-Z0-9_/-]{3,24})\s+TO\s+([A-Z0-9_/-]{3,24})/i);
        if (fromToMatch) {
          fromEndpoint = fromToMatch[1].toUpperCase();
          toEndpoint = fromToMatch[2].toUpperCase();
        } else if (!fromEndpoint) {
          const otherSpans = row
            .map((b) => b.str.trim())
            .filter((t) => t && !t.toUpperCase().includes(normCable) && !CABLE_SPEC_RE.test(t));
          CABLE_SPEC_RE.lastIndex = 0;
          if (otherSpans.length >= 2) {
            fromEndpoint = otherSpans[0].slice(0, 28);
            toEndpoint = otherSpans[otherSpans.length - 1].slice(0, 28);
          } else if (otherSpans.length === 1) {
            fromEndpoint = otherSpans[0].slice(0, 28);
          }
        }

        results.push({
          id: `CBL-${drawingId}-P${pageNum}-${results.length + 1}`,
          drawingId,
          pageNum,
          cableNo: rawCable,
          normalizedCableNo: normCable,
          cableSpec: specs.join(' / ') || '-',
          signalCategory: classifyCableSignal(rawCable, rowText),
          fromEndpoint: fromEndpoint || '-',
          toEndpoint: toEndpoint || '-',
          xPct: box.xPct,
          yPct: box.yPct,
          source,
        });
      }
    }
  }

  return results;
}

/**
 * Analyzes Maker / Vendor drawings (control panels, skids, terminal wiring diagrams, datasheets)
 * to extract Terminal/IO interfaces, Yard-to-Maker tag mappings, power/signal standards, and battery-limit scope notes.
 */
export function analyzeMakerDrawingProfile(params: {
  drawingId: string;
  displayName: string;
  docClass: DrawingDocumentClass;
  vendorHint?: string;
  pageBoxes: PdfTextBox[][];
}): MakerDrawingProfile {
  const { drawingId, displayName, docClass, vendorHint, pageBoxes } = params;
  const powerSet = new Set<string>();
  const signalSet = new Set<string>();
  const interfacePoints: MakerInterfacePoint[] = [];
  const yardToMakerMappings: MakerDrawingProfile['yardToMakerMappings'] = [];
  const scopeNotes: MakerDrawingProfile['scopeNotes'] = [];
  const seenIf = new Set<string>();
  const seenMap = new Set<string>();
  const seenScope = new Set<string>();

  let makerKeywordHits = 0;

  pageBoxes.forEach((boxes, idx) => {
    const pageNum = idx + 1;
    const rows = groupBoxesIntoSpatialRows(boxes, 2.0);

    for (const row of rows) {
      const rowText = row.map((b) => b.str.trim()).filter(Boolean).join(' ');
      if (!rowText) continue;
      const upper = rowText.toUpperCase();

      if (
        upper.includes('BY YARD') ||
        upper.includes('BY MAKER') ||
        upper.includes('BY VENDOR') ||
        upper.includes('YARD TAG') ||
        upper.includes('MAKER TAG') ||
        upper.includes('BUYER TAG') ||
        upper.includes('TERMINAL BLOCK') ||
        upper.includes('VENDOR') ||
        upper.includes('SUPPLIER')
      ) {
        makerKeywordHits += 1;
      }

      for (const pm of rowText.matchAll(POWER_STD_RE)) {
        powerSet.add(pm[0].toUpperCase().replace(/\s+/g, ''));
      }
      for (const sm of rowText.matchAll(SIGNAL_STD_RE)) {
        signalSet.add(sm[0].toUpperCase().replace(/\s+/g, ' '));
      }

      // Scope & battery limit notes
      const scopeOwner: 'BY_YARD' | 'BY_MAKER' | 'INTERFACE' | 'HOLD' | null =
        upper.includes('BY YARD') || upper.includes('YARD SCOPE')
          ? 'BY_YARD'
          : upper.includes('BY MAKER') || upper.includes('BY VENDOR') || upper.includes('VENDOR SUPPLY')
            ? 'BY_MAKER'
            : upper.includes('BATTERY LIMIT') || upper.includes('INTERFACE')
              ? 'INTERFACE'
              : upper.includes('HOLD') || upper.includes('T.B.D')
                ? 'HOLD'
                : null;

      if (scopeOwner && scopeNotes.length < 40) {
        const key = `${scopeOwner}:${upper.slice(0, 60)}`;
        if (!seenScope.has(key)) {
          seenScope.add(key);
          scopeNotes.push({
            owner: scopeOwner,
            text: rowText.slice(0, 140),
            pageNum,
            xPct: row[0].xPct,
            yPct: row[0].yPct,
          });
        }
      }

      // Yard Tag <-> Maker Tag crosswalk detection on the same row
      const explicitPair = rowText.match(
        /(?:YARD|BUYER|CLIENT)\s*(?:TAG)?\s*[:=]?\s*([A-Z0-9-]{4,18}).*?(?:MAKER|VENDOR|SUPPLIER)\s*(?:TAG)?\s*[:=]?\s*([A-Z0-9-]{3,18})/i
      );
      if (explicitPair) {
        const yardTag = explicitPair[1].toUpperCase();
        const makerTag = explicitPair[2].toUpperCase();
        const key = `${yardTag}->${makerTag}`;
        if (!seenMap.has(key)) {
          seenMap.add(key);
          yardToMakerMappings.push({
            yardTag,
            makerTag,
            pageNum,
            context: rowText.slice(0, 120),
            xPct: row[0].xPct,
            yPct: row[0].yPct,
          });
        }
      } else {
        // Also pair a 3-digit Yard tag (e.g. 200-PIT-101) with an unprefixed Maker tag (e.g. PT-101 or M-PT01) on the same row
        const rowTags = Array.from(rowText.matchAll(TAG_TOKEN_RE)).map((m) => m[0].toUpperCase());
        const yardCandidates = rowTags.filter((t) => /^\d{3}-/.test(t));
        const makerCandidates = rowTags.filter((t) => !/^\d{3}-/.test(t));
        if (yardCandidates.length > 0 && makerCandidates.length > 0) {
          const yardTag = yardCandidates[0];
          const makerTag = makerCandidates[0];
          if (yardTag !== makerTag && !yardTag.endsWith(makerTag)) {
            const key = `${yardTag}->${makerTag}`;
            if (!seenMap.has(key)) {
              seenMap.add(key);
              yardToMakerMappings.push({
                yardTag,
                makerTag,
                pageNum,
                context: rowText.slice(0, 120),
                xPct: row[0].xPct,
                yPct: row[0].yPct,
              });
            }
          }
        }
      }

      // Terminal & I/O Interface points
      for (const tm of rowText.matchAll(TERMINAL_RE)) {
        const terminalOrPin = tm[0].toUpperCase();
        const ifKey = `${pageNum}:${terminalOrPin}`;
        if (seenIf.has(ifKey)) continue;
        seenIf.add(ifKey);

        const ioType: MakerInterfacePoint['ioType'] =
          terminalOrPin.startsWith('AI') || upper.includes('4-20MA') || upper.includes('RTD')
            ? 'AI'
            : terminalOrPin.startsWith('AO')
              ? 'AO'
              : terminalOrPin.startsWith('DI') || upper.includes('NO/NC') || upper.includes('DRY CONTACT')
                ? 'DI'
                : terminalOrPin.startsWith('DO') || upper.includes('SOLENOID') || upper.includes('TRIP')
                  ? 'DO'
                  : upper.includes('MODBUS') || upper.includes('PROFIBUS') || upper.includes('RS485')
                    ? 'COMM'
                    : upper.includes('24VDC') || upper.includes('220VAC') || upper.includes('440VAC') || upper.includes('POWER')
                      ? 'POWER'
                      : 'INTERLOCK';

        const rowTags = Array.from(rowText.matchAll(TAG_TOKEN_RE)).map((m) => m[0].toUpperCase());
        const yardTagRef = rowTags.find((t) => /^\d{3}-/.test(t));
        const makerTagRef = rowTags.find((t) => !/^\d{3}-/.test(t));
        const sigs = Array.from(rowText.matchAll(SIGNAL_STD_RE)).map((m) => m[0]);
        const pwr = Array.from(rowText.matchAll(POWER_STD_RE)).map((m) => m[0]);

        interfacePoints.push({
          id: `MIF-${drawingId}-P${pageNum}-${interfacePoints.length + 1}`,
          drawingId,
          pageNum,
          terminalOrPin,
          ioType,
          signalDetail: [...sigs, ...pwr].join(' · ') || ioType,
          yardTagRef,
          makerTagRef,
          scopeOwner:
            scopeOwner === 'BY_YARD' || scopeOwner === 'BY_MAKER' || scopeOwner === 'INTERFACE'
              ? scopeOwner
              : 'UNSPECIFIED',
          rawContext: rowText.slice(0, 120),
          xPct: row[0].xPct,
          yPct: row[0].yPct,
        });
      }
    }
  });

  const isMakerDrawing =
    docClass === 'MAKER_DRAWING' ||
    makerKeywordHits >= 2 ||
    yardToMakerMappings.length > 0 ||
    interfacePoints.length >= 2;

  return {
    drawingId,
    displayName,
    docClass,
    isMakerDrawing,
    vendorOrPackageHint: vendorHint || displayName,
    powerSpecs: Array.from(powerSet),
    signalStandards: Array.from(signalSet),
    yardToMakerMappings,
    interfacePoints: interfacePoints.slice(0, 80),
    scopeNotes,
  };
}

function deriveUniversalCoreKey(category: UniversalDiagramMatchItem['entityCategory'], raw: string): string {
  const upper = raw.trim().toUpperCase().replace(/\s+/g, '-');
  if (category === 'EQUIPMENT' || category === 'INSTRUMENT_TAG') {
    return upper.replace(/^(?:\d{1,4}|[A-Z]\d)-/, '');
  }
  return upper;
}

/**
 * Matches extracted Tags, Equipment, Cables, Junction Boxes, and Maker Interfaces
 * across ANY set of analyzed drawings (H042 or newly uploaded arbitrary/maker drawings).
 */
export function buildUniversalDiagramMatches(params: {
  profiles: DrawingDocumentProfile[];
  entities: ExtractedPdfEntity[];
  equipmentRecords: ExtractedEquipmentRecord[];
  cableRecords: ExtractedCableRecord[];
  makerProfiles: MakerDrawingProfile[];
}): UniversalDiagramMatchItem[] {
  const { profiles, entities, equipmentRecords, cableRecords, makerProfiles } = params;
  const profileMap = new Map<string, DrawingDocumentProfile>(
    profiles.map((p) => [p.drawingId, p])
  );

  // Build spatial lookup of cables and equipment by drawingId + pageNum for fast association
  const cablesByPage = new Map<string, ExtractedCableRecord[]>();
  for (const c of cableRecords) {
    const k = `${c.drawingId}:${c.pageNum}`;
    const arr = cablesByPage.get(k) || [];
    arr.push(c);
    cablesByPage.set(k, arr);
  }

  const equipByPage = new Map<string, ExtractedEquipmentRecord[]>();
  for (const eq of equipmentRecords) {
    const k = `${eq.drawingId}:${eq.pageNum}`;
    const arr = equipByPage.get(k) || [];
    arr.push(eq);
    equipByPage.set(k, arr);
  }

  type Bucket = {
    coreKey: string;
    entityCategory: UniversalDiagramMatchItem['entityCategory'];
    variants: Set<string>;
    pidDrawings: Set<string>;
    elecDrawings: Set<string>;
    makerDrawings: Set<string>;
    allDrawings: Set<string>;
    linkedCables: Set<string>;
    linkedEquip: Set<string>;
    attentionReasons: string[];
    primaryJump: UniversalDiagramMatchItem['primaryJump'];
  };

  const buckets = new Map<string, Bucket>();

  const registerOccurrence = (opts: {
    entityCategory: UniversalDiagramMatchItem['entityCategory'];
    normalized: string;
    rawText: string;
    drawingId: string;
    pageNum: number;
    xPct: number;
    yPct: number;
    attentionNote?: string;
    extraCable?: string;
    extraEquip?: string;
  }) => {
    const coreKey = deriveUniversalCoreKey(opts.entityCategory, opts.normalized);
    if (coreKey.length < 3) return;
    const bucketKey = `${opts.entityCategory}::${coreKey}`;
    let b = buckets.get(bucketKey);
    if (!b) {
      b = {
        coreKey,
        entityCategory: opts.entityCategory,
        variants: new Set(),
        pidDrawings: new Set(),
        elecDrawings: new Set(),
        makerDrawings: new Set(),
        allDrawings: new Set(),
        linkedCables: new Set(),
        linkedEquip: new Set(),
        attentionReasons: [],
        primaryJump: {
          drawingId: opts.drawingId,
          pageNum: opts.pageNum,
          rawText: opts.rawText,
          xPct: opts.xPct,
          yPct: opts.yPct,
        },
      };
      buckets.set(bucketKey, b);
    }

    b.variants.add(opts.normalized);
    b.allDrawings.add(opts.drawingId);

    const prof = profileMap.get(opts.drawingId);
    const docClass = prof?.docClass || 'PID';
    if (docClass === 'MAKER_DRAWING' || prof?.isMakerDrawing) {
      b.makerDrawings.add(opts.drawingId);
    } else if (docClass === 'ELECTRICAL_DIA' || docClass === 'CABLE_SCHEDULE') {
      b.elecDrawings.add(opts.drawingId);
    } else {
      b.pidDrawings.add(opts.drawingId);
    }

    if (opts.extraCable) b.linkedCables.add(opts.extraCable);
    if (opts.extraEquip) b.linkedEquip.add(opts.extraEquip);
    if (opts.attentionNote && !b.attentionReasons.includes(opts.attentionNote)) {
      b.attentionReasons.push(opts.attentionNote);
    }

    // Associate nearby cables and equipment on the same page
    const pageKey = `${opts.drawingId}:${opts.pageNum}`;
    for (const c of cablesByPage.get(pageKey) || []) {
      if (Math.abs(c.yPct - opts.yPct) <= 2.5 || c.fromEndpoint.includes(coreKey) || c.toEndpoint.includes(coreKey)) {
        b.linkedCables.add(c.normalizedCableNo);
      }
    }
    for (const eq of equipByPage.get(pageKey) || []) {
      if (Math.abs(eq.yPct - opts.yPct) <= 3.0 && Math.abs(eq.xPct - opts.xPct) <= 25) {
        b.linkedEquip.add(eq.normalizedTag);
      }
    }
  };

  for (const eq of equipmentRecords) {
    registerOccurrence({
      entityCategory: 'EQUIPMENT',
      normalized: eq.normalizedTag,
      rawText: eq.tag,
      drawingId: eq.drawingId,
      pageNum: eq.pageNum,
      xPct: eq.xPct,
      yPct: eq.yPct,
      attentionNote: eq.normalizedTag.startsWith('110-P-') ? '유닛 접두사 110-P 오기 의심' : undefined,
      extraEquip: eq.normalizedTag,
    });
  }

  for (const cbl of cableRecords) {
    registerOccurrence({
      entityCategory: 'CABLE',
      normalized: cbl.normalizedCableNo,
      rawText: cbl.cableNo,
      drawingId: cbl.drawingId,
      pageNum: cbl.pageNum,
      xPct: cbl.xPct,
      yPct: cbl.yPct,
      attentionNote:
        cbl.signalCategory === 'UNASSIGNED'
          ? '케이블 번호 미할당(TBD/****)'
          : cbl.cableSpec === '-'
            ? '케이블 규격(Spec) 미검출'
            : undefined,
      extraCable: cbl.normalizedCableNo,
    });
  }

  for (const ent of entities) {
    if (ent.kind === 'TAG') {
      registerOccurrence({
        entityCategory: 'INSTRUMENT_TAG',
        normalized: ent.normalized,
        rawText: ent.text,
        drawingId: ent.drawingId,
        pageNum: ent.pageNum,
        xPct: ent.xPct,
        yPct: ent.yPct,
        attentionNote:
          ent.normalized.includes('PEIT-111E') || ent.normalized === 'TI-131B' || ent.normalized === 'RV-113D'
            ? `태그 오기 의심 (${ent.normalized})`
            : undefined,
      });
    } else if (ent.kind === 'JUNCTION_BOX') {
      registerOccurrence({
        entityCategory: 'JUNCTION_BOX',
        normalized: ent.normalized,
        rawText: ent.text,
        drawingId: ent.drawingId,
        pageNum: ent.pageNum,
        xPct: ent.xPct,
        yPct: ent.yPct,
      });
    }
  }

  // Register Maker interface & Yard-to-Maker mapping points
  for (const mp of makerProfiles) {
    for (const mapping of mp.yardToMakerMappings) {
      registerOccurrence({
        entityCategory: 'MAKER_INTERFACE',
        normalized: mapping.yardTag,
        rawText: `${mapping.yardTag} ↔ ${mapping.makerTag}`,
        drawingId: mp.drawingId,
        pageNum: mapping.pageNum,
        xPct: mapping.xPct,
        yPct: mapping.yPct,
        attentionNote: `메이커 태그 매핑 확인 (${mapping.yardTag} ↔ ${mapping.makerTag})`,
      });
    }
    for (const pt of mp.interfacePoints) {
      if (pt.scopeOwner === 'BY_YARD' || pt.scopeOwner === 'INTERFACE') {
        registerOccurrence({
          entityCategory: 'MAKER_INTERFACE',
          normalized: pt.yardTagRef || pt.terminalOrPin,
          rawText: pt.terminalOrPin,
          drawingId: mp.drawingId,
          pageNum: pt.pageNum,
          xPct: pt.xPct,
          yPct: pt.yPct,
          attentionNote: `메이커 인터페이스 경계(${pt.scopeOwner}): ${pt.terminalOrPin} (${pt.signalDetail})`,
        });
      }
    }
  }

  const totalDocs = Math.max(1, profiles.length);
  const items: UniversalDiagramMatchItem[] = [];

  for (const b of buckets.values()) {
    const variantsFound = Array.from(b.variants);
    const hasConflict = variantsFound.length > 1;
    const hasAttention = b.attentionReasons.length > 0;
    const disciplineSpan =
      (b.pidDrawings.size > 0 ? 1 : 0) +
      (b.elecDrawings.size > 0 ? 1 : 0) +
      (b.makerDrawings.size > 0 ? 1 : 0);
    const isCrossMatched = disciplineSpan >= 2 || b.allDrawings.size >= 2;

    let matchStatus: UniversalDiagramMatchItem['matchStatus'];
    let severity: DiscrepancySeverity;
    let summaryKo: string;

    if (hasConflict) {
      matchStatus = 'VARIANT_CONFLICT';
      severity = 'CRITICAL';
      summaryKo = `동일 코어 식별자(${b.coreKey})에 대해 도면 간 상이한 표기 검출: ${variantsFound.join(' ↔ ')}`;
    } else if (hasAttention) {
      matchStatus = 'UNRESOLVED_ATTENTION';
      severity = b.attentionReasons.some((r) => r.includes('미할당') || r.includes('오기')) ? 'CRITICAL' : 'WARNING';
      summaryKo = b.attentionReasons.join(' · ');
    } else if (isCrossMatched) {
      matchStatus = 'CROSS_MATCHED';
      severity = 'INFO';
      summaryKo = `다중 도면(${b.allDrawings.size}종) 간 상호 매칭 확인${b.linkedCables.size > 0 ? ` · 케이블 ${Array.from(b.linkedCables).slice(0, 3).join(', ')}` : ''}`;
    } else {
      matchStatus = 'SINGLE_DRAWING_ONLY';
      severity = totalDocs >= 2 && b.entityCategory !== 'JUNCTION_BOX' ? 'WARNING' : 'INFO';
      summaryKo =
        totalDocs >= 2
          ? `분석 대상 ${totalDocs}종 중 ${b.primaryJump.drawingId} 단독 출현 (타 도면 반영 여부 확인 필요)`
          : `${b.primaryJump.drawingId} p.${b.primaryJump.pageNum} 추출 완료`;
    }

    items.push({
      id: `UM-${b.entityCategory}-${b.coreKey}`,
      coreKey: b.coreKey,
      displayTag: variantsFound[0] || b.coreKey,
      entityCategory: b.entityCategory,
      matchStatus,
      severity,
      pidOrLayoutDrawings: Array.from(b.pidDrawings),
      electricalOrCableDrawings: Array.from(b.elecDrawings),
      makerDrawings: Array.from(b.makerDrawings),
      variantsFound,
      linkedCableNos: Array.from(b.linkedCables).slice(0, 6),
      linkedEquipment: Array.from(b.linkedEquip).slice(0, 6),
      summaryKo,
      primaryJump: b.primaryJump,
    });
  }

  const statusRank: Record<UniversalDiagramMatchItem['matchStatus'], number> = {
    VARIANT_CONFLICT: 0,
    UNRESOLVED_ATTENTION: 1,
    SINGLE_DRAWING_ONLY: 2,
    CROSS_MATCHED: 3,
  };
  const sevRank: Record<DiscrepancySeverity, number> = {
    CRITICAL: 0,
    WARNING: 1,
    INFO: 2,
  };

  return items.sort((a, b) => {
    if (statusRank[a.matchStatus] !== statusRank[b.matchStatus]) {
      return statusRank[a.matchStatus] - statusRank[b.matchStatus];
    }
    if (sevRank[a.severity] !== sevRank[b.severity]) {
      return sevRank[a.severity] - sevRank[b.severity];
    }
    return a.displayTag.localeCompare(b.displayTag);
  });
}
