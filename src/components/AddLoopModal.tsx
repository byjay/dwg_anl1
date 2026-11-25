import React, { useMemo, useState } from 'react';
import { Sparkles, Check, X, FileText } from 'lucide-react';
import { DiagramLoopEntry, GarMarkupCode, UnitCode } from '../types/diagram';
import { normalizeTag } from '../utils/diagramMatcher';
import { suggestLoopReferences } from '../utils/autoTagger';

interface AddLoopModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddLoop: (entry: DiagramLoopEntry) => void;
  onOpenSuggestedPdfs?: (pidDrawingId: string, pidSheet: string, elecDrawingId: string, elecSheet: string) => void;
}

const SERVICE_PRESETS: Array<{ unitCode: UnitCode; label: string; serviceName: string; rawTag?: string }> = [
  {
    unitCode: '200',
    label: 'Pump B 차단밸브 (PSDS)',
    serviceName: 'LNG Booster Pump B Discharge Shutdown Valve',
    rawTag: 'SDV-112B',
  },
  {
    unitCode: '100',
    label: 'Vaporizer C 유량계 (iCAMS)',
    serviceName: 'Vaporizer C NG Outlet Flow Transmitter',
  },
  {
    unitCode: '100',
    label: 'GW 히터 온도조절 (iCAMS)',
    serviceName: 'Glycol Water Heater A Outlet Temperature Control Valve',
  },
  {
    unitCode: '200',
    label: 'Pump C 진동센서 (PSDS)',
    serviceName: 'HP Pump C Motor Vibration Sensor',
  },
];

