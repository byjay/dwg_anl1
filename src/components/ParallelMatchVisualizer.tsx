import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import {
  ArrowUpRight,
  Cable,
  ChevronDown,
  ChevronUp,
  FileSearch,
  GitFork,
  PieChart,
  RotateCcw,
} from 'lucide-react';
import {
  DrawingContentAnalysisReport,
  EvaluatedLoopMatch,
  ParallelBatchSummary,
} from '../types/diagram';
import { LoopFilterOptions } from '../utils/diagramMatcher';
import {
  buildDiagramNetworkGraph,
  buildParallelMatchSunburstTree,
  DiagramNetworkLink,
  DiagramNetworkNode,
  NetworkIconRole,
  SunburstNodeDatum,
} from '../utils/diagramGraphBuilder';

interface ParallelMatchVisualizerProps {
  loops: EvaluatedLoopMatch[];
  summary: ParallelBatchSummary;
  filters: LoopFilterOptions;
  onChangeFilters: (next: LoopFilterOptions) => void;
  onInspectLoop: (loopId: string) => void;
  onCompareInPdf: (loop: EvaluatedLoopMatch, autoInsert?: boolean) => void;
  analysisReport?: DrawingContentAnalysisReport | null;
}

type VisualViewMode = 'SPLIT' | 'SUNBURST' | 'NETWORK';

const LEGEND_ITEMS: Array<{ label: string; color: string }> = [
  { label: '정상 매칭', color: '#16A34A' },
  { label: '오기·충돌', color: '#DC2626' },
  { label: 'Mark B 누락', color: '#E11D48' },
  { label: 'Mark C 미할당', color: '#D97706' },
  { label: 'Mark D 단독', color: '#F59E0B' },
  { label: '리비전 불일치', color: '#9333EA' },
];

function getHealthStroke(health: DiagramNetworkLink['dominantHealth']): string {
  if (health === 'HEALTHY') return '#16A34A';
  if (health === 'WARNING') return '#D97706';
  return '#DC2626';
}

function getKindStroke(kind: DiagramNetworkNode['kind']): string {
  if (kind === 'PIPING') return '#0369A1';
  if (kind === 'GAR') return '#0D9488';
  if (kind === 'EXTERNAL_MAKER') return '#4F46E5';
  return '#334155';
}

