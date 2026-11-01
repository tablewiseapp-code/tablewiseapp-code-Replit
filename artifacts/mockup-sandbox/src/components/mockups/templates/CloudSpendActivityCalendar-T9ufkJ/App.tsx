import { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Flame,
  Leaf,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  CircleDollarSign,
  CalendarDays,
  Zap,
  ChevronDown,
} from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';

// ------------------------------------------------------------------
// DATA — March 2025, today = March 19
// ------------------------------------------------------------------
const TODAY = 19;

const DAYS = [
  { d: 1, cost: 2940 }, { d: 2, cost: 2870 },
  { d: 3, cost: 4180 }, { d: 4, cost: 6340, ev: ['anomaly'] }, { d: 5, cost: 4460 },
  { d: 6, cost: 4310 }, { d: 7, cost: 4050, ev: ['saving'] },
  { d: 8, cost: 2760 }, { d: 9, cost: 2810 },
  { d: 10, cost: 3920 }, { d: 11, cost: 3870 }, { d: 12, cost: 3940, ev: ['renewal'] },
  { d: 13, cost: 3890 }, { d: 14, cost: 5120, ev: ['anomaly'] },
  { d: 15, cost: 2690 }, { d: 16, cost: 2740 },
  { d: 17, cost: 3850 }, { d: 18, cost: 3910, ev: ['renewal'] }, { d: 19, cost: 3880 },
  { d: 20, cost: 3840 }, { d: 21, cost: 3790, ev: ['saving'] },
  { d: 22, cost: 2650 }, { d: 23, cost: 2680 },
  { d: 24, cost: 3760 }, { d: 25, cost: 3720, ev: ['saving'] }, { d: 26, cost: 3740 },
  { d: 27, cost: 3710 }, { d: 28, cost: 3730, ev: ['renewal'] },
  { d: 29, cost: 2610 }, { d: 30, cost: 2640 }, { d: 31, cost: 3690 },
];

const EVENTS = {
  4: [{ type: 'anomaly', title: 'NAT Gateway transfer spike', desc: 'us-east-1 · prod-vpc · 4.2 TB egress vs 0.9 TB daily avg', amount: '+$1,840' }],
  7: [{ type: 'saving', title: 'Rightsizing applied', desc: '12 instances · m5.2xlarge → m6g.xlarge across api fleet', amount: '−$312 / day' }],
  12: [{ type: 'renewal', title: 'Reserved Instances expiring', desc: '8× m5.2xlarge · us-east-1 · convertible, 1-yr term', amount: '$2,140 /mo at risk' }],
  14: [{ type: 'anomaly', title: 'Unattached EBS volumes', desc: '47 gp3 volumes orphaned after ASG scale-in event', amount: '+$1,180' }],
  18: [{ type: 'renewal', title: 'Compute Savings Plan renewal', desc: '$3,400 /mo commitment · 1-yr · no upfront · auto-renews', amount: 'in 0 days' }],
  21: [{ type: 'saving', title: 'S3 Intelligent-Tiering rollout', desc: 'analytics-archive bucket · 38 TB eligible for archive tier', amount: 'est. −$640 /mo' }],
  25: [{ type: 'saving', title: 'Dev cluster off-hours schedule', desc: 'eks-dev-01 · stop 20:00–07:00 weekdays + weekends', amount: 'est. −$890 /mo' }],
  28: [{ type: 'renewal', title: 'RDS Reserved Instance expiring', desc: '2× db.r6g.xlarge · Multi-AZ · payments-primary', amount: '$980 /mo at risk' }],
};

