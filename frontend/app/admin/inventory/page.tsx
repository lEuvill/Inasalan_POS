'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { api, Product, ProductVariation, RawMaterial, ProductIngredient } from '@/app/lib/api'

// ─── Stock tab ────────────────────────────────────────────────────────────────

const LOW_STOCK = 10

function stockStatus(stock: number | null): 'untracked' | 'out' | 'low' | 'good' {
  if (stock === null) return 'untracked'
  if (stock === 0)    return 'out'
  if (stock <= LOW_STOCK) return 'low'
  return 'good'
}

const STATUS_DOT: Record<string, string> = {
  good: 'bg-green-400', low: 'bg-amber-400', out: 'bg-red-500', untracked: 'bg-gray-200',
}
const STATUS_LABEL: Record<string, string> = {
  good: 'Good', low: 'Low', out: 'Out', untracked: '—',
}

function StockRow({ product, onSaved }: { product: Product; onSaved: (id: number, stock: number | null) => void }) {
  const [draft, setDraft] = useState(product.stock === null ? '' : String(product.stock))
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const status = stockStatus(product.stock)

  useEffect(() => {
    setDraft(product.stock === null ? '' : String(product.stock))
  }, [product.stock])

  const save = async (value: number | null) => {
    if (value === product.stock) return
    setSaving(true)
    try {
      await api.updateProduct(product.id, { stock: value })
      onSaved(product.id, value)
    } finally { setSaving(false) }
  }

  const commitDraft = () => {
    const n = parseInt(draft, 10)
    if (draft.trim() === '') save(null)
    else if (!isNaN(n) && n >= 0) save(n)
    else setDraft(product.stock === null ? '' : String(product.stock))
  }

  const adjust = (delta: number) => {
    const next = Math.max(0, (product.stock ?? 0) + delta)
    setDraft(String(next))
    save(next)
  }

  return (
    <div className="flex items-center gap-4 py-3 border-b border-gray-50 last:border-0 group">
      <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[status]}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{product.name}</p>
        {product.variations.length > 0 && (
          <p className="text-xs text-gray-400 truncate">{product.variations.map(v => v.name).join(' · ')}</p>
        )}
      </div>
      <span className={`text-xs font-semibold w-10 text-right shrink-0
        ${status === 'out' ? 'text-red-500' : status === 'low' ? 'text-amber-500' : status === 'good' ? 'text-green-600' : 'text-gray-300'}`}>
        {STATUS_LABEL[status]}
      </span>
      {product.stock === null ? (
        <button
          onClick={() => { setDraft('0'); save(0); setTimeout(() => inputRef.current?.focus(), 50) }}
          className="text-xs text-gray-400 hover:text-brand font-semibold border border-dashed border-gray-200 hover:border-brand px-3 py-1.5 rounded-lg transition-colors w-32 text-center"
        >
          Track stock
        </button>
      ) : (
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => adjust(-1)} disabled={saving || (product.stock ?? 0) <= 0}
            className="w-7 h-7 rounded-lg bg-gray-100 text-gray-600 text-sm font-bold flex items-center justify-center hover:bg-gray-200 disabled:opacity-30 transition-colors">−</button>
          <input
            ref={inputRef}
            type="number" min="0" value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={e => { if (e.key === 'Enter') { commitDraft(); inputRef.current?.blur() } }}
            className="w-14 text-center border border-gray-200 rounded-lg py-1 text-sm font-bold text-gray-800 focus:outline-none focus:border-brand"
          />
          <button onClick={() => adjust(1)} disabled={saving}
            className="w-7 h-7 rounded-lg bg-brand text-white text-sm font-bold flex items-center justify-center hover:bg-brand-dark disabled:opacity-30 transition-colors">+</button>
          <button onClick={() => { setDraft(''); save(null) }} title="Stop tracking"
            className="w-7 h-7 rounded-lg text-gray-200 hover:text-red-400 hover:bg-red-50 text-xs font-bold flex items-center justify-center ml-0.5 opacity-0 group-hover:opacity-100 transition-all">✕</button>
        </div>
      )}
    </div>
  )
}

