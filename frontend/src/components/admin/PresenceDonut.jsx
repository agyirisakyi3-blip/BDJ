import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';

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

export default function PresenceDonut({ data, total }) {
  return (
    <div className="donut-wrap">
      {total === 0 ? (
        <p className="hint empty">Aucun personnel.</p>
      ) : (
        <div className="donut-row">
          <div className="donut-main">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="key" cx="50%" cy="50%" innerRadius={62} outerRadius={90}
                  paddingAngle={data.length > 1 ? 3 : 0} cornerRadius={6}
                  stroke="none" animationDuration={900}>
                  {data.map((e) => (
                    <Cell key={e.key} fill={COLORS[e.key]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'var(--surface)',
                    border: '1px solid var(--stroke-strong)',
                    borderRadius: 10,
                    color: 'var(--text)',
                    fontSize: 12,
                    boxShadow: 'var(--shadow-card)',
                  }}
                  formatter={(v, name) => [v + ' personne' + (v > 1 ? 's' : ''), LABELS[name]]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="donut-center">
              <b>{total}</b>
              <span>au total</span>
            </div>
          </div>
          <ul className="donut-legend">
            {data.map((e) => (
              <li key={e.key}>
                <span className="donut-dot" style={{ background: COLORS[e.key] }} />
                <span className="donut-label">{LABELS[e.key]}</span>
                <span className="donut-value">{e.value}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
