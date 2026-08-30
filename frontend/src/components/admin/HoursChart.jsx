import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';

const fmtH = (n) => (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 1 });

export default function HoursChart({ data }) {
  return (
    <div className="hours-chart">
      {data.length === 0 ? (
        <p className="hint">Aucune donnee sur cette periode.</p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="gradHours" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--stroke)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: 'var(--muted-2)', fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={18} />
            <YAxis tick={{ fill: 'var(--muted-2)', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={fmtH} width={44} />
            <Tooltip
              cursor={{ stroke: 'var(--stroke-strong)' }}
              contentStyle={{
                background: 'var(--surface)',
                border: '1px solid var(--stroke-strong)',
                borderRadius: 10,
                color: 'var(--text)',
                fontSize: 12,
                boxShadow: 'var(--shadow-card)',
              }}
              labelStyle={{ color: 'var(--muted)', marginBottom: 4 }}
              formatter={(v) => [fmtH(v) + ' h', 'Heures']}
            />
            <Area type="monotone" dataKey="hours" name="Heures"
              stroke="#6366f1" strokeWidth={2.5}
              fill="url(#gradHours)"
              dot={false} activeDot={{ r: 5, strokeWidth: 2, fill: 'var(--surface)' }}
              animationDuration={900} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
