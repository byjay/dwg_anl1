import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import fs from 'fs';
import path from 'path';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';

const PORT = Number(process.env.PORT || 3000);
const DEFAULT_MODEL_NAME = 'gemini-4-hydrogen';
const ALLOWED_FREE_MODELS = new Set(['gemini-4-hydrogen', 'gemini-3.1-flash-lite']);

function resolveFreeTierModel(requested?: string): string {
  if (requested && ALLOWED_FREE_MODELS.has(requested)) {
    return requested;
  }
  return DEFAULT_MODEL_NAME;
}

const DRAWING_CATALOG = [
  {
    id: 'PR-100-PID-0001',
    drawingNo: 'H042-PR-100-PID-0001',
    moduleCode: '100',
    discipline: 'PID',
    serverPath: 'public/assets/aistudio/H042-PR-100-PID-0001_0_P_ID_for_RegasTainer_Module_76a38d14.pdf',
  },
  {
    id: 'PR-200-PID-0001',
    drawingNo: 'H042-PR-200-PID-0001',
    moduleCode: '200',
    discipline: 'PID',
    serverPath: 'public/assets/aistudio/H042-PR-200-PID-0001_0_P_ID_for_HP_Pump_Skid_Module_e2f7a353.pdf',
  },
  {
    id: 'PD-100-GAR-0001',
    drawingNo: 'H042-PD-100-GAR-0001',
    moduleCode: '100',
    discipline: 'GAR',
    serverPath: 'public/assets/aistudio/H042-PD-100-GAR-0001_A_Piping_Arrangement_for_Regastainer_Module_CABLE-No_20261112_5cf56683.pdf',
  },
  {
    id: 'PD-200-GAR-0001',
    drawingNo: 'H042-PD-200-GAR-0001',
    moduleCode: '200',
    discipline: 'GAR',
    serverPath: 'public/assets/aistudio/H042-PD-200-GAR-0001_A_Piping_Arrangement_for_HP_Pump_Skid_Module_CABLE-No_20261112_faa015ab.pdf',
  },
  {
    id: 'CI-000-DIA-0001',
    drawingNo: 'H042-CI-000-DIA-0001',
    moduleCode: 'ALL',
    discipline: 'ICAMS',
    serverPath: 'public/assets/aistudio/H042-CI-000-DIA-0001_Cable_Diagram_and_Connection_Drawing_for_iCAMS_RevB_d6edbea6.pdf',
  },
  {
    id: 'CI-000-DIA-0002',
    drawingNo: 'H042-CI-000-DIA-0002',
    moduleCode: 'ALL',
    discipline: 'PSDS',
    serverPath: 'public/assets/aistudio/H042-CI-000-DIA-0002_Cable_Diagram_and_Connection_Drawing_for_PSDS_RevB_dc4f003b.pdf',
  },
];

function getAiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      '서버 환경에 GEMINI_API_KEY가 아직 설정되지 않았습니다. Settings > Secrets 패널에서 GEMINI_API_KEY가 구성되어 있는지 확인해 주세요.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function loadPdfPartFromCatalog(drawingId: string) {
  const entry = DRAWING_CATALOG.find((d) => d.id === drawingId);
  if (!entry) return null;
  const fullPath = path.resolve(process.cwd(), entry.serverPath);
  if (!fs.existsSync(fullPath)) return null;
  const bytes = fs.readFileSync(fullPath);
  return {
    inlineData: {
      mimeType: 'application/pdf',
      data: bytes.toString('base64'),
    },
  };
}

interface CustomAttachment {
  name: string;
  role: 'PIPING' | 'ELECTRICAL';
  base64Data: string;
}

interface TrackInput {
  trackId: string;
  trackName: string;
  moduleCode: string;
  drawingIds: string[];
  prompt: string;
  customAttachments?: CustomAttachment[];
}

const AUDIT_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summaryKo: {
      type: Type.STRING,
      description: 'Concise Korean technical summary of the cross-diagram audit results.',
    },
    findings: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          tag: { type: Type.STRING },
          severity: { type: Type.STRING, enum: ['CRITICAL', 'WARNING', 'INFO'] },
          category: { type: Type.STRING },
          finding: { type: Type.STRING },
          sourceEvidence: { type: Type.STRING },
          recommendation: { type: Type.STRING },
          textRegions: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Exact verbatim tag numbers, cable numbers, JB labels, or text spans visible on the drawing to highlight on the PDF canvas.',
          },
          pageHint: {
            type: Type.INTEGER,
            description: '1-indexed PDF page number where the issue text region appears, if identifiable.',
          },
        },
        required: ['tag', 'severity', 'category', 'finding', 'sourceEvidence', 'recommendation'],
      },
    },
  },
  required: ['summaryKo', 'findings'],
};

