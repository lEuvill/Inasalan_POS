'use client'

import { useEffect, useState, useMemo } from 'react'
import { api, Transaction, Product } from '@/app/lib/api'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

// ─── Constants ────────────────────────────────────────────────────────────────

const BRAND = '#F5A623'
const PIE_COLORS = ['#F5A623', '#3B82F6', '#22C55E', '#A855F7', '#EF4444', '#14B8A6', '#EC4899', '#F59E0B']

const ORDER_TYPE_LABELS: Record<string, string> = {
  DINE_IN: 'Dine In', TAKE_OUT: 'Take Out', DELIVERY: 'Delivery', PICK_UP: 'Pick Up',
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// ─── Types ────────────────────────────────────────────────────────────────────

type Preset = 'today' | 'yesterday' | '7d' | '30d' | 'this_month' | 'last_month' | '3m' | '1y' | 'custom'
type TopBy = 'revenue' | 'qty'
type CatBy = 'revenue' | 'qty' | 'orders'
type Bucket = 'hour' | 'day' | 'week' | 'month'

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'today',      label: 'Today' },
  { key: 'yesterday',  label: 'Yesterday' },
  { key: '7d',         label: '7 Days' },
  { key: '30d',        label: '30 Days' },
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: '3m',         label: '3 Months' },
  { key: '1y',         label: '1 Year' },
  { key: 'custom',     label: 'Custom' },
]

// ─── Date helpers ─────────────────────────────────────────────────────────────

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function getRange(preset: Preset, customStart: string, customEnd: string): { start: Date; end: Date } {
  const now = new Date()
  const today = startOfDay(now)
  switch (preset) {
    case 'today': return { start: today, end: now }
    case 'yesterday': {
      const y = new Date(today); y.setDate(y.getDate() - 1)
      return { start: y, end: new Date(today.getTime() - 1) }
    }
    case '7d': { const s = new Date(today); s.setDate(s.getDate() - 6); return { start: s, end: now } }
    case '30d': { const s = new Date(today); s.setDate(s.getDate() - 29); return { start: s, end: now } }
    case 'this_month': return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now }
    case 'last_month': {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const e = new Date(now.getFullYear(), now.getMonth(), 1)
      return { start: s, end: e }
    }
    case '3m': { const s = new Date(today); s.setMonth(s.getMonth() - 3); return { start: s, end: now } }
    case '1y': { const s = new Date(today); s.setFullYear(s.getFullYear() - 1); return { start: s, end: now } }
    case 'custom':
      return {
        start: customStart ? startOfDay(new Date(customStart)) : today,
        end: customEnd ? new Date(customEnd + 'T23:59:59') : now,
      }
  }
}

function getPrevRange(start: Date, end: Date) {
  const len = end.getTime() - start.getTime()
  return { start: new Date(start.getTime() - len), end: new Date(start.getTime()) }
}

function filterTx(txns: Transaction[], start: Date, end: Date) {
  return txns.filter(t => {
    const d = new Date(t.completed_at)
    return d >= start && d <= end
  })
}

// ─── Analytics builders ───────────────────────────────────────────────────────

function sumRevenue(txns: Transaction[]) {
  return txns.reduce((s, t) => s + parseFloat(t.total), 0)
}

function getBucket(start: Date, end: Date): Bucket {
  const days = (end.getTime() - start.getTime()) / 86400000
  if (days <= 2)   return 'hour'
  if (days <= 90)  return 'day'
  if (days <= 365) return 'week'
  return 'month'
}

function bucketKey(d: Date, bucket: Bucket): string {
  if (bucket === 'hour') return `${String(d.getHours()).padStart(2, '0')}:00`
  if (bucket === 'day') {
    return `${d.getMonth() + 1}/${d.getDate()}`
  }
  if (bucket === 'week') {
    const mon = new Date(d)
    mon.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    return `${mon.getMonth() + 1}/${mon.getDate()}`
  }
  return d.toLocaleString('en-US', { month: 'short', year: '2-digit' })
}

