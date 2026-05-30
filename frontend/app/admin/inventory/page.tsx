'use client'

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { api, Product, ProductVariation, RawMaterial, ProductIngredient, RawMaterialSnapshot, SnapshotProjection } from '@/app/lib/api'
import { printInventorySheet, printSnapshotSheet } from '@/app/lib/printReceipt'

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
  product, variationIndex, variation, onSaved,
}: {
  product: Product; variationIndex: number; variation: ProductVariation
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
  products, onSaved, onVariationSaved,
}: {
  products: Product[]
  onSaved: (id: number, stock: number | null) => void
  onVariationSaved: (productId: number, updatedVariations: ProductVariation[]) => void
}) {
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

// ─── Ingredients tab ──────────────────────────────────────────────────────────

type RawForm = {
  name: string; category: string; purchase_unit: string
  batch_qty: string; batch_price: string
  serving_unit: string; yield_min: string; yield_max: string
  stock_qty: string; notes: string
}

const BLANK_FORM: RawForm = {
  name: '', category: '', purchase_unit: '', batch_qty: '', batch_price: '',
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
    low:     pricePerUnit / yHi,
    high:    pricePerUnit / yMin,
    isRange: !!(yMax && yMax > yMin),
  }
}

function fmtPeso(n: number) {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function RawMaterialModal({
  initial, onSave, onClose, existingCategories,
}: {
  initial?: RawMaterial
  onSave: (form: RawForm) => Promise<void>
  onClose: () => void
  existingCategories: string[]
}) {
  const hasCostingData = initial
    ? parseFloat(initial.batch_price) > 0
    : false

  const [form, setForm] = useState<RawForm>(
    initial
      ? {
          name: initial.name, category: initial.category ?? '',
          purchase_unit: initial.purchase_unit,
          batch_qty: initial.batch_qty, batch_price: initial.batch_price,
          serving_unit: initial.serving_unit, yield_min: initial.yield_min,
          yield_max: initial.yield_max, stock_qty: initial.stock_qty ?? '',
          notes: initial.notes,
        }
      : BLANK_FORM,
  )
  const [showCosting, setShowCosting] = useState(hasCostingData)
  const [saving, setSaving] = useState(false)

  const set = (k: keyof RawForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }))

  const cost = showCosting ? costPerServing(form) : null
  const batchQty   = parseFloat(form.batch_qty)
  const batchPrice = parseFloat(form.batch_price)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    // Fill in safe defaults for any empty costing fields
    const payload: RawForm = {
      ...form,
      batch_qty:    form.batch_qty    || '1',
      batch_price:  showCosting ? (form.batch_price  || '0') : '0',
      serving_unit: form.serving_unit || form.purchase_unit || 'unit',
      yield_min:    form.yield_min    || '1',
      yield_max:    form.yield_max    || '1',
    }
    try { await onSave(payload) } finally { setSaving(false) }
  }

  const inp = (label: string, key: keyof RawForm, props?: React.InputHTMLAttributes<HTMLInputElement>) => (
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
          <p className="text-xs text-gray-400 mt-0.5">
            {initial ? 'Update ingredient details' : 'Name and unit are enough to get started — add costing later'}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* Always-required fields */}
          {inp('Ingredient Name', 'name', { placeholder: 'e.g. Rice, Chicken, Cooking Oil', required: true, autoFocus: !initial })}

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Category <span className="font-normal text-gray-400">(optional)</span></label>
            <input
              list="rawmat-categories"
              value={form.category}
              onChange={e => setForm(prev => ({ ...prev, category: e.target.value }))}
              placeholder="e.g. Meat, Grains, Sauce…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-brand"
            />
            <datalist id="rawmat-categories">
              {existingCategories.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {inp('Purchase Unit', 'purchase_unit', { placeholder: 'kg, pc, L, bag…', required: true })}
            {inp('Stock on Hand', 'stock_qty', { type: 'number', min: '0', step: 'any', placeholder: '0' })}
          </div>

          {/* Costing section — optional */}
          <div className={`rounded-xl border transition-colors ${showCosting ? 'border-orange-200 bg-orange-50/40' : 'border-dashed border-gray-200'}`}>
            <button
              type="button"
              onClick={() => setShowCosting(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-left"
            >
              <span className={`text-xs font-semibold ${showCosting ? 'text-orange-700' : 'text-gray-400'}`}>
                {showCosting ? '▾ Costing details' : '▸ Add costing details (optional)'}
              </span>
              {!showCosting && (
                <span className="text-xs text-gray-300">batch price, yield, cost/serving</span>
              )}
            </button>

            {showCosting && (
              <div className="px-4 pb-4 space-y-4">

                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Purchase batch</p>
                  <div className="grid grid-cols-3 gap-3">
                    {inp('Qty', 'batch_qty', { type: 'number', min: '0', step: 'any', placeholder: '25' })}
                    {inp('Unit', 'purchase_unit', { placeholder: 'kg' })}
                    {inp('Price (₱)', 'batch_price', { type: 'number', min: '0', step: 'any', placeholder: '1375' })}
                  </div>
                  {batchQty > 0 && batchPrice > 0 && (
                    <p className="text-xs text-gray-400 mt-1.5">
                      → <span className="font-semibold text-gray-600">{fmtPeso(batchPrice / batchQty)}</span> per {form.purchase_unit || 'unit'}
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">
                    Yield per {form.purchase_unit || 'purchase unit'}
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {inp('Min yield', 'yield_min', { type: 'number', min: '0', step: 'any', placeholder: '4.2' })}
                    {inp('Max yield', 'yield_max', { type: 'number', min: '0', step: 'any', placeholder: '5.0' })}
                    {inp('Serving unit', 'serving_unit', { placeholder: 'cup' })}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Leave max blank if yield is fixed</p>
                </div>

                {cost && (
                  <div className="bg-white border border-orange-100 rounded-xl px-4 py-3">
                    <p className="text-xs font-bold text-orange-700 mb-1.5">Cost per {form.serving_unit || 'serving'}</p>
                    {cost.isRange ? (
                      <div className="flex items-baseline gap-2">
                        <span className="text-lg font-bold text-orange-600">{fmtPeso(cost.low)}</span>
                        <span className="text-orange-300">–</span>
                        <span className="text-lg font-bold text-orange-600">{fmtPeso(cost.high)}</span>
                        <span className="text-xs text-orange-400 ml-1">avg {fmtPeso((cost.low + cost.high) / 2)}</span>
                      </div>
                    ) : (
                      <span className="text-lg font-bold text-orange-600">{fmtPeso(cost.low)}</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {inp('Notes (optional)', 'notes', { placeholder: 'Brand, supplier, any context…' })}

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

function IngredientRow({
  item, onStockSaved, onEdit, onDelete,
}: {
  item: RawMaterial
  onStockSaved: (id: number, stock_qty: string) => void
  onEdit: () => void
  onDelete: () => void
}) {
  const stockQty = parseFloat(item.stock_qty) || 0
  const [draft, setDraft] = useState(stockQty > 0 ? String(stockQty) : '')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const n = parseFloat(item.stock_qty) || 0
    setDraft(n > 0 ? String(n) : '')
  }, [item.stock_qty])

  const saveStock = async (value: string) => {
    if (parseFloat(value) === parseFloat(item.stock_qty)) return
    setSaving(true)
    try {
      await api.updateRawMaterial(item.id, { stock_qty: value })
      onStockSaved(item.id, value)
    } finally { setSaving(false) }
  }

  const commitDraft = () => {
    const n = parseFloat(draft)
    if (draft.trim() === '') saveStock('0')
    else if (!isNaN(n) && n >= 0) saveStock(String(n))
    else { setDraft(stockQty > 0 ? String(stockQty) : '') }
  }

  const adjust = (delta: number) => {
    const next = Math.max(0, stockQty + delta)
    setDraft(next > 0 ? String(next) : '')
    saveStock(String(next))
  }

  const yieldMin = parseFloat(item.yield_min) || 0
  const yieldMax = parseFloat(item.yield_max) || 0
  const hasYield = yieldMin > 0 && !!item.serving_unit
  const hasStock = stockQty > 0 && hasYield
  const srvMin = hasStock ? stockQty * yieldMin : 0
  const srvMax = hasStock && yieldMax > yieldMin ? stockQty * yieldMax : srvMin
  const fmt = (n: number) => n % 1 === 0 ? n.toFixed(0) : n.toFixed(1)

  const cost = costPerServing({
    batch_qty: item.batch_qty, batch_price: item.batch_price,
    yield_min: item.yield_min, yield_max: item.yield_max,
    name: item.name, category: item.category ?? '',
    purchase_unit: item.purchase_unit,
    serving_unit: item.serving_unit, stock_qty: item.stock_qty, notes: item.notes,
  })

  return (
    <div className="flex items-center gap-4 py-3.5 border-b border-gray-50 last:border-0 group">

      {/* Name */}
      <div className="w-44 shrink-0 min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">{item.name}</p>
        <p className="text-xs text-gray-400 truncate">{item.notes || item.purchase_unit}</p>
      </div>

      {/* Stock on hand */}
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
        <span className="text-xs text-gray-400 w-8 ml-0.5 truncate">{item.purchase_unit}</span>
      </div>

      {/* Serving units available */}
      <div className="w-36 shrink-0 text-right">
        {hasStock ? (
          <div>
            <p className="text-sm font-bold text-brand">
              {srvMin === srvMax ? fmt(srvMin) : `${fmt(srvMin)}–${fmt(srvMax)}`} {item.serving_unit}
            </p>
            <p className="text-xs text-gray-400">available</p>
          </div>
        ) : hasYield ? (
          <p className="text-xs text-gray-300">— set stock</p>
        ) : (
          <p className="text-xs text-gray-300">—</p>
        )}
      </div>

      {/* Cost per serving */}
      <div className="flex-1 min-w-0 text-right">
        {cost ? (
          cost.isRange ? (
            <div>
              <p className="text-sm font-bold text-gray-700">
                {fmtPeso(cost.low)} – {fmtPeso(cost.high)}
              </p>
              <p className="text-xs text-gray-400">per {item.serving_unit}</p>
            </div>
          ) : (
            <div>
              <p className="text-sm font-bold text-gray-700">{fmtPeso(cost.low)}</p>
              <p className="text-xs text-gray-400">per {item.serving_unit}</p>
            </div>
          )
        ) : (
          <button onClick={onEdit}
            className="text-xs text-gray-300 hover:text-brand hover:underline font-medium">
            + add costing
          </button>
        )}
      </div>

      {/* Edit / Delete */}
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

function fmtDateTime(iso: string) {
  const d = new Date(iso)
  return (
    d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) +
    '\n' +
    d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true })
  )
}

// ── Layout config (stored in localStorage) ───────────────────────────────────
type LayoutConfig = {
  categories: string[]                        // ordered category names
  categoryItems: Record<string, number[]>     // category → ordered ingredient IDs
}
const LAYOUT_KEY = 'pos_ingredient_layout'
function loadLayout(): LayoutConfig {
  if (typeof window === 'undefined') return { categories: [], categoryItems: {} }
  try { return JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}') } catch { return { categories: [], categoryItems: {} } }
}
function persistLayout(l: LayoutConfig) { localStorage.setItem(LAYOUT_KEY, JSON.stringify(l)) }

function SnapshotHistoryDrawer({ onClose, fontSize }: { onClose: () => void; fontSize: number }) {
  const [snapshots, setSnapshots] = useState<RawMaterialSnapshot[]>([])
  const [loading, setLoading]     = useState(true)
  const [layout, setLayout]       = useState<LayoutConfig>({ categories: [], categoryItems: {} })
  useEffect(() => { setLayout(loadLayout()) }, [])
  const [editMode, setEditMode]   = useState(false)
  const [addingCat, setAddingCat] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [snapOffset, setSnapOffset] = useState(0)
  const [editingSnapId, setEditingSnapId]   = useState<number | null>(null)
  const [editingSnapDate, setEditingSnapDate] = useState('')
  const [savingSnapDate, setSavingSnapDate] = useState(false)
  const [projections, setProjections] = useState<Record<number, SnapshotProjection | 'loading'>>({})
  const [activeProjections, setActiveProjections] = useState<Set<number>>(new Set())
  const SHOW = 5

  useEffect(() => {
    api.getSnapshots().then(s => { setSnapshots(s); setLoading(false) })
  }, [])

  const updateLayout = useCallback((fn: (p: LayoutConfig) => LayoutConfig) => {
    setLayout(prev => { const next = fn(prev); persistLayout(next); return next })
  }, [])

  // Union of all ingredients seen across every snapshot
  const allIngredients = useMemo(() => {
    const map = new Map<number, { id: number; name: string; purchase_unit: string }>()
    for (const snap of snapshots)
      for (const e of snap.data)
        if (!map.has(e.id)) map.set(e.id, e)
    return Array.from(map.values())
  }, [snapshots])

  // Build grouped rows: defined categories (in order), then uncategorized
  const grouped = useMemo(() => {
    const allCategorized = new Set(Object.values(layout.categoryItems ?? {}).flat())
    const result: { category: string; items: typeof allIngredients }[] = []

    for (const cat of layout.categories ?? []) {
      const orderedIds = layout.categoryItems?.[cat] ?? []
      const items = orderedIds.map(id => allIngredients.find(i => i.id === id)).filter(Boolean) as typeof allIngredients
      result.push({ category: cat, items })
    }

    const uncategorized = allIngredients.filter(i => !allCategorized.has(i.id))
    if (uncategorized.length > 0 || editMode) result.push({ category: '', items: uncategorized })
    return result
  }, [allIngredients, layout, editMode])

  const visibleSnaps = snapshots.slice(snapOffset, snapOffset + SHOW)

  const getStock = (snap: RawMaterialSnapshot, id: number) => {
    const e = snap.data.find(e => e.id === id)
    return e ? parseFloat(e.stock_qty) : null
  }

  const assignCategory = (ingredientId: number, newCat: string) => {
    updateLayout(prev => {
      const ci = { ...prev.categoryItems }
      for (const k of Object.keys(ci)) ci[k] = ci[k].filter(id => id !== ingredientId)
      if (newCat) ci[newCat] = [...(ci[newCat] ?? []), ingredientId]
      return { ...prev, categoryItems: ci }
    })
  }

  const getIngCat = (id: number) =>
    Object.entries(layout.categoryItems ?? {}).find(([, ids]) => ids.includes(id))?.[0] ?? ''

  const moveIngredient = (cat: string, id: number, dir: -1 | 1) => {
    if (!cat) return
    updateLayout(prev => {
      const ids = [...(prev.categoryItems?.[cat] ?? [])]
      const idx = ids.indexOf(id)
      if (idx < 0 || (dir === -1 && idx === 0) || (dir === 1 && idx === ids.length - 1)) return prev
      ;[ids[idx], ids[idx + dir]] = [ids[idx + dir], ids[idx]]
      return { ...prev, categoryItems: { ...(prev.categoryItems ?? {}), [cat]: ids } }
    })
  }

  const moveCat = (cat: string, dir: -1 | 1) => {
    updateLayout(prev => {
      const cats = [...(prev.categories ?? [])]
      const idx = cats.indexOf(cat)
      if (idx < 0 || (dir === -1 && idx === 0) || (dir === 1 && idx === cats.length - 1)) return prev
      ;[cats[idx], cats[idx + dir]] = [cats[idx + dir], cats[idx]]
      return { ...prev, categories: cats }
    })
  }

  const addCategory = (name: string) => {
    const n = name.trim()
    if (!n || (layout.categories ?? []).includes(n)) return
    updateLayout(prev => ({ ...prev, categories: [...(prev.categories ?? []), n], categoryItems: { ...(prev.categoryItems ?? {}), [n]: [] } }))
  }

  const deleteCategory = (cat: string) => {
    updateLayout(prev => ({
      categories: (prev.categories ?? []).filter(c => c !== cat),
      categoryItems: Object.fromEntries(Object.entries(prev.categoryItems ?? {}).filter(([k]) => k !== cat)),
    }))
  }

  const toLocalInput = (iso: string) => {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const startEditSnap = (snap: RawMaterialSnapshot) => {
    setEditingSnapId(snap.id)
    setEditingSnapDate(toLocalInput(snap.saved_at))
  }

  const saveSnapDate = async (id: number) => {
    if (!editingSnapDate) return
    setSavingSnapDate(true)
    try {
      const updated = await api.patchSnapshot(id, { saved_at: new Date(editingSnapDate).toISOString() })
      setSnapshots(prev => prev.map(s => s.id === id ? updated : s))
      setEditingSnapId(null)
    } finally {
      setSavingSnapDate(false)
    }
  }

  const toggleProjection = async (id: number) => {
    if (activeProjections.has(id)) {
      setActiveProjections(prev => { const s = new Set(prev); s.delete(id); return s })
      return
    }
    setActiveProjections(prev => new Set(prev).add(id))
    if (projections[id]) return
    setProjections(prev => ({ ...prev, [id]: 'loading' }))
    try {
      const result = await api.getSnapshotProjection(id)
      setProjections(prev => ({ ...prev, [id]: result }))
    } catch {
      setProjections(prev => { const n = { ...prev }; delete n[id]; return n })
      setActiveProjections(prev => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  const handlePrintSnapshot = (snap: RawMaterialSnapshot) => {
    // Build a map from this snapshot's own data so quantities always resolve
    const snapById = new Map(snap.data.map(e => [e.id, e]))
    const printed = new Set<number>()
    const printGroups: { category: string; items: { name: string; purchase_unit: string; stock_qty: number | null }[] }[] = []

    // Apply layout categories where possible
    for (const g of grouped) {
      const items: { name: string; purchase_unit: string; stock_qty: number | null }[] = []
      for (const ing of g.items) {
        const e = snapById.get(ing.id)
        if (!e) continue
        printed.add(ing.id)
        const qty = parseFloat(e.stock_qty)
        items.push({ name: e.name, purchase_unit: e.purchase_unit, stock_qty: isNaN(qty) ? null : qty })
      }
      if (items.length > 0) printGroups.push({ category: g.category, items })
    }

    // Any snapshot entries not matched by the layout (or if layout is empty)
    const extra = snap.data
      .filter(e => !printed.has(e.id))
      .sort((a, b) => a.name.localeCompare(b.name))
    if (extra.length > 0) {
      printGroups.push({
        category: '',
        items: extra.map(e => {
          const qty = parseFloat(e.stock_qty)
          return { name: e.name, purchase_unit: e.purchase_unit, stock_qty: isNaN(qty) ? null : qty }
        }),
      })
    }

    printSnapshotSheet(snap.saved_at, printGroups, fontSize)
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-6xl bg-white shadow-2xl flex flex-col h-full">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-800">Stock History</h2>
            <p className="text-xs text-gray-400 mt-0.5">Compare ingredient stock across snapshots — columns are saved points in time</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setEditMode(e => !e); setAddingCat(false) }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${editMode ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {editMode ? '✓ Done' : '✏ Manage Layout'}
            </button>
            <button onClick={onClose} className="w-8 h-8 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex items-center justify-center text-xl">✕</button>
          </div>
        </div>

        {/* Category management bar */}
        {editMode && (
          <div className="px-5 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Categories:</span>
            {(layout.categories ?? []).map((cat, ci) => (
              <div key={cat} className="flex items-center gap-0.5 bg-white border border-gray-200 rounded-lg px-1.5 py-0.5">
                <button onClick={() => moveCat(cat, -1)} disabled={ci === 0} className="text-gray-300 hover:text-gray-600 disabled:opacity-20 text-[10px] px-0.5">◀</button>
                <span className="text-xs font-semibold text-gray-700 px-1">{cat}</span>
                <button onClick={() => moveCat(cat, 1)} disabled={ci === (layout.categories ?? []).length - 1} className="text-gray-300 hover:text-gray-600 disabled:opacity-20 text-[10px] px-0.5">▶</button>
                <button onClick={() => deleteCategory(cat)} className="text-gray-200 hover:text-red-400 ml-0.5 text-[11px] leading-none">✕</button>
              </div>
            ))}
            {addingCat ? (
              <form className="flex items-center gap-1.5" onSubmit={e => { e.preventDefault(); addCategory(newCatName); setNewCatName(''); setAddingCat(false) }}>
                <input autoFocus type="text" value={newCatName} onChange={e => setNewCatName(e.target.value)}
                  onBlur={() => { if (!newCatName.trim()) setAddingCat(false) }}
                  placeholder="Name…" className="border border-brand rounded-lg px-2.5 py-1 text-xs focus:outline-none w-28" />
                <button type="submit" className="text-xs font-semibold text-brand">Add</button>
                <button type="button" onClick={() => { setAddingCat(false); setNewCatName('') }} className="text-xs text-gray-400">✕</button>
              </form>
            ) : (
              <button onClick={() => setAddingCat(true)} className="text-xs font-semibold text-brand hover:underline">+ New category</button>
            )}
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {loading && <div className="text-center py-20 text-gray-400 text-sm">Loading…</div>}

          {!loading && snapshots.length === 0 && (
            <div className="text-center py-24">
              <p className="text-3xl mb-3">📋</p>
              <p className="text-gray-600 font-semibold">No snapshots yet</p>
              <p className="text-xs text-gray-400 mt-1.5">Hit Save in the Ingredients tab to record stock levels.</p>
            </div>
          )}

          {!loading && snapshots.length > 0 && allIngredients.length > 0 && (
            <table className="w-full border-collapse" style={{ minWidth: `${200 + visibleSnaps.length * 130}px` }}>
              <thead className="sticky top-0 z-20">
                <tr className="bg-white border-b-2 border-gray-100">
                  <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide sticky left-0 bg-white border-r border-gray-100 z-30 w-52">
                    Ingredient
                  </th>
                  {visibleSnaps.map((snap, i) => {
                    const isLatest = i === 0 && snapOffset === 0
                    const lines = fmtDateTime(snap.saved_at).split('\n')
                    const isEditing = editingSnapId === snap.id
                    return (
                      <th key={snap.id} className={`px-4 py-2.5 text-center min-w-[150px] ${isLatest ? 'bg-orange-50' : 'bg-white'}`}>
                        {isLatest && <div className="text-[9px] font-bold text-brand uppercase tracking-widest mb-0.5">Latest</div>}
                        {isEditing ? (
                          <div className="flex flex-col items-center gap-1.5">
                            <input
                              type="datetime-local"
                              value={editingSnapDate}
                              onChange={e => setEditingSnapDate(e.target.value)}
                              className="w-full border border-brand rounded px-1.5 py-1 text-xs text-gray-800 focus:outline-none"
                            />
                            <div className="flex gap-1">
                              <button
                                onClick={() => saveSnapDate(snap.id)}
                                disabled={savingSnapDate}
                                className="px-2 py-0.5 bg-brand text-white text-[10px] font-bold rounded hover:bg-brand-dark disabled:opacity-40"
                              >{savingSnapDate ? '…' : 'Save'}</button>
                              <button
                                onClick={() => setEditingSnapId(null)}
                                className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-bold rounded hover:bg-gray-200"
                              >Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div className="group/col relative">
                            <div className={`text-xs font-semibold leading-tight ${isLatest ? 'text-brand' : 'text-gray-600'}`}>{lines[0]}</div>
                            <div className="text-[10px] text-gray-400 leading-tight">{lines[1]}</div>
                            {/* Projection badge */}
                            {activeProjections.has(snap.id) && (
                              <div className="mt-1">
                                {projections[snap.id] === 'loading' ? (
                                  <span className="text-[9px] text-gray-400">Loading…</span>
                                ) : projections[snap.id] ? (
                                  <span className="text-[9px] font-semibold text-blue-500">
                                    📦 {(projections[snap.id] as SnapshotProjection).order_count} orders deducted
                                  </span>
                                ) : null}
                              </div>
                            )}
                            <div className="absolute -top-1 -right-1 flex gap-0.5 opacity-0 group-hover/col:opacity-100 transition-opacity">
                              <button
                                onClick={() => toggleProjection(snap.id)}
                                title={activeProjections.has(snap.id) ? 'Hide projection' : 'Project order deductions'}
                                className={`w-5 h-5 rounded text-[10px] flex items-center justify-center transition-colors
                                  ${activeProjections.has(snap.id) ? 'bg-blue-500 text-white' : 'bg-gray-100 hover:bg-blue-500 hover:text-white text-gray-400'}`}
                              >📊</button>
                              <button
                                onClick={() => handlePrintSnapshot(snap)}
                                title="Print this snapshot"
                                className="w-5 h-5 rounded bg-gray-100 hover:bg-brand hover:text-white text-gray-400 text-[10px] flex items-center justify-center"
                              >🖨</button>
                              <button
                                onClick={() => startEditSnap(snap)}
                                title="Edit date"
                                className="w-5 h-5 rounded bg-gray-100 hover:bg-brand hover:text-white text-gray-400 text-[10px] flex items-center justify-center"
                              >✏</button>
                              <button
                                onClick={() => {
                                  if (confirm('Delete this snapshot?')) {
                                    api.deleteSnapshot(snap.id).then(() =>
                                      setSnapshots(prev => prev.filter(s => s.id !== snap.id))
                                    )
                                  }
                                }}
                                title="Delete snapshot"
                                className="w-5 h-5 rounded bg-gray-100 hover:bg-red-500 hover:text-white text-gray-400 text-[10px] flex items-center justify-center"
                              >🗑</button>
                            </div>
                          </div>
                        )}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {grouped.filter(g => g.items.length > 0 || (editMode && g.category !== '')).map(({ category, items }) => (
                  <React.Fragment key={`grp-${category}`}>
                    {/* Category header */}
                    <tr className="bg-gray-50/80">
                      <td colSpan={visibleSnaps.length + 1} className="px-5 py-1.5 sticky left-0 bg-gray-50/80">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                          {category || 'Uncategorized'}
                        </span>
                      </td>
                    </tr>

                    {/* Ingredient rows */}
                    {items.map((ing, ingIdx) => (
                      <tr key={ing.id} className="border-b border-gray-50 hover:bg-sky-50/30 group/row">
                        <td className="px-4 py-2.5 sticky left-0 bg-white group-hover/row:bg-sky-50/30 border-r border-gray-100 z-10 w-52">
                          <div className="flex items-start gap-2">
                            {editMode && category && (
                              <div className="flex flex-col gap-0 shrink-0 pt-0.5">
                                <button onClick={() => moveIngredient(category, ing.id, -1)} disabled={ingIdx === 0}
                                  className="text-gray-300 hover:text-gray-600 disabled:opacity-20 text-[9px] leading-snug">▲</button>
                                <button onClick={() => moveIngredient(category, ing.id, 1)} disabled={ingIdx === items.length - 1}
                                  className="text-gray-300 hover:text-gray-600 disabled:opacity-20 text-[9px] leading-snug">▼</button>
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-800 truncate leading-tight">{ing.name}</p>
                              {editMode ? (
                                <select
                                  value={getIngCat(ing.id)}
                                  onChange={e => assignCategory(ing.id, e.target.value)}
                                  className="mt-1 w-full border border-gray-200 rounded px-1.5 py-0.5 text-xs text-gray-600 focus:outline-none focus:border-brand"
                                >
                                  <option value="">Uncategorized</option>
                                  {(layout.categories ?? []).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                </select>
                              ) : (
                                <p className="text-[10px] text-gray-400 leading-tight">{ing.purchase_unit}</p>
                              )}
                            </div>
                          </div>
                        </td>

                        {visibleSnaps.map((snap, si) => {
                          const qty = getStock(snap, ing.id)
                          const isLatestCol = si === 0 && snapOffset === 0
                          const proj = activeProjections.has(snap.id) && projections[snap.id] !== 'loading'
                            ? (projections[snap.id] as SnapshotProjection | undefined)?.items.find(p => p.id === ing.id)
                            : null
                          const remaining = proj ? parseFloat(proj.remaining_qty) : null
                          const usedQty   = proj ? parseFloat(proj.used_qty) : null
                          return (
                            <td key={snap.id} className={`px-4 py-2.5 text-center ${isLatestCol ? 'bg-orange-50/40' : ''}`}>
                              {qty === null ? (
                                <span className="text-xs text-gray-200">—</span>
                              ) : proj ? (
                                <div className="flex flex-col items-center gap-0.5">
                                  <span className="text-[10px] text-gray-400 tabular-nums line-through">
                                    {qty % 1 === 0 ? qty : qty.toFixed(2)}
                                  </span>
                                  {usedQty !== null && usedQty > 0 && (
                                    <span className="text-[9px] text-red-400 tabular-nums">−{usedQty % 1 === 0 ? usedQty : usedQty.toFixed(2)}</span>
                                  )}
                                  <span className={`text-sm font-bold tabular-nums ${remaining === 0 ? 'text-red-500' : remaining! <= 5 ? 'text-amber-500' : 'text-blue-600'}`}>
                                    {remaining! % 1 === 0 ? remaining : remaining!.toFixed(2)}
                                    <span className="text-[10px] font-normal text-gray-400 ml-0.5">{ing.purchase_unit}</span>
                                  </span>
                                </div>
                              ) : (
                                <span className={`text-sm font-bold tabular-nums ${qty === 0 ? 'text-red-400' : qty <= 5 ? 'text-amber-500' : 'text-gray-800'}`}>
                                  {qty % 1 === 0 ? qty : qty.toFixed(2)}
                                  <span className="text-[10px] font-normal text-gray-400 ml-0.5">{ing.purchase_unit}</span>
                                </span>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}

                    {items.length === 0 && editMode && (
                      <tr>
                        <td colSpan={visibleSnaps.length + 1} className="px-5 py-2 text-xs text-gray-300 italic sticky left-0">
                          No ingredients in this category yet
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Snapshot pagination */}
        {!loading && snapshots.length > SHOW && (
          <div className="border-t border-gray-100 px-6 py-3 flex items-center justify-between shrink-0 bg-white">
            <span className="text-xs text-gray-400">
              Showing snapshots {snapOffset + 1}–{Math.min(snapOffset + SHOW, snapshots.length)} of {snapshots.length}
            </span>
            <div className="flex gap-2">
              <button onClick={() => setSnapOffset(p => Math.max(0, p - SHOW))} disabled={snapOffset === 0}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-30">← Newer</button>
              <button onClick={() => setSnapOffset(p => Math.min(snapshots.length - SHOW, p + SHOW))} disabled={snapOffset + SHOW >= snapshots.length}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-30">Older →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

type SortKey = 'name' | 'stock' | 'cost'

function IngredientsTab({ onStockChange }: { onStockChange: () => void }) {
  const [materials, setMaterials]   = useState<RawMaterial[]>([])
  const [loading, setLoading]       = useState(true)
  const [showModal, setShowModal]   = useState(false)
  const [editing, setEditing]       = useState<RawMaterial | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [saving, setSaving]         = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [printFontSize, setPrintFontSize] = useState(() => {
    if (typeof window === 'undefined') return 11
    return parseInt(localStorage.getItem('pos_print_sheet_fontsize') ?? '11', 10) || 11
  })
  const [search, setSearch]         = useState('')
  const [sortKey, setSortKey]       = useState<SortKey>('name')
  const [sortAsc, setSortAsc]       = useState(true)
  const [collapsed, setCollapsed]   = useState<Set<string>>(new Set())

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

  const handleStockSaved = (id: number, stock_qty: string) => {
    setMaterials(prev => prev.map(m => m.id === id ? { ...m, stock_qty } : m))
    onStockChange()
  }

  const openEdit   = (m: RawMaterial) => { setEditing(m); setShowModal(true) }
  const openCreate = () => { setEditing(null); setShowModal(true) }

  const handleSaveSnapshot = async () => {
    setSaving(true)
    try {
      await api.createSnapshot()
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const handlePrintList = () => printInventorySheet(materials, printFontSize, 'list', { areaColumns: [], rowHeightMm: 8, colPaddingMm: 3 })

  const setAndSaveFontSize = (v: number) => {
    setPrintFontSize(v)
    localStorage.setItem('pos_print_sheet_fontsize', String(v))
  }

  const existingCategories = useMemo(
    () => [...new Set(materials.map(m => m.category).filter(Boolean))].sort(),
    [materials],
  )

  const cycleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(v => !v)
    else { setSortKey(key); setSortAsc(true) }
  }

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return <span className="text-gray-300 text-[10px]">↕</span>
    return <span className="text-brand text-[10px]">{sortAsc ? '↑' : '↓'}</span>
  }

  if (loading) return <div className="text-gray-400 text-sm py-10 text-center">Loading…</div>

  const stocked    = materials.filter(m => (parseFloat(m.stock_qty) || 0) > 0).length
  const withCosting = materials.filter(m => costPerServing({
    batch_qty: m.batch_qty, batch_price: m.batch_price, yield_min: m.yield_min,
    yield_max: m.yield_max, name: m.name, category: m.category ?? '',
    purchase_unit: m.purchase_unit,
    serving_unit: m.serving_unit, stock_qty: m.stock_qty, notes: m.notes,
  }) !== null).length

  const q = search.trim().toLowerCase()
  const filtered = q
    ? materials.filter(m => m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q))
    : materials

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0
    if (sortKey === 'name') {
      cmp = a.name.localeCompare(b.name)
    } else if (sortKey === 'stock') {
      cmp = (parseFloat(a.stock_qty) || 0) - (parseFloat(b.stock_qty) || 0)
    } else {
      const ca = costPerServing({ batch_qty: a.batch_qty, batch_price: a.batch_price, yield_min: a.yield_min, yield_max: a.yield_max, name: a.name, category: a.category ?? '', purchase_unit: a.purchase_unit, serving_unit: a.serving_unit, stock_qty: a.stock_qty, notes: a.notes })
      const cb = costPerServing({ batch_qty: b.batch_qty, batch_price: b.batch_price, yield_min: b.yield_min, yield_max: b.yield_max, name: b.name, category: b.category ?? '', purchase_unit: b.purchase_unit, serving_unit: b.serving_unit, stock_qty: b.stock_qty, notes: b.notes })
      cmp = (ca?.low ?? 0) - (cb?.low ?? 0)
    }
    return sortAsc ? cmp : -cmp
  })

  // Group by category; uncategorized goes last
  const grouped: { label: string; items: RawMaterial[] }[] = []
  if (q) {
    grouped.push({ label: '', items: sorted })
  } else {
    const catMap = new Map<string, RawMaterial[]>()
    for (const m of sorted) {
      const cat = m.category || ''
      if (!catMap.has(cat)) catMap.set(cat, [])
      catMap.get(cat)!.push(m)
    }
    const named = [...catMap.entries()].filter(([k]) => k !== '').sort(([a], [b]) => a.localeCompare(b))
    const uncategorized = catMap.get('') ?? []
    for (const [label, items] of named) grouped.push({ label, items })
    if (uncategorized.length) grouped.push({ label: '', items: uncategorized })
  }

  const hasCategories = existingCategories.length > 0

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-4 min-w-0">
          {materials.length > 0 && (
            <>
              <span className="text-sm text-gray-500">{materials.length} ingredient{materials.length !== 1 ? 's' : ''}</span>
              <span className="text-xs text-gray-300">·</span>
              <span className="text-sm text-gray-500">{stocked} stocked</span>
              <span className="text-xs text-gray-300">·</span>
              <span className="text-sm text-gray-500">{withCosting} with costing</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Print buttons */}
          <div className="flex items-stretch rounded-xl border border-gray-200 overflow-hidden shrink-0">
            <button
              onClick={() => setAndSaveFontSize(Math.max(8, printFontSize - 1))}
              disabled={printFontSize <= 8}
              title="Decrease font size"
              className="px-2.5 text-sm font-bold text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition-colors border-r border-gray-200"
            >A−</button>
            <span className="px-2.5 flex items-center text-xs font-semibold text-gray-500 tabular-nums select-none border-r border-gray-200">
              {printFontSize}px
            </span>
            <button
              onClick={() => setAndSaveFontSize(Math.min(16, printFontSize + 1))}
              disabled={printFontSize >= 16}
              title="Increase font size"
              className="px-2.5 text-sm font-bold text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition-colors border-r border-gray-200"
            >A+</button>
            <button
              onClick={handlePrintList}
              disabled={materials.length === 0}
              title="Print ingredient list"
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-gray-500 hover:text-brand hover:bg-orange-50 disabled:opacity-40 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9"/>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                <rect x="6" y="14" width="12" height="8"/>
              </svg>
              List
            </button>
          </div>

          {/* History button */}
          <button
            onClick={() => setShowHistory(true)}
            title="View stock history"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-gray-500 hover:text-brand hover:border-brand text-sm font-semibold transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            History
          </button>

          {/* Save snapshot button */}
          <button
            onClick={handleSaveSnapshot}
            disabled={saving || materials.length === 0}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 ${
              savedFlash
                ? 'bg-green-500 text-white'
                : 'bg-gray-800 hover:bg-gray-700 text-white'
            }`}
          >
            {savedFlash ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Saved!
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
                </svg>
                {saving ? 'Saving…' : 'Save'}
              </>
            )}
          </button>

          <button onClick={openCreate}
            className="bg-brand text-white font-semibold px-4 py-2 rounded-xl hover:bg-brand-dark transition-colors text-sm">
            + Add Ingredient
          </button>
        </div>
      </div>

      {/* Search + Sort toolbar */}
      {materials.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-40">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search ingredients…"
              className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:border-brand"
            />
          </div>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {(['name', 'stock', 'cost'] as SortKey[]).map(key => (
              <button
                key={key}
                onClick={() => cycleSort(key)}
                className={`flex items-center gap-1 px-3 py-1 rounded-md text-xs font-semibold transition-colors capitalize ${
                  sortKey === key
                    ? 'bg-white text-gray-800 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {key} {sortIcon(key)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {materials.length === 0 && (
        <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
          <p className="text-gray-500 font-medium">No ingredients yet</p>
          <p className="text-xs text-gray-400 mt-1.5 max-w-xs mx-auto">
            Add rice, chicken, cooking oil — just a name and unit to start. Costing details can be filled in later.
          </p>
          <button onClick={openCreate}
            className="mt-4 bg-brand text-white font-semibold px-5 py-2 rounded-xl hover:bg-brand-dark transition-colors text-sm">
            + Add your first ingredient
          </button>
        </div>
      )}

      {/* No search results */}
      {materials.length > 0 && filtered.length === 0 && (
        <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
          <p className="text-gray-400 text-sm">No ingredients match <span className="font-semibold text-gray-600">"{search}"</span></p>
          <button onClick={() => setSearch('')} className="mt-2 text-xs text-brand hover:underline">Clear search</button>
        </div>
      )}

      {/* Table */}
      {materials.length > 0 && filtered.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Column headers */}
          <div className="flex items-center gap-4 px-5 py-3 bg-gray-50 border-b border-gray-100">
            <span className="w-44 shrink-0 text-xs font-bold text-gray-400 uppercase tracking-wide">Ingredient</span>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wide shrink-0" style={{ width: '148px' }}>Stock on Hand</span>
            <span className="w-36 shrink-0 text-xs font-bold text-gray-400 uppercase tracking-wide text-right">Serving Units Avail.</span>
            <span className="flex-1 text-xs font-bold text-gray-400 uppercase tracking-wide text-right">Cost / Serving</span>
          </div>

          {grouped.map(({ label, items }) => {
            const key = label || '__none__'
            const isCollapsed = collapsed.has(key)
            const toggleCollapse = () => setCollapsed(prev => {
              const next = new Set(prev)
              next.has(key) ? next.delete(key) : next.add(key)
              return next
            })
            return (
              <div key={key}>
                {/* Category header — only when categories exist and not in search mode */}
                {hasCategories && !q && (
                  <button
                    type="button"
                    onClick={toggleCollapse}
                    className="w-full flex items-center gap-2 px-5 pt-3 pb-1.5 text-left hover:bg-gray-50 group transition-colors"
                  >
                    <span className={`text-gray-300 group-hover:text-gray-500 transition-transform duration-150 ${isCollapsed ? '-rotate-90' : ''}`}
                      style={{ display: 'inline-block', fontSize: '10px', lineHeight: 1 }}>▼</span>
                    <span className="text-[10px] font-bold text-gray-400 group-hover:text-gray-600 uppercase tracking-widest transition-colors">
                      {label || 'Uncategorized'}
                    </span>
                    <span className="text-[10px] text-gray-300 ml-1">{items.length}</span>
                  </button>
                )}
                {!isCollapsed && (
                  <div className="px-5">
                    {items.map(m => (
                      <IngredientRow
                        key={m.id}
                        item={m}
                        onStockSaved={handleStockSaved}
                        onEdit={() => openEdit(m)}
                        onDelete={() => handleDelete(m.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {materials.length > 0 && (
        <p className="text-xs text-gray-400">
          Serving units are calculated from yield settings in costing. Stock feeds into the Recipes tab yield estimate.
        </p>
      )}

      {showModal && (
        <RawMaterialModal
          initial={editing ?? undefined}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditing(null) }}
          existingCategories={existingCategories}
        />
      )}

      {showHistory && <SnapshotHistoryDrawer onClose={() => setShowHistory(false)} fontSize={printFontSize} />}
    </div>
  )
}

// ─── Recipes tab ──────────────────────────────────────────────────────────────

type MenuEntry = {
  key: string; productId: number; productName: string; variationName: string; category: string
}

type ProductSource = {
  sid: string; label: string; subLabel: string; product: Product; variationName: string
}

function calcIngredientYield(ing: ProductIngredient): { min: number; max: number } | null {
  const stockQty      = parseFloat(ing.stock_qty)
  const yieldMin      = parseFloat(ing.yield_min)
  const yieldMax      = parseFloat(ing.yield_max)
  const qtyPerServing = parseFloat(ing.qty_per_serving)
  if (!stockQty || !yieldMin || !qtyPerServing) return null
  const effectiveMax = yieldMax && yieldMax > yieldMin ? yieldMax : yieldMin
  return {
    min: (stockQty * yieldMin) / qtyPerServing,
    max: (stockQty * effectiveMax) / qtyPerServing,
  }
}

function RecipeMenuRow({
  ing, products, onDelete, onUpdateQty,
}: {
  ing: ProductIngredient; products: Product[]
  onDelete: () => void; onUpdateQty: (id: number, qty: string) => Promise<void>
}) {
  const product = products.find(p => p.id === ing.product)
  const displayName = product
    ? (ing.variation_name ? `${product.name} — ${ing.variation_name}` : product.name)
    : `Product #${ing.product}`

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

  const yld = calcIngredientYield(ing)

  return (
    <div className="flex items-center gap-4 py-3 border-b border-gray-50 last:border-0 group">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{displayName}</p>
        {product?.category && <p className="text-xs text-gray-400">{product.category}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <input
          type="number" min="0" step="any" value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={e => { if (e.key === 'Enter') commitDraft() }}
          disabled={saving}
          className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-800 text-center focus:outline-none focus:border-brand disabled:opacity-50"
        />
        <span className="text-xs text-gray-400 whitespace-nowrap">{ing.serving_unit}/serving</span>
      </div>
      <div className="w-32 shrink-0 text-right">
        {yld ? (
          <p className="text-sm font-bold text-brand">
            ~{Math.floor(yld.min)}{Math.floor(yld.max) !== Math.floor(yld.min) ? `–${Math.floor(yld.max)}` : ''} servings
          </p>
        ) : (
          <p className="text-xs text-gray-300">no stock</p>
        )}
      </div>
      <div className="w-14 flex items-center justify-end shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
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

function RecipesTab({ onRecipeChanged }: { onRecipeChanged: () => void }) {
  const [products, setProducts]   = useState<Product[]>([])
  const [materials, setMaterials] = useState<RawMaterial[]>([])
  const [allIngredients, setAll]  = useState<ProductIngredient[]>([])
  const [selectedSid, setSelectedSid] = useState('')
  const [search, setSearch]       = useState('')
  const [loading, setLoading]     = useState(true)
  const [adding, setAdding]       = useState(false)
  const [newMenuKey, setNewMenuKey] = useState('')
  const [newQty, setNewQty]       = useState('')
  const [saving, setSaving]       = useState(false)
  const [registering, setRegistering] = useState(false)

  const load = useCallback(async () => {
    const [p, m, i] = await Promise.all([
      api.getProducts(), api.getRawMaterials(), api.getProductIngredients(),
    ])
    setProducts(p); setMaterials(m); setAll(i); setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const parsedSid = useMemo(() => {
    if (!selectedSid) return null
    if (selectedSid.startsWith('raw:')) return { type: 'raw' as const, id: parseInt(selectedSid.slice(4)), variationName: '' }
    if (selectedSid.startsWith('product:')) {
      const rest = selectedSid.slice(8)
      const sep  = rest.indexOf('__')
      if (sep < 0) return { type: 'product' as const, id: parseInt(rest), variationName: '' }
      return { type: 'product' as const, id: parseInt(rest.slice(0, sep)), variationName: rest.slice(sep + 2) }
    }
    return null
  }, [selectedSid])

  const selectedRaw = useMemo((): RawMaterial | null => {
    if (!parsedSid) return null
    if (parsedSid.type === 'raw') return materials.find(m => m.id === parsedSid.id) ?? null
    const prod = products.find(p => p.id === parsedSid.id)
    if (!prod) return null
    const targetName = parsedSid.variationName ? `${prod.name} — ${parsedSid.variationName}` : prod.name
    return materials.find(m => m.name.toLowerCase() === targetName.toLowerCase()) ?? null
  }, [parsedSid, materials, products])

  const selectedProduct = useMemo((): Product | null => {
    if (!parsedSid || parsedSid.type !== 'product') return null
    return products.find(p => p.id === parsedSid.id) ?? null
  }, [parsedSid, products])

  const selectedVariationName = parsedSid?.type === 'product' ? parsedSid.variationName : ''

  const allMenuEntries = useMemo((): MenuEntry[] =>
    products.flatMap(p =>
      p.variations.length > 0
        ? p.variations.map(v => ({ key: `${p.id}__${v.name}`, productId: p.id, productName: p.name, variationName: v.name, category: p.category }))
        : [{ key: `${p.id}__`, productId: p.id, productName: p.name, variationName: '', category: p.category }]
    ), [products])

  const linkedIngredients = useMemo(
    () => allIngredients.filter(i => i.raw_material === selectedRaw?.id),
    [allIngredients, selectedRaw]
  )

  const linkedKeys = useMemo(
    () => new Set(linkedIngredients.map(i => `${i.product}__${i.variation_name ?? ''}`)),
    [linkedIngredients]
  )
  const availableMenuEntries = useMemo(
    () => allMenuEntries.filter(e => !linkedKeys.has(e.key)),
    [allMenuEntries, linkedKeys]
  )

  const matUsage = useMemo(() => {
    const map = new Map<number, number>()
    for (const ing of allIngredients) map.set(ing.raw_material, (map.get(ing.raw_material) ?? 0) + 1)
    return map
  }, [allIngredients])

  const productLinkedMat = useCallback(
    (label: string) => materials.find(m => m.name.toLowerCase() === label.toLowerCase()) ?? null,
    [materials]
  )

  const productSources = useMemo((): ProductSource[] =>
    products.flatMap(p =>
      p.variations.length > 0
        ? p.variations.map(v => ({ sid: `product:${p.id}__${v.name}`, label: `${p.name} — ${v.name}`, subLabel: p.category || 'Menu item', product: p, variationName: v.name }))
        : [{ sid: `product:${p.id}__`, label: p.name, subLabel: p.category || 'Menu item', product: p, variationName: '' }]
    ), [products])

  const handleAdd = async () => {
    if (!selectedRaw || !newMenuKey || !newQty) return
    const sep = newMenuKey.indexOf('__')
    if (sep < 0) return
    const productId     = parseInt(newMenuKey.slice(0, sep))
    const variationName = newMenuKey.slice(sep + 2)
    setSaving(true)
    try {
      const created = await api.createProductIngredient({ product: productId, raw_material: selectedRaw.id, qty_per_serving: newQty, variation_name: variationName })
      setAll(prev => [...prev, created])
      setNewMenuKey(''); setNewQty(''); setAdding(false)
      onRecipeChanged()
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: number) => {
    await api.deleteProductIngredient(id)
    setAll(prev => prev.filter(i => i.id !== id))
    onRecipeChanged()
  }

  const handleUpdateQty = async (id: number, qty: string) => {
    const updated = await api.updateProductIngredient(id, { qty_per_serving: qty })
    setAll(prev => prev.map(i => i.id === id ? updated : i))
    onRecipeChanged()
  }

  const handleRegister = async () => {
    if (!selectedProduct) return
    const name      = selectedVariationName ? `${selectedProduct.name} — ${selectedVariationName}` : selectedProduct.name
    const variation = selectedVariationName ? selectedProduct.variations.find(v => v.name === selectedVariationName) : null
    const price     = variation?.price ?? selectedProduct.price ?? '0'
    const stock     = variation?.stock ?? selectedProduct.stock
    setRegistering(true)
    try {
      const m = await api.createRawMaterial({
        name, category: '', purchase_unit: 'pc', batch_qty: '1', batch_price: price,
        serving_unit: 'pc', yield_min: '1', yield_max: '1', stock_qty: String(stock ?? 0),
        notes: selectedVariationName ? `Linked from "${selectedProduct.name}" (${selectedVariationName})` : `Linked from "${selectedProduct.name}"`,
      })
      setMaterials(prev => [...prev, m])
    } finally { setRegistering(false) }
  }

  const q = search.toLowerCase()
  const filteredMaterials      = useMemo(() => materials.filter(m => m.name.toLowerCase().includes(q)), [materials, q])
  const filteredProductSources = useMemo(() => productSources.filter(s => s.label.toLowerCase().includes(q)), [productSources, q])

  if (loading) return <div className="text-gray-400 text-sm py-10 text-center">Loading…</div>

  const stockQtyNum = parseFloat(selectedRaw?.stock_qty ?? '0') || 0
  const yieldMinNum = parseFloat(selectedRaw?.yield_min ?? '0') || 0
  const yieldMaxNum = parseFloat(selectedRaw?.yield_max ?? '0') || 0
  const hasYield    = stockQtyNum > 0 && yieldMinNum > 0
  const availMin    = hasYield ? stockQtyNum * yieldMinNum : 0
  const availMax    = hasYield && yieldMaxNum > yieldMinNum ? stockQtyNum * yieldMaxNum : availMin

  return (
    <div className="flex gap-5 min-h-[520px]">

      {/* Left panel */}
      <div className="w-60 shrink-0 flex flex-col gap-3">
        <input
          type="text" placeholder="Search ingredients…"
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-brand"
        />

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Raw Ingredients</p>
          </div>
          {filteredMaterials.length === 0 ? (
            <p className="px-4 py-5 text-xs text-gray-300 text-center">
              {materials.length === 0 ? 'Add ingredients in the Ingredients tab' : 'No matches'}
            </p>
          ) : (
            <div>
              {filteredMaterials.map(m => {
                const sid    = `raw:${m.id}`
                const count  = matUsage.get(m.id) ?? 0
                const active = selectedSid === sid
                return (
                  <button key={m.id} onClick={() => { setSelectedSid(sid); setAdding(false) }}
                    className={`w-full flex items-center gap-2.5 px-4 py-3 text-left border-b border-gray-50 last:border-0 transition-colors
                      ${active ? 'bg-orange-50 border-l-[3px] border-l-brand' : 'hover:bg-gray-50'}`}>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${active ? 'text-brand' : 'text-gray-800'}`}>{m.name}</p>
                      <p className="text-xs text-gray-400">{m.serving_unit || m.purchase_unit}</p>
                    </div>
                    {count > 0 && (
                      <span className="text-[10px] font-bold text-brand bg-orange-100 rounded-full px-1.5 py-0.5 shrink-0">{count}</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Menu as Ingredient</p>
            <span className="text-[9px] text-gray-300 font-medium">sub-components</span>
          </div>
          {filteredProductSources.length === 0 ? (
            <p className="px-4 py-5 text-xs text-gray-300 text-center">No menu items</p>
          ) : (
            <div>
              {filteredProductSources.map(s => {
                const match  = productLinkedMat(s.label)
                const count  = match ? (matUsage.get(match.id) ?? 0) : 0
                const active = selectedSid === s.sid
                return (
                  <button key={s.sid} onClick={() => { setSelectedSid(s.sid); setAdding(false) }}
                    className={`w-full flex items-center gap-2.5 px-4 py-3 text-left border-b border-gray-50 last:border-0 transition-colors
                      ${active ? 'bg-blue-50 border-l-[3px] border-l-blue-400' : 'hover:bg-gray-50'}`}>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${active ? 'text-blue-600' : 'text-gray-800'}`}>
                        {s.variationName ? s.variationName : s.label}
                      </p>
                      <p className="text-xs text-gray-400 truncate">{s.variationName ? s.product.name : s.subLabel}</p>
                    </div>
                    {match ? (count > 0 && (
                      <span className="text-[10px] font-bold text-blue-500 bg-blue-50 border border-blue-100 rounded-full px-1.5 py-0.5 shrink-0">{count}</span>
                    )) : (
                      <span className="text-[10px] text-gray-300 shrink-0 font-medium">+</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 min-w-0">
        {!selectedSid ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-300">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z"/>
            </svg>
            <p className="text-sm">Select an ingredient to view its recipe usage</p>
          </div>

        ) : parsedSid?.type === 'product' && !selectedRaw ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto">
              <svg className="w-7 h-7 text-blue-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </div>
            <div>
              <p className="text-base font-bold text-gray-800">
                {selectedVariationName ? `${selectedProduct?.name} — ${selectedVariationName}` : selectedProduct?.name}
              </p>
              <p className="text-xs text-gray-400 mt-1.5 max-w-xs mx-auto">
                Not yet registered as an ingredient. Register it so other menu items can use it as a sub-component.
              </p>
            </div>
            <button onClick={handleRegister} disabled={registering}
              className="bg-blue-500 text-white font-semibold px-6 py-2.5 rounded-xl hover:bg-blue-600 transition-colors text-sm disabled:opacity-40">
              {registering ? 'Registering…' : 'Register as Ingredient'}
            </button>
            <p className="text-[10px] text-gray-300">Creates a matching entry in the Ingredients tab — edit units and yield there.</p>
          </div>

        ) : selectedRaw ? (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-bold text-gray-800">{selectedRaw.name}</h3>
                    {parsedSid?.type === 'product' && (
                      <span className="text-[10px] font-bold text-blue-500 bg-blue-50 border border-blue-100 rounded-full px-2 py-0.5">Menu item</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {stockQtyNum > 0 ? `${selectedRaw.stock_qty} ${selectedRaw.purchase_unit} on hand` : 'No stock set — update in the Ingredients tab'}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-2xl font-bold text-gray-800">{linkedIngredients.length}</p>
                  <p className="text-xs text-gray-400">menu item{linkedIngredients.length !== 1 ? 's' : ''}</p>
                </div>
              </div>

              {hasYield && (
                <div className="mt-4 pt-4 border-t border-gray-50 grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Stock on hand</p>
                    <p className="text-sm font-bold text-gray-700 mt-0.5">{selectedRaw.stock_qty} {selectedRaw.purchase_unit}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Yield rate</p>
                    <p className="text-sm font-bold text-gray-700 mt-0.5">
                      {selectedRaw.yield_min}{yieldMaxNum > yieldMinNum ? `–${selectedRaw.yield_max}` : ''} {selectedRaw.serving_unit}/{selectedRaw.purchase_unit}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Serving units avail.</p>
                    <p className="text-sm font-bold text-brand mt-0.5">
                      {availMin === availMax
                        ? availMin % 1 === 0 ? availMin.toFixed(0) : availMin.toFixed(1)
                        : `${availMin % 1 === 0 ? availMin.toFixed(0) : availMin.toFixed(1)}–${availMax % 1 === 0 ? availMax.toFixed(0) : availMax.toFixed(1)}`}
                      {' '}{selectedRaw.serving_unit}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div>
                  <h4 className="text-sm font-bold text-gray-700">Menu Items Using This Ingredient</h4>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {linkedIngredients.length === 0 ? 'None linked yet' : `${linkedIngredients.length} item${linkedIngredients.length !== 1 ? 's' : ''} · qty/serving controls yield estimate`}
                  </p>
                </div>
                {availableMenuEntries.length > 0 && !adding && (
                  <button onClick={() => setAdding(true)} className="text-sm font-semibold text-brand hover:underline">
                    + Add Menu Item
                  </button>
                )}
              </div>

              {linkedIngredients.length > 0 && (
                <div className="px-5">
                  <div className="flex items-center gap-4 py-2 border-b border-gray-50">
                    <span className="flex-1 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Menu Item</span>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Qty / Serving</span>
                    <span className="w-32 shrink-0 text-[10px] font-bold text-gray-400 uppercase tracking-wide text-right">Yield from stock</span>
                    <span className="w-14" />
                  </div>
                  {linkedIngredients.map(ing => (
                    <RecipeMenuRow
                      key={ing.id} ing={ing} products={products}
                      onDelete={() => handleDelete(ing.id)}
                      onUpdateQty={handleUpdateQty}
                    />
                  ))}
                </div>
              )}

              {linkedIngredients.length === 0 && !adding && (
                <div className="px-5 py-12 text-center">
                  <p className="text-sm text-gray-300">No menu items linked yet.</p>
                  <p className="text-xs text-gray-300 mt-1">Add menu items that use <span className="font-medium">{selectedRaw.name}</span> as an ingredient.</p>
                </div>
              )}

              {adding && (
                <div className="px-5 py-4 bg-gray-50 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 mb-3">Link a menu item to this ingredient</p>
                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <label className="block text-xs font-semibold text-gray-400 mb-1">Menu Item</label>
                      <select value={newMenuKey} onChange={e => setNewMenuKey(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-brand bg-white">
                        <option value="">— Select menu item —</option>
                        {Object.entries(
                          availableMenuEntries.reduce<Record<string, MenuEntry[]>>((acc, e) => {
                            const cat = e.category || 'Uncategorized'
                            if (!acc[cat]) acc[cat] = []
                            acc[cat].push(e)
                            return acc
                          }, {})
                        ).map(([cat, entries]) => (
                          <optgroup key={cat} label={cat}>
                            {entries.map(e => (
                              <option key={e.key} value={e.key}>
                                {e.variationName ? `${e.productName} — ${e.variationName}` : e.productName}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                    <div className="w-44 shrink-0">
                      <label className="block text-xs font-semibold text-gray-400 mb-1">
                        Qty per serving ({selectedRaw.serving_unit || selectedRaw.purchase_unit})
                      </label>
                      <input type="number" min="0" step="any" value={newQty} onChange={e => setNewQty(e.target.value)}
                        placeholder="1"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-brand" />
                    </div>
                    <button onClick={handleAdd} disabled={saving || !newMenuKey || !newQty}
                      className="bg-brand text-white font-semibold px-4 py-2 rounded-xl hover:bg-brand-dark transition-colors text-sm disabled:opacity-40 shrink-0">
                      {saving ? '…' : 'Add'}
                    </button>
                    <button onClick={() => { setAdding(false); setNewMenuKey(''); setNewQty('') }}
                      className="text-gray-400 hover:text-gray-700 text-sm py-2 shrink-0">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'stock' | 'ingredients' | 'recipes'

const TAB_LABELS: Record<Tab, string> = {
  stock:       'Menu Stock',
  ingredients: 'Ingredients',
  recipes:     'Recipes',
}

const TAB_SUBTITLES: Record<Tab, string> = {
  stock:       'Track stock levels for your menu items',
  ingredients: 'Manage raw ingredients — add stock on hand and costing info',
  recipes:     'Link ingredients to menu items and estimate serving yield',
}

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [materials, setMaterials] = useState<RawMaterial[]>([])
  const [loading, setLoading]   = useState(true)
  const [tab, setTab]           = useState<Tab>('stock')

  const load = useCallback(async () => {
    const [prods, mats] = await Promise.all([api.getProducts(), api.getRawMaterials()])
    setProducts(prods); setMaterials(mats); setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleSaved = async (id: number, stock: number | null) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, stock } : p))
    if (stock === null) return
    const product = products.find(p => p.id === id)
    if (!product) return
    const mat = materials.find(m => m.name.toLowerCase() === product.name.toLowerCase())
    if (!mat) return
    const newQty = String(stock)
    await api.updateRawMaterial(mat.id, { stock_qty: newQty })
    setMaterials(prev => prev.map(m => m.id === mat.id ? { ...m, stock_qty: newQty } : m))
    recalcProductStocks()
  }

  const handleVariationSaved = async (productId: number, updatedVariations: ProductVariation[]) => {
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, variations: updatedVariations } : p))
    const product = products.find(p => p.id === productId)
    if (!product) return
    let synced = false
    await Promise.all(updatedVariations.map(async v => {
      if (v.stock == null) return
      const matName = `${product.name} — ${v.name}`
      const mat = materials.find(m => m.name.toLowerCase() === matName.toLowerCase())
      if (!mat) return
      synced = true
      const newQty = String(v.stock)
      await api.updateRawMaterial(mat.id, { stock_qty: newQty })
      setMaterials(prev => prev.map(m => m.id === mat.id ? { ...m, stock_qty: newQty } : m))
    }))
    if (synced) recalcProductStocks()
  }

  const recalcProductStocks = useCallback(async () => {
    const [ings, mats] = await Promise.all([api.getProductIngredients(), api.getRawMaterials()])
    setMaterials(mats)

    const byEntry: Record<string, ProductIngredient[]> = {}
    for (const ing of ings) {
      const key = `${ing.product}__${ing.variation_name ?? ''}`
      if (!byEntry[key]) byEntry[key] = []
      byEntry[key].push(ing)
    }

    const plainPatches: Record<number, number> = {}
    const varPatches:   Record<number, Record<string, number>> = {}

    for (const [key, entries] of Object.entries(byEntry)) {
      const sep = key.indexOf('__')
      const productId     = parseInt(key.slice(0, sep))
      const variationName = key.slice(sep + 2)
      let bottleneck: number | null = null
      for (const ing of entries) {
        const mat = mats.find(m => m.id === ing.raw_material)
        if (!mat) continue
        const stockQty      = parseFloat(mat.stock_qty) || 0
        const yieldMin      = parseFloat(ing.yield_min)
        const qtyPerServing = parseFloat(ing.qty_per_serving)
        if (!yieldMin || !qtyPerServing) continue
        const servings = Math.floor((stockQty * yieldMin) / qtyPerServing)
        if (bottleneck === null || servings < bottleneck) bottleneck = servings
      }
      if (bottleneck === null) continue
      if (variationName === '') plainPatches[productId] = bottleneck
      else { if (!varPatches[productId]) varPatches[productId] = {}; varPatches[productId][variationName] = bottleneck }
    }

    const calls: Promise<unknown>[] = []
    for (const [pidStr, stock] of Object.entries(plainPatches))
      calls.push(api.updateProduct(parseInt(pidStr), { stock }).catch(() => {}))

    for (const [pidStr, vMap] of Object.entries(varPatches)) {
      const productId = parseInt(pidStr)
      const product   = products.find(p => p.id === productId)
      if (!product) continue
      const updatedVariations = product.variations.map(v =>
        vMap[v.name] !== undefined ? { ...v, stock: vMap[v.name] } : v
      )
      calls.push(api.updateProduct(productId, { variations: updatedVariations }).catch(() => {}))
    }

    await Promise.all(calls)

    setProducts(prev => prev.map(p => {
      let updated = p
      if (plainPatches[p.id] !== undefined) updated = { ...updated, stock: plainPatches[p.id] }
      if (varPatches[p.id]) {
        const vMap = varPatches[p.id]
        updated = { ...updated, variations: updated.variations.map(v => vMap[v.name] !== undefined ? { ...v, stock: vMap[v.name] } : v) }
      }
      return updated
    }))
  }, [products])

  if (loading) return <div className="text-gray-400 text-sm py-10 text-center">Loading…</div>

  return (
    <div className={tab === 'recipes' ? 'max-w-5xl' : 'max-w-3xl'}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Inventory</h1>
          <p className="text-sm text-gray-400 mt-0.5">{TAB_SUBTITLES[tab]}</p>
        </div>
        <div className="flex rounded-xl overflow-hidden border border-gray-200">
          {(['stock', 'ingredients', 'recipes'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-semibold transition-colors border-r border-gray-200 last:border-r-0
                ${tab === t ? 'bg-brand text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {tab === 'stock'       && <StockTab products={products} onSaved={handleSaved} onVariationSaved={handleVariationSaved} />}
      {tab === 'ingredients' && <IngredientsTab onStockChange={recalcProductStocks} />}
      {tab === 'recipes'     && <RecipesTab onRecipeChanged={recalcProductStocks} />}
    </div>
  )
}
