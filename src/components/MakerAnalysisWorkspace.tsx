import React, { useMemo, useState } from 'react';
import {
  BookOpenCheck,
  ExternalLink,
  Factory,
  FileSearch,
  Scale,
  Upload,
} from 'lucide-react';
import {
  DiscrepancySeverity,
  DrawingContentAnalysisReport,
  EvaluatedLoopMatch,
  MakerDrawingProfile,
} from '../types/diagram';

interface MakerAnalysisWorkspaceProps {
  evaluatedLoops: EvaluatedLoopMatch[];
  analysisReport?: DrawingContentAnalysisReport | null;
  onUploadMakerPdf: (item: {
    id: string;
    name: string;
    role: 'PIPING' | 'ELECTRICAL';
    hintRole?: 'PID_GAR' | 'ELECTRICAL_DIA' | 'CABLE_SCHEDULE' | 'MAKER_VENDOR' | 'AUTO';
    objectUrl: string;
    base64Data: string;
    sizeLabel: string;
  }) => void;
  onOpenDeepAnalyzer: () => void;
  onJumpToDrawingPage: (
    drawingId: string,
    pageNum: number,
    opts?: {
      tagRef: string;
      content: string;
      severity: DiscrepancySeverity;
      searchTerms?: string[];
      autoInsert?: boolean;
    }
  ) => void;
  onOpenSpecReview: () => void;
  onLearnMakerRule: (payload: {
    titleKo: string;
    patternOrCondition: string;
    learnedLessonKo: string;
    posRequirementClause: string;
    severity: DiscrepancySeverity;
    tCodeOrigin: string;
  }) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const MakerAnalysisWorkspace: React.FC<MakerAnalysisWorkspaceProps> = ({
  evaluatedLoops,
  analysisReport,
  onUploadMakerPdf,
  onOpenDeepAnalyzer,
  onJumpToDrawingPage,
  onOpenSpecReview,
  onLearnMakerRule,
}) => {
  const [selectedProfileId, setSelectedProfileId] = useState<string>('ALL');
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  // Synthesize baseline H042 Vendor/Maker Package Profile from loops + merge live uploaded makerProfiles
  const makerProfiles: MakerDrawingProfile[] = useMemo(() => {
    const vendor300Loops = evaluatedLoops.filter(
      (l) =>
        l.unitCode === '300' ||
        l.electricalPaths.some(
          (p) =>
            p.junctionBox.toUpperCase().includes('VENDOR') ||
            p.junctionBox.toUpperCase().includes('EXMAR') ||
            p.junctionBox.toUpperCase().includes('DAJB') ||
            p.junctionBox.toUpperCase().includes('EAJB') ||
            p.junctionBox.toUpperCase().includes('EDJB')
        )
    );

    const baselineProfile: MakerDrawingProfile = {
      drawingId: 'CI-000-DIA-0001',
      displayName: 'H042 Recondenser & EXMAR MCC Vendor Interface (기준선)',
      docClass: 'MAKER_DRAWING',
      isMakerDrawing: true,
      vendorOrPackageHint: 'Recondenser Skid Vendor / EXMAR MCC',
      powerSpecs: ['6.6kV 3PH (6/10kV CJPF/SC)', '24VDC Ex ia/d', '230VAC'],
      signalStandards: ['4-20mA HART', 'Dry Contact (ZSO/ZSC 4-Wire)', 'PSDS Relay'],
      yardToMakerMappings: vendor300Loops.map((l) => {
        const ep = l.electricalPaths[0];
        return {
          yardTag: l.canonicalTag,
          makerTag: ep?.electricalTag || l.canonicalTag,
          pageNum: l.unitCode === '300' ? 39 : 47,
          context: `${l.serviceName} · JB: ${l.primaryJunctionBox} · Trunk: ${ep?.trunkCableNo || 'HOLD'}`,
          xPct: 50,
          yPct: 45,
        };
      }),
      interfacePoints: vendor300Loops.flatMap((l, idx) =>
        l.electricalPaths.map((p, pIdx) => ({
          id: `BASE-IF-${idx}-${pIdx}`,
          drawingId: p.system === 'PSDS' ? 'CI-000-DIA-0002' : 'CI-000-DIA-0001',
          pageNum: p.system === 'PSDS' ? 44 : 39,
          terminalOrPin: p.cabinetTerminalOrBarrier || p.jbTerminal || 'TBD (BY VENDOR)',
          ioType: l.pid.signalCategory === 'SHUTDOWN_VALVE'
            ? 'DO'
            : l.pid.signalCategory === 'CONTROL_VALVE'
              ? 'AO'
              : 'AI',
          signalDetail: `${l.canonicalTag} (${p.signalRole}) · Cable: ${p.fieldCableNo}`,
          yardTagRef: l.canonicalTag,
          makerTagRef: p.junctionBox,
          scopeOwner: p.junctionBox.toUpperCase().includes('VENDOR') ? 'BY_MAKER' : 'INTERFACE',
          rawContext: `${p.fieldCableSpec} · Trunk ${p.trunkCableNo}`,
          xPct: 50,
          yPct: 50,
        }))
      ),
      scopeNotes: [
        {
          owner: 'HOLD',
          text: '모듈 300 Vendor JB (300-DAJB-001/002, EAJB-001, EDJB-002) 트렁크 케이블 Spec 및 2선식 결선 HOLD',
          pageNum: 39,
          xPct: 55,
          yPct: 75,
        },
        {
          owner: 'BY_MAKER',
          text: '300-FCV-001 (TYP.2) Solenoid(300-FY-001/003) 및 Fail-Close Limit Switch 단자 포함 공급 필요',
          pageNum: 40,
          xPct: 45,
          yPct: 60,
        },
        {
          owner: 'BY_YARD',
          text: 'EXMAR MCC ↔ PSDS Cabinet 간 30C 통합 제어 케이블 포설 및 DIN 심볼 표준화',
          pageNum: 49,
          xPct: 50,
          yPct: 50,
        },
      ],
    };

    const uploadedMakers = analysisReport?.makerProfiles || [];
    return [baselineProfile, ...uploadedMakers];
  }, [evaluatedLoops, analysisReport]);

  const visibleProfiles = useMemo(() => {
    if (selectedProfileId === 'ALL') return makerProfiles;
    return makerProfiles.filter((p) => p.drawingId === selectedProfileId);
  }, [makerProfiles, selectedProfileId]);

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64Data = btoa(binary);
    const id = `MKR-PDF-${Date.now()}`;
    onUploadMakerPdf({
      id,
      name: file.name,
      role: 'ELECTRICAL',
      hintRole: 'MAKER_VENDOR',
      objectUrl,
      base64Data,
      sizeLabel: formatFileSize(file.size),
    });
    setStatusNotice(
      `"${file.name}" 메이커 도면을 등록했습니다. CV03N(도면·OCR 분석)에서 전체 스캔을 실행하면 자동으로 Yard↔Maker 매핑과 I/O가 추출됩니다.`
    );
    e.target.value = '';
  };