function buildTimeSeries(txns: Transaction[], start: Date, end: Date) {
  const bucket = getBucket(start, end)
  const map = new Map<string, number>()

  const cursor = new Date(start)
  let guard = 0
  while (cursor <= end && guard++ < 500) {
    const key = bucketKey(cursor, bucket)
    if (!map.has(key)) map.set(key, 0)
    if (bucket === 'hour')  cursor.setHours(cursor.getHours() + 1)
    else if (bucket === 'day')  cursor.setDate(cursor.getDate() + 1)
    else if (bucket === 'week') cursor.setDate(cursor.getDate() + 7)
    else cursor.setMonth(cursor.getMonth() + 1)
  }

  for (const t of txns) {
    const key = bucketKey(new Date(t.completed_at), bucket)
    if (map.has(key)) map.set(key, (map.get(key) ?? 0) + parseFloat(t.total))
  }

  return [...map.entries()].map(([label, revenue]) => ({ label, revenue }))
}

function buildTopProducts(txns: Transaction[], by: TopBy, limit = 10) {
  const map = new Map<string, { qty: number; revenue: number }>()
  for (const t of txns) {
    for (const item of t.order_detail?.items_json ?? []) {
      const cur = map.get(item.name) ?? { qty: 0, revenue: 0 }
      const disc = item.discount ?? 0
      cur.qty += item.quantity
      cur.revenue += item.price * (1 - disc / 100) * item.quantity
      map.set(item.name, cur)
    }
  }
  return [...map.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b[by] - a[by])
    .slice(0, limit)
}

