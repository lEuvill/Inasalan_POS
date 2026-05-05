'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { api, Product, ProductVariation } from '@/app/lib/api'

type ExportProduct = Omit<Product, 'id' | 'android_id' | 'stock'>

function exportMenu(products: Product[]) {
  const data: ExportProduct[] = products.map(({ name, price, category, image_path, is_available, variations, output_name }) => ({
    name, price, category, image_path, is_available, variations, output_name,
  }))
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `menu_export_${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

type ImportEntry = ExportProduct & { _action: 'create' | 'update'; _existingId?: number }

function ImportModal({
  entries,
  onConfirm,
  onClose,
}: {
  entries: ImportEntry[]
  onConfirm: () => Promise<void>
  onClose: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const creates = entries.filter(e => e._action === 'create').length
  const updates = entries.filter(e => e._action === 'update').length

  const confirm = async () => {
    setSaving(true)
    try {
      await onConfirm()
      setDone(true)
      setTimeout(onClose, 900)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm flex flex-col max-h-[80vh]">
        <div className="px-5 pt-5 pb-3 border-b border-gray-100">
          <h3 className="font-bold text-gray-800 text-base">Import Menu</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {creates > 0 && <span className="text-green-600 font-medium">{creates} new</span>}
            {creates > 0 && updates > 0 && <span className="text-gray-400"> · </span>}
            {updates > 0 && <span className="text-orange-500 font-medium">{updates} update</span>}
            {creates > 0 || updates > 0 ? ' will be applied' : 'Nothing to import'}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1">
          {entries.map((e, i) => (
            <div key={i} className="flex items-center gap-3 py-1.5">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${e._action === 'create' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                {e._action === 'create' ? 'NEW' : 'UPDATE'}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{e.name}</p>
                <p className="text-xs text-gray-400 truncate">{e.category || 'Uncategorized'}{e.variations.length > 0 ? ` · ${e.variations.length} variation${e.variations.length > 1 ? 's' : ''}` : ` · ₱${parseFloat(e.price).toFixed(2)}`}</p>
              </div>
            </div>
          ))}
          {entries.length === 0 && <p className="text-gray-400 text-sm text-center py-6">No valid products found in file</p>}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2 text-sm hover:bg-gray-50">Cancel</button>
          <button
            type="button"
            onClick={confirm}
            disabled={entries.length === 0 || saving || done}
            className="flex-1 bg-brand text-white rounded-xl py-2 text-sm font-semibold hover:bg-brand-dark disabled:opacity-40 transition-colors"
          >
            {done ? 'Done!' : saving ? 'Importing…' : `Import ${entries.length}`}
          </button>
        </div>
      </div>
    </div>
  )
}

const BLANK: Omit<Product, 'id' | 'android_id'> = {
  name: '',
  price: '0',
  category: '',
  image_path: '',
  is_available: true,
  variations: [],
  output_name: '',
  stock: null,
}

// ── Drag-and-drop image picker ────────────────────────────────────────────────

function ImageDropZone({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const readFile = (file: File) => {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (e) => onChange(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">Photo</label>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) readFile(f) }}
        className={`relative w-full h-36 rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors overflow-hidden
          ${dragging ? 'border-brand bg-orange-50' : 'border-gray-200 bg-gray-50 hover:border-brand hover:bg-orange-50'}`}
      >
        {value ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="product" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
              <span className="text-white text-xs font-semibold">Change photo</span>
            </div>
          </>
        ) : (
          <>
            <span className="text-2xl mb-1">📷</span>
            <span className="text-xs text-gray-400 text-center px-2">
              {dragging ? 'Drop to upload' : 'Drag & drop or click to browse'}
            </span>
          </>
        )}
      </div>
      {value && (
        <button type="button" onClick={() => onChange('')} className="mt-1 text-xs text-red-400 hover:text-red-600">
          Remove photo
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f) }} />
    </div>
  )
}

// ── Variation editor ──────────────────────────────────────────────────────────

function VariationEditor({ variations, onChange }: { variations: ProductVariation[]; onChange: (v: ProductVariation[]) => void }) {
  const add = () => onChange([...variations, { name: '', price: '0', output_name: '' }])
  const remove = (i: number) => onChange(variations.filter((_, idx) => idx !== i))
  const update = (i: number, field: keyof ProductVariation, val: string) =>
    onChange(variations.map((v, idx) => idx === i ? { ...v, [field]: val } : v))

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-xs font-medium text-gray-500">Variations</label>
        <button
          type="button"
          onClick={add}
          className="text-xs font-semibold text-brand hover:text-brand-dark"
        >
          + Add
        </button>
      </div>
      {variations.length === 0 ? (
        <p className="text-xs text-gray-400 py-2 text-center border border-dashed border-gray-200 rounded-xl">
          No variations — uses base price
        </p>
      ) : (
        <div className="space-y-3">
          {variations.map((v, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex gap-2 items-center">
                <input
                  placeholder="e.g. Meal"
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand"
                  value={v.name}
                  onChange={(e) => update(i, 'name', e.target.value)}
                />
                <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
                  <span className="px-2 text-sm text-gray-400">₱</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-24 py-2 pr-3 text-sm focus:outline-none"
                    value={v.price}
                    onChange={(e) => update(i, 'price', e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="text-gray-300 hover:text-red-500 text-sm px-1"
                >
                  ✕
                </button>
              </div>
              <input
                placeholder="Export name (e.g. Heavygat na Pechopak Meal)"
                className="w-full border border-gray-100 bg-gray-50 rounded-lg px-3 py-1.5 text-xs text-gray-600 focus:outline-none focus:border-brand placeholder:text-gray-300"
                value={v.output_name ?? ''}
                onChange={(e) => update(i, 'output_name', e.target.value)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Copy-variations modal ─────────────────────────────────────────────────────

function CopyVariationsModal({
  variations,
  products,
  excludeId,
  onClose,
}: {
  variations: ProductVariation[]
  products: Product[]
  excludeId: number | null
  onClose: () => void
}) {
  const targets = products.filter(p => p.id !== excludeId)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  const filtered = targets.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.category.toLowerCase().includes(search.toLowerCase())
  )

  const allFilteredSelected = filtered.length > 0 && filtered.every(p => selected.has(p.id))

  const toggle = (id: number) =>
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  const toggleAll = () =>
    setSelected(prev => {
      if (allFilteredSelected) {
        const s = new Set(prev); filtered.forEach(p => s.delete(p.id)); return s
      }
      const s = new Set(prev); filtered.forEach(p => s.add(p.id)); return s
    })

  const apply = async () => {
    if (selected.size === 0) return
    setSaving(true)
    try {
      await Promise.all([...selected].map(id => api.updateProduct(id, { variations })))
      setDone(true)
      setTimeout(onClose, 900)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm flex flex-col max-h-[80vh]">
        <div className="px-5 pt-5 pb-3 border-b border-gray-100">
          <h3 className="font-bold text-gray-800 text-base">Copy variations to…</h3>
          <p className="text-xs text-gray-400 mt-0.5">{variations.length} variation{variations.length !== 1 ? 's' : ''} will be applied to selected items</p>
          <input
            type="text"
            placeholder="Search items…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="mt-3 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand"
          />
        </div>

        <div className="flex items-center justify-between px-5 py-2 border-b border-gray-50">
          <span className="text-xs text-gray-400">{selected.size} selected</span>
          <button
            type="button"
            onClick={toggleAll}
            className="text-xs font-semibold text-brand hover:text-brand-dark"
          >
            {allFilteredSelected ? 'Deselect all' : 'Select all'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1">
          {filtered.length === 0 && (
            <p className="text-gray-400 text-sm text-center py-6">No other items found</p>
          )}
          {filtered.map(p => (
            <label key={p.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has(p.id)}
                onChange={() => toggle(p.id)}
                className="accent-brand w-4 h-4 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                <p className="text-xs text-gray-400">
                  {p.category || 'Uncategorized'}
                  {p.variations && p.variations.length > 0 && (
                    <span className="ml-2 text-orange-400">· has {p.variations.length} variation{p.variations.length !== 1 ? 's' : ''} (will replace)</span>
                  )}
                </p>
              </div>
            </label>
          ))}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2 text-sm hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={selected.size === 0 || saving || done}
            className="flex-1 bg-brand text-white rounded-xl py-2 text-sm font-semibold hover:bg-brand-dark disabled:opacity-40 transition-colors"
          >
            {done ? 'Applied!' : saving ? 'Applying…' : `Apply to ${selected.size || '…'}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MenuPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [form, setForm] = useState(BLANK)
  const [editId, setEditId] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showCopyModal, setShowCopyModal] = useState(false)
  const [importEntries, setImportEntries] = useState<ImportEntry[] | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => { setProducts(await api.getProducts()) }, [])
  useEffect(() => { load() }, [load])

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const raw: ExportProduct[] = JSON.parse(ev.target?.result as string)
        const entries: ImportEntry[] = raw.map(p => {
          const existing = products.find(x => x.name.toLowerCase() === p.name.toLowerCase())
          return existing
            ? { ...p, _action: 'update', _existingId: existing.id }
            : { ...p, _action: 'create' }
        })
        setImportEntries(entries)
      } catch {
        alert('Invalid file — could not parse JSON.')
      }
    }
    reader.readAsText(file)
  }

  const doImport = async () => {
    if (!importEntries) return
    await Promise.all(importEntries.map(e => {
      const { _action, _existingId, ...data } = e
      return _action === 'update' && _existingId != null
        ? api.updateProduct(_existingId, data)
        : api.createProduct({ ...data, stock: null })
    }))
    load()
  }

  const openCreate = () => { setForm(BLANK); setEditId(null); setShowForm(true) }
  const openEdit = (p: Product) => {
    setForm({ name: p.name, price: p.price, category: p.category, image_path: p.image_path, is_available: p.is_available, variations: p.variations ?? [], output_name: p.output_name ?? '', stock: p.stock ?? null })
    setEditId(p.id)
    setShowForm(true)
  }

  const save = async () => {
    if (editId !== null) {
      await api.updateProduct(editId, form)
    } else {
      await api.createProduct(form)
    }
    setShowForm(false)
    load()
  }

  const toggle = async (p: Product) => {
    await api.updateProduct(p.id, { is_available: !p.is_available })
    load()
  }

  const remove = async (id: number) => {
    if (!confirm('Delete this product?')) return
    await api.deleteProduct(id)
    load()
  }

  const categories = [...new Set(products.map(p => p.category).filter(Boolean))]
  const hasUncategorized = products.some(p => !p.category)
  const displayCategories = [...categories, ...(hasUncategorized ? ['Uncategorized'] : [])]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Menu</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => exportMenu(products)} className="border border-gray-200 text-gray-600 font-semibold px-4 py-2 rounded-xl hover:bg-gray-50 transition-colors text-sm">
            Export
          </button>
          <button onClick={() => importRef.current?.click()} className="border border-gray-200 text-gray-600 font-semibold px-4 py-2 rounded-xl hover:bg-gray-50 transition-colors text-sm">
            Import
          </button>
          <input ref={importRef} type="file" accept="application/json,.json" className="hidden" onChange={handleImportFile} />
          <button onClick={openCreate} className="bg-brand text-white font-semibold px-5 py-2 rounded-xl hover:bg-brand-dark transition-colors text-sm">
            + Add Item
          </button>
        </div>
      </div>

      {products.length === 0 && (
        <p className="text-gray-400 text-center py-16">No products yet. Add your first menu item.</p>
      )}

      {displayCategories.map(cat => (
        <div key={cat} className="mb-8">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">{cat}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {products.filter(p => p.category === cat || (!p.category && cat === 'Uncategorized')).map(p => (
              <div key={p.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl overflow-hidden bg-orange-50 shrink-0 flex items-center justify-center">
                  {p.image_path
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={p.image_path} alt={p.name} className="w-full h-full object-cover" />
                    : <span className="text-xl">🍽️</span>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800 truncate">{p.name}</p>
                  {p.variations && p.variations.length > 0 ? (
                    <p className="text-xs text-gray-400">{p.variations.length} variation{p.variations.length > 1 ? 's' : ''}</p>
                  ) : (
                    <p className="text-sm text-brand font-bold">₱{parseFloat(p.price).toFixed(2)}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => toggle(p)} className={`text-xs px-2 py-1 rounded-lg font-medium transition-colors ${p.is_available ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                    {p.is_available ? 'Available' : 'Hidden'}
                  </button>
                  <button onClick={() => openEdit(p)} className="text-gray-400 hover:text-brand text-sm px-1">Edit</button>
                  <button onClick={() => remove(p.id)} className="text-gray-300 hover:text-red-500 text-sm px-1">✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {showCopyModal && (
        <CopyVariationsModal
          variations={form.variations}
          products={products}
          excludeId={editId}
          onClose={() => { setShowCopyModal(false); load() }}
        />
      )}

      {importEntries !== null && (
        <ImportModal
          entries={importEntries}
          onConfirm={doImport}
          onClose={() => setImportEntries(null)}
        />
      )}

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-5">{editId ? 'Edit Item' : 'New Item'}</h2>
            <div className="space-y-4">

              <ImageDropZone value={form.image_path} onChange={v => setForm(f => ({ ...f, image_path: v }))} />

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
                <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
                <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Base Price (₱)
                  {form.variations.length > 0 && <span className="ml-1 text-gray-300">— overridden by variations</span>}
                </label>
                <input type="number" min="0" step="0.01" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
              </div>

              <VariationEditor
                variations={form.variations}
                onChange={v => setForm(f => ({ ...f, variations: v }))}
              />

              {form.variations.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowCopyModal(true)}
                  className="text-xs text-brand font-semibold hover:underline text-left"
                >
                  Copy these variations to other items →
                </button>
              )}

              {/* Export mapping — only shown for non-variation products; variations set their own export name above */}
              {form.variations.length === 0 && (
                <div className="border-t border-gray-100 pt-4">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Export Name</label>
                  <input
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand"
                    placeholder="e.g. Heavygat na Pechopak Meal (leave blank to use POS name)"
                    value={form.output_name}
                    onChange={e => setForm(f => ({ ...f, output_name: e.target.value }))}
                  />
                </div>
              )}

              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input type="checkbox" checked={form.is_available} onChange={e => setForm(f => ({ ...f, is_available: e.target.checked }))} className="accent-brand" />
                Available on menu
              </label>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowForm(false)} className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2 text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={save} className="flex-1 bg-brand text-white rounded-xl py-2 text-sm font-semibold hover:bg-brand-dark">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