  const totalIoCount = makerProfiles.reduce((acc, p) => acc + p.interfacePoints.length, 0);
  const totalMappingCount = makerProfiles.reduce((acc, p) => acc + p.yardToMakerMappings.length, 0);
  const totalHoldCount = makerProfiles.reduce(
    (acc, p) => acc + p.scopeNotes.filter((n) => n.owner === 'HOLD').length,
    0
  );

  return (
    <div className="space-y-4">
      {/* Header Strip */}
      <section className="rounded border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-mono font-semibold text-[#005CC8]">SAP T-Code CS15</span>
              <span aria-hidden="true">·</span>
              <span>메이커·벤더 도면 분해 및 Yard↔Maker I/O 인터페이스 분석</span>
            </div>
            <h1 className="mt-1 text-lg font-bold tracking-tight text-slate-900">
              메이커 도면 분석 및 공급 범위(BY YARD / BY MAKER) 검증
            </h1>
            <p className="mt-0.5 text-xs text-slate-600">
              Vendor Skid 패키지(Recondenser 300-V-001, EXMAR MCC)와 업로드된 메이커 도면 PDF에서 전원·신호 규격, 단자 I/O, Yard↔Maker 태그 매핑 및 HOLD 경계를 추출합니다.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded border border-slate-300 bg-white px-3 text-xs font-medium whitespace-nowrap text-slate-700 hover:bg-slate-50">
              <Upload className="h-3.5 w-3.5 text-slate-600" />
              <span>메이커 도면 PDF 업로드</span>
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => void handleUploadFile(e)}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={onOpenDeepAnalyzer}
              className="inline-flex h-9 items-center gap-1.5 rounded border border-slate-300 bg-white px-3 text-xs font-medium whitespace-nowrap text-slate-700 hover:bg-slate-50"
            >
              <FileSearch className="h-3.5 w-3.5 text-slate-600" />
              <span>CV03N 전체 스캔</span>
            </button>