export const ParallelMatchVisualizer: React.FC<ParallelMatchVisualizerProps> = ({
  loops,
  summary,
  filters,
  onChangeFilters,
  onInspectLoop,
  onCompareInPdf,
  analysisReport,
}) => {
  const [viewMode, setViewMode] = useState<VisualViewMode>('SPLIT');
  const [expanded, setExpanded] = useState(true);
  const [hoveredArc, setHoveredArc] = useState<SunburstNodeDatum | null>(null);
  const [focusedSunburstId, setFocusedSunburstId] = useState<string>('SB-ROOT');
  const [selectedNetworkNodeId, setSelectedNetworkNodeId] = useState<string | null>(null);
  const [selectedNetworkLinkId, setSelectedNetworkLinkId] = useState<string | null>(null);
  const [hoveredNetworkInfo, setHoveredNetworkInfo] = useState<string | null>(null);

  const sunburstSvgRef = useRef<SVGSVGElement | null>(null);
  const networkSvgRef = useRef<SVGSVGElement | null>(null);

  const sunburstTree = useMemo(
    () => buildParallelMatchSunburstTree(loops, summary),
    [loops, summary]
  );

  const networkGraph = useMemo(
    () => buildDiagramNetworkGraph(loops, analysisReport),
    [loops, analysisReport]
  );

  const focusedSunburstNode = useMemo(() => {
    const findNode = (node: SunburstNodeDatum): SunburstNodeDatum | null => {
      if (node.id === focusedSunburstId) return node;
      for (const ch of node.children || []) {
        const hit = findNode(ch);
        if (hit) return hit;
      }
      return null;
    };
    return findNode(sunburstTree) || sunburstTree;
  }, [sunburstTree, focusedSunburstId]);

  const activeSunburstDisplay = hoveredArc || focusedSunburstNode;

  // Render D3 Sunburst Chart
  useEffect(() => {
    if (!expanded || (viewMode !== 'SPLIT' && viewMode !== 'SUNBURST')) return;
    const svgEl = sunburstSvgRef.current;
    if (!svgEl) return;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const size = 420;
    const radius = size / 2 - 12;
    const innerHole = 54;
    const ringBounds: Array<[number, number]> = [
      [innerHole, 122],
      [122, 162],
      [162, radius],
    ];

    const rootHierarchy = d3
      .hierarchy<SunburstNodeDatum>(sunburstTree)
      .sum((d) => (d.kind === 'LOOP' ? 1 : 0))
      .sort((a, b) => (b.value || 0) - (a.value || 0));

    const partition = d3
      .partition<SunburstNodeDatum>()
      .size([2 * Math.PI, 3]);

    const partitioned = partition(rootHierarchy);

    const g = svg
      .append('g')
      .attr('transform', `translate(${size / 2},${size / 2})`);

    const arcGen = d3
      .arc<d3.HierarchyRectangularNode<SunburstNodeDatum>>()
      .startAngle((d) => d.x0)
      .endAngle((d) => d.x1)
      .padAngle((d) => Math.min((d.x1 - d.x0) / 2, 0.012))
      .padRadius(radius / 2)
      .innerRadius((d) => {
        const idx = Math.max(0, Math.min(2, d.depth - 1));
        return ringBounds[idx][0];
      })
      .outerRadius((d) => {
        const idx = Math.max(0, Math.min(2, d.depth - 1));
        return ringBounds[idx][1] - 2;
      });

    const descendants = partitioned.descendants().filter((d) => d.depth >= 1);

    const paths = g
      .selectAll<SVGPathElement, d3.HierarchyRectangularNode<SunburstNodeDatum>>('path.sunburst-arc')
      .data(descendants, (d) => d.data.id)
      .join('path')
      .attr('class', 'sunburst-arc')
      .attr('data-node-id', (d) => d.data.id)
      .attr('data-node-kind', (d) => d.data.kind)
      .attr('aria-label', (d) => `${d.data.name} (${d.data.matchRatePercent}%)`)
      .attr('d', arcGen)
      .attr('fill', (d) => d.data.color)
      .attr('fill-opacity', (d) => {
        if (focusedSunburstId !== 'SB-ROOT') {
          const matchesFocus =
            d.data.id === focusedSunburstId ||
            d.ancestors().some((a) => a.data.id === focusedSunburstId);
          if (!matchesFocus) return 0.28;
        }
        if (d.depth === 1) return 0.88;
        if (d.depth === 2) return 0.92;
        return 0.78;
      })
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 1.4)
      .style('cursor', 'pointer')
      .on('mouseenter', function (_, d) {
        d3.select(this).attr('stroke', '#0F172A').attr('stroke-width', 2);
        setHoveredArc(d.data);
      })
      .on('mouseleave', function () {
        d3.select(this).attr('stroke', '#ffffff').attr('stroke-width', 1.4);
        setHoveredArc(null);
      })
      .on('click', (_, d) => {
        const node = d.data;
        setFocusedSunburstId(node.id);
        if (node.kind === 'MODULE' && node.unitCode) {
          onChangeFilters({
            ...filters,
            unitCode: filters.unitCode === node.unitCode ? 'ALL' : node.unitCode,
            status: 'ALL',
          });
        } else if (node.kind === 'STATUS' && node.unitCode && node.status) {
          onChangeFilters({
            ...filters,
            unitCode: node.unitCode,
            status: node.status,
          });
        } else if (node.kind === 'LOOP' && node.loopId) {
          onInspectLoop(node.loopId);
        }
      });

    paths.append('title').text((d) => {
      const n = d.data;
      return `${n.name} · 정상 ${n.matchedCount} / 전체 ${n.totalCount} (${n.matchRatePercent}%)`;
    });

    // Module arc labels on ring 1 (upright Cartesian coordinates)
    g.selectAll<SVGTextElement, d3.HierarchyRectangularNode<SunburstNodeDatum>>('text.sunburst-label')
      .data(descendants.filter((d) => d.depth === 1 && d.x1 - d.x0 > 0.25))
      .join('text')
      .attr('class', 'sunburst-label')
      .attr('transform', (d) => {
        const midAngle = (d.x0 + d.x1) / 2;
        const r = (ringBounds[0][0] + ringBounds[0][1]) / 2;
        const lx = r * Math.sin(midAngle);
        const ly = -r * Math.cos(midAngle);
        return `translate(${lx},${ly})`;
      })
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', '#ffffff')
      .attr('font-size', '11px')
      .attr('font-weight', '700')
      .style('pointer-events', 'none')
      .text((d) => `${d.data.unitCode}`);

    // Center interactive reset circle (kept cleanly inside innerHole so inner arcs are unobstructed)
    const centerGroup = g
      .append('g')
      .attr('class', 'sunburst-reset-center')
      .attr('aria-label', '전체 시스템 필터 초기화')
      .style('cursor', 'pointer')
      .on('click', () => {
        setFocusedSunburstId('SB-ROOT');
        setHoveredArc(null);
        onChangeFilters({ unitCode: 'ALL', status: 'ALL', system: 'ALL', query: '' });
      });

    centerGroup
      .append('circle')
      .attr('r', 48)
      .attr('fill', '#F8FAFC')
      .attr('stroke', '#CBD5E1')
      .attr('stroke-width', 1.2);
  }, [
    expanded,
    viewMode,
    sunburstTree,
    focusedSunburstId,
    filters,
    onChangeFilters,
    onInspectLoop,
  ]);

  // Render D3 Force-Stabilized Cross-Drawing Network Graph
  useEffect(() => {
    if (!expanded || (viewMode !== 'SPLIT' && viewMode !== 'NETWORK')) return;
    const svgEl = networkSvgRef.current;
    if (!svgEl) return;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const width = 640;
    const height = 420;

    // Column guidance bands with concise engineering icons
    const columns = [
      { label: '⋈ 배관 (P&ID)', x: width * 0.16 },
      { label: '⊞ 배치 (GAR) · 메이커', x: width * 0.49 },
      { label: '⚡ 전장 · 케이블 (DIA)', x: width * 0.84 },
    ];

    const bgLayer = svg.append('g');
    bgLayer
      .selectAll('line.col-guide')
      .data(columns)
      .join('line')
      .attr('x1', (d) => d.x)
      .attr('x2', (d) => d.x)
      .attr('y1', 28)
      .attr('y2', height - 14)
      .attr('stroke', '#E2E8F0')
      .attr('stroke-dasharray', '3,3');

    bgLayer
      .selectAll('text.col-title')
      .data(columns)
      .join('text')
      .attr('x', (d) => d.x)
      .attr('y', 18)
      .attr('text-anchor', 'middle')
      .attr('fill', '#475569')
      .attr('font-size', '11px')
      .attr('font-weight', '600')
      .text((d) => d.label);

    type SimNode = DiagramNetworkNode & d3.SimulationNodeDatum;
    type SimLink = Omit<DiagramNetworkLink, 'source' | 'target'> & {
      source: SimNode;
      target: SimNode;
      badgeT?: number;
    };

    const simNodes: SimNode[] = networkGraph.nodes.map((n) => ({
      ...n,
      x: n.anchorXRatio * width,
      y: 36 + n.anchorYRatio * (height - 62),
    }));
    const nodeById = new Map<string, SimNode>(simNodes.map((n) => [n.id, n]));

    const simLinks: SimLink[] = networkGraph.links
      .map((l) => {
        const s = nodeById.get(l.source);
        const t = nodeById.get(l.target);
        if (!s || !t) return null;
        return { ...l, source: s, target: t };
      })
      .filter((x): x is SimLink => x !== null);

    // Deterministic settled force simulation around layer anchors
    const sim = d3
      .forceSimulation<SimNode>(simNodes)
      .force(
        'x',
        d3.forceX<SimNode>((d) => d.anchorXRatio * width).strength(0.95)
      )
      .force(
        'y',
        d3.forceY<SimNode>((d) => 36 + d.anchorYRatio * (height - 68)).strength(0.85)
      )
      .force('collide', d3.forceCollide<SimNode>(42))
      .force(
        'link',
        d3
          .forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance(145)
          .strength(0.1)
      )
      .stop();

    for (let i = 0; i < 120; i++) {
      sim.tick();
    }
    for (const n of simNodes) {
      n.x = Math.max(58, Math.min(width - 58, n.x || n.anchorXRatio * width));
      n.y = Math.max(52, Math.min(height - 38, n.y || n.anchorYRatio * height));
    }

    const linkLayer = svg.append('g');
    const linkLabelLayer = svg.append('g');
    const nodeLayer = svg.append('g');

    const getQuadBezierControl = (d: SimLink) => {
      const sx = d.source.x ?? 0;
      const sy = d.source.y ?? 0;
      const tx = d.target.x ?? 0;
      const ty = d.target.y ?? 0;
      const cx = (sx + tx) / 2;
      const cy = (sy + ty) / 2 - (ty - sy) * 0.12;
      return { sx, sy, cx, cy, tx, ty };
    };

    const evalQuadBezier = (d: SimLink, t: number) => {
      const { sx, sy, cx, cy, tx, ty } = getQuadBezierControl(d);
      const u = 1 - t;
      return {
        x: u * u * sx + 2 * u * t * cx + t * t * tx,
        y: u * u * sy + 2 * u * t * cy + t * t * ty,
      };
    };

    const linkPath = (d: SimLink) => {
      const { sx, sy, cx, cy, tx, ty } = getQuadBezierControl(d);
      return `M${sx},${sy} Q${cx},${cy} ${tx},${ty}`;
    };

    const cableJacketEls = linkLayer
      .selectAll<SVGPathElement, SimLink>('path.net-cable-jacket')
      .data(simLinks, (d) => d.id)
      .join('path')
      .attr('class', 'net-cable-jacket')
      .attr('d', linkPath)
      .attr('fill', 'none')
      .attr('stroke', '#E2E8F0')
      .attr('stroke-linecap', 'round')
      .attr('stroke-width', (d) => Math.max(4.5, Math.min(9.5, 4 + d.totalLoops * 0.55)))
      .attr('stroke-opacity', (d) => {
        if (selectedNetworkLinkId) return d.id === selectedNetworkLinkId ? 0.95 : 0.25;
        if (selectedNetworkNodeId) {
          return d.source.id === selectedNetworkNodeId || d.target.id === selectedNetworkNodeId
            ? 0.9
            : 0.2;
        }
        return 0.72;
      })
      .style('pointer-events', 'none');

    const linkEls = linkLayer
      .selectAll<SVGPathElement, SimLink>('path.net-link')
      .data(simLinks, (d) => d.id)
      .join('path')
      .attr('class', 'net-link')
      .attr('d', linkPath)
      .attr('fill', 'none')
      .attr('stroke', (d) => getHealthStroke(d.dominantHealth))
      .attr('stroke-linecap', 'round')
      .attr('stroke-dasharray', (d) =>
        d.cableContinuity === 'BROKEN'
          ? '4,4'
          : d.cableContinuity === 'PARTIAL'
            ? '8,3'
            : 'none'
      )
      .attr('stroke-width', (d) => Math.max(1.8, Math.min(4.8, 1.4 + d.totalLoops * 0.42)))
      .attr('stroke-opacity', (d) => {
        if (selectedNetworkLinkId) return d.id === selectedNetworkLinkId ? 0.98 : 0.25;
        if (selectedNetworkNodeId) {
          return d.source.id === selectedNetworkNodeId || d.target.id === selectedNetworkNodeId
            ? 0.95
            : 0.2;
        }
        return 0.85;
      })
      .style('cursor', 'pointer')
      .on('mouseenter', (_, d) => {
        const cableTxt =
          d.sampleCables.length > 0 ? ` · 케이블 ${d.sampleCables.slice(0, 3).join(', ')}` : '';
        setHoveredNetworkInfo(
          `${d.source.shortLabel} ── ${d.target.shortLabel} · ${d.totalLoops}루프 (정상 ${d.matchedLoops}/이슈 ${d.issueLoops})${cableTxt}`
        );
      })
      .on('mouseleave', () => setHoveredNetworkInfo(null))
      .on('click', (_, d) => {
        setSelectedNetworkNodeId(null);
        setSelectedNetworkLinkId((prev) => (prev === d.id ? null : d.id));
      });

    linkEls.append('title').text(
      (d) =>
        `${d.source.label} -> ${d.target.label}: 정상 ${d.matchedLoops} / 이슈 ${d.issueLoops}${
          d.sampleCables.length > 0 ? ` (${d.sampleCables.join(', ')})` : ''
        }`
    );

    const badgedLinks = simLinks.filter((l) => l.issueLoops > 0 || l.totalLoops >= 2);
    const placedBadges: Array<{ x: number; y: number }> = [];
    const candidateTs = [0.5, 0.36, 0.64, 0.28, 0.72, 0.43, 0.57];

    for (const link of badgedLinks) {
      let bestT = 0.5;
      let bestPenalty = Number.POSITIVE_INFINITY;
      for (const t of candidateTs) {
        const pt = evalQuadBezier(link, t);
        let penalty = Math.abs(t - 0.5) * 8;
        for (const n of simNodes) {
          const dx = pt.x - (n.x ?? 0);
          const dy = pt.y - (n.y ?? 0);
          const dist = Math.hypot(dx, dy);
          if (dist < 42) penalty += (42 - dist) * 20;
        }
        for (const b of placedBadges) {
          const dx = Math.abs(pt.x - b.x);
          const dy = Math.abs(pt.y - b.y);
          if (dx < 42 && dy < 20) penalty += (42 - dx) * 18 + (20 - dy) * 24;
        }
        if (penalty < bestPenalty) {
          bestPenalty = penalty;
          bestT = t;
        }
      }
      link.badgeT = bestT;
      placedBadges.push(evalQuadBezier(link, bestT));
    }

    const linkLabels = linkLabelLayer
      .selectAll<SVGGElement, SimLink>('g.net-link-badge')
      .data(badgedLinks, (d) => d.id)
      .join('g')
      .attr('class', 'net-link-badge')
      .attr('transform', (d) => {
        const pt = evalQuadBezier(d, d.badgeT ?? 0.5);
        return `translate(${pt.x},${pt.y})`;
      })
      .style('pointer-events', 'none');

    linkLabels
      .append('rect')
      .attr('x', -18)
      .attr('y', -9)
      .attr('width', 36)
      .attr('height', 16)
      .attr('rx', 3)
      .attr('fill', '#ffffff')
      .attr('stroke', (d) => getHealthStroke(d.dominantHealth))
      .attr('stroke-width', 1);

    linkLabels
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('y', 2.5)
      .attr('font-size', '9.5px')
      .attr('font-family', 'ui-monospace, monospace')
      .attr('font-weight', '600')
      .attr('fill', (d) => getHealthStroke(d.dominantHealth))
      .text((d) => (d.issueLoops > 0 ? `!${d.issueLoops}/${d.totalLoops}` : `${d.totalLoops}`));

    const nodeRingArc = d3
      .arc<{ startAngle: number; endAngle: number }>()
      .innerRadius(22)
      .outerRadius(26.5);

    const drawNodeIcon = (gNode: d3.Selection<SVGGElement, SimNode, null, undefined>, role: NetworkIconRole) => {
      const iconG = gNode
        .append('g')
        .attr('transform', 'translate(0, -11.5)')
        .attr('fill', 'none')
        .attr('stroke', getKindStroke(
          role === 'PID'
            ? 'PIPING'
            : role === 'GAR'
              ? 'GAR'
              : role === 'MAKER'
                ? 'EXTERNAL_MAKER'
                : 'ELECTRICAL'
        ))
        .attr('stroke-width', 1.4)
        .attr('stroke-linecap', 'round')
        .attr('stroke-linejoin', 'round')
        .style('pointer-events', 'none');

      if (role === 'PID') {
        // Bowtie control valve / instrument symbol
        iconG.append('path').attr('d', 'M-5,-3.5 L5,3.5 L5,-3.5 L-5,3.5 Z');
      } else if (role === 'GAR') {
        // Deck/Skid 2x2 grid
        iconG.append('rect').attr('x', -4.5).attr('y', -4.5).attr('width', 9).attr('height', 9).attr('rx', 1);
        iconG.append('path').attr('d', 'M0,-4.5 L0,4.5 M-4.5,0 L4.5,0');
      } else if (role === 'UNLINKED') {
        // Disconnected cable gap
        iconG.append('path').attr('stroke', '#D97706').attr('d', 'M-5,0 L-1.5,0 M1.5,0 L5,0 M-1,-3 L1,3');
      } else if (role === 'MCC') {
        // Breaker switch symbol
        iconG.append('rect').attr('x', -4.5).attr('y', -4.5).attr('width', 9).attr('height', 9).attr('rx', 1.5);
        iconG.append('path').attr('d', 'M-2,1 L0,-2 L2,1');
      } else if (role === 'MAKER') {
        // Package / vendor cube
        iconG.append('path').attr('d', 'M0,-5 L4.5,-2.5 L4.5,2.5 L0,5 L-4.5,2.5 L-4.5,-2.5 Z');
      } else {
        // Electrical signal bolt (ICAMS / PSDS)
        iconG.append('path').attr('d', 'M1,-5 L-3,0.5 L0.5,0.5 L-1,5 L3,-0.5 L-0.5,-0.5 Z');
      }
    };

    const nodeGroups = nodeLayer
      .selectAll<SVGGElement, SimNode>('g.net-node')
      .data(simNodes, (d) => d.id)
      .join('g')
      .attr('class', 'net-node')
      .attr('data-node-id', (d) => d.id)
      .attr('aria-label', (d) => `${d.label} (${d.matchRatePercent}%)`)
      .attr('transform', (d) => `translate(${d.x},${d.y})`)
      .style('cursor', 'pointer')
      .on('mouseenter', (_, d) => {
        setHoveredNetworkInfo(
          `${d.label} · 매칭률 ${d.matchRatePercent}% (정상 ${d.matchedLoops} / 이슈 ${d.issueLoops})`
        );
      })
      .on('mouseleave', () => setHoveredNetworkInfo(null))
      .on('click', (_, d) => {
        setSelectedNetworkLinkId(null);
        setSelectedNetworkNodeId((prev) => (prev === d.id ? null : d.id));
        if (d.unitCode) {
          onChangeFilters({
            ...filters,
            unitCode: filters.unitCode === d.unitCode ? 'ALL' : d.unitCode,
          });
        } else if (d.systemFilter) {
          onChangeFilters({
            ...filters,
            system: filters.system === d.systemFilter ? 'ALL' : d.systemFilter,
          });
        }
      });

    // Outer white halo
    nodeGroups
      .append('circle')
      .attr('r', 28)
      .attr('fill', '#ffffff')
      .attr('stroke', (d) =>
        selectedNetworkNodeId === d.id ? '#0F172A' : getKindStroke(d.kind)
      )
      .attr('stroke-width', (d) => (selectedNetworkNodeId === d.id ? 2.5 : 1.2));

    // Match rate ring + embedded engineering icon
    nodeGroups.each(function (d) {
      const gNode = d3.select<SVGGElement, SimNode>(this);
      const frac = Math.max(0, Math.min(1, d.matchRatePercent / 100));
      const matchedAngle = frac * 2 * Math.PI;

      if (matchedAngle > 0) {
        gNode
          .append('path')
          .attr(
            'd',
            nodeRingArc({
              startAngle: 0,
              endAngle: matchedAngle,
            }) || ''
          )
          .attr('fill', '#16A34A');
      }
      if (matchedAngle < 2 * Math.PI) {
        gNode
          .append('path')
          .attr(
            'd',
            nodeRingArc({
              startAngle: matchedAngle,
              endAngle: 2 * Math.PI,
            }) || ''
          )
          .attr('fill', d.criticalCount > 0 ? '#DC2626' : '#D97706');
      }

      drawNodeIcon(gNode, d.iconRole);
    });

    // Inner percentage & counts inside node
    nodeGroups
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('y', 3.5)
      .attr('font-size', '10px')
      .attr('font-weight', '700')
      .attr('fill', '#0F172A')
      .attr('font-family', 'ui-monospace, monospace')
      .text((d) => `${d.matchRatePercent}%`);

    nodeGroups
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('y', 13.5)
      .attr('font-size', '8px')
      .attr('fill', (d) => (d.issueLoops > 0 ? '#B91C1C' : '#15803D'))
      .attr('font-family', 'ui-monospace, monospace')
      .text((d) => `${d.matchedLoops}/${d.totalLoops}`);

    // Node caption below circle
    nodeGroups
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('y', 40)
      .attr('font-size', '10.5px')
      .attr('font-weight', '600')
      .attr('fill', '#1E293B')
      .text((d) => d.shortLabel);

    // Enable D3 drag repositioning on nodes
    const dragBehavior = d3
      .drag<SVGGElement, SimNode>()
      .on('drag', function (event, d) {
        d.x = Math.max(44, Math.min(width - 44, event.x));
        d.y = Math.max(38, Math.min(height - 36, event.y));
        d3.select(this).attr('transform', `translate(${d.x},${d.y})`);
        cableJacketEls.attr('d', linkPath);
        linkEls.attr('d', linkPath);
        linkLabels.attr('transform', (l) => {
          const pt = evalQuadBezier(l, l.badgeT ?? 0.5);
          return `translate(${pt.x},${pt.y})`;
        });
      });

    nodeGroups.call(dragBehavior);
  }, [
    expanded,
    viewMode,
    networkGraph,
    selectedNetworkNodeId,
    selectedNetworkLinkId,
    filters,
    onChangeFilters,
  ]);

  const selectedNetworkTargetLoops = useMemo(() => {
    if (selectedNetworkLinkId) {
      const link = networkGraph.links.find((l) => l.id === selectedNetworkLinkId);
      if (!link) return [];
      return loops.filter((l) => link.discrepantLoopIds.includes(l.id));
    }
    if (selectedNetworkNodeId) {
      const node = networkGraph.nodes.find((n) => n.id === selectedNetworkNodeId);
      if (!node) return [];
      return loops.filter((l) => node.loopIds.includes(l.id) && l.status !== 'MATCHED');
    }
    return [];
  }, [selectedNetworkLinkId, selectedNetworkNodeId, networkGraph, loops]);

  const hasVizSelection =
    focusedSunburstId !== 'SB-ROOT' ||
    selectedNetworkNodeId !== null ||
    selectedNetworkLinkId !== null;

  return (
    <section
      aria-label="도면 매칭 상태 D3 시각화"
      className="rounded border border-slate-200 bg-white"
    >
      {/* Header & Mode Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-2.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xs font-semibold tracking-tight text-slate-900">
              병렬 분석 매칭률 · 도면 연결 토폴로지 (D3)
            </h2>
            <span className="text-[11px] text-slate-500 tabular-nums">
              전체 {summary.totalLoops}루프 · 정상 {summary.matchedCount} ({summary.matchRatePercent}%) · 불일치/누락 {summary.totalLoops - summary.matchedCount}건
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {hasVizSelection && (
            <button
              type="button"
              onClick={() => {
                setFocusedSunburstId('SB-ROOT');
                setSelectedNetworkNodeId(null);
                setSelectedNetworkLinkId(null);
                onChangeFilters({ unitCode: 'ALL', status: 'ALL', system: 'ALL', query: '' });
              }}
              className="inline-flex h-7 items-center gap-1 whitespace-nowrap rounded border border-slate-300 bg-white px-2 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
            >
              <RotateCcw className="h-3 w-3" />
              <span>선택 해제</span>
            </button>
          )}

          <div className="inline-flex rounded border border-slate-200 bg-slate-100 p-0.5">
            <button
              type="button"
              onClick={() => {
                setExpanded(true);
                setViewMode('SPLIT');
              }}
              className={`h-6 whitespace-nowrap rounded px-2 text-[11px] font-medium transition-colors ${
                viewMode === 'SPLIT' && expanded
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              분할 보기
            </button>
            <button
              type="button"
              onClick={() => {
                setExpanded(true);
                setViewMode('SUNBURST');
              }}
              className={`inline-flex h-6 items-center gap-1 whitespace-nowrap rounded px-2 text-[11px] font-medium transition-colors ${
                viewMode === 'SUNBURST' && expanded
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <PieChart className="h-3 w-3" />
              <span>썬버스트</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setExpanded(true);
                setViewMode('NETWORK');
              }}
              className={`inline-flex h-6 items-center gap-1 whitespace-nowrap rounded px-2 text-[11px] font-medium transition-colors ${
                viewMode === 'NETWORK' && expanded
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <GitFork className="h-3 w-3" />
              <span>네트워크</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="inline-flex h-7 items-center gap-1 whitespace-nowrap rounded border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            <span>{expanded ? '접기' : '펼치기'}</span>
          </button>
        </div>
      </div>

      {expanded && (
        <div className="p-4">
          {loops.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500">
              시각화할 루프 데이터가 없습니다. 루프를 추가하거나 병렬 매칭을 실행해 주세요.
            </div>
          ) : (
            <div
              className={`grid grid-cols-1 gap-4 ${
                viewMode === 'SPLIT' ? 'lg:grid-cols-12' : ''
              }`}
            >
              {/* Left: D3 Sunburst Chart */}
              {(viewMode === 'SPLIT' || viewMode === 'SUNBURST') && (
                <div
                  className={`flex flex-col justify-between rounded border border-slate-200 bg-slate-50/40 p-3.5 ${
                    viewMode === 'SPLIT' ? 'lg:col-span-5' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-800">
                      계층형 매칭 분포 (Sunburst)
                    </span>
                    <span className="text-[11px] text-slate-500">
                      모듈 → 상태 → 루프 클릭 시 필터
                    </span>
                  </div>

                  <div className="relative mx-auto my-2 flex w-full max-w-[380px] items-center justify-center">
                    <svg
                      ref={sunburstSvgRef}
                      viewBox="0 0 420 420"
                      aria-label="유닛·매칭 상태별 D3 썬버스트 차트"
                      className="h-auto w-full select-none"
                    />
                    {/* Center KPI Overlay */}
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="max-w-[76px] truncate text-[9px] font-medium text-slate-500">
                        {activeSunburstDisplay.shortLabel}
                      </span>
                      <span
                        className={`font-mono text-lg leading-tight font-bold tabular-nums ${
                          activeSunburstDisplay.matchRatePercent >= 70
                            ? 'text-emerald-700'
                            : activeSunburstDisplay.matchRatePercent >= 30
                              ? 'text-amber-700'
                              : 'text-red-700'
                        }`}
                      >
                        {activeSunburstDisplay.matchRatePercent}%
                      </span>
                      <span className="max-w-[82px] text-[9px] font-medium text-slate-600 tabular-nums">
                        정상 {activeSunburstDisplay.matchedCount} · 이슈{' '}
                        {activeSunburstDisplay.issueCount}
                      </span>
                    </div>
                  </div>

                  {/* Active Arc Readout + Legend */}
                  <div className="space-y-2 border-t border-slate-200 pt-2.5 text-[11px]">
                    <div className="flex items-center justify-between gap-2 text-slate-700">
                      <span className="truncate font-medium">
                        {activeSunburstDisplay.name}
                      </span>
                      <span className="shrink-0 font-mono text-slate-600 tabular-nums">
                        총 {activeSunburstDisplay.totalCount}루프
                        {activeSunburstDisplay.completenessScore !== undefined
                          ? ` · 완전도 ${activeSunburstDisplay.completenessScore}%`
                          : ''}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-slate-600">
                      {LEGEND_ITEMS.map((item) => (
                        <span key={item.label} className="inline-flex items-center gap-1">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-xs"
                            style={{ backgroundColor: item.color }}
                          />
                          <span>{item.label}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Right: D3 Cross-Drawing Network Graph */}
              {(viewMode === 'SPLIT' || viewMode === 'NETWORK') && (
                <div
                  className={`flex flex-col justify-between rounded border border-slate-200 bg-slate-50/40 p-3.5 ${
                    viewMode === 'SPLIT' ? 'lg:col-span-7' : ''
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-800">
                      도면 간 교차 연결 네트워크 (P&amp;ID ↔ GAR ↔ 전장 DIA)
                    </span>
                    <span className="text-[11px] text-slate-500 tabular-nums">
                      도면 노드 {networkGraph.overallStats.totalNodes}개 · 연결선{' '}
                      {networkGraph.overallStats.totalLinks}개
                      {networkGraph.overallStats.externalDocsLinked > 0
                        ? ` · 외부/메이커 ${networkGraph.overallStats.externalDocsLinked}종`
                        : ''}
                    </span>
                  </div>

                  <div className="my-2 overflow-hidden rounded border border-slate-200 bg-white">
                    <svg
                      ref={networkSvgRef}
                      viewBox="0 0 640 420"
                      aria-label="도면 간 교차 매칭 D3 네트워크 그래프"
                      className={`mx-auto h-auto w-full select-none ${
                        viewMode === 'NETWORK' ? 'max-h-[450px] max-w-[740px]' : ''
                      }`}
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-2 text-[11px] text-slate-600">
                    <span className="truncate font-medium text-slate-700">
                      {hoveredNetworkInfo ||
                        '노드 드래그로 배치 조정, 노드/연결선 클릭 시 관련 불일치 루프 필터 및 추적'}
                    </span>
                    <div className="flex shrink-0 items-center gap-3 text-[10.5px]">
                      <span className="inline-flex items-center gap-1">
                        <span className="inline-block h-1 w-3.5 rounded-full bg-emerald-600" />
                        <span>정상 케이블</span>
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="inline-block w-3.5 border-t-2 border-dashed border-amber-600" />
                        <span>부분/미할당</span>
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="inline-block w-3.5 border-t-2 border-dashed border-red-600" />
                        <span>단절/충돌</span>
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Selected Node/Edge Discrepant Cable Flow Strip */}
          {selectedNetworkTargetLoops.length > 0 && (
            <div className="mt-3 rounded border border-slate-200 bg-slate-50 px-3 py-2.5">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
                  <Cable className="h-3.5 w-3.5 text-sky-700" />
                  <span>
                    선택된 경로 케이블·루프 불일치 ({selectedNetworkTargetLoops.length}건)
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedNetworkNodeId(null);
                    setSelectedNetworkLinkId(null);
                  }}
                  className="text-[11px] text-slate-500 hover:text-slate-900"
                >
                  닫기
                </button>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
                {selectedNetworkTargetLoops.slice(0, 6).map((loop) => {
                  const shortCable =
                    loop.primaryCableNo === 'UNWIRED'
                      ? '미연결'
                      : loop.primaryCableNo.split(/\s+/)[0];
                  return (
                    <div
                      key={loop.id}
                      className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 font-mono text-[11px]">
                          <span className="font-semibold text-slate-900">
                            {loop.canonicalTag}
                          </span>
                          <span className="text-slate-300">──</span>
                          <span className="inline-flex items-center gap-0.5 text-sky-800">
                            <Cable className="h-3 w-3 shrink-0" />
                            <span>{shortCable}</span>
                          </span>
                          <span className="text-slate-300">──</span>
                          <span className="truncate text-slate-500">
                            {loop.primaryJunctionBox}
                          </span>
                        </div>
                        <div className="truncate text-[10.5px] text-amber-800">
                          {loop.statusLabelKo}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onCompareInPdf(loop, true)}
                          aria-label={`${loop.canonicalTag} PDF 확인`}
                          className="inline-flex h-6 items-center gap-1 rounded border border-slate-200 px-1.5 text-[10.5px] font-medium text-sky-800 hover:bg-sky-50"
                        >
                          <FileSearch className="h-3 w-3" />
                          <span>PDF</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onInspectLoop(loop.id)}
                          aria-label={`${loop.canonicalTag} 추적`}
                          className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-200 text-slate-600 hover:text-sky-700"
                        >
                          <ArrowUpRight className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
