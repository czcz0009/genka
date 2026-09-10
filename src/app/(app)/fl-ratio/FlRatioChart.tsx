"use client";

import { useState } from "react";
import { FL_BENCHMARK_PERCENT, FLR_BENCHMARK_PERCENT, type Severity } from "@/lib/flRatio";

export interface TrendPoint {
  month: string;
  label: string;
  totalSales: number;
  laborCost: number | null;
  rentCost: number | null;
  foodCostRate: number | null;
  laborCostRate: number | null;
  flRate: number | null;
  flrRate: number | null;
  flSeverity: Severity | null;
  flrSeverity: Severity | null;
}

// dataviz参考パレット slot1(blue)/slot2(orange)。隣接ペアでCVD分離を検証済み
// (node scripts/validate_palette.js "#2a78d6,#eb6834" --mode light/dark -> ALL PASS)。
const FL_COLOR = { light: "#2a78d6", dark: "#3987e5" };
const FLR_COLOR = { light: "#eb6834", dark: "#d95926" };

const WIDTH = 640;
const HEIGHT = 260;
const PADDING = { top: 16, right: 16, bottom: 28, left: 40 };

/** 「きりのいい」目盛り間隔(1/2/5×10^nのいずれか)を選ぶ */
function niceStep(roughStep: number): number {
  if (roughStep <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const residual = roughStep / magnitude;
  const niceResidual = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10;
  return niceResidual * magnitude;
}

export function FlRatioChart({ trend }: { trend: TrendPoint[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const plotW = WIDTH - PADDING.left - PADDING.right;
  const plotH = HEIGHT - PADDING.top - PADDING.bottom;

  // 実データがFLR目安+αを大きく超える(原価が異常値など)場合でも、目盛りが
  // 意味を保つよう、実際の最大値に応じてきりのいい間隔・上限を計算する
  // (固定で0/25/50/75/100%だけ引くと、スケールが伸びたときに目盛りが
  // 全部下の方に潰れて読めなくなる)。
  const values = trend.flatMap((t) => [t.flRate, t.flrRate]).filter((v): v is number => v != null);
  const rawMax = Math.max(FLR_BENCHMARK_PERCENT + 10, ...values, 10);
  const step = niceStep(rawMax / 4);
  const maxValue = Math.ceil(rawMax / step) * step;

  const xFor = (idx: number) =>
    trend.length <= 1 ? PADDING.left + plotW / 2 : PADDING.left + (idx / (trend.length - 1)) * plotW;
  const yFor = (v: number) => PADDING.top + plotH - (Math.min(v, maxValue) / maxValue) * plotH;

  function linePath(key: "flRate" | "flrRate"): string {
    let d = "";
    let drawing = false;
    trend.forEach((t, idx) => {
      const v = t[key];
      if (v == null) {
        drawing = false;
        return;
      }
      const cmd = drawing ? "L" : "M";
      d += `${cmd}${xFor(idx).toFixed(1)},${yFor(v).toFixed(1)} `;
      drawing = true;
    });
    return d.trim();
  }

  const gridLines: number[] = [];
  for (let v = 0; v <= maxValue + 1e-9; v += step) gridLines.push(Math.round(v));
  const hovered = hoverIdx != null ? trend[hoverIdx] : null;

  return (
    <div className="fl-ratio-chart rounded border p-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      <style>{`
        .fl-ratio-chart { --fl-color: ${FL_COLOR.light}; --flr-color: ${FLR_COLOR.light}; }
        @media (prefers-color-scheme: dark) {
          .fl-ratio-chart { --fl-color: ${FL_COLOR.dark}; --flr-color: ${FLR_COLOR.dark}; }
        }
      `}</style>
      <div className="mb-3 flex items-center gap-4 text-xs">
        <LegendSwatch label="FL比率" colorVar="--fl-color" />
        <LegendSwatch label="FLR比率" colorVar="--flr-color" />
      </div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label="FL比率・FLR比率の月次推移">
        {/* 目盛りの補助線 */}
        {gridLines.map((v) => (
          <g key={v}>
            <line
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={yFor(v)}
              y2={yFor(v)}
              stroke="var(--border)"
              strokeWidth={1}
            />
            <text x={PADDING.left - 6} y={yFor(v) + 3} textAnchor="end" fill="var(--muted-foreground)" fontSize={9}>
              {v}%
            </text>
          </g>
        ))}

        {/* 業界目安の基準線 */}
        <ReferenceLine y={yFor(FL_BENCHMARK_PERCENT)} label={`FL目安${FL_BENCHMARK_PERCENT}%`} width={WIDTH} padding={PADDING} />
        <ReferenceLine y={yFor(FLR_BENCHMARK_PERCENT)} label={`FLR目安${FLR_BENCHMARK_PERCENT}%`} width={WIDTH} padding={PADDING} />

        {/* データ線 */}
        <path d={linePath("flRate")} fill="none" className="stroke-[--fl-color]" strokeWidth={2} strokeLinecap="round" />
        <path
          d={linePath("flrRate")}
          fill="none"
          className="stroke-[--flr-color]"
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray="5 3"
        />

        {trend.map((t, idx) => (
          <g key={t.month}>
            {t.flRate != null && <circle cx={xFor(idx)} cy={yFor(t.flRate)} r={3} className="fill-[--fl-color]" />}
            {t.flrRate != null && <circle cx={xFor(idx)} cy={yFor(t.flrRate)} r={3} className="fill-[--flr-color]" />}
            {/* ホバー用の当たり判定(マーカーより広め) */}
            <rect
              x={xFor(idx) - plotW / Math.max(trend.length, 1) / 2}
              y={PADDING.top}
              width={plotW / Math.max(trend.length, 1)}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(idx)}
              onMouseLeave={() => setHoverIdx((cur) => (cur === idx ? null : cur))}
            />
            <text
              x={xFor(idx)}
              y={HEIGHT - 8}
              textAnchor="middle"
              fill="var(--muted-foreground)"
              fontSize={9}
            >
              {t.label.replace(/^\d+年/, "")}
            </text>
            {hoverIdx === idx && (
              <line
                x1={xFor(idx)}
                x2={xFor(idx)}
                y1={PADDING.top}
                y2={PADDING.top + plotH}
                stroke="var(--border)"
                strokeWidth={1}
              />
            )}
          </g>
        ))}
      </svg>

      {hovered && (
        <div className="mt-2 rounded border px-3 py-2 text-xs" style={{ borderColor: "var(--border)", background: "var(--muted)", color: "var(--foreground)" }}>
          <span className="font-medium">{hovered.label}</span>
          <span className="ml-3">FL: {hovered.flRate != null ? `${hovered.flRate.toFixed(1)}%` : "-"}</span>
          <span className="ml-3">FLR: {hovered.flrRate != null ? `${hovered.flrRate.toFixed(1)}%` : "-"}</span>
        </div>
      )}
    </div>
  );
}

function LegendSwatch({ colorVar, label }: { colorVar: "--fl-color" | "--flr-color"; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: `var(${colorVar})` }}
      />
      <span style={{ color: "var(--muted-foreground)" }}>{label}</span>
    </span>
  );
}

function ReferenceLine({
  y,
  label,
  width,
  padding,
}: {
  y: number;
  label: string;
  width: number;
  padding: { left: number; right: number };
}) {
  return (
    <g>
      <line
        x1={padding.left}
        x2={width - padding.right}
        y1={y}
        y2={y}
        stroke="var(--muted-foreground)"
        strokeOpacity={0.5}
        strokeWidth={1}
        strokeDasharray="3 3"
      />
      <text x={width - padding.right} y={y - 3} textAnchor="end" fill="var(--muted-foreground)" fontSize={9}>
        {label}
      </text>
    </g>
  );
}