function VariationStockRow({
  product,
  variationIndex,
  variation,
  onSaved,
}: {
  product: Product
  variationIndex: number
  variation: ProductVariation
  onSaved: (productId: number, updatedVariations: ProductVariation[]) => void
}) {
  const [draft, setDraft] = useState(variation.stock == null ? '' : String(variation.stock))
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const status = stockStatus(variation.stock ?? null)

  useEffect(() => {
    setDraft(variation.stock == null ? '' : String(variation.stock))
  }, [variation.stock])

  const save = async (value: number | null) => {
    if (value === (variation.stock ?? null)) return
    setSaving(true)
    try {
      const updatedVariations = product.variations.map((v, i) =>
        i === variationIndex ? { ...v, stock: value } : v
      )
      await api.updateProduct(product.id, { variations: updatedVariations })
      onSaved(product.id, updatedVariations)
    } finally { setSaving(false) }
  }

  const commitDraft = () => {
    const n = parseInt(draft, 10)
    if (draft.trim() === '') save(null)
    else if (!isNaN(n) && n >= 0) save(n)
    else setDraft(variation.stock == null ? '' : String(variation.stock))
  }

  const adjust = (delta: number) => {
    const next = Math.max(0, (variation.stock ?? 0) + delta)
    setDraft(String(next))
    save(next)
  }

  return (
    <div className="flex items-center gap-4 py-3 border-b border-gray-50 last:border-0 group pl-2">
      <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[status]}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">
          <span className="text-gray-400 text-xs">{product.name} · </span>
          {variation.name}
        </p>
      </div>
      <span className={`text-xs font-semibold w-10 text-right shrink-0
        ${status === 'out' ? 'text-red-500' : status === 'low' ? 'text-amber-500' : status === 'good' ? 'text-green-600' : 'text-gray-300'}`}>
        {STATUS_LABEL[status]}
      </span>
      {variation.stock == null ? (
        <button
          onClick={() => { setDraft('0'); save(0); setTimeout(() => inputRef.current?.focus(), 50) }}
          className="text-xs text-gray-400 hover:text-brand font-semibold border border-dashed border-gray-200 hover:border-brand px-3 py-1.5 rounded-lg transition-colors w-32 text-center"
        >
          Track stock
        </button>
      ) : (
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => adjust(-1)} disabled={saving || (variation.stock ?? 0) <= 0}
            className="w-7 h-7 rounded-lg bg-gray-100 text-gray-600 text-sm font-bold flex items-center justify-center hover:bg-gray-200 disabled:opacity-30 transition-colors">−</button>
          <input
            ref={inputRef}
            type="number" min="0" value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={e => { if (e.key === 'Enter') { commitDraft(); inputRef.current?.blur() } }}
            className="w-14 text-center border border-gray-200 rounded-lg py-1 text-sm font-bold text-gray-800 focus:outline-none focus:border-brand"
          />
          <button onClick={() => adjust(1)} disabled={saving}
            className="w-7 h-7 rounded-lg bg-brand text-white text-sm font-bold flex items-center justify-center hover:bg-brand-dark disabled:opacity-30 transition-colors">+</button>
          <button onClick={() => { setDraft(''); save(null) }} title="Stop tracking"
            className="w-7 h-7 rounded-lg text-gray-200 hover:text-red-400 hover:bg-red-50 text-xs font-bold flex items-center justify-center ml-0.5 opacity-0 group-hover:opacity-100 transition-all">✕</button>
        </div>
      )}
    </div>
  )
}

