import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Plus,
  Scale,
  Trash2,
} from 'lucide-react';
import {
  DrawingContentAnalysisReport,
  EvaluatedLoopMatch,
  LearnedEngineeringRule,
  PosLineItem,
  PosPackageId,
  SpecReviewReport,
} from '../types/diagram';
import {
  POS_PACKAGE_TEMPLATES,
  buildPosHtmlDocument,
  buildPurchaseOrderSpec,
} from '../utils/posGeneratorEngine';

interface PosGeneratorWorkspaceProps {
  evaluatedLoops: EvaluatedLoopMatch[];
  specReport: SpecReviewReport;
  learnedRules: LearnedEngineeringRule[];
  analysisReport?: DrawingContentAnalysisReport | null;
  selectedPackageId: PosPackageId;
  onSelectPackageId: (id: PosPackageId) => void;
  onOpenSpecReview: () => void;
  onOpenCommentReport: () => void;
}

export const PosGeneratorWorkspace: React.FC<PosGeneratorWorkspaceProps> = ({
  evaluatedLoops,
  specReport,
  learnedRules,
  analysisReport,
  selectedPackageId,
  onSelectPackageId,
  onOpenSpecReview,
  onOpenCommentReport,
}) => {
  const [vendorByPkg, setVendorByPkg] = useState<Partial<Record<PosPackageId, string>>>({});
  const [revisionByPkg, setRevisionByPkg] = useState<Partial<Record<PosPackageId, string>>>({});
  const [extraLinesByPkg, setExtraLinesByPkg] = useState<Partial<Record<PosPackageId, PosLineItem[]>>>({});
  const [qtyOverridesByPkg, setQtyOverridesByPkg] = useState<
    Partial<Record<PosPackageId, Record<string, number>>>
  >({});

  const vendorOverride = vendorByPkg[selectedPackageId] ?? '';
  const revisionOverride =
    revisionByPkg[selectedPackageId] ?? 'Rev.0 (For Engineering Release)';
  const extraLines = extraLinesByPkg[selectedPackageId] ?? [];
  const qtyOverrides = qtyOverridesByPkg[selectedPackageId] ?? {};

  // Custom item quick-add state
  const [newTag, setNewTag] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newSpec, setNewSpec] = useState('');
  const [newQty, setNewQty] = useState(1);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const posDoc = useMemo(() => {
    const built = buildPurchaseOrderSpec({
      packageId: selectedPackageId,
      evaluatedLoops,
      specReport,
      learnedRules,
      analysisReport,
      customVendor: vendorOverride,
      customRevision: revisionOverride,
      extraLines,
    });
    return {
      ...built,
      lineItems: built.lineItems.map((line) => ({
        ...line,
        qty: qtyOverrides[line.materialCode] ?? line.qty,
      })),
    };
  }, [
    selectedPackageId,
    evaluatedLoops,
    specReport,
    learnedRules,
    analysisReport,
    vendorOverride,
    revisionOverride,
    extraLines,
    qtyOverrides,
  ]);

  const handleAddCustomLine = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTag.trim() || !newDesc.trim()) return;
    const itemNo = String((posDoc.lineItems.length + 1) * 10).padStart(4, '0');
    const nextItem: PosLineItem = {
      itemNo,
      materialCode: `CUST-${Date.now().toString().slice(-5)}`,
      tagRef: newTag.trim(),
      description: newDesc.trim(),
      qty: Math.max(1, newQty),
      unit: 'EA',
      technicalSpec: newSpec.trim() || '도면·학습기준 준수',
      drawingRef: 'USER ADDED',
      specStatus: 'PASS',
      appliedRuleNote: '엔지니어 직접 추가',
      isCustom: true,
    };
    setExtraLinesByPkg((prev) => ({
      ...prev,
      [selectedPackageId]: [...(prev[selectedPackageId] ?? []), nextItem],
    }));
    setNewTag('');
    setNewDesc('');
    setNewSpec('');
    setNewQty(1);
  };

  const handleExportPosHtml = () => {
    const html = buildPosHtmlDocument(posDoc);
    const filename = `${posDoc.posNo}_${posDoc.createdDate}.html`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    setExportNotice(
      `${filename} 구매발주사양서(품목 ${posDoc.lineItems.length}건 · 학습조항 ${posDoc.learnedClauses.length}건 · HOLD ${posDoc.openHoldConditions.length}건 포함)를 생성했습니다.`
    );
  };

  return (
    <div className="space-y-4">
      {/* SAP ME21N Header */}
      <section className="rounded border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-mono font-semibold text-[#005CC8]">SAP T-Code ME21N</span>
              <span aria-hidden="true">·</span>
              <span>구매발주사양서 (POS) 자동 생성</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{posDoc.posNo}</span>
            </div>
            <h1 className="mt-1 text-lg font-bold tracking-tight text-slate-900">
              {posDoc.packageTitleKo}
            </h1>
            <p className="mt-0.5 text-xs text-slate-600">
              도면 분석({posDoc.sourceStats.loopsEvaluated}루프) · 메이커 인터페이스({posDoc.sourceStats.makerProfilesCount}종) · 스펙 검토({posDoc.sourceStats.specChecksTotal}건) · 학습 규칙({posDoc.sourceStats.learnedRulesApplied}건)을 통합하여 POS 사양서를 생성합니다.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onOpenSpecReview}
              className="inline-flex h-9 items-center gap-1.5 rounded border border-slate-300 bg-white px-3 text-xs font-medium whitespace-nowrap text-slate-700 hover:bg-slate-50"
            >
              <Scale className="h-3.5 w-3.5" />
              <span>스펙 검토(CL03)</span>
            </button>
            <button
              type="button"
              onClick={handleExportPosHtml}
              className="inline-flex h-9 items-center gap-1.5 rounded bg-[#0070F2] px-4 text-xs font-semibold whitespace-nowrap text-white hover:bg-[#005CC8]"
            >
              <Download className="h-3.5 w-3.5" />
              <span>SAP POS 사양서 HTML 생성</span>
            </button>
          </div>
        </div>

        {exportNotice && (
          <div className="mt-3 flex items-center gap-2 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
            <span>{exportNotice}</span>
          </div>
        )}

        {/* Package Selector Tabs */}
        <div className="mt-4 flex flex-wrap gap-1.5 border-t border-slate-200 pt-3">
          {POS_PACKAGE_TEMPLATES.map((tpl) => {
            const active = selectedPackageId === tpl.id;
            return (
              <button
                key={tpl.id}
                type="button"
                onClick={() => onSelectPackageId(tpl.id)}
                className={`rounded px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-[#103258] text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {tpl.id.replace('POS-', '')} · {tpl.targetModule}
              </button>
            );
          })}
        </div>

        {/* Editable SAP Header Fields & Readiness */}
        <div className="mt-4 grid grid-cols-1 gap-3 rounded border border-slate-200 bg-slate-50/70 p-3.5 md:grid-cols-4">
          <div>
            <div className="text-[11px] font-semibold text-slate-600">구매요청(PR) · 자재그룹</div>
            <div className="mt-1 font-mono text-xs font-bold text-slate-900">
              {posDoc.prNo} · {posDoc.sapMaterialGroup}
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600">
              공급 벤더 / 메이커명
            </label>
            <input
              type="text"
              aria-label="공급 벤더/메이커명"
              value={vendorOverride}
              onChange={(e) => {
                const value = e.target.value;
                setVendorByPkg((prev) => ({ ...prev, [selectedPackageId]: value }));
              }}
              placeholder={posDoc.vendorName}
              className="mt-1 h-7 w-full rounded border border-slate-300 bg-white px-2 text-xs text-slate-900"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600">
              문서 리비전
            </label>
            <input
              type="text"
              aria-label="POS 문서 리비전"
              value={revisionOverride}
              onChange={(e) => {
                const value = e.target.value;
                setRevisionByPkg((prev) => ({ ...prev, [selectedPackageId]: value }));
              }}
              className="mt-1 h-7 w-full rounded border border-slate-300 bg-white px-2 font-mono text-xs text-slate-900"
            />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-slate-600">발주 가능 판정 (Readiness)</div>
            <div
              className={`mt-1 text-xs font-bold ${
                posDoc.readinessStatus === 'RELEASE_READY'
                  ? 'text-emerald-700'
                  : 'text-amber-700'
              }`}
            >
              {posDoc.readinessStatus === 'RELEASE_READY'
                ? 'RELEASE_READY (정식 발주 가능)'
                : `HOLD_PENDING (선결 ${posDoc.openHoldConditions.length}건)`}
            </div>
          </div>
        </div>
      </section>

      {/* 1. POS Line Items ALV Grid */}
      <section className="rounded border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-bold text-slate-900">
            1. POS 발주 품목 및 기술 사양 내역 ({posDoc.lineItems.length}건)
          </h2>
          <span className="text-[11px] text-slate-500">
            수량은 표에서 직접 수정할 수 있으며, 하단 폼으로 품목을 추가할 수 있습니다.
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-700">
                <th className="px-3 py-2 whitespace-nowrap">항목</th>
                <th className="px-3 py-2 whitespace-nowrap">자재코드 · Tag</th>
                <th className="px-3 py-2">품명 (Description)</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">수량</th>
                <th className="px-3 py-2">필수 기술 사양 (Spec & Rating)</th>
                <th className="px-3 py-2 whitespace-nowrap">스펙판정 · 학습반영</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">삭제</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {posDoc.lineItems.map((line) => (
                <tr key={`${line.itemNo}-${line.materialCode}`} className="hover:bg-slate-50/70">
                  <td className="px-3 py-2 font-mono text-[11px] text-slate-500 tabular-nums">
                    {line.itemNo}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="font-mono font-bold text-slate-900">{line.tagRef}</div>
                    <div className="font-mono text-[10.5px] text-slate-500">
                      {line.materialCode}
                    </div>
                  </td>
                  <td className="max-w-[230px] px-3 py-2 text-slate-800">
                    <div>{line.description}</div>
                    <div className="mt-0.5 font-mono text-[10.5px] text-slate-500">
                      {line.drawingRef}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        aria-label={`${line.tagRef} 수량`}
                        value={line.qty}
                        onChange={(e) => {
                          const val = Math.max(1, Number(e.target.value) || 1);
                          setQtyOverridesByPkg((prev) => ({
                            ...prev,
                            [selectedPackageId]: {
                              ...(prev[selectedPackageId] ?? {}),
                              [line.materialCode]: val,
                            },
                          }));
                        }}
                        className="h-7 w-16 rounded border border-slate-300 px-1.5 text-right font-mono text-xs tabular-nums"
                      />
                      <span className="font-mono text-[11px] text-slate-600">{line.unit}</span>
                    </div>
                  </td>
                  <td className="max-w-[290px] px-3 py-2 text-[11.5px] text-slate-700">
                    {line.technicalSpec}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div
                      className={`text-[11px] font-bold ${
                        line.specStatus === 'PASS'
                          ? 'text-emerald-700'
                          : line.specStatus === 'HOLD_REQUIRED'
                            ? 'text-amber-700'
                            : 'text-red-700'
                      }`}
                    >
                      {line.specStatus}
                    </div>
                    {line.appliedRuleNote && (
                      <div className="text-[10.5px] text-[#005CC8]">{line.appliedRuleNote}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {line.isCustom && (
                      <button
                        type="button"
                        onClick={() =>
                          setExtraLinesByPkg((prev) => ({
                            ...prev,
                            [selectedPackageId]: (prev[selectedPackageId] ?? []).filter(
                              (item) => item.materialCode !== line.materialCode
                            ),
                          }))
                        }
                        aria-label={`${line.tagRef} 삭제`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-300 text-slate-500 hover:text-red-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Quick Add Custom Line */}
        <form
          onSubmit={handleAddCustomLine}
          className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3"
        >
          <input
            type="text"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            placeholder="Tag No. (예: 300-TIT-006)"
            className="h-8 w-40 rounded border border-slate-300 bg-white px-2.5 font-mono text-xs"
          />
          <input
            type="text"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="품명 입력..."
            className="h-8 min-w-[200px] flex-1 rounded border border-slate-300 bg-white px-2.5 text-xs"
          />
          <input
            type="text"
            value={newSpec}
            onChange={(e) => setNewSpec(e.target.value)}
            placeholder="요구 스펙 (예: Ex ia · 4-20mA)"
            className="h-8 w-56 rounded border border-slate-300 bg-white px-2.5 text-xs"
          />
          <input
            type="number"
            min={1}
            value={newQty}
            onChange={(e) => setNewQty(Math.max(1, Number(e.target.value) || 1))}
            className="h-8 w-16 rounded border border-slate-300 bg-white px-2 text-right font-mono text-xs tabular-nums"
          />
          <button
            type="submit"
            className="inline-flex h-8 items-center gap-1 rounded bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>품목 추가</span>
          </button>
        </form>
      </section>

      {/* 2. Learned Clauses & Pre-PO Hold Conditions */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-bold text-slate-900">
            2. 학습된 지식(ZP01) 기반 자동 반영 사양 조항 ({posDoc.learnedClauses.length}건)
          </h2>
          <p className="mt-0.5 text-[11px] text-slate-500">
            활성화된 엔지니어링 교훈이 모든 POS 사양서에 필수 구매 조건으로 자동 편입됩니다.
          </p>
          <ul className="mt-3 space-y-2 text-xs text-slate-800">
            {posDoc.learnedClauses.map((cl) => (
              <li
                key={cl.ruleCode}
                className="rounded border border-sky-200 bg-sky-50/60 px-3 py-2 leading-relaxed"
              >
                <div className="font-mono text-[11px] font-bold text-[#005CC8]">
                  {cl.ruleCode} · {cl.titleKo} ({cl.origin})
                </div>
                <div className="mt-0.5">{cl.clauseText}</div>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <span>3. 발주 전 선결 HOLD 조건 ({posDoc.openHoldConditions.length}건)</span>
            </h2>
            <button
              type="button"
              onClick={onOpenCommentReport}
              className="inline-flex h-7 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
            >
              <ClipboardCheck className="h-3 w-3" />
              <span>전기 코멘트(QM02) 확인</span>
            </button>
          </div>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {posDoc.readinessSummaryKo}
          </p>

          {posDoc.openHoldConditions.length === 0 ? (
            <div className="mt-3 rounded border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900">
              발주 전 선결 필요한 스펙 불일치나 HOLD 항목이 없습니다.
            </div>
          ) : (
            <ul className="mt-3 space-y-2 text-xs">
              {posDoc.openHoldConditions.map((h) => (
                <li
                  key={h.specCode}
                  className="rounded border border-red-200 bg-red-50/50 px-3 py-2 text-slate-900"
                >
                  <div className="flex items-center justify-between gap-2 font-mono text-[11px]">
                    <span className="font-bold text-red-700">
                      {h.specCode} · {h.severity}
                    </span>
                    <span className="text-slate-500">{h.evidenceRef}</span>
                  </div>
                  <div className="mt-0.5 font-semibold">{h.titleKo}</div>
                  <div className="mt-0.5 text-[11.5px] text-slate-700">
                    선결 조치: {h.requiredAction}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};
