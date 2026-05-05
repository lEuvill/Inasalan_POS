'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { api, Product } from '@/app/lib/api'

const LOW_STOCK = 10

function stockStatus(stock: number | null): 'untracked' | 'out' | 'low' | 'good' {
  if (stock === null) return 'untracked'
  if (stock === 0) return 'out'
  if (stock <= LOW_STOCK) return 'low'
  return 'good'
}

const STATUS_DOT: Record<string, string> = {
  good:      'bg-green-400',
  low:       'bg-amber-400',
  out:       'bg-red-500',
  untracked: 'bg-gray-200',
}

const STATUS_LABEL: Record<string, string> = {
  good:      'Good',
  low:       'Low',
  out:       'Out',
  untracked: '—',
}

// ── Stock row ─────────────────────────────────────────────────────────────────

function StockRow({ product, onSaved }: { product: Product; onSaved: (id: number, stock: number | null) => void }) {
  const [draft, setDraft] = useState<string>(product.stock === null ? '' : String(product.stock))
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
    } finally {
      setSaving(false)
    }
  }

  const commitDraft = () => {
    const n = parseInt(draft, 10)
    if (draft.trim() === '') {
      save(null)
    } else if (!isNaN(n) && n >= 0) {
      save(n)
    } else {
      setDraft(product.stock === null ? '' : String(product.stock))
    }
  }

  const adjust = (delta: number) => {
    const base = product.stock ?? 0
    const next = Math.max(0, base + delta)
    setDraft(String(next))
    save(next)
  }

  const startTracking = () => {
    setDraft('0')
    save(0)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  return (
    <div className="flex items-center gap-4 py-3 border-b border-gray-50 last:border-0 group">
      {/* Status dot */}
      <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[status]}`} />

      {/* Name */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{product.name}</p>
        {product.variations.length > 0 && (
          <p className="text-xs text-gray-400 truncate">
            {product.variations.map(v => v.name).join(' · ')}
          </p>
        )}
      </div>

      {/* Status label */}
      <span className={`text-xs font-semibold w-10 text-right shrink-0
        ${status === 'out' ? 'text-red-500' : status === 'low' ? 'text-amber-500' : status === 'good' ? 'text-green-600' : 'text-gray-300'}`}
      >
        {STATUS_LABEL[status]}
      </span>

      {/* Controls */}
      {product.stock === null ? (
        <button
          onClick={startTracking}
          className="text-xs text-gray-400 hover:text-brand font-semibold border border-dashed border-gray-200 hover:border-brand px-3 py-1.5 rounded-lg transition-colors w-32 text-center"
        >
          Track stock
        </button>
      ) : (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => adjust(-1)}
            disabled={saving || (product.stock ?? 0) <= 0}
            className="w-7 h-7 rounded-lg bg-gray-100 text-gray-600 text-sm font-bold flex items-center justify-center hover:bg-gray-200 disabled:opacity-30 transition-colors"
          >−</button>
          <input
            ref={inputRef}
            type="number"
            min="0"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={e => { if (e.key === 'Enter') { commitDraft(); inputRef.current?.blur() } }}
            className="w-14 text-center border border-gray-200 rounded-lg py-1 text-sm font-bold text-gray-800 focus:outline-none focus:border-brand"
          />
          <button
            onClick={() => adjust(1)}
            disabled={saving}
            className="w-7 h-7 rounded-lg bg-brand text-white text-sm font-bold flex items-center justify-center hover:bg-brand-dark disabled:opacity-30 transition-colors"
          >+</button>
          <button
            onClick={() => { setDraft(''); save(null) }}
            title="Stop tracking"
            className="w-7 h-7 rounded-lg text-gray-200 hover:text-red-400 hover:bg-red-50 text-xs font-bold flex items-center justify-center ml-0.5 opacity-0 group-hover:opacity-100 transition-all"
          >✕</button>
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const data = await api.getProducts()
    setProducts(data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleSaved = (id: number, stock: number | null) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, stock } : p))
  }

  const grouped = products.reduce<Record<string, Product[]>>((acc, p) => {
    const cat = p.category || 'Uncategorized'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(p)
    return acc
  }, {})

  const tracked    = products.filter(p => p.stock !== null)
  const outOfStock = products.filter(p => p.stock === 0)
  const lowStock   = products.filter(p => p.stock !== null && p.stock > 0 && p.stock <= LOW_STOCK)

  if (loading) {
    return <div className="text-gray-400 text-sm py-10 text-center">Loading…</div>
  }

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Inventory</h1>
        <p className="text-sm text-gray-400 mt-0.5">Track stock levels for your menu items</p>
      </div>

      {/* Summary */}
      {products.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
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
      )}

      {/* Product list by category */}
      {products.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          No menu items found. Add items in the Menu section first.
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Category header */}
              <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">{category}</span>
                <span className="text-xs text-gray-400">
                  {items.filter(p => p.stock !== null).length}/{items.length} tracked
                </span>
              </div>

              {/* Rows */}
              <div className="px-5">
                {items.map(p => (
                  <StockRow key={p.id} product={p} onSaved={handleSaved} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      {tracked.length > 0 && (
        <div className="mt-6 flex items-center gap-4 text-xs text-gray-400">
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