            <button
              type="button"
              onClick={onOpenSpecReview}
              className="inline-flex h-9 items-center gap-1.5 rounded bg-[#0070F2] px-3.5 text-xs font-semibold whitespace-nowrap text-white hover:bg-[#005CC8]"
            >
              <Scale className="h-3.5 w-3.5" />
              <span>스펙 검토(CL03)로 이동</span>
            </button>
          </div>
        </div>

        {statusNotice && (
          <div className="mt-3 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
            {statusNotice}
          </div>
        )}

        {/* KPI Row */}
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded border border-slate-200 bg-slate-50/70 px-4 py-3">
            <div className="text-[11px] font-medium text-slate-600">분석 메이커 패키지</div>
            <div className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums">
              {makerProfiles.length}종
            </div>
          </div>
          <div className="rounded border border-slate-200 bg-slate-50/70 px-4 py-3">
            <div className="text-[11px] font-medium text-slate-600">추출 I/O · 단자 포인트</div>
            <div className="mt-1 font-mono text-2xl font-bold text-[#005CC8] tabular-nums">
              {totalIoCount}점
            </div>
          </div>
          <div className="rounded border border-slate-200 bg-slate-50/70 px-4 py-3">
            <div className="text-[11px] font-medium text-slate-600">Yard ↔ Maker 매핑</div>
            <div className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums">
              {totalMappingCount}건
            </div>
          </div>
          <div className="rounded border border-slate-200 bg-slate-50/70 px-4 py-3">
            <div className="text-[11px] font-medium text-slate-600">벤더 미확정 HOLD</div>
            <div className="mt-1 font-mono text-2xl font-bold text-red-700 tabular-nums">
              {totalHoldCount}건
            </div>
          </div>
        </div>

