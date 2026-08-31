const COLORS = {
  onsite: '#10b981',
  break: '#f59e0b',
  leave: '#6366f1',
  out: '#0ea5e9',
  absent: '#94a3b8',
};

const LABELS = {
  onsite: 'Sur place',
  break: 'En pause',
  leave: 'En conge',
  out: 'Sorti',
  absent: 'Absent',
};

const R_IN = 62;
const R_OUT = 90;
const CX = 100;
const CY = 100;

function polar(cx, cy, r, angleDeg) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function arcPath(cx, cy, rIn, rOut, start, end) {
  const large = end - start > 180 ? 1 : 0;
  const [x1, y1] = polar(cx, cy, rOut, start);
  const [x2, y2] = polar(cx, cy, rOut, end);
  const [x3, y3] = polar(cx, cy, rIn, end);
  const [x4, y4] = polar(cx, cy, rIn, start);
  return [
    `M ${x1} ${y1}`,
    `A ${rOut} ${rOut} 0 ${large} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${rIn} ${rIn} 0 ${large} 0 ${x4} ${y4}`,
    'Z',
  ].join(' ');
}

export default function PresenceDonut({ data, total }) {
  if (total === 0) return <p className="hint empty">Aucun personnel.</p>;

  const sum = data.reduce((s, b) => s + b.value, 0);
  const { segments } = data
    .filter((b) => b.value > 0)
    .reduce(
      ({ segments, acc }, b) => {
        const start = (acc / sum) * 360;
        const end = ((acc + b.value) / sum) * 360;
        return { segments: segments.concat([{ ...b, start, end }]), acc: acc + b.value };
      },
      { segments: [], acc: 0 }
    );

  return (
    <div className="donut-wrap">
      <div className="donut-row">
        <div className="donut-main">
          <svg viewBox="0 0 200 200" width="100%" height={200} role="img" aria-label="Repartition de la presence">
            {segments.length === 1 ? (
              <circle cx={CX} cy={CY} r={(R_IN + R_OUT) / 2} fill="none" stroke={COLORS[segments[0].key]} strokeWidth={R_OUT - R_IN} />
            ) : (
              segments.map((s) => (
                <path key={s.key} d={arcPath(CX, CY, R_IN, R_OUT, s.start, s.end)} fill={COLORS[s.key]} />
              ))
            )}
            <circle cx={CX} cy={CY} r={R_IN - 1} fill="var(--surface)" />
          </svg>
          <div className="donut-center">
            <b>{total}</b>
            <span>au total</span>
          </div>
        </div>
        <ul className="donut-legend">
          {segments.map((b) => (
            <li key={b.key}>
              <span className="donut-dot" style={{ background: COLORS[b.key] }} />
              <span className="donut-label">{LABELS[b.key]}</span>
              <span className="donut-value">{b.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