const RECOMMENDATIONS = {
  4: { title: 'Add VPC endpoint for S3 traffic', body: 'Route the analytics pipeline through a gateway endpoint to eliminate NAT egress charges on this path.', value: 'Saves ~$1,400 /mo' },
  14: { title: 'Delete 47 unattached gp3 volumes', body: 'Volumes have been detached for 36+ hours with no snapshots pending. Snapshot-and-delete policy is available.', value: 'Saves $1,180 /mo' },
  12: { title: 'Convert expiring RIs to Savings Plan', body: 'Coverage gap of 23% opens on March 15. A 1-yr Compute SP at $1,890/mo keeps the same effective rate with more flexibility.', value: 'Avoids +$2,140 /mo' },
  21: { title: 'Extend tiering to log buckets', body: 'cloudtrail-archive and elb-logs show <1 access/90d on 12 TB of objects.', value: 'Additional −$210 /mo' },
};

const EVENT_META = {
  anomaly: { label: 'Anomaly', color: '#C03A2B', bg: '#FBEAE6', Icon: Flame },
  saving: { label: 'Optimization', color: '#1E6B45', bg: '#E6F2EA', Icon: Leaf },
  renewal: { label: 'Commitment', color: '#A8731E', bg: '#F8EFDD', Icon: RefreshCw },
};

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const fmt = (n) => '$' + n.toLocaleString('en-US');

const dayName = (d) => {
  // March 1 2025 = Saturday
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return names[(6 + (d - 1)) % 7];
};

const getBreakdown = (day) => {
  const c = day.cost;
  let shares = [
    ['EC2 Compute', 0.41], ['RDS & Aurora', 0.18], ['S3 & Storage', 0.12],
    ['Data Transfer', 0.08], ['Lambda & Fargate', 0.07], ['Other (34 svcs)', 0.14],
  ];
  if (day.d === 4) shares = [
    ['Data Transfer', 0.34], ['EC2 Compute', 0.29], ['RDS & Aurora', 0.13],
    ['S3 & Storage', 0.09], ['Lambda & Fargate', 0.05], ['Other (34 svcs)', 0.10],
  ];
  if (day.d === 14) shares = [
    ['EC2 Compute', 0.32], ['S3 & Storage', 0.30], ['RDS & Aurora', 0.14],
    ['Data Transfer', 0.07], ['Lambda & Fargate', 0.06], ['Other (34 svcs)', 0.11],
  ];
  return shares.map(([name, p]) => ({ name, value: Math.round(c * p) }));
};

// heat classification
const heat = (day) => {
  const isWeekend = [0, 6].includes((6 + (day.d - 1)) % 7);
  const baseline = isWeekend ? 2900 : 4000;
  const ratio = day.cost / baseline;
  if (ratio > 1.35) return 'hot';
  if (ratio > 1.08) return 'warm';
  if (ratio < 0.97) return 'cool';
  return 'neutral';
};