async function executeAuditTrack(ai: GoogleGenAI, track: TrackInput, modelName: string) {
  const startedAt = Date.now();
  try {
    const parts: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> = [];

    for (const drawingId of track.drawingIds) {
      const pdfPart = loadPdfPartFromCatalog(drawingId);
      if (pdfPart) {
        parts.push(pdfPart);
      }
    }

    if (track.customAttachments && track.customAttachments.length > 0) {
      for (const att of track.customAttachments) {
        const cleanBase64 = att.base64Data.includes(',')
          ? att.base64Data.split(',')[1]
          : att.base64Data;
        parts.push({
          inlineData: {
            mimeType: 'application/pdf',
            data: cleanBase64,
          },
        });
      }
    }

    parts.push({
      text: track.prompt,
    });

    const isLite = modelName === 'gemini-3.1-flash-lite';
    const response = await ai.models.generateContent({
      model: modelName,
      contents: { parts },
      config: {
        systemInstruction:
          'You are a senior marine & LNG FSRU piping and instrumentation/electrical engineering auditor. ' +
          'Analyze the attached P&ID, Piping Arrangement (GAR with SEASTAR cable markups A/B/C/D/E), and iCAMS/PSDS Cable & Connection Drawings. ' +
          'Verify tag consistency (100/200/300/400 unit prefixes, SDV->SDY+ZSO/ZSC, FCV->FCV+FVI, PDIT/PIT/TIT/LIT), cable numbering, junction boxes, relay numbers, and revision drift. ' +
          'Respond in Korean technical language with exact English tag numbers and sheet references.',
        thinkingConfig: isLite
          ? { thinkingLevel: ThinkingLevel.LOW }
          : { thinkingLevel: ThinkingLevel.HIGH, includeThoughts: true },
        responseMimeType: 'application/json',
        responseSchema: AUDIT_RESPONSE_SCHEMA,
      },
    });

    const candidateParts = response.candidates?.[0]?.content?.parts || [];
    const thoughtSummary = candidateParts
      .filter((p) => (p as { thought?: boolean }).thought === true && typeof p.text === 'string')
      .map((p) => p.text)
      .join('\n')
      .trim();

    const parsed = JSON.parse(response.text || '{}');
    return {
      trackId: track.trackId,
      trackName: track.trackName,
      moduleCode: track.moduleCode,
      drawingIds: track.drawingIds,
      status: 'COMPLETED' as const,
      durationMs: Date.now() - startedAt,
      thoughtSummary: thoughtSummary || undefined,
      summaryKo: parsed.summaryKo || '분석이 완료되었습니다.',
      findings: Array.isArray(parsed.findings) ? parsed.findings : [],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      trackId: track.trackId,
      trackName: track.trackName,
      moduleCode: track.moduleCode,
      drawingIds: track.drawingIds,
      status: 'ERROR' as const,
      durationMs: Date.now() - startedAt,
      error: message,
    };
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      model: DEFAULT_MODEL_NAME,
      thinkingLevel: 'HIGH',
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      catalogCount: DRAWING_CATALOG.length,
      citationGuardrail: true,
      supportedDisciplines: ['PIPING', 'ELECTRICAL', 'INSTRUMENT', 'SAFETY_EX', 'POS', 'MAKER'],
    });
  });

  app.get('/api/drawings', (_req, res) => {
    res.json({ drawings: DRAWING_CATALOG });
  });

  // Single focused query across selected drawings or custom uploaded PDFs
  app.post('/api/analyze', async (req, res) => {
    try {
      const ai = getAiClient();
      const {
        query,
        drawingIds = ['PR-200-PID-0001', 'CI-000-DIA-0002'],
        customAttachments = [],
        model,
      } = req.body as {
        query?: string;
        drawingIds?: string[];
        customAttachments?: CustomAttachment[];
        model?: string;
      };

      if (!query || !query.trim()) {
        res.status(400).json({ error: '분석 질의(query)를 입력해 주세요.' });
        return;
      }

      const modelName = resolveFreeTierModel(model);
      const track: TrackInput = {
        trackId: 'SINGLE-FOCUS',
        trackName: '단일 집중 교차 검증',
        moduleCode: 'CUSTOM',
        drawingIds,
        customAttachments,
        prompt:
          `사용자 엔지니어링 검증 질의:\n${query}\n\n` +
          `첨부된 배관 도면(P&ID/GAR)과 전장 도면(iCAMS/PSDS)을 대조하여 정확한 태그, 케이블 번호, JB, 결선표 시트, 불일치 원인과 수정 권고안을 도출하세요.`,
      };

      const result = await executeAuditTrack(ai, track, modelName);
      if (result.status === 'ERROR') {
        res.status(502).json({ error: result.error });
        return;
      }

      res.json({
        model: modelName,
        thinkingLevel: modelName === 'gemini-3.1-flash-lite' ? 'LOW' : 'HIGH',
        totalDurationMs: result.durationMs,
        tracks: [result],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  // Parallel multi-track cross-matching verification using Promise.all
  app.post('/api/analyze-parallel', async (req, res) => {
    const totalStart = Date.now();
    try {
      const ai = getAiClient();
      const { focusQuery, customAttachments = [], model } = req.body as {
        focusQuery?: string;
        customAttachments?: CustomAttachment[];
        model?: string;
      };
      const modelName = resolveFreeTierModel(model);

      const extraNote = focusQuery?.trim()
        ? `\n추가 집중 검증 요청: ${focusQuery.trim()}`
        : '';

      const tracks: TrackInput[] = [
        {
          trackId: 'TRACK-100-REGAS',
          trackName: '트랙 1: Regastainer(100) P&ID · GAR ↔ iCAMS/PSDS 병렬 감사',
          moduleCode: '100',
          drawingIds: ['PR-100-PID-0001', 'PD-100-GAR-0001', 'CI-000-DIA-0001', 'CI-000-DIA-0002'],
          prompt:
            'Module 100(Regastainer) 도면(H042-PR-100-PID-0001, PD-100-GAR-0001)과 전장 도면(DIA-0001, DIA-0002)을 교차 검증하세요. ' +
            '특히 (1) SEASTAR Mark B(CABLE MISSING: SDV-254A, SDV-202A 등) 및 Mark C(RC**** 미할당: TCV-252A~E, UV-250A~C), ' +
            '(2) P&ID Rev. C에서 삭제된 TIT-252A~E의 DIA-0001 잔존 여부, (3) DIA-0001 R-03(RC03208)/R-06(RC04xx 복사오류)/E-01(RE0101 중복), ' +
            '(4) GAR E-201A vs E-202A 장비 태그 오기를 검증해 최대 6개 핵심 결함을 보고하세요.' +
            extraNote,
        },
        {
          trackId: 'TRACK-200-HPPUMP',
          trackName: '트랙 2: HP Pump Skid(200) P&ID · GAR ↔ iCAMS/PSDS 병렬 감사',
          moduleCode: '200',
          drawingIds: ['PR-200-PID-0001', 'PD-200-GAR-0001', 'CI-000-DIA-0001', 'CI-000-DIA-0002'],
          prompt:
            'Module 200(HP Pump Skid) 도면(H042-PR-200-PID-0001, PD-200-GAR-0001)과 전장 도면(DIA-0001, DIA-0002)을 교차 검증하세요. ' +
            '특히 (1) DIA-0002 H-06/Sheet 15의 200-SDY-101/102 vs 100-ZSO/ZSC-101/102 유닛코드 불일치 및 100-NISJB vs 200-NISJB 혼선, ' +
            '(2) DIA-0001 Sheet 12/22의 200-PEIT-111E 오타, (3) DIA-0002 H-05(200-ISJB-004/LIT-101D 복사오류) & H-09(VE-101A 복사오류) & Sheet 22 R76 릴레이 중복, ' +
            '(4) GAR 110-P-101A~E 오기를 검증해 최대 6개 핵심 결함을 보고하세요.' +
            extraNote,
        },
        {
          trackId: 'TRACK-CROSS-INTEGRITY',
          trackName: '트랙 3: 크로스 모듈(300/400) · 케이블 번호 · 리비전 정합성 병렬 감사',
          moduleCode: 'ALL',
          drawingIds: ['CI-000-DIA-0001', 'CI-000-DIA-0002'],
          customAttachments,
          prompt:
            'iCAMS(DIA-0001)와 PSDS(DIA-0002) 전체 블록도와 결선표를 교차 검증하세요. ' +
            '특히 (1) DIA-0002 R-01 상단/하단 중복 태그(100-PIT-210A vs 400-PIT-613A/B/C), ' +
            '(2) DIA-0001 E-01(100-GDJB-001)과 E-02(200-GDJB-001) 간 RE0101~0105 케이블 번호 충돌, ' +
            '(3) DIA-0001 R-07(RC710), E-02(HE0101 vs RE0101~0105) 등 도면 내 블록도-결선표 불일치와 업로드된 추가 도면(있는 경우)을 검증하세요.' +
            extraNote,
        },
      ];

      // Execute all 3 Gemini audit tracks concurrently
      const results = await Promise.all(tracks.map((t) => executeAuditTrack(ai, t, modelName)));

      const allFailed = results.every((r) => r.status === 'ERROR');
      if (allFailed) {
        res.status(502).json({
          error: results[0]?.error || '모든 병렬 Gemini 검증 트랙이 실패했습니다.',
          tracks: results,
        });
        return;
      }

      res.json({
        model: modelName,
        thinkingLevel: modelName === 'gemini-3.1-flash-lite' ? 'LOW' : 'HIGH',
        totalDurationMs: Date.now() - totalStart,
        tracks: results,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Marine Diagram Analyzer server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
