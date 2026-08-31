import { useState } from 'react';

const W = 600;
const H = 260;
const PAD = { top: 10, right: 10, bottom: 24, left: 42 };

const fmtH = (n) => (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 1 });

export default function HoursChart({ data }) {
  const [hover, setHover] = useState(null);

  if (data.length === 0) return <p className="hint">Aucune donnee sur cette periode.</p>;

  const max = Math.max(...data.map((d) => d.hours), 1);
  const niceMax = Math.ceil(max * 1.15);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;
  const x = (i) => PAD.left + (data.length > 1 ? i * stepX : innerW / 2);
  const y = (v) => PAD.top + innerH - (v / niceMax) * innerH;

  const points = data.map((d, i) => `${x(i)},${y(d.hours)}`).join(' ');
  const area = `${PAD.left},${PAD.top + innerH} ${points} ${x(data.length - 1)},${PAD.top + innerH}`;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => niceMax * f);

  return (
    <div className="hours-chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="hours-chart-svg" role="img" aria-label="Graphique des heures par jour">
        <defs>
          <linearGradient id="gradHours" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--stroke)" strokeDasharray="3 3" />
            <text x={PAD.left - 6} y={y(t) + 3} textAnchor="end" fill="var(--muted-2)" fontSize={11}>
              {fmtH(t)}
            </text>
          </g>
        ))}
        <polygon points={area} fill="url(#gradHours)" />
        <polyline points={points} fill="none" stroke="#6366f1" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {data.map((d, i) => (
          <g key={i}>
            <rect
              x={x(i) - (data.length > 1 ? stepX * 0.45 : 0)}
              y={PAD.top}
              width={data.length > 1 ? stepX * 0.9 : 40}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
            />
            <text x={x(i)} y={H - 6} textAnchor="middle" fill="var(--muted-2)" fontSize={11}>
              {d.label}
            </text>
            {hover === i && <circle cx={x(i)} cy={y(d.hours)} r={5} fill="var(--surface)" stroke="#6366f1" strokeWidth={2} />}
          </g>
        ))}
        {hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--stroke-strong)" strokeDasharray="3 3" />
            <g transform={`translate(${Math.min(Math.max(x(hover), 60), W - 70)}, ${Math.max(PAD.top, y(data[hover].hours) - 42)})`}>
              <rect x={-40} y={-18} width={80} height={34} rx={8} fill="var(--surface)" stroke="var(--stroke-strong)" strokeWidth={1} />
              <text x={0} y={1} textAnchor="middle" fill="var(--text)" fontSize={11}>{data[hover].label}</text>
              <text x={0} y={14} textAnchor="middle" fill="#6366f1" fontSize={12} fontWeight={600}>{fmtH(data[hover].hours)} h</text>
            </g>
          </g>
        )}
      </svg>
    </div>
  );
}