export default function App() {
  const [selected, setSelected] = useState(14);
  const [filter, setFilter] = useState('all');

  const selectedDay = DAYS.find((d) => d.d === selected);
  const breakdown = useMemo(() => getBreakdown(selectedDay), [selected]);
  const maxBreakdown = Math.max(...breakdown.map((b) => b.value));
  const events = EVENTS[selected] || [];
  const rec = RECOMMENDATIONS[selected];

  const trailing = useMemo(() => {
    const idx = selected - 1;
    const window = DAYS.slice(Math.max(0, idx - 7), idx);
    if (!window.length) return selectedDay.cost;
    return Math.round(window.reduce((a, b) => a + b.cost, 0) / window.length);
  }, [selected]);
  const delta = selectedDay.cost - trailing;
  const deltaPct = ((delta / trailing) * 100).toFixed(1);

  const sparkData = DAYS.slice(0, TODAY).map((d) => ({ d: d.d, cost: d.cost }));

  const filterMatch = (day) => {
    if (filter === 'all') return true;
    return (day.ev || []).includes(filter);
  };

  const heatStyles = {
    hot: { background: '#FBE7E2', costColor: '#A93226' },
    warm: { background: '#F9F0DC', costColor: '#8C6A1D' },
    cool: { background: '#FFFFFF', costColor: '#5C6B5E' },
    neutral: { background: '#FFFFFF', costColor: '#3A3A33' },
  };

  return (
    <div className="min-h-screen w-full bg-[#F4F1EA] text-[#1C1B17]" style={{ fontFamily: "'Inter Tight', sans-serif" }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter+Tight:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
        rel="stylesheet"
      />
      <style
        dangerouslySetInnerHTML={{
          __html: `
            * { box-sizing: border-box; }
            ::selection { background: #1E6B45; color: #fff; }
            .mono { font-family: 'IBM Plex Mono', monospace; }
            .serif { font-family: 'Instrument Serif', serif; }
            .future-cell {
              background-image: repeating-linear-gradient(135deg, transparent 0 6px, rgba(28,27,23,0.035) 6px 7px);
            }
            .cell-hover { transition: box-shadow .18s ease, transform .18s ease, border-color .18s ease; }
            .cell-hover:hover { box-shadow: 0 6px 18px -8px rgba(28,27,23,0.28); transform: translateY(-1px); z-index: 2; }
            .panel-scroll::-webkit-scrollbar { width: 4px; }
            .panel-scroll::-webkit-scrollbar-thumb { background: #D6D1C4; border-radius: 4px; }
            @keyframes pulseDot { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
            .pulse-dot { animation: pulseDot 2s ease-in-out infinite; }
          `,
        }}
      />

      {/* ------------------------------------------------ TOP BAR */}
      <header className="border-b border-[#E2DDD0] bg-[#F4F1EA]/90 backdrop-blur sticky top-0 z-20">
        <div className="max-w-[1480px] mx-auto px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-10">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-[#1C1B17] rounded-[6px] flex items-center justify-center">
                <CircleDollarSign size={15} className="text-[#F4F1EA]" strokeWidth={2.2} />
              </div>
              <span className="font-semibold tracking-tight text-[15px]">overcast<span className="text-[#1E6B45]">.</span>finops</span>
            </div>
            <nav className="hidden lg:flex items-center gap-7 text-[13.5px] text-[#6B675C]">
              <span className="hover:text-[#1C1B17] cursor-pointer transition-colors">Overview</span>
              <span className="text-[#1C1B17] font-medium relative">
                Spend Calendar
                <span className="absolute -bottom-[22px] left-0 right-0 h-[2px] bg-[#1C1B17]" />
              </span>
              <span className="hover:text-[#1C1B17] cursor-pointer transition-colors">Recommendations</span>
              <span className="hover:text-[#1C1B17] cursor-pointer transition-colors">Commitments</span>
              <span className="hover:text-[#1C1B17] cursor-pointer transition-colors">Reports</span>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <button className="flex items-center gap-2 text-[13px] border border-[#D6D1C4] rounded-full px-3.5 py-1.5 bg-white hover:border-[#1C1B17] transition-colors">
              <span className="w-1.5 h-1.5 rounded-full bg-[#1E6B45] pulse-dot" />
              prod-payer · 4 accounts
              <ChevronDown size={14} className="text-[#9B9686]" />
            </button>
            <img
              src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80&h=80&fit=crop"
              alt="avatar"
              className="w-8 h-8 rounded-full border border-[#D6D1C4] object-cover"
            />
          </div>
        </div>
      </header>

      <main className="max-w-[1480px] mx-auto px-8 py-8">
        {/* ------------------------------------------------ MONTH HEADER */}
        <div className="flex flex-wrap items-end justify-between gap-6 mb-7">
          <div className="flex items-end gap-5">
            <h1 className="serif italic text-[56px] leading-none tracking-[-0.01em]">March</h1>
            <span className="mono text-[15px] text-[#9B9686] mb-1.5">2025</span>
            <div className="flex items-center gap-1 mb-1.5 ml-1">
              <button className="w-8 h-8 rounded-full border border-[#D6D1C4] bg-white flex items-center justify-center hover:border-[#1C1B17] transition-colors">
                <ChevronLeft size={15} />
              </button>
              <button className="w-8 h-8 rounded-full border border-[#D6D1C4] bg-white flex items-center justify-center hover:border-[#1C1B17] transition-colors">
                <ChevronRight size={15} />
              </button>
            </div>
          </div>

          {/* stat strip */}
          <div className="flex items-stretch divide-x divide-[#E2DDD0] border border-[#E2DDD0] rounded-xl bg-white overflow-hidden">
            <div className="px-6 py-4">
              <div className="text-[11px] uppercase tracking-[0.12em] text-[#9B9686] mb-1.5">Spend MTD</div>
              <div className="flex items-center gap-3">
                <span className="mono text-[22px] font-semibold leading-none">$72,530</span>
                <div className="w-[88px] h-[30px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={sparkData} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
                      <defs>
                        <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#1E6B45" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#1E6B45" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="cost" stroke="#1E6B45" strokeWidth={1.5} fill="url(#spark)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
            <div className="px-6 py-4">
              <div className="text-[11px] uppercase tracking-[0.12em] text-[#9B9686] mb-1.5">Forecast / Budget</div>
              <div className="mono text-[22px] font-semibold leading-none">
                $114.2k <span className="text-[14px] text-[#9B9686] font-normal">/ $118k</span>
              </div>
              <div className="text-[12px] text-[#1E6B45] mt-1 flex items-center gap-1 font-medium">
                <ArrowDownRight size={13} /> 3.2% under budget
              </div>
            </div>
            <div className="px-6 py-4">
              <div className="text-[11px] uppercase tracking-[0.12em] text-[#9B9686] mb-1.5">Savings realized</div>
              <div className="mono text-[22px] font-semibold leading-none text-[#1E6B45]">−$4,120</div>
              <div className="text-[12px] text-[#6B675C] mt-1">3 optimizations applied</div>
            </div>
            <div className="px-6 py-4">
              <div className="text-[11px] uppercase tracking-[0.12em] text-[#9B9686] mb-1.5">Open recommendations</div>
              <div className="mono text-[22px] font-semibold leading-none">9</div>
              <div className="text-[12px] text-[#6B675C] mt-1">worth <span className="mono">$2,430</span> /mo</div>
            </div>
          </div>
        </div>

        {/* filters + legend */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            {[
              { key: 'all', label: 'All activity' },
              { key: 'anomaly', label: 'Anomalies', dot: '#C03A2B' },
              { key: 'saving', label: 'Optimizations', dot: '#1E6B45' },
              { key: 'renewal', label: 'Commitments', dot: '#A8731E' },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`flex items-center gap-2 text-[13px] px-3.5 py-1.5 rounded-full border transition-all ${
                  filter === f.key
                    ? 'bg-[#1C1B17] text-[#F4F1EA] border-[#1C1B17]'
                    : 'bg-white border-[#D6D1C4] text-[#4A473E] hover:border-[#1C1B17]'
                }`}
              >
                {f.dot && <span className="w-1.5 h-1.5 rounded-full" style={{ background: filter === f.key ? '#F4F1EA' : f.dot }} />}
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-5 text-[12px] text-[#6B675C]">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-[3px] bg-[#FBE7E2] border border-[#E8C7BE]" /> over forecast</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-[3px] bg-[#F9F0DC] border border-[#E6D7B3]" /> elevated</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-[3px] bg-white border border-[#D6D1C4] future-cell" /> projected</span>
          </div>
        </div>

        {/* ------------------------------------------------ GRID + PANEL */}
        <div className="flex gap-6 items-start">
          {/* CALENDAR */}
          <div className="flex-1 min-w-0">
            <div className="grid grid-cols-7 mb-2">
              {WEEKDAYS.map((w, i) => (
                <div key={w} className={`text-[11px] tracking-[0.14em] px-3 ${i === 0 || i === 6 ? 'text-[#B3AE9F]' : 'text-[#6B675C]'}`}>
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px bg-[#E2DDD0] border border-[#E2DDD0] rounded-xl overflow-hidden">
              {/* leading blanks (Mar 1 = Saturday) */}
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={`b${i}`} className="bg-[#EFEBE1] min-h-[104px]" />
              ))}
              {DAYS.map((day) => {
                const future = day.d > TODAY;
                const isToday = day.d === TODAY;
                const isSelected = day.d === selected;
                const h = heat(day);
                const hs = heatStyles[h];
                const dim = !filterMatch(day);
                return (
                  <button
                    key={day.d}
                    onClick={() => setSelected(day.d)}
                    className={`cell-hover relative text-left min-h-[104px] p-2.5 flex flex-col justify-between outline-none ${future ? 'future-cell' : ''}`}
                    style={{
                      background: future ? '#FAF8F2' : hs.background,
                      opacity: dim ? 0.35 : 1,
                      boxShadow: isSelected ? 'inset 0 0 0 2px #1C1B17' : 'none',
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <span
                        className={`mono text-[12px] leading-none ${
                          isToday
                            ? 'bg-[#1C1B17] text-[#F4F1EA] rounded-full w-[22px] h-[22px] flex items-center justify-center -mt-0.5 -ml-0.5'
                            : 'text-[#9B9686]'
                        }`}
                      >
                        {day.d}
                      </span>
                      <div className="flex gap-1">
                        {(day.ev || []).map((e) => (
                          <span key={e} className="w-[7px] h-[7px] rounded-full mt-0.5" style={{ background: EVENT_META[e].color }} />
                        ))}
                      </div>
                    </div>
                    <div>
                      {(day.ev || []).map((e) => (
                        <div
                          key={e}
                          className="hidden xl:inline-block text-[10px] font-medium px-1.5 py-[2px] rounded-[4px] mb-1 leading-tight"
                          style={{ background: EVENT_META[e].bg, color: EVENT_META[e].color }}
                        >
                          {EVENTS[day.d]?.[0]?.title.split(' ').slice(0, 2).join(' ') || EVENT_META[e].label}
                        </div>
                      ))}
                      <div
                        className={`mono text-[14px] font-medium leading-none ${future ? 'text-[#A8A293]' : ''}`}
                        style={{ color: future ? undefined : hs.costColor }}
                      >
                        {future && <span className="text-[11px]">≈ </span>}
                        {fmt(day.cost)}
                      </div>
                    </div>
                    {isToday && <span className="absolute bottom-2 right-2.5 text-[9px] tracking-[0.14em] text-[#9B9686]">TODAY</span>}
                  </button>
                );
              })}
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={`t${i}`} className="bg-[#EFEBE1] min-h-[104px]" />
              ))}
            </div>
            <p className="mt-3 text-[12px] text-[#9B9686] flex items-center gap-1.5">
              <Zap size={12} className="text-[#A8731E]" />
              Anomaly detection runs hourly against a 30-day seasonal baseline. Projections refresh at 06:00 UTC.
            </p>
          </div>

          {/* DAY PANEL */}
          <aside className="w-[372px] shrink-0 sticky top-24">
            <AnimatePresence mode="wait">
              <motion.div
                key={selected}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="bg-white border border-[#E2DDD0] rounded-xl overflow-hidden"
              >
                {/* panel header */}
                <div className="px-6 pt-6 pb-5 border-b border-[#EFEBE1]">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[11px] uppercase tracking-[0.14em] text-[#9B9686] flex items-center gap-1.5">
                      <CalendarDays size={12} /> {dayName(selected)}, March {selected}
                    </div>
                    {selected > TODAY && (
                      <span className="text-[10px] tracking-[0.1em] uppercase bg-[#EFEBE1] text-[#6B675C] px-2 py-0.5 rounded-full">Projected</span>
                    )}
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="mono text-[34px] font-semibold leading-none tracking-tight">{fmt(selectedDay.cost)}</div>
                      <div className={`mt-2 text-[13px] font-medium flex items-center gap-1 ${delta >= 0 ? 'text-[#A93226]' : 'text-[#1E6B45]'}`}>
                        {delta >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                        {delta >= 0 ? '+' : '−'}{fmt(Math.abs(delta))} ({Math.abs(deltaPct)}%)
                        <span className="text-[#9B9686] font-normal ml-1">vs 7-day avg</span>
                      </div>
                    </div>
                    <div className="text-right text-[12px] text-[#6B675C] leading-relaxed">
                      <div>amortized · blended</div>
                      <div className="mono">{fmt(Math.round(selectedDay.cost / 24))}/hr eff.</div>
                    </div>
                  </div>
                </div>

                {/* breakdown */}
                <div className="px-6 py-5 border-b border-[#EFEBE1]">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-[#9B9686] mb-3.5">Service breakdown</div>
                  <div className="space-y-2.5">
                    {breakdown.map((b, i) => (
                      <div key={b.name} className="flex items-center gap-3">
                        <span className="w-[120px] text-[12.5px] text-[#4A473E] truncate">{b.name}</span>
                        <div className="flex-1 h-[10px] bg-[#F0EDE4] rounded-sm overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${(b.value / maxBreakdown) * 100}%` }}
                            transition={{ duration: 0.5, delay: i * 0.05, ease: 'easeOut' }}
                            className="h-full rounded-sm"
                            style={{ background: i === 0 ? '#1C1B17' : i === 1 ? '#4A6B57' : i === 2 ? '#8FA98F' : '#C9C3B2' }}
                          />
                        </div>
                        <span className="mono text-[12px] w-[58px] text-right text-[#1C1B17]">{fmt(b.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* events */}
                <div className="px-6 py-5 panel-scroll">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-[#9B9686] mb-3.5">
                    Activity {events.length > 0 && <span className="mono">({events.length})</span>}
                  </div>
                  {events.length === 0 ? (
                    <div className="text-[13px] text-[#9B9686] bg-[#FAF8F2] border border-dashed border-[#D6D1C4] rounded-lg px-4 py-3.5">
                      No anomalies, optimizations, or commitment events on this day. Spend tracked within forecast band.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {events.map((ev, i) => {
                        const meta = EVENT_META[ev.type];
                        return (
                          <div key={i} className="flex gap-3 p-3.5 rounded-lg border" style={{ background: meta.bg, borderColor: meta.color + '33' }}>
                            <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: meta.color }}>
                              <meta.Icon size={14} className="text-white" strokeWidth={2.2} />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[13.5px] font-semibold leading-tight" style={{ color: meta.color }}>{ev.title}</span>
                              </div>
                              <p className="text-[12px] text-[#5B584D] mt-1 leading-snug">{ev.desc}</p>
                              <div className="mono text-[12px] mt-1.5 font-medium" style={{ color: meta.color }}>{ev.amount}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* recommendation */}
                  {rec && (
                    <div className="mt-4 rounded-lg bg-[#1C1B17] text-[#F4F1EA] p-4">
                      <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.16em] text-[#B3AE9F] mb-2">
                        <Sparkles size={12} className="text-[#7FBF9B]" /> Recommended action
                      </div>
                      <div className="text-[14.5px] font-semibold leading-snug">{rec.title}</div>
                      <p className="text-[12.5px] text-[#B3AE9F] mt-1.5 leading-relaxed">{rec.body}</p>
                      <div className="flex items-center justify-between mt-4">
                        <span className="mono text-[13px] text-[#7FBF9B] font-medium">{rec.value}</span>
                        <div className="flex gap-2">
                          <button className="text-[12px] px-3 py-1.5 rounded-md border border-[#3A382F] text-[#B3AE9F] hover:text-white hover:border-[#6B675C] transition-colors">
                            Snooze
                          </button>
                          <button className="text-[12px] font-medium px-3.5 py-1.5 rounded-md bg-[#2E7D54] hover:bg-[#349161] transition-colors flex items-center gap-1.5">
                            Apply fix <ArrowUpRight size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          </aside>
        </div>
      </main>
    </div>
  );
}