export const AddLoopModal: React.FC<AddLoopModalProps> = ({
  isOpen,
  onClose,
  onAddLoop,
  onOpenSuggestedPdfs,
}) => {
  const [unitCode, setUnitCode] = useState<UnitCode>('200');
  const [rawTag, setRawTag] = useState('');
  const [equipmentTag, setEquipmentTag] = useState('200-P-101B');
  const [serviceName, setServiceName] = useState('');
  const [pidSheet, setPidSheet] = useState('12/15');
  const [garSheet, setGarSheet] = useState('04/07');
  const [lineNo, setLineNo] = useState('');
  const [garMarkup, setGarMarkup] = useState<GarMarkupCode>('A');
  const [electricalTag, setElectricalTag] = useState('');
  const [system, setSystem] = useState<'ICAMS' | 'PSDS' | 'ESD_MCC'>('ICAMS');
  const [blockSheet, setBlockSheet] = useState('H-02');
  const [connectionSheet, setConnectionSheet] = useState('9/22');
  const [fieldCableNo, setFieldCableNo] = useState('');
  const [junctionBox, setJunctionBox] = useState('200-ISJB-002');
  const [autoAppliedNotice, setAutoAppliedNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const suggestion = useMemo(
    () => suggestLoopReferences(unitCode, serviceName, rawTag),
    [unitCode, serviceName, rawTag]
  );

  if (!isOpen) return null;

  const applySuggestionToForm = (customSuggestion = suggestion) => {
    setRawTag((prev) => prev.trim() || customSuggestion.suggestedPidTag);
    setEquipmentTag(customSuggestion.suggestedEquipmentTag);
    setPidSheet(customSuggestion.pidSheet);
    setGarSheet(customSuggestion.garSheet);
    setLineNo(customSuggestion.suggestedLinePrefix);
    setSystem(customSuggestion.electricalSystem);
    setBlockSheet(customSuggestion.blockSheet);
    setConnectionSheet(customSuggestion.connectionSheet);
    setElectricalTag(customSuggestion.suggestedElectricalTag);
    setFieldCableNo(customSuggestion.suggestedCablePrefix);
    setJunctionBox(customSuggestion.suggestedJunctionBox);
    setAutoAppliedNotice(
      `자동 태깅 적용: ${customSuggestion.pidDrawingNo} (${customSuggestion.pidSheet}) ↔ ${customSuggestion.electricalDrawingNo} (${customSuggestion.blockSheet})`
    );
  };

  const handleSelectPreset = (preset: (typeof SERVICE_PRESETS)[number]) => {
    setUnitCode(preset.unitCode);
    setServiceName(preset.serviceName);
    setRawTag(preset.rawTag || '');
    const nextSug = suggestLoopReferences(preset.unitCode, preset.serviceName, preset.rawTag || '');
    setRawTag(preset.rawTag || nextSug.suggestedPidTag);
    setEquipmentTag(nextSug.suggestedEquipmentTag);
    setPidSheet(nextSug.pidSheet);
    setGarSheet(nextSug.garSheet);
    setLineNo(nextSug.suggestedLinePrefix);
    setSystem(nextSug.electricalSystem);
    setBlockSheet(nextSug.blockSheet);
    setConnectionSheet(nextSug.connectionSheet);
    setElectricalTag(nextSug.suggestedElectricalTag);
    setFieldCableNo(nextSug.suggestedCablePrefix);
    setJunctionBox(nextSug.suggestedJunctionBox);
    setAutoAppliedNotice(`프리셋 자동 태깅 완료 (${nextSug.confidence})`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveRawTag = rawTag.trim() || suggestion.suggestedPidTag;
    if (!effectiveRawTag || !serviceName.trim()) {
      setError('P&ID 태그와 서비스 설명을 입력해 주세요.');
      return;
    }

    const canonicalTag = normalizeTag(effectiveRawTag, unitCode);
    const jb = junctionBox.trim().toUpperCase() || suggestion.suggestedJunctionBox;
    const entry: DiagramLoopEntry = {
      id: `LOOP-CUSTOM-${Date.now()}`,
      canonicalTag,
      unitCode,
      moduleName: suggestion.moduleName,
      equipmentTag: equipmentTag.trim() || suggestion.suggestedEquipmentTag,
      serviceName: serviceName.trim(),
      pid: {
        rawTag: effectiveRawTag.toUpperCase(),
        unitCode,
        equipmentTag: equipmentTag.trim() || suggestion.suggestedEquipmentTag,
        serviceDescription: serviceName.trim(),
        sheet: pidSheet.trim() || suggestion.pidSheet,
        lineNo: lineNo.trim() || undefined,
        signalCategory: suggestion.suggestedSignalCategory,
      },
      gar: {
        tag: effectiveRawTag.toUpperCase(),
        unitCode,
        sheet: garSheet.trim() || suggestion.garSheet,
        deckLocation: `${suggestion.moduleName} (Auto-Tagged)`,
        markupCode: garMarkup,
        markupLabel:
          garMarkup === 'A'
            ? 'Cable in Cable List'
            : garMarkup === 'B'
              ? 'CABLE MISSING'
              : garMarkup === 'C'
                ? 'CIRCUIT UNASSIGNED'
                : garMarkup === 'D'
                  ? 'D CHECK (P&ID ONLY)'
                  : 'NO CABLE NEEDED',
        annotatedCableNo: fieldCableNo.trim() || undefined,
      },
      electricalPaths: electricalTag.trim()
        ? [
            {
              system,
              electricalTag: electricalTag.trim().toUpperCase(),
              signalRole: `${system} Auto-Tagged Signal`,
              blockSheet: blockSheet.trim() || suggestion.blockSheet,
              connectionSheet: connectionSheet.trim() || suggestion.connectionSheet,
              fieldCableNo: fieldCableNo.trim().toUpperCase() || 'TBD',
              fieldCableSpec: system === 'PSDS' ? 'FMYS2 / FMYS4' : 'FMYS2',
              junctionBox: jb,
              trunkCableNo: `FR-I-${jb}-01`,
              rackRoomCabinet: `${system} CABINET`,
            },
          ]
        : [],
    };

    onAddLoop(entry);
    onClose();
  };

  const suggestedPidDrawingId = unitCode === '100' ? 'PR-100-PID-0001' : 'PR-200-PID-0001';
  const suggestedElecDrawingId =
    suggestion.electricalDrawingNo === 'H042-CI-000-DIA-0002'
      ? 'CI-000-DIA-0002'
      : 'CI-000-DIA-0001';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-loop-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
    >
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded border border-slate-200 bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <div>
            <h2 id="add-loop-title" className="text-sm font-semibold text-slate-900">
              배관 · 전장 매칭 루프 추가 (자동 태깅 · 도면 레퍼런스 추천)
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              유닛 코드와 서비스 설명을 입력하면 P&amp;ID · GAR · iCAMS/PSDS 시트와 JB를 자동 추천합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 p-5 text-xs">
          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-red-800">
              {error}
            </div>
          )}

          {/* Quick Service Presets */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium text-slate-500">빠른 서비스 입력:</span>
            {SERVICE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => handleSelectPreset(preset)}
                className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700 hover:border-sky-500 hover:bg-sky-50 hover:text-sky-800"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="add-unit-code" className="mb-1 block font-medium text-slate-700">
                모듈 유닛 코드
              </label>
              <select
                id="add-unit-code"
                value={unitCode}
                onChange={(e) => setUnitCode(e.target.value as UnitCode)}
                className="h-8 w-full rounded border border-slate-300 px-2"
              >
                <option value="100">100 · Regastainer</option>
                <option value="200">200 · HP Pump Skid</option>
                <option value="300">300 · Recondenser</option>
                <option value="400">400 · Utility</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="add-service-name" className="mb-1 block font-medium text-slate-700">
                서비스 설명 * (입력 시 도면 자동 추천)
              </label>
              <input
                id="add-service-name"
                type="text"
                value={serviceName}
                onChange={(e) => setServiceName(e.target.value)}
                placeholder="예: LNG Booster Pump B Discharge Shutdown Valve"
                className="h-8 w-full rounded border border-slate-300 px-2.5"
              />
            </div>
          </div>

          {/* Live Auto-Tagging Recommendation Panel */}
          <section
            aria-label="자동 태깅 추천 도면 레퍼런스"
            className="rounded border border-sky-200 bg-sky-50/60 p-3.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-900">
                <Sparkles className="h-3.5 w-3.5 text-sky-700" />
                <span>자동 태깅 추천 레퍼런스</span>
                <span className="font-mono text-[10px] font-medium text-sky-700">
                  ({suggestion.confidence} · {suggestion.matchedSignals.join(', ') || '기본 규칙'})
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {onOpenSuggestedPdfs && (unitCode === '100' || unitCode === '200') && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenSuggestedPdfs(
                        suggestedPidDrawingId,
                        suggestion.pidSheet,
                        suggestedElecDrawingId,
                        suggestion.blockSheet
                      );
                      onClose();
                    }}
                    className="inline-flex h-7 items-center gap-1 rounded border border-sky-300 bg-white px-2.5 text-[11px] font-medium text-sky-800 hover:bg-sky-50"
                  >
                    <FileText className="h-3 w-3" />
                    <span>추천 PDF 페이지 열기</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => applySuggestionToForm()}
                  className="inline-flex h-7 items-center gap-1 rounded bg-sky-700 px-2.5 text-[11px] font-semibold text-white hover:bg-sky-800"
                >
                  <Check className="h-3 w-3" />
                  <span>추천 값 일괄 적용</span>
                </button>
              </div>
            </div>

            <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="rounded border border-sky-200/80 bg-white px-2.5 py-2">
                <div className="text-[10px] font-semibold text-sky-800">추천 배관 도면 (P&amp;ID / GAR)</div>
                <div className="mt-0.5 font-mono text-[11px] font-semibold text-slate-900">
                  {suggestion.pidDrawingNo} · Sheet {suggestion.pidSheet}
                </div>
                <div className="font-mono text-[11px] text-slate-600">
                  GAR: {suggestion.garDrawingNo} ({suggestion.garSheet}) · 태그 {suggestion.suggestedPidTag}
                </div>
              </div>
              <div className="rounded border border-sky-200/80 bg-white px-2.5 py-2">
                <div className="text-[10px] font-semibold text-slate-700">
                  추천 전장 도면 ({suggestion.electricalSystem})
                </div>
                <div className="mt-0.5 font-mono text-[11px] font-semibold text-slate-900">
                  {suggestion.electricalDrawingNo} · {suggestion.blockSheet} / {suggestion.connectionSheet}
                </div>
                <div className="font-mono text-[11px] text-slate-600">
                  JB: {suggestion.suggestedJunctionBox} · {suggestion.suggestedCablePrefix}
                </div>
              </div>
            </div>

            <p className="mt-2 text-[11px] text-slate-700">{suggestion.rationale}</p>
            {autoAppliedNotice && (
              <div className="mt-1.5 font-medium text-emerald-800">{autoAppliedNotice}</div>
            )}
          </section>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="add-raw-tag" className="mb-1 block font-medium text-slate-700">
                P&amp;ID 태그 *
              </label>
              <input
                id="add-raw-tag"
                type="text"
                value={rawTag}
                onChange={(e) => setRawTag(e.target.value)}
                placeholder={`예: ${suggestion.suggestedPidTag}`}
                className="h-8 w-full rounded border border-slate-300 px-2.5 font-mono"
              />
            </div>
            <div>
              <label htmlFor="add-equip-tag" className="mb-1 block font-medium text-slate-700">
                연결 장비 태그
              </label>
              <input
                id="add-equip-tag"
                type="text"
                value={equipmentTag}
                onChange={(e) => setEquipmentTag(e.target.value)}
                className="h-8 w-full rounded border border-slate-300 px-2.5 font-mono"
              />
            </div>
            <div>
              <label htmlFor="add-line-no" className="mb-1 block font-medium text-slate-700">
                배관 라인 번호
              </label>
              <input
                id="add-line-no"
                type="text"
                value={lineNo}
                onChange={(e) => setLineNo(e.target.value)}
                placeholder={suggestion.suggestedLinePrefix}
                className="h-8 w-full rounded border border-slate-300 px-2.5 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label htmlFor="add-pid-sheet" className="mb-1 block font-medium text-slate-700">
                P&amp;ID 시트
              </label>
              <input
                id="add-pid-sheet"
                type="text"
                value={pidSheet}
                onChange={(e) => setPidSheet(e.target.value)}
                className="h-8 w-full rounded border border-slate-300 px-2.5 font-mono"
              />
            </div>
            <div>
              <label htmlFor="add-gar-sheet" className="mb-1 block font-medium text-slate-700">
                GAR 시트
              </label>
              <input
                id="add-gar-sheet"
                type="text"
                value={garSheet}
                onChange={(e) => setGarSheet(e.target.value)}
                className="h-8 w-full rounded border border-slate-300 px-2.5 font-mono"
              />
            </div>
            <div>
              <label htmlFor="add-gar-markup" className="mb-1 block font-medium text-slate-700">
                GAR 마크업
              </label>
              <select
                id="add-gar-markup"
                value={garMarkup}
                onChange={(e) => setGarMarkup(e.target.value as GarMarkupCode)}
                className="h-8 w-full rounded border border-slate-300 px-2"
              >
                <option value="A">A · Cable List 존재</option>
                <option value="B">B · 케이블 누락</option>
                <option value="C">C · 번호 미할당</option>
                <option value="D">D · P&amp;ID 단독</option>
                <option value="E">E · 케이블 불필요</option>
              </select>
            </div>
            <div>
              <label htmlFor="add-system" className="mb-1 block font-medium text-slate-700">
                전장 계통
              </label>
              <select
                id="add-system"
                value={system}
                onChange={(e) => setSystem(e.target.value as 'ICAMS' | 'PSDS' | 'ESD_MCC')}
                className="h-8 w-full rounded border border-slate-300 px-2"
              >
                <option value="ICAMS">iCAMS (DIA-0001)</option>
                <option value="PSDS">PSDS (DIA-0002)</option>
                <option value="ESD_MCC">EXMAR ESD/MCC</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <label htmlFor="add-elec-tag" className="mb-1 block font-medium text-slate-700">
                전장 태그 (자동유닛검증)
              </label>
              <input
                id="add-elec-tag"
                type="text"
                value={electricalTag}
                onChange={(e) => setElectricalTag(e.target.value)}
                placeholder={suggestion.suggestedElectricalTag}
                className="h-8 w-full rounded border border-slate-300 px-2.5 font-mono"
              />
            </div>
            <div>
              <label htmlFor="add-cable-no" className="mb-1 block font-medium text-slate-700">
                필드 케이블 번호
              </label>
              <input
                id="add-cable-no"
                type="text"
                value={fieldCableNo}
                onChange={(e) => setFieldCableNo(e.target.value)}
                placeholder={suggestion.suggestedCablePrefix}
                className="h-8 w-full rounded border border-slate-300 px-2.5 font-mono"
              />
            </div>
            <div>
              <label htmlFor="add-jb" className="mb-1 block font-medium text-slate-700">
                Junction Box
              </label>
              <input
                id="add-jb"
                type="text"
                value={junctionBox}
                onChange={(e) => setJunctionBox(e.target.value)}
                className="h-8 w-full rounded border border-slate-300 px-2.5 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="add-block-sheet" className="mb-1 block font-medium text-slate-700">
                전장 블록도 시트
              </label>
              <input
                id="add-block-sheet"
                type="text"
                value={blockSheet}
                onChange={(e) => setBlockSheet(e.target.value)}
                className="h-8 w-full rounded border border-slate-300 px-2.5 font-mono"
              />
            </div>
            <div>
              <label htmlFor="add-conn-sheet" className="mb-1 block font-medium text-slate-700">
                전장 결선표 시트
              </label>
              <input
                id="add-conn-sheet"
                type="text"
                value={connectionSheet}
                onChange={(e) => setConnectionSheet(e.target.value)}
                className="h-8 w-full rounded border border-slate-300 px-2.5 font-mono"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="h-8 rounded border border-slate-300 bg-white px-3 font-medium text-slate-700 hover:bg-slate-50"
            >
              취소
            </button>
            <button
              type="submit"
              className="h-8 rounded bg-sky-700 px-4 font-semibold text-white hover:bg-sky-800"
            >
              루프 추가 및 병렬 재검증
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