        {/* Profile Filter */}
        <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-slate-200 pt-3">
          <Factory className="h-3.5 w-3.5 text-slate-500" />
          <button
            type="button"
            onClick={() => setSelectedProfileId('ALL')}
            className={`rounded px-2.5 py-1 text-xs font-medium whitespace-nowrap ${
              selectedProfileId === 'ALL'
                ? 'bg-[#0070F2] text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            전체 패키지 ({makerProfiles.length})
          </button>
          {makerProfiles.map((mp) => (
            <button
              key={mp.drawingId}
              type="button"
              onClick={() => setSelectedProfileId(mp.drawingId)}
              className={`rounded px-2.5 py-1 text-xs font-medium whitespace-nowrap ${
                selectedProfileId === mp.drawingId
                  ? 'bg-[#0070F2] text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {mp.vendorOrPackageHint || mp.displayName}
            </button>
          ))}
        </div>
      </section>

      {/* Maker Profile Details */}
      {visibleProfiles.map((profile) => (
        <section
          key={profile.drawingId}
          className="space-y-4 rounded border border-slate-200 bg-white p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-mono font-semibold text-slate-700">
                  {profile.drawingId}
                </span>
                <span aria-hidden="true">·</span>
                <span>전원: {profile.powerSpecs.join(' / ') || '미검출'}</span>
                <span aria-hidden="true">·</span>
                <span>신호: {profile.signalStandards.join(' / ') || '미검출'}</span>
              </div>
              <h2 className="mt-1 text-sm font-bold text-slate-900">
                {profile.vendorOrPackageHint || profile.displayName}
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onLearnMakerRule({
                    titleKo: `${profile.vendorOrPackageHint || profile.displayName} 인터페이스 기준`,
                    patternOrCondition: profile.yardToMakerMappings
                      .slice(0, 3)
                      .map((m) => m.yardTag)
                      .join('|') || profile.drawingId,
                    learnedLessonKo: `${profile.displayName} 기준 전원(${profile.powerSpecs.join(', ')})·신호(${profile.signalStandards.join(', ')}) 및 Scope Note ${profile.scopeNotes.length}건 확인.`,
                    posRequirementClause: `${profile.vendorOrPackageHint || profile.displayName} 발주 시 추출된 I/O(${profile.interfacePoints.length}점) 및 Yard↔Maker 단자 경계를 POS에 필수 포함한다.`,
                    severity: profile.scopeNotes.some((n) => n.owner === 'HOLD')
                      ? 'CRITICAL'
                      : 'WARNING',
                    tCodeOrigin: `CS15 · ${profile.drawingId}`,
                  });
                  setStatusNotice(
                    `"${profile.vendorOrPackageHint || profile.displayName}" 메이커 기준을 ZP01 학습 지식베이스에 저장했습니다.`
                  );
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <BookOpenCheck className="h-3.5 w-3.5 text-[#0070F2]" />
                <span>지식베이스(ZP01)에 학습 저장</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  onJumpToDrawingPage(profile.drawingId, 1, {
                    tagRef: profile.vendorOrPackageHint || profile.displayName,
                    content: `메이커 패키지 도면 확인 (${profile.interfacePoints.length} I/O)`,
                    severity: 'INFO',
                    autoInsert: false,
                  })
                }
                className="inline-flex h-8 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>도면 원문(CV04N)</span>
              </button>
            </div>
          </div>

          {/* Scope Notes */}
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
            {profile.scopeNotes.map((note, idx) => (
              <div
                key={idx}
                className={`rounded border p-3 text-xs ${
                  note.owner === 'HOLD'
                    ? 'border-red-200 bg-red-50/60 text-red-950'
                    : note.owner === 'BY_MAKER'
                      ? 'border-amber-200 bg-amber-50/50 text-slate-900'
                      : 'border-slate-200 bg-slate-50 text-slate-800'
                }`}
              >
                <div className="font-mono text-[11px] font-bold">
                  {note.owner} · p.{note.pageNum}
                </div>
                <p className="mt-1 leading-relaxed">{note.text}</p>
              </div>
            ))}
          </div>

          {/* Yard <-> Maker Tag Mapping & I/O Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-700">
                  <th className="px-3 py-2 whitespace-nowrap">Yard Tag</th>
                  <th className="px-3 py-2 whitespace-nowrap">Maker / JB Tag</th>
                  <th className="px-3 py-2 whitespace-nowrap">I/O · 단자</th>
                  <th className="px-3 py-2">인터페이스 상세 및 케이블 사양</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">도면 위치</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {profile.interfacePoints.slice(0, 12).map((pt) => (
                  <tr key={pt.id} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2 font-mono font-semibold text-slate-900 whitespace-nowrap">
                      {pt.yardTagRef || '-'}
                    </td>
                    <td className="px-3 py-2 font-mono text-[#005CC8] whitespace-nowrap">
                      {pt.makerTagRef || '-'}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                      {pt.ioType} · {pt.terminalOrPin}
                    </td>
                    <td className="px-3 py-2 text-[11.5px] text-slate-700">
                      {pt.signalDetail} · {pt.rawContext}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() =>
                          onJumpToDrawingPage(pt.drawingId, pt.pageNum, {
                            tagRef: pt.yardTagRef || pt.terminalOrPin,
                            content: `${pt.signalDetail} (${pt.scopeOwner})`,
                            severity: pt.scopeOwner === 'BY_MAKER' ? 'WARNING' : 'INFO',
                            searchTerms: [pt.yardTagRef || pt.terminalOrPin],
                            autoInsert: true,
                          })
                        }
                        className="inline-flex h-7 items-center gap-1 rounded border border-slate-300 bg-white px-2 text-[11px] text-slate-700 hover:border-sky-600 hover:text-sky-800"
                      >
                        <ExternalLink className="h-3 w-3" />
                        <span>p.{pt.pageNum}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
};