function StockTab({
  products,
  onSaved,
  onVariationSaved,
}: {
  products: Product[]
  onSaved: (id: number, stock: number | null) => void
  onVariationSaved: (productId: number, updatedVariations: ProductVariation[]) => void
}) {
  // Flatten all stock entries: products with variations contribute one entry per variation
  const allStocks = products.flatMap(p =>
    p.variations.length > 0 ? p.variations.map(v => v.stock ?? null) : [p.stock]
  )
  const trackedCount    = allStocks.filter(s => s !== null).length
  const outOfStockCount = allStocks.filter(s => s === 0).length
  const lowStockCount   = allStocks.filter(s => s !== null && s > 0 && s <= LOW_STOCK).length

  const grouped = products.reduce<Record<string, Product[]>>((acc, p) => {
    const cat = p.category || 'Uncategorized'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(p)
    return acc
  }, {})

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-gray-800">{trackedCount}</p>
          <p className="text-xs text-gray-400 mt-0.5">Tracked</p>
        </div>
        <div className={`rounded-2xl border shadow-sm p-4 text-center ${lowStockCount > 0 ? 'bg-amber-50 border-amber-100' : 'bg-white border-gray-100'}`}>
          <p className={`text-2xl font-bold ${lowStockCount > 0 ? 'text-amber-600' : 'text-gray-800'}`}>{lowStockCount}</p>
          <p className={`text-xs mt-0.5 ${lowStockCount > 0 ? 'text-amber-500' : 'text-gray-400'}`}>Low Stock</p>
        </div>
        <div className={`rounded-2xl border shadow-sm p-4 text-center ${outOfStockCount > 0 ? 'bg-red-50 border-red-100' : 'bg-white border-gray-100'}`}>
          <p className={`text-2xl font-bold ${outOfStockCount > 0 ? 'text-red-600' : 'text-gray-800'}`}>{outOfStockCount}</p>
          <p className={`text-xs mt-0.5 ${outOfStockCount > 0 ? 'text-red-500' : 'text-gray-400'}`}>Out of Stock</p>
        </div>
      </div>

      {products.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">No menu items found. Add items in the Menu section first.</div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([category, items]) => {
            const categoryTotal = items.reduce((sum, p) =>
              sum + (p.variations.length > 0 ? p.variations.length : 1), 0)
            const categoryTracked = items.reduce((sum, p) => {
              if (p.variations.length > 0) return sum + p.variations.filter(v => v.stock != null).length
              return sum + (p.stock !== null ? 1 : 0)
            }, 0)
            return (
              <div key={category} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">{category}</span>
                  <span className="text-xs text-gray-400">{categoryTracked}/{categoryTotal} tracked</span>
                </div>
                <div className="px-5">
                  {items.map(p =>
                    p.variations.length > 0
                      ? p.variations.map((v, i) => (
                          <VariationStockRow
                            key={`${p.id}-${i}`}
                            product={p}
                            variationIndex={i}
                            variation={v}
                            onSaved={onVariationSaved}
                          />
                        ))
                      : <StockRow key={p.id} product={p} onSaved={onSaved} />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {trackedCount > 0 && (
        <div className="flex items-center gap-4 text-xs text-gray-400">
          {(['good', 'low', 'out'] as const).map(s => (
            <span key={s} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${STATUS_DOT[s]}`} />
              {s === 'good' ? `Good (>${LOW_STOCK})` : s === 'low' ? `Low (1–${LOW_STOCK})` : 'Out of stock'}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Raw Stock tab ────────────────────────────────────────────────────────────

function RawStockRow({
  item,
  onSaved,
}: {
  item: RawMaterial
  onSaved: (id: number, stock_qty: string) => void
}) {
  const currentQty = parseFloat(item.stock_qty) || 0
  const [draft, setDraft] = useState(currentQty > 0 ? String(currentQty) : '')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const n = parseFloat(item.stock_qty) || 0
    setDraft(n > 0 ? String(n) : '')
  }, [item.stock_qty])

  const save = async (value: string) => {
    if (parseFloat(value) === parseFloat(item.stock_qty)) return
    setSaving(true)
    try {
      await api.updateRawMaterial(item.id, { stock_qty: value })
      onSaved(item.id, value)
    } finally { setSaving(false) }
  }

  const commitDraft = () => {
    const n = parseFloat(draft)
    if (draft.trim() === '') save('0')
    else if (!isNaN(n) && n >= 0) save(String(n))
    else { const c = parseFloat(item.stock_qty) || 0; setDraft(c > 0 ? String(c) : '') }
  }

  const adjust = (delta: number) => {
    const next = Math.max(0, (parseFloat(item.stock_qty) || 0) + delta)
    setDraft(next > 0 ? String(next) : '')
    save(String(next))
  }

  const stockQty  = parseFloat(item.stock_qty) || 0
  const yieldMin  = parseFloat(item.yield_min)
  const yieldMax  = parseFloat(item.yield_max)
  const hasStock  = stockQty > 0 && yieldMin > 0
  const srvMin    = hasStock ? stockQty * yieldMin : 0
  const srvMax    = hasStock && yieldMax > yieldMin ? stockQty * yieldMax : srvMin

  return (
    <div className="flex items-center gap-4 py-3 border-b border-gray-50 last:border-0 group">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
        <p className="text-xs text-gray-400">{item.serving_unit} · yield {item.yield_min}{parseFloat(item.yield_max) > yieldMin ? `–${item.yield_max}` : ''}/{item.purchase_unit}</p>
      </div>

      {/* Derived serving units available */}
      <div className="w-44 shrink-0 text-right">
        {hasStock ? (
          <div>
            <p className="text-sm font-bold text-brand">
              {srvMin === srvMax
                ? srvMin % 1 === 0 ? srvMin.toFixed(0) : srvMin.toFixed(1)
                : `${srvMin % 1 === 0 ? srvMin.toFixed(0) : srvMin.toFixed(1)}–${srvMax % 1 === 0 ? srvMax.toFixed(0) : srvMax.toFixed(1)}`}
              {' '}{item.serving_unit}
            </p>
            <p className="text-xs text-gray-400">available</p>
          </div>
        ) : (
          <p className="text-xs text-gray-300">— set stock</p>
        )}
      </div>

      {/* Stock input */}
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={() => adjust(-1)} disabled={saving || stockQty <= 0}
          className="w-7 h-7 rounded-lg bg-gray-100 text-gray-600 text-sm font-bold flex items-center justify-center hover:bg-gray-200 disabled:opacity-30 transition-colors">−</button>
        <input
          ref={inputRef}
          type="number" min="0" step="any" value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={e => { if (e.key === 'Enter') { commitDraft(); inputRef.current?.blur() } }}
          placeholder="0"
          className="w-16 text-center border border-gray-200 rounded-lg py-1 text-sm font-bold text-gray-800 focus:outline-none focus:border-brand"
        />
        <button onClick={() => adjust(1)} disabled={saving}
          className="w-7 h-7 rounded-lg bg-brand text-white text-sm font-bold flex items-center justify-center hover:bg-brand-dark disabled:opacity-30 transition-colors">+</button>
        <span className="text-xs text-gray-400 w-7 ml-0.5">{item.purchase_unit}</span>
      </div>
    </div>
  )
}

function RawStockTab({ onStockChange }: { onStockChange: (updatedMaterials: RawMaterial[]) => void }) {
  const [materials, setMaterials] = useState<RawMaterial[]>([])
  const [loading, setLoading]     = useState(true)
  const [syncing, setSyncing]     = useState(false)

  const load = useCallback(async () => {
    setMaterials(await api.getRawMaterials())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleSaved = (id: number, stock_qty: string) => {
    const updated = materials.map(m => m.id === id ? { ...m, stock_qty } : m)
    setMaterials(updated)
    setSyncing(true)
    onStockChange(updated)
    // syncing badge cleared by parent when done — we use a short local timeout as fallback
    setTimeout(() => setSyncing(false), 2000)
  }

  if (loading) return <div className="text-gray-400 text-sm py-10 text-center">Loading…</div>

  if (materials.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400 text-sm">
        No ingredients yet. Add ingredients in the <strong className="text-gray-600">Costing</strong> tab first.
      </div>
    )
  }

  const stocked  = materials.filter(m => (parseFloat(m.stock_qty) || 0) > 0).length
  const noStock  = materials.length - stocked

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex-1 grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
            <p className="text-2xl font-bold text-gray-800">{stocked}</p>
            <p className="text-xs text-gray-400 mt-0.5">Stocked</p>
          </div>
          <div className={`rounded-2xl border shadow-sm p-4 text-center ${noStock > 0 ? 'bg-amber-50 border-amber-100' : 'bg-white border-gray-100'}`}>
            <p className={`text-2xl font-bold ${noStock > 0 ? 'text-amber-600' : 'text-gray-800'}`}>{noStock}</p>
            <p className={`text-xs mt-0.5 ${noStock > 0 ? 'text-amber-500' : 'text-gray-400'}`}>No Stock Set</p>
          </div>
        </div>
        {syncing && (
          <div className="shrink-0 flex items-center gap-2 text-xs text-brand font-medium bg-orange-50 border border-orange-100 rounded-xl px-3 py-2">
            <span className="w-2 h-2 rounded-full bg-brand animate-pulse" />
            Updating Stock tab…
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-4 px-5 py-3 bg-gray-50 border-b border-gray-100">
          <span className="flex-1 text-xs font-bold text-gray-400 uppercase tracking-wide">Ingredient</span>
          <span className="w-44 shrink-0 text-xs font-bold text-gray-400 uppercase tracking-wide text-right">Serving Units Available</span>
          <span className="w-32 shrink-0 text-xs font-bold text-gray-400 uppercase tracking-wide text-right">Stock on Hand</span>
        </div>
        <div className="px-5">
          {materials.map(m => <RawStockRow key={m.id} item={m} onSaved={handleSaved} />)}
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Serving units are derived from yield settings in the Costing tab. Stock entered here feeds into the Recipes tab yield estimate.
      </p>
    </div>
  )
}

// ─── Costing tab ──────────────────────────────────────────────────────────────

type RawForm = {
  name: string
  purchase_unit: string
  batch_qty: string
  batch_price: string
  serving_unit: string
  yield_min: string
  yield_max: string
  stock_qty: string
  notes: string
}

const BLANK_FORM: RawForm = {
  name: '', purchase_unit: '', batch_qty: '', batch_price: '',
  serving_unit: '', yield_min: '', yield_max: '', stock_qty: '', notes: '',
}

function costPerServing(form: RawForm) {
  const batchQty   = parseFloat(form.batch_qty)
  const batchPrice = parseFloat(form.batch_price)
  const yMin       = parseFloat(form.yield_min)
  const yMax       = parseFloat(form.yield_max)
  if (!batchQty || !batchPrice || !yMin) return null
  const pricePerUnit = batchPrice / batchQty
  const yHi = yMax && yMax >= yMin ? yMax : yMin
  return {
    pricePerUnit,
    low:  pricePerUnit / yHi,
    high: pricePerUnit / yMin,
    isRange: yMax && yMax > yMin,
  }
}

function fmtPeso(n: number) {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function RawMaterialModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: RawMaterial
  onSave: (form: RawForm) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState<RawForm>(
    initial
      ? {
          name: initial.name, purchase_unit: initial.purchase_unit,
          batch_qty: initial.batch_qty, batch_price: initial.batch_price,
          serving_unit: initial.serving_unit, yield_min: initial.yield_min,
          yield_max: initial.yield_max, stock_qty: initial.stock_qty ?? '',
          notes: initial.notes,
        }
      : BLANK_FORM,
  )
  const [saving, setSaving] = useState(false)

  const set = (k: keyof RawForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }))

  const cost = costPerServing(form)
  const batchQty   = parseFloat(form.batch_qty)
  const batchPrice = parseFloat(form.batch_price)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try { await onSave(form) } finally { setSaving(false) }
  }

  const field = (label: string, key: keyof RawForm, props?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div>
      <label className="block text-xs font-semibold text-gray-500 mb-1">{label}</label>
      <input
        value={form[key]}
        onChange={set(key)}
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-brand"
        {...props}
      />
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh]">

        <div className="px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
          <h3 className="font-bold text-gray-800 text-base">{initial ? 'Edit Ingredient' : 'Add Ingredient'}</h3>
          <p className="text-xs text-gray-400 mt-0.5">Enter purchase info and serving yield to compute cost</p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {field('Ingredient Name', 'name', { placeholder: 'e.g. Rice', required: true })}

          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Purchase</p>
            <div className="grid grid-cols-3 gap-3">
              {field('Batch qty', 'batch_qty', { type: 'number', min: '0', step: 'any', placeholder: '25', required: true })}
              {field('Unit', 'purchase_unit', { placeholder: 'kg', required: true })}
              {field('Batch price (₱)', 'batch_price', { type: 'number', min: '0', step: 'any', placeholder: '1375', required: true })}
            </div>
            {batchQty > 0 && batchPrice > 0 && (
              <p className="text-xs text-gray-400 mt-1.5">
                → <span className="font-semibold text-gray-600">{fmtPeso(batchPrice / batchQty)}</span> per {form.purchase_unit || 'unit'}
              </p>
            )}
          </div>

          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Yield per {form.purchase_unit || 'purchase unit'}</p>
            <div className="grid grid-cols-3 gap-3">
              {field('Min yield', 'yield_min', { type: 'number', min: '0', step: 'any', placeholder: '4.2', required: true })}
              {field('Max yield', 'yield_max', { type: 'number', min: '0', step: 'any', placeholder: '5.0' })}
              {field('Serving unit', 'serving_unit', { placeholder: 'cup', required: true })}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">Leave max yield blank if yield is fixed</p>
          </div>

          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Stock on Hand</p>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                {field('Current qty', 'stock_qty', { type: 'number', min: '0', step: 'any', placeholder: '0' })}
              </div>
              <div className="w-24 pt-5">
                <p className="text-sm text-gray-400 font-medium">{form.purchase_unit || 'units'}</p>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-1">Used to estimate serving yield in Recipes tab</p>
          </div>

          {cost && (
            <div className="bg-orange-50 border border-orange-100 rounded-xl px-4 py-3">
              <p className="text-xs font-bold text-orange-700 mb-2">Cost per {form.serving_unit || 'serving'}</p>
              <div className="flex items-end gap-3">
                {cost.isRange ? (
                  <>
                    <div>
                      <p className="text-[10px] text-orange-400 font-medium">Low (max yield)</p>
                      <p className="text-lg font-bold text-orange-600">{fmtPeso(cost.low)}</p>
                    </div>
                    <span className="text-orange-300 text-sm mb-1">–</span>
                    <div>
                      <p className="text-[10px] text-orange-400 font-medium">High (min yield)</p>
                      <p className="text-lg font-bold text-orange-600">{fmtPeso(cost.high)}</p>
                    </div>
                    <div className="ml-auto text-right">
                      <p className="text-[10px] text-orange-400 font-medium">Average</p>
                      <p className="text-lg font-bold text-orange-500">{fmtPeso((cost.low + cost.high) / 2)}</p>
                    </div>
                  </>
                ) : (
                  <p className="text-2xl font-bold text-orange-600">{fmtPeso(cost.low)}</p>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Notes (optional)</label>
            <textarea
              value={form.notes}
              onChange={set('notes')}
              rows={2}
              placeholder="Any extra context…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-brand resize-none"
            />
          </div>
        </div>

        <div className="px-6 pb-6 pt-4 border-t border-gray-100 flex gap-3 shrink-0">
          <button type="button" onClick={onClose}
            className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm hover:bg-gray-50">
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="flex-1 bg-brand text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-brand-dark disabled:opacity-40 transition-colors">
            {saving ? 'Saving…' : initial ? 'Save Changes' : 'Add Ingredient'}
          </button>
        </div>
      </form>
    </div>
  )
}

function CostRow({
  item,
  onEdit,
  onDelete,
}: {
  item: RawMaterial
  onEdit: () => void
  onDelete: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const cost = costPerServing({
    batch_qty: item.batch_qty, batch_price: item.batch_price,
    yield_min: item.yield_min, yield_max: item.yield_max,
    name: item.name, purchase_unit: item.purchase_unit,
    serving_unit: item.serving_unit, stock_qty: item.stock_qty,
    notes: item.notes,
  })
  const batchQty   = parseFloat(item.batch_qty)
  const batchPrice = parseFloat(item.batch_price)
  const stockQty   = parseFloat(item.stock_qty)

  return (
    <div className="flex items-center gap-4 py-3.5 border-b border-gray-50 last:border-0 group">

      <div className="w-36 shrink-0">
        <p className="text-sm font-semibold text-gray-800 truncate">{item.name}</p>
        {item.notes && <p className="text-xs text-gray-400 truncate">{item.notes}</p>}
        {stockQty > 0 ? (
          <p className="text-xs text-green-600 font-medium">{item.stock_qty} {item.purchase_unit} on hand</p>
        ) : (
          <p className="text-xs text-gray-300">No stock set</p>
        )}
      </div>

      <div className="w-36 shrink-0">
        <p className="text-xs text-gray-700">
          {batchQty} {item.purchase_unit} · {fmtPeso(batchPrice)}
        </p>
        <p className="text-xs text-gray-400">
          {fmtPeso(batchQty > 0 ? batchPrice / batchQty : 0)}/{item.purchase_unit}
        </p>
      </div>

      <div className="w-32 shrink-0">
        <p className="text-xs text-gray-700">
          {item.yield_min}
          {parseFloat(item.yield_max) > parseFloat(item.yield_min) ? `–${item.yield_max}` : ''}
          {' '}{item.serving_unit}/{item.purchase_unit}
        </p>
      </div>

      <div className="flex-1 min-w-0">
        {cost ? (
          cost.isRange ? (
            <div>
              <p className="text-sm font-bold text-brand">
                {fmtPeso(cost.low)} – {fmtPeso(cost.high)}
              </p>
              <p className="text-xs text-gray-400">avg {fmtPeso((cost.low + cost.high) / 2)} / {item.serving_unit}</p>
            </div>
          ) : (
            <p className="text-sm font-bold text-brand">{fmtPeso(cost.low)} / {item.serving_unit}</p>
          )
        ) : (
          <p className="text-xs text-gray-300">—</p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {confirmDelete ? (
          <>
            <span className="text-xs text-red-500 font-medium">Delete?</span>
            <button onClick={onDelete}
              className="text-xs text-white bg-red-500 hover:bg-red-600 font-semibold px-2.5 py-1 rounded-lg">Yes</button>
            <button onClick={() => setConfirmDelete(false)}
              className="text-xs text-gray-400 hover:text-gray-700 font-medium px-1">No</button>
          </>
        ) : (
          <>
            <button onClick={onEdit}
              className="text-xs text-gray-400 hover:text-brand font-medium hover:underline">Edit</button>
            <button onClick={() => setConfirmDelete(true)}
              className="text-xs text-gray-300 hover:text-red-500 font-medium hover:underline">Delete</button>
          </>
        )}
      </div>
    </div>
  )
}

function CostingTab() {
  const [materials, setMaterials] = useState<RawMaterial[]>([])
  const [loading, setLoading]     = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing]     = useState<RawMaterial | null>(null)

  const load = useCallback(async () => {
    setMaterials(await api.getRawMaterials())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = async (form: RawForm) => {
    if (editing) {
      await api.updateRawMaterial(editing.id, form)
    } else {
      await api.createRawMaterial(form)
    }
    await load()
    setShowModal(false)
    setEditing(null)
  }

  const handleDelete = async (id: number) => {
    await api.deleteRawMaterial(id)
    setMaterials(prev => prev.filter(m => m.id !== id))
  }

  const openEdit = (m: RawMaterial) => { setEditing(m); setShowModal(true) }
  const openCreate = () => { setEditing(null); setShowModal(true) }

  if (loading) return <div className="text-gray-400 text-sm py-10 text-center">Loading…</div>

  return (
    <div className="space-y-4">

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {materials.length === 0
            ? 'No ingredients yet. Add one to start tracking raw costs.'
            : `${materials.length} ingredient${materials.length !== 1 ? 's' : ''}`}
        </p>
        <button onClick={openCreate}
          className="bg-brand text-white font-semibold px-4 py-2 rounded-xl hover:bg-brand-dark transition-colors text-sm">
          + Add Ingredient
        </button>
      </div>

      {materials.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center gap-4 px-5 py-3 bg-gray-50 border-b border-gray-100">
            <span className="w-36 shrink-0 text-xs font-bold text-gray-400 uppercase tracking-wide">Ingredient</span>
            <span className="w-36 shrink-0 text-xs font-bold text-gray-400 uppercase tracking-wide">Batch</span>
            <span className="w-32 shrink-0 text-xs font-bold text-gray-400 uppercase tracking-wide">Yield</span>
            <span className="flex-1 text-xs font-bold text-gray-400 uppercase tracking-wide">Cost / Serving</span>
          </div>
          <div className="px-5">
            {materials.map(m => (
              <CostRow
                key={m.id}
                item={m}
                onEdit={() => openEdit(m)}
                onDelete={() => handleDelete(m.id)}
              />
            ))}
          </div>
        </div>
      )}

      {showModal && (
        <RawMaterialModal
          initial={editing ?? undefined}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditing(null) }}
        />
      )}
    </div>
  )
}

// ─── Recipes tab ──────────────────────────────────────────────────────────────

function calcIngredientYield(ing: ProductIngredient): { min: number; max: number } | null {
  const stockQty     = parseFloat(ing.stock_qty)
  const yieldMin     = parseFloat(ing.yield_min)
  const yieldMax     = parseFloat(ing.yield_max)
  const qtyPerServing = parseFloat(ing.qty_per_serving)
  if (!stockQty || !yieldMin || !qtyPerServing) return null
  const effectiveMax = yieldMax && yieldMax > yieldMin ? yieldMax : yieldMin
  return {
    min: (stockQty * yieldMin) / qtyPerServing,
    max: (stockQty * effectiveMax) / qtyPerServing,
  }
}

function productYield(ingredients: ProductIngredient[]): { min: number; max: number } | null {
  const yields = ingredients
    .map(calcIngredientYield)
    .filter((y): y is { min: number; max: number } => y !== null)
  if (!yields.length) return null
  return {
    min: Math.min(...yields.map(y => y.min)),
    max: Math.min(...yields.map(y => y.max)),
  }
}

function IngredientRow({
  ing,
  onDelete,
  onUpdateQty,
}: {
  ing: ProductIngredient
  onDelete: () => void
  onUpdateQty: (id: number, qty: string) => Promise<void>
}) {
  const [draft, setDraft]           = useState(ing.qty_per_serving)
  const [confirmDelete, setConfirm] = useState(false)
  const [saving, setSaving]         = useState(false)

  useEffect(() => { setDraft(ing.qty_per_serving) }, [ing.qty_per_serving])

  const commitDraft = async () => {
    const n = parseFloat(draft)
    if (!n || n === parseFloat(ing.qty_per_serving)) { setDraft(ing.qty_per_serving); return }
    setSaving(true)
    try { await onUpdateQty(ing.id, draft) } finally { setSaving(false) }
  }

  const yld      = calcIngredientYield(ing)
  const stockQty = parseFloat(ing.stock_qty)

  return (
    <div className="flex items-center gap-4 py-3 border-b border-gray-50 last:border-0 group">
      <div className="w-40 shrink-0">
        <p className="text-sm font-semibold text-gray-800 truncate">{ing.raw_material_name}</p>
        <p className="text-xs text-gray-400">{ing.serving_unit}</p>
      </div>

      <div className="w-28 shrink-0">
        <input
          type="number" min="0" step="any"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={e => { if (e.key === 'Enter') commitDraft() }}
          disabled={saving}
          className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-800 focus:outline-none focus:border-brand disabled:opacity-50"
        />
      </div>

      <div className="w-28 shrink-0">
        {stockQty > 0 ? (
          <p className="text-sm font-semibold text-gray-700">{ing.stock_qty} {ing.purchase_unit}</p>
        ) : (
          <p className="text-xs text-amber-500 font-medium">No stock — set in Costing</p>
        )}
      </div>

      <div className="flex-1">
        {yld ? (
          <p className="text-sm font-bold text-brand">
            ~{Math.floor(yld.min)}{Math.floor(yld.max) !== Math.floor(yld.min) ? `–${Math.floor(yld.max)}` : ''} servings
          </p>
        ) : (
          <p className="text-xs text-gray-300">—</p>
        )}
      </div>

      <div className="w-20 flex items-center justify-end shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {confirmDelete ? (
          <div className="flex items-center gap-1">
            <button onClick={onDelete}
              className="text-xs text-white bg-red-500 hover:bg-red-600 font-semibold px-2 py-0.5 rounded-lg">Yes</button>
            <button onClick={() => setConfirm(false)}
              className="text-xs text-gray-400 hover:text-gray-700 px-1">No</button>
          </div>
        ) : (
          <button onClick={() => setConfirm(true)}
            className="text-xs text-gray-300 hover:text-red-500 font-medium hover:underline">Remove</button>
        )}
      </div>
    </div>
  )
}

function RecipesTab() {
  const [products, setProducts]         = useState<Product[]>([])
  const [materials, setMaterials]       = useState<RawMaterial[]>([])
  const [allIngredients, setAll]        = useState<ProductIngredient[]>([])
  const [selectedId, setSelectedId]     = useState<number | null>(null)
  const [loading, setLoading]           = useState(true)
  const [adding, setAdding]             = useState(false)
  const [newMatId, setNewMatId]         = useState('')
  const [newQty, setNewQty]             = useState('')
  const [saving, setSaving]             = useState(false)

  const load = useCallback(async () => {
    const [p, m, i] = await Promise.all([
      api.getProducts(),
      api.getRawMaterials(),
      api.getProductIngredients(),
    ])
    setProducts(p)
    setMaterials(m)
    setAll(i)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const selectedProduct   = selectedId ? products.find(p => p.id === selectedId) : null
  const ingredients       = allIngredients.filter(i => i.product === selectedId)
  const linkedIds         = new Set(ingredients.map(i => i.raw_material))
  const availableMaterials = materials.filter(m => !linkedIds.has(m.id))
  const yld               = productYield(ingredients)
  const selectedMaterial  = newMatId ? materials.find(m => m.id === parseInt(newMatId)) : null

  const handleAdd = async () => {
    if (!selectedId || !newMatId || !newQty) return
    setSaving(true)
    try {
      const created = await api.createProductIngredient({
        product: selectedId,
        raw_material: parseInt(newMatId),
        qty_per_serving: newQty,
      })
      setAll(prev => [...prev, created])
      setNewMatId('')
      setNewQty('')
      setAdding(false)
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: number) => {
    await api.deleteProductIngredient(id)
    setAll(prev => prev.filter(i => i.id !== id))
  }

  const handleUpdateQty = async (id: number, qty: string) => {
    const updated = await api.updateProductIngredient(id, { qty_per_serving: qty })
    setAll(prev => prev.map(i => i.id === id ? updated : i))
  }

  if (loading) return <div className="text-gray-400 text-sm py-10 text-center">Loading…</div>

  if (materials.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400 text-sm">
        No ingredients yet. Add ingredients in the <strong className="text-gray-600">Costing</strong> tab first.
      </div>
    )
  }

  return (
    <div className="space-y-5">

      {/* Product selector — ✓ suffix shows items with a recipe already */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Menu Item</label>
        <select
          value={selectedId ?? ''}
          onChange={e => { setSelectedId(e.target.value ? parseInt(e.target.value) : null); setAdding(false) }}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:border-brand"
        >
          <option value="">— Select a menu item to view or edit its recipe —</option>
          {products.map(p => (
            <option key={p.id} value={p.id}>
              {p.name}{p.category ? ` · ${p.category}` : ''}
              {allIngredients.some(i => i.product === p.id) ? ' ✓' : ''}
            </option>
          ))}
        </select>
      </div>

      {selectedProduct && (
        <>
          {/* Yield summary */}
          {yld ? (
            <div className="bg-orange-50 border border-orange-100 rounded-2xl px-6 py-5">
              <p className="text-xs font-bold text-orange-500 uppercase tracking-wide mb-1">Estimated Servings from Current Stock</p>
              <p className="text-4xl font-bold text-orange-700 leading-none">
                {Math.floor(yld.min) === Math.floor(yld.max)
                  ? Math.floor(yld.min)
                  : `${Math.floor(yld.min)}–${Math.floor(yld.max)}`}
              </p>
              <p className="text-xs text-orange-400 mt-2">
                Limited by bottleneck ingredient · Update stock in the Raw Stock tab to refresh
              </p>
            </div>
          ) : ingredients.length > 0 ? (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl px-6 py-4">
              <p className="text-sm text-amber-600 font-medium">Some ingredients have no stock set — go to the Raw Stock tab and enter quantities on hand.</p>
            </div>
          ) : null}

          {/* Recipe card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-sm font-bold text-gray-800">{selectedProduct.name}</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {ingredients.length === 0
                    ? 'No ingredients linked yet'
                    : `${ingredients.length} ingredient${ingredients.length !== 1 ? 's' : ''}`}
                </p>
              </div>
              {availableMaterials.length > 0 && (
                <button
                  onClick={() => setAdding(true)}
                  className="text-sm font-semibold text-brand hover:underline"
                >
                  + Link Ingredient
                </button>
              )}
            </div>

            {ingredients.length > 0 && (
              <div className="px-5">
                <div className="flex items-center gap-4 py-2 border-b border-gray-50">
                  <span className="w-40 shrink-0 text-xs font-bold text-gray-400 uppercase tracking-wide">Ingredient</span>
                  <span className="w-28 shrink-0 text-xs font-bold text-gray-400 uppercase tracking-wide">Qty / Serving</span>
                  <span className="w-28 shrink-0 text-xs font-bold text-gray-400 uppercase tracking-wide">Stock</span>
                  <span className="flex-1 text-xs font-bold text-gray-400 uppercase tracking-wide">Yield from stock</span>
                  <span className="w-20" />
                </div>
                {ingredients.map(ing => (
                  <IngredientRow
                    key={ing.id}
                    ing={ing}
                    onDelete={() => handleDelete(ing.id)}
                    onUpdateQty={handleUpdateQty}
                  />
                ))}
              </div>
            )}

            {ingredients.length === 0 && !adding && (
              <div className="px-5 py-10 text-center text-gray-400 text-sm">
                Link ingredients to see how many servings your current stock can make.
              </div>
            )}

            {adding && (
              <div className="px-5 py-4 border-t border-gray-100 bg-gray-50">
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Ingredient</label>
                    <select
                      value={newMatId}
                      onChange={e => setNewMatId(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-brand"
                    >
                      <option value="">— Select —</option>
                      {availableMaterials.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="w-40">
                    <label className="block text-xs font-semibold text-gray-500 mb-1">
                      Qty per serving ({selectedMaterial?.serving_unit ?? '—'})
                    </label>
                    <input
                      type="number" min="0" step="any" value={newQty}
                      onChange={e => setNewQty(e.target.value)}
                      placeholder="1.5"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-brand"
                    />
                  </div>
                  <button
                    onClick={handleAdd}
                    disabled={saving || !newMatId || !newQty}
                    className="bg-brand text-white font-semibold px-4 py-2 rounded-xl hover:bg-brand-dark transition-colors text-sm disabled:opacity-40"
                  >
                    {saving ? '…' : 'Add'}
                  </button>
                  <button
                    onClick={() => { setAdding(false); setNewMatId(''); setNewQty('') }}
                    className="text-gray-400 hover:text-gray-700 text-sm py-2"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'stock' | 'raw_stock' | 'costing' | 'recipes'

const TAB_LABELS: Record<Tab, string> = {
  stock:     'Stock',
  raw_stock: 'Raw Stock',
  costing:   'Costing',
  recipes:   'Recipes',
}

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading]   = useState(true)
  const [tab, setTab]           = useState<Tab>('stock')

  const load = useCallback(async () => {
    setProducts(await api.getProducts())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleSaved = (id: number, stock: number | null) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, stock } : p))
  }

  const handleVariationSaved = (productId: number, updatedVariations: ProductVariation[]) => {
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, variations: updatedVariations } : p))
  }

  // Called by RawStockTab whenever an ingredient stock changes.
  // Fetches fresh recipe links, recalculates the bottleneck yield for every
  // product that has ingredients configured, then patches product.stock.
  const recalcProductStocks = useCallback(async (updatedMaterials: RawMaterial[]) => {
    const ings = await api.getProductIngredients()

    const byProduct: Record<number, ProductIngredient[]> = {}
    for (const ing of ings) {
      if (!byProduct[ing.product]) byProduct[ing.product] = []
      byProduct[ing.product].push(ing)
    }

    const patches: Record<number, number> = {}
    const calls: Promise<unknown>[] = []

    for (const [productIdStr, pIngs] of Object.entries(byProduct)) {
      const productId = parseInt(productIdStr)
      let bottleneck: number | null = null

      for (const ing of pIngs) {
        const mat = updatedMaterials.find(m => m.id === ing.raw_material)
        if (!mat) continue
        const stockQty     = parseFloat(mat.stock_qty) || 0
        const yieldMin     = parseFloat(ing.yield_min)
        const qtyPerServing = parseFloat(ing.qty_per_serving)
        if (!yieldMin || !qtyPerServing) continue
        // An ingredient with stock_qty = 0 means it's out — that IS the bottleneck
        const servings = Math.floor((stockQty * yieldMin) / qtyPerServing)
        if (bottleneck === null || servings < bottleneck) bottleneck = servings
      }

      if (bottleneck !== null) {
        patches[productId] = bottleneck
        calls.push(api.updateProduct(productId, { stock: bottleneck }).catch(() => {}))
      }
    }

    await Promise.all(calls)
    if (Object.keys(patches).length > 0) {
      setProducts(prev => prev.map(p =>
        patches[p.id] !== undefined ? { ...p, stock: patches[p.id] } : p,
      ))
    }
  }, [])

  const subtitle: Record<Tab, string> = {
    stock:     'Track stock levels for your menu items',
    raw_stock: 'Set ingredient quantities on hand — auto-calculates serving units available',
    costing:   'Track raw ingredient costs and yield',
    recipes:   'Link ingredients to menu items and estimate serving yield',
  }

  if (loading) return <div className="text-gray-400 text-sm py-10 text-center">Loading…</div>

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Inventory</h1>
          <p className="text-sm text-gray-400 mt-0.5">{subtitle[tab]}</p>
        </div>

        <div className="flex rounded-xl overflow-hidden border border-gray-200">
          {(['stock', 'raw_stock', 'costing', 'recipes'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-semibold transition-colors border-r border-gray-200 last:border-r-0
                ${tab === t ? 'bg-brand text-white' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {tab === 'stock'     && <StockTab products={products} onSaved={handleSaved} onVariationSaved={handleVariationSaved} />}
      {tab === 'raw_stock' && <RawStockTab onStockChange={recalcProductStocks} />}
      {tab === 'costing'   && <CostingTab />}
      {tab === 'recipes'   && <RecipesTab />}
    </div>
  )
}
