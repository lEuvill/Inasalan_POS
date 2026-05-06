'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { api, Product, RawMaterial } from '@/app/lib/api'

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

function StockTab({ products, onSaved }: { products: Product[]; onSaved: (id: number, stock: number | null) => void }) {
  const tracked    = products.filter(p => p.stock !== null)
  const outOfStock = products.filter(p => p.stock === 0)
  const lowStock   = products.filter(p => p.stock !== null && p.stock > 0 && p.stock <= LOW_STOCK)

  const grouped = products.reduce<Record<string, Product[]>>((acc, p) => {
    const cat = p.category || 'Uncategorized'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(p)
    return acc
  }, {})

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-gray-800">{tracked.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">Tracked</p>
        </div>
        <div className={`rounded-2xl border shadow-sm p-4 text-center ${lowStock.length > 0 ? 'bg-amber-50 border-amber-100' : 'bg-white border-gray-100'}`}>
          <p className={`text-2xl font-bold ${lowStock.length > 0 ? 'text-amber-600' : 'text-gray-800'}`}>{lowStock.length}</p>
          <p className={`text-xs mt-0.5 ${lowStock.length > 0 ? 'text-amber-500' : 'text-gray-400'}`}>Low Stock</p>
        </div>
        <div className={`rounded-2xl border shadow-sm p-4 text-center ${outOfStock.length > 0 ? 'bg-red-50 border-red-100' : 'bg-white border-gray-100'}`}>
          <p className={`text-2xl font-bold ${outOfStock.length > 0 ? 'text-red-600' : 'text-gray-800'}`}>{outOfStock.length}</p>
          <p className={`text-xs mt-0.5 ${outOfStock.length > 0 ? 'text-red-500' : 'text-gray-400'}`}>Out of Stock</p>
        </div>
      </div>

      {/* Product list */}
      {products.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">No menu items found. Add items in the Menu section first.</div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">{category}</span>
                <span className="text-xs text-gray-400">{items.filter(p => p.stock !== null).length}/{items.length} tracked</span>
              </div>
              <div className="px-5">
                {items.map(p => <StockRow key={p.id} product={p} onSaved={onSaved} />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {tracked.length > 0 && (
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

// ─── Costing tab ──────────────────────────────────────────────────────────────

type RawForm = {
  name: string
  purchase_unit: string
  batch_qty: string
  batch_price: string
  serving_unit: string
  yield_min: string
  yield_max: string
  notes: string
}

const BLANK_FORM: RawForm = {
  name: '', purchase_unit: '', batch_qty: '', batch_price: '',
  serving_unit: '', yield_min: '', yield_max: '', notes: '',
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
          yield_max: initial.yield_max, notes: initial.notes,
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

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
          <h3 className="font-bold text-gray-800 text-base">{initial ? 'Edit Ingredient' : 'Add Ingredient'}</h3>
          <p className="text-xs text-gray-400 mt-0.5">Enter purchase info and serving yield to compute cost</p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* Name */}
          {field('Ingredient Name', 'name', { placeholder: 'e.g. Rice', required: true })}

          {/* Purchase info */}
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

          {/* Yield */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Yield per {form.purchase_unit || 'purchase unit'}</p>
            <div className="grid grid-cols-3 gap-3">
              {field('Min yield', 'yield_min', { type: 'number', min: '0', step: 'any', placeholder: '4.2', required: true })}
              {field('Max yield', 'yield_max', { type: 'number', min: '0', step: 'any', placeholder: '5.0' })}
              {field('Serving unit', 'serving_unit', { placeholder: 'cup', required: true })}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">Leave max yield blank if yield is fixed</p>
          </div>

          {/* Live cost preview */}
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

          {/* Notes */}
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

        {/* Footer */}
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
    serving_unit: item.serving_unit, notes: item.notes,
  })
  const batchQty   = parseFloat(item.batch_qty)
  const batchPrice = parseFloat(item.batch_price)

  return (
    <div className="flex items-center gap-4 py-3.5 border-b border-gray-50 last:border-0 group">

      {/* Name */}
      <div className="w-36 shrink-0">
        <p className="text-sm font-semibold text-gray-800 truncate">{item.name}</p>
        {item.notes && <p className="text-xs text-gray-400 truncate">{item.notes}</p>}
      </div>

      {/* Batch */}
      <div className="w-36 shrink-0">
        <p className="text-xs text-gray-700">
          {batchQty} {item.purchase_unit} · {fmtPeso(batchPrice)}
        </p>
        <p className="text-xs text-gray-400">
          {fmtPeso(batchQty > 0 ? batchPrice / batchQty : 0)}/{item.purchase_unit}
        </p>
      </div>

      {/* Yield */}
      <div className="w-32 shrink-0">
        <p className="text-xs text-gray-700">
          {item.yield_min}
          {parseFloat(item.yield_max) > parseFloat(item.yield_min) ? `–${item.yield_max}` : ''}
          {' '}{item.serving_unit}/{item.purchase_unit}
        </p>
      </div>

      {/* Cost per serving */}
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

      {/* Actions */}
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

      {/* Header row */}
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

      {/* Table */}
      {materials.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Column headers */}
          <div className="flex items-center gap-4 px-5 py-3 bg-gray-50 border-b border-gray-100">
            <span className="w-36 shrink-0 text-xs font-bold text-gray-400 uppercase tracking-wide">Ingredient</span>
            <span className="w-36 shrink-0 text-xs font-bold text-gray-400 uppercase tracking-wide">Batch</span>
            <span className="w-32 shrink-0 text-xs font-bold text-gray-400 uppercase tracking-wide">Yield</span>
            <span className="flex-1 text-xs font-bold text-gray-400 uppercase tracking-wide">Cost / Serving</span>
          </div>
          {/* Rows */}
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

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'stock' | 'costing'

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

  if (loading) return <div className="text-gray-400 text-sm py-10 text-center">Loading…</div>

  return (
    <div className="max-w-3xl">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Inventory</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {tab === 'stock' ? 'Track stock levels for your menu items' : 'Track raw ingredient costs and yield'}
          </p>
        </div>

        {/* Tab toggle */}
        <div className="flex rounded-xl overflow-hidden border border-gray-200">
          {(['stock', 'costing'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2 text-sm font-semibold transition-colors
                ${tab === t ? 'bg-brand text-white' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              {t === 'stock' ? 'Stock' : 'Costing'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'stock'
        ? <StockTab products={products} onSaved={handleSaved} />
        : <CostingTab />}
    </div>
  )
}