function buildCategoryData(txns: Transaction[], products: Product[]) {
  const catMap = new Map(products.map(p => [p.id, p.category || 'Uncategorized']))
  const map = new Map<string, { revenue: number; qty: number; orders: number }>()
  for (const t of txns) {
    const catsInTxn = new Set<string>()
    for (const item of t.order_detail?.items_json ?? []) {
      const cat = catMap.get(item.productId) ?? 'Other'
      if (!map.has(cat)) map.set(cat, { revenue: 0, qty: 0, orders: 0 })
      const cur = map.get(cat)!
      cur.revenue += item.price * item.quantity
      cur.qty += item.quantity
      catsInTxn.add(cat)
    }
    for (const cat of catsInTxn) map.get(cat)!.orders++
  }
  return [...map.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
}

function buildOrderTypeData(txns: Transaction[]) {
  const map = new Map<string, { count: number; revenue: number }>()
  for (const t of txns) {
    const key = t.order_detail?.order_type || 'Unknown'
    const cur = map.get(key) ?? { count: 0, revenue: 0 }
    cur.count++
    cur.revenue += parseFloat(t.total)
    map.set(key, cur)
  }
  return [...map.entries()].map(([key, v]) => ({
    name: ORDER_TYPE_LABELS[key] ?? key, ...v,
  }))
}

function buildPaymentData(txns: Transaction[]) {
  const map = new Map<string, { count: number; revenue: number }>()
  for (const t of txns) {
    const key = t.order_detail?.payment_method || 'Unknown'
    const cur = map.get(key) ?? { count: 0, revenue: 0 }
    cur.count++
    cur.revenue += parseFloat(t.total)
    map.set(key, cur)
  }
  return [...map.entries()].map(([name, v]) => ({ name, ...v }))
}

function buildHourly(txns: Transaction[]) {
  const map = new Map<number, number>()
  for (let h = 0; h < 24; h++) map.set(h, 0)
  for (const t of txns) {
    const h = new Date(t.completed_at).getHours()
    map.set(h, (map.get(h) ?? 0) + parseFloat(t.total))
  }
  return [...map.entries()].map(([h, revenue]) => ({
    label: h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`,
    revenue,
  }))
}

function buildDayOfWeek(txns: Transaction[]) {
  const map = new Map<number, number>()
  for (let d = 0; d < 7; d++) map.set(d, 0)
  for (const t of txns) {
    const d = new Date(t.completed_at).getDay()
    map.set(d, (map.get(d) ?? 0) + parseFloat(t.total))
  }
  return [...map.entries()].map(([d, revenue]) => ({ label: DAY_LABELS[d], revenue }))
}

// ─── Formatting ───────────────────────────────────────────────────────────────

function fmtPeso(n: number) {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtShort(n: number) {
  if (n >= 1_000_000) return `₱${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `₱${(n / 1_000).toFixed(1)}K`
  return `₱${n.toFixed(0)}`
}

// ─── UI primitives ────────────────────────────────────────────────────────────

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm ${className}`}>
      {children}
    </div>
  )
}

function CardHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-6 pt-5 pb-4">
      <h3 className="text-sm font-bold text-gray-700 tracking-wide">{title}</h3>
      {action}
    </div>
  )
}

function Empty() {
  return (
    <div className="flex items-center justify-center h-40 text-gray-300 text-sm">
      No data for this period
    </div>
  )
}

function ChartTooltip({ active, payload, label }: {
  active?: boolean
  payload?: readonly { value?: unknown }[]
  label?: string | number
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-3 py-2.5">
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm font-bold text-gray-800">{fmtPeso(payload[0].value as number)}</p>
    </div>
  )
}

function Variance({ value, prev }: { value: number; prev: number }) {
  if (prev === 0) return null
  const pct = ((value - prev) / prev) * 100
  const up = pct >= 0
  return (
    <p className={`text-xs font-semibold mt-1.5 ${up ? 'text-green-500' : 'text-red-400'}`}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}% vs prior period
    </p>
  )
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label, primary, secondary, prevValue, currentValue,
}: {
  label: string
  primary: string
  secondary?: string
  prevValue?: number
  currentValue?: number
}) {
  return (
    <Card className="p-5">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-gray-800 mt-1 leading-tight">{primary}</p>
      {secondary && <p className="text-xs text-gray-400 mt-0.5 truncate">{secondary}</p>}
      {currentValue !== undefined && prevValue !== undefined && (
        <Variance value={currentValue} prev={prevValue} />
      )}
    </Card>
  )
}

// ─── Donut legend ─────────────────────────────────────────────────────────────

function DonutLegend({ data, sub }: {
  data: { name: string; revenue: number; count?: number }[]
  sub?: boolean
}) {
  const total = data.reduce((s, d) => s + d.revenue, 0)
  return (
    <div className="flex-1 space-y-2.5 min-w-0">
      {data.map((d, i) => (
        <div key={d.name} className="flex items-start gap-2">
          <span className="w-2.5 h-2.5 rounded-full shrink-0 mt-0.5" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-700 font-medium truncate">{d.name}</p>
            {sub && d.count !== undefined && (
              <p className="text-[10px] text-gray-400">{d.count} order{d.count !== 1 ? 's' : ''}</p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs font-semibold text-gray-700">{fmtPeso(d.revenue)}</p>
            <p className="text-[10px] text-gray-400">{total > 0 ? ((d.revenue / total) * 100).toFixed(0) : 0}%</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [products, setProducts]         = useState<Product[]>([])
  const [loading, setLoading]           = useState(true)
  const [preset, setPreset]             = useState<Preset>('30d')
  const [customStart, setCustomStart]   = useState('')
  const [customEnd, setCustomEnd]       = useState('')
  const [topBy, setTopBy]               = useState<TopBy>('revenue')
  const [catBy, setCatBy]               = useState<CatBy>('revenue')

  useEffect(() => {
    Promise.all([api.getTransactions(), api.getProducts()]).then(([txns, prods]) => {
      setTransactions(txns)
      setProducts(prods)
      setLoading(false)
    })
  }, [])

  const { start, end } = useMemo(
    () => getRange(preset, customStart, customEnd),
    [preset, customStart, customEnd],
  )
  const { start: prevStart, end: prevEnd } = useMemo(
    () => getPrevRange(start, end),
    [start, end],
  )

  const filtered     = useMemo(() => filterTx(transactions, start, end),         [transactions, start, end])
  const prevFiltered = useMemo(() => filterTx(transactions, prevStart, prevEnd),  [transactions, prevStart, prevEnd])

  const revenue     = useMemo(() => sumRevenue(filtered),     [filtered])
  const prevRevenue = useMemo(() => sumRevenue(prevFiltered), [prevFiltered])
  const aov         = filtered.length     ? revenue     / filtered.length     : 0
  const prevAov     = prevFiltered.length ? prevRevenue / prevFiltered.length : 0

  const timeSeries   = useMemo(() => buildTimeSeries(filtered, start, end),      [filtered, start, end])
  const topProducts  = useMemo(() => buildTopProducts(filtered, topBy),          [filtered, topBy])
  const topItem      = useMemo(() => buildTopProducts(filtered, 'qty', 1)[0],    [filtered])
  const categoryData = useMemo(() => buildCategoryData(filtered, products),      [filtered, products])
  const orderTypeData = useMemo(() => buildOrderTypeData(filtered),              [filtered])
  const paymentData  = useMemo(() => buildPaymentData(filtered),                 [filtered])
  const hourlyData   = useMemo(() => buildHourly(filtered),                      [filtered])
  const dowData      = useMemo(() => buildDayOfWeek(filtered),                   [filtered])

  const dateLabel = `${start.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })} — ${end.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400 text-sm">Loading analytics…</p>
      </div>
    )
  }

  return (
    <div className="space-y-5 pb-8">

      {/* ── Page title ── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Analytics</h1>
        <p className="text-sm text-gray-400 mt-0.5">{dateLabel}</p>
      </div>

      {/* ── Time frame selector ── */}
      <Card className="px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map(p => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
                ${preset === p.key
                  ? 'bg-brand text-white shadow-sm'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
            >
              {p.label}
            </button>
          ))}
          {preset === 'custom' && (
            <div className="flex items-center gap-2 pl-1 border-l border-gray-200 ml-1">
              <input
                type="date"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:border-brand"
              />
              <span className="text-gray-300">—</span>
              <input
                type="date"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:border-brand"
              />
            </div>
          )}
        </div>
      </Card>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Total Revenue"
          primary={fmtPeso(revenue)}
          currentValue={revenue}
          prevValue={prevRevenue}
        />
        <StatCard
          label="Total Orders"
          primary={filtered.length.toLocaleString()}
          currentValue={filtered.length}
          prevValue={prevFiltered.length}
        />
        <StatCard
          label="Avg Order Value"
          primary={fmtPeso(aov)}
          currentValue={aov}
          prevValue={prevAov}
        />
        <StatCard
          label="Top Item"
          primary={topItem?.name ?? '—'}
          secondary={topItem ? `${topItem.qty} sold · ${fmtPeso(topItem.revenue)}` : undefined}
        />
      </div>

      {/* ── Revenue over time ── */}
      <Card>
        <CardHeader title="Revenue Over Time" />
        <div className="px-6 pb-6">
          {filtered.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={timeSeries} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={BRAND} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#9CA3AF' }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickFormatter={fmtShort}
                  tick={{ fontSize: 11, fill: '#9CA3AF' }}
                  tickLine={false}
                  axisLine={false}
                  width={58}
                />
                <Tooltip content={(p) => <ChartTooltip {...p} />} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke={BRAND}
                  strokeWidth={2.5}
                  fill="url(#grad)"
                  dot={false}
                  activeDot={{ r: 4, fill: BRAND, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* ── Top Products + Category ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

        {/* Top Products */}
        <Card>
          <CardHeader
            title="Top Products"
            action={
              <div className="flex rounded-lg overflow-hidden border border-gray-200">
                {(['revenue', 'qty'] as TopBy[]).map(k => (
                  <button
                    key={k}
                    onClick={() => setTopBy(k)}
                    className={`px-3 py-1 text-xs font-semibold transition-colors
                      ${topBy === k ? 'bg-brand text-white' : 'text-gray-400 hover:bg-gray-50'}`}
                  >
                    {k === 'revenue' ? 'Revenue' : 'Qty'}
                  </button>
                ))}
              </div>
            }
          />
          <div className="px-4 pb-5">
            {topProducts.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={Math.max(topProducts.length * 38 + 10, 180)}>
                <BarChart
                  layout="vertical"
                  data={topProducts}
                  margin={{ top: 0, right: 12, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={topBy === 'revenue' ? fmtShort : (v: number) => String(v)}
                    tick={{ fontSize: 11, fill: '#9CA3AF' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={140}
                    tick={{ fontSize: 11, fill: '#6B7280' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: string) => v.length > 22 ? v.slice(0, 20) + '…' : v}
                  />
                  <Tooltip
                    formatter={(v: unknown) => [topBy === 'revenue' ? fmtPeso(v as number) : `${v} sold`, '']}
                    labelStyle={{ fontSize: 12, fontWeight: 600, color: '#374151' }}
                    contentStyle={{ borderRadius: 12, border: '1px solid #F3F4F6', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}
                  />
                  <Bar dataKey={topBy} fill={BRAND} radius={[0, 4, 4, 0]} maxBarSize={24} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* Revenue by Category */}
        <Card>
          <CardHeader
            title="Category Breakdown"
            action={
              <div className="flex rounded-lg overflow-hidden border border-gray-200">
                {(['revenue', 'qty', 'orders'] as CatBy[]).map(k => (
                  <button
                    key={k}
                    onClick={() => setCatBy(k)}
                    className={`px-3 py-1 text-xs font-semibold transition-colors
                      ${catBy === k ? 'bg-brand text-white' : 'text-gray-400 hover:bg-gray-50'}`}
                  >
                    {k === 'revenue' ? 'Revenue' : k === 'qty' ? 'Qty' : 'Orders'}
                  </button>
                ))}
              </div>
            }
          />
          <div className="px-6 pb-6">
            {categoryData.length === 0 ? <Empty /> : (() => {
              const catTotal = categoryData.reduce((s, x) => s + x[catBy], 0)
              return (
                <div className="flex items-center gap-5">
                  <div className="shrink-0">
                    <ResponsiveContainer width={180} height={180}>
                      <PieChart>
                        <Pie
                          data={categoryData}
                          dataKey={catBy}
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={82}
                          paddingAngle={2}
                          strokeWidth={0}
                        >
                          {categoryData.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(v: unknown) =>
                            catBy === 'revenue'
                              ? [fmtPeso(v as number), '']
                              : catBy === 'qty'
                              ? [`${v} items`, '']
                              : [`${v} orders`, '']
                          }
                          contentStyle={{ borderRadius: 12, border: '1px solid #F3F4F6' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-2.5 min-w-0">
                    {categoryData.map((d, i) => (
                      <div key={d.name} className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="text-xs text-gray-600 flex-1 truncate">{d.name}</span>
                        <span className="text-[10px] text-gray-400 shrink-0">
                          {catTotal > 0 ? ((d[catBy] / catTotal) * 100).toFixed(0) : 0}%
                        </span>
                        <span className="text-xs font-semibold text-gray-700 shrink-0">
                          {catBy === 'revenue'
                            ? fmtPeso(d.revenue)
                            : catBy === 'qty'
                            ? `${d.qty} items`
                            : `${d.orders} orders`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>
        </Card>
      </div>

      {/* ── Order Type + Payment Method ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

        {/* Order Type */}
        <Card>
          <CardHeader title="Order Type" />
          <div className="px-6 pb-6">
            {orderTypeData.length === 0 ? <Empty /> : (
              <div className="flex items-center gap-5">
                <div className="shrink-0">
                  <ResponsiveContainer width={160} height={160}>
                    <PieChart>
                      <Pie data={orderTypeData} dataKey="revenue" cx="50%" cy="50%" innerRadius={46} outerRadius={72} paddingAngle={2} strokeWidth={0}>
                        {orderTypeData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: unknown) => [fmtPeso(v as number), '']} contentStyle={{ borderRadius: 12, border: '1px solid #F3F4F6' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <DonutLegend data={orderTypeData} sub />
              </div>
            )}
          </div>
        </Card>

        {/* Payment Method */}
        <Card>
          <CardHeader title="Payment Method" />
          <div className="px-6 pb-6">
            {paymentData.length === 0 ? <Empty /> : (
              <div className="flex items-center gap-5">
                <div className="shrink-0">
                  <ResponsiveContainer width={160} height={160}>
                    <PieChart>
                      <Pie data={paymentData} dataKey="revenue" cx="50%" cy="50%" innerRadius={46} outerRadius={72} paddingAngle={2} strokeWidth={0}>
                        {paymentData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: unknown) => [fmtPeso(v as number), '']} contentStyle={{ borderRadius: 12, border: '1px solid #F3F4F6' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <DonutLegend data={paymentData} sub />
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* ── Hourly + Day of Week ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

        {/* Hourly */}
        <Card>
          <CardHeader title="Revenue by Hour of Day" />
          <div className="px-4 pb-6">
            {filtered.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={hourlyData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9CA3AF' }} tickLine={false} axisLine={false} interval={2} />
                  <YAxis tickFormatter={fmtShort} tick={{ fontSize: 10, fill: '#9CA3AF' }} tickLine={false} axisLine={false} width={50} />
                  <Tooltip content={(p) => <ChartTooltip {...p} />} />
                  <Bar dataKey="revenue" fill={BRAND} radius={[3, 3, 0, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* Day of Week */}
        <Card>
          <CardHeader title="Revenue by Day of Week" />
          <div className="px-4 pb-6">
            {filtered.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={dowData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9CA3AF' }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: '#9CA3AF' }} tickLine={false} axisLine={false} width={50} />
                  <Tooltip content={(p) => <ChartTooltip {...p} />} />
                  <Bar dataKey="revenue" fill="#3B82F6" radius={[3, 3, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

    </div>
  )
}
