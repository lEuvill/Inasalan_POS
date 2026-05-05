'use client'

import { useEffect, useState, useCallback } from 'react'
import { api, Transaction, Product, OrderItem } from '@/app/lib/api'
import { EditOrderModal } from '@/app/admin/components/EditOrderModal'

// ── Export ────────────────────────────────────────────────────────────────────

export type ExportColumn = 'date' | 'slip' | 'product' | 'payment' | 'order_type'

const EXPORT_COLUMN_LABELS: Record<ExportColumn, string> = {
  date: 'Date',
  slip: 'Slip #',
  product: 'Product Name',
  payment: 'Payment Method',
  order_type: 'Order Type',
}

const DEFAULT_COLUMNS: ExportColumn[] = ['date', 'slip', 'product', 'payment', 'order_type']

function exportTsv(transactions: Transaction[], products: Product[], columns: ExportColumn[]) {
  const productMap = new Map(products.map(p => [p.id, p]))
  const rows: string[] = []
  const sorted = [...transactions].sort((a, b) => new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime())

  for (const t of sorted) {
    const d = new Date(t.completed_at)
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const yyyy = d.getFullYear()
    const dateStr = `${mm}/${dd}/${yyyy}`
    const orderNum = t.order_detail?.slip_number || String(t.order)
    const payment = t.order_detail?.payment_method || ''
    const orderType = (t.order_detail?.order_type || '').replace('_', ' ')

    for (const item of t.order_detail?.items_json ?? []) {
      const product = productMap.get(item.productId)
      let outputName = item.output_name?.trim() || item.name
      if (product) {
        if (product.variations?.length > 0) {
          const prefix = product.name + ' - '
          const varName = item.name.startsWith(prefix) ? item.name.slice(prefix.length) : null
          const variation = varName ? product.variations.find(v => v.name === varName) : null
          outputName = variation?.output_name?.trim() || product.output_name?.trim() || item.name
        } else {
          outputName = product.output_name?.trim() || item.name
        }
      }
      for (let i = 0; i < item.quantity; i++) {
        const cells: string[] = []
        if (columns.includes('date')) cells.push(dateStr)
        if (columns.includes('slip')) cells.push(orderNum)
        if (columns.includes('product')) cells.push(outputName)
        if (columns.includes('payment')) cells.push(payment)
        if (columns.includes('order_type')) cells.push(orderType)
        rows.push(cells.join('\t'))
      }
    }
  }

  const blob = new Blob([rows.join('\n')], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `sales_export_${new Date().toISOString().slice(0, 10)}.txt`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── Export Column Picker Modal ─────────────────────────────────────────────────

function ExportModal({
  transactions,
  products,
  onClose,
}: {
  transactions: Transaction[]
  products: Product[]
  onClose: () => void
}) {
  const [selected, setSelected] = useState<Set<ExportColumn>>(new Set(DEFAULT_COLUMNS))

  const toggle = (col: ExportColumn) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(col)) next.delete(col)
      else next.add(col)
      return next
    })
  }

  const doExport = () => {
    const ordered = (Object.keys(EXPORT_COLUMN_LABELS) as ExportColumn[]).filter(c => selected.has(c))
    exportTsv(transactions, products, ordered)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-800">Export Columns</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100">✕</button>
        </div>
        <div className="px-6 py-4 space-y-3">
          {(Object.entries(EXPORT_COLUMN_LABELS) as [ExportColumn, string][]).map(([col, label]) => (
            <label key={col} className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={selected.has(col)}
                onChange={() => toggle(col)}
                className="w-4 h-4 accent-brand rounded"
              />
              <span className="text-sm text-gray-700">{label}</span>
            </label>
          ))}
        </div>
        <div className="px-6 pb-5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={doExport}
            disabled={selected.size === 0}
            className="flex-1 bg-brand text-white font-bold py-2.5 rounded-xl text-sm hover:bg-brand-dark disabled:opacity-40"
          >
            Export
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Payment badge ─────────────────────────────────────────────────────────────

const PAYMENT_STYLE: Record<string, string> = {
  CASH:  'bg-green-100 text-green-700',
  GCASH: 'bg-sky-100 text-sky-700',
}

function PaymentBadge({ method }: { method: string }) {
  if (!method) return <span className="text-gray-300 text-xs">—</span>
  return (
    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${PAYMENT_STYLE[method] ?? 'bg-gray-100 text-gray-500'}`}>
      {method}
    </span>
  )
}

// ── Import Modal ──────────────────────────────────────────────────────────────

type ImportItem = {
  outputName: string
  productId: number
  itemName: string
  price: number
  quantity: number
  matched: boolean
}

type ImportOrder = {
  date: string        // MM/DD/YYYY display
  isoDate: string     // YYYY-MM-DD for API
  slipNumber: string
  items: ImportItem[]
}

function parseImport(raw: string, products: Product[], dfOutputNames: Record<number, string> = {}): ImportOrder[] {
  // Build reverse map from configured DF export names → { price }
  const dfByName = new Map<string, number>()
  for (const [price, name] of Object.entries(dfOutputNames)) {
    if (name.trim()) dfByName.set(name.trim().toLowerCase(), Number(price))
  }

  function findProduct(outputName: string) {
    const needle = outputName.trim().toLowerCase()

    // Match against delivery fee export names configured in take-order settings
    if (dfByName.has(needle)) {
      const price = dfByName.get(needle)!
      return { productId: -1, itemName: 'Delivery Fee', price, matched: true }
    }

    for (const p of products) {
      for (const v of p.variations ?? []) {
        if ((v.output_name ?? '').trim().toLowerCase() === needle) {
          return { productId: p.id, itemName: `${p.name} - ${v.name}`, price: parseFloat(v.price), matched: true }
        }
      }
      if ((p.output_name ?? '').trim().toLowerCase() === needle) {
        return { productId: p.id, itemName: p.name, price: parseFloat(p.price), matched: true }
      }
    }
    return { productId: 0, itemName: outputName.trim(), price: 0, matched: false }
  }

  // group raw items by (isoDate, slipNumber)
  const orderMap = new Map<string, ImportOrder>()

  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue

    let parts: string[]
    if (line.includes('\t')) {
      parts = line.split('\t').map(s => s.trim())
    } else {
      // split on 2+ consecutive spaces (handles manual paste with spaces)
      parts = line.split(/\s{2,}/)
    }
    if (parts.length < 3) continue

    const [date, slipNumber, ...nameParts] = parts
    const outputName = nameParts.join(' ').trim()
    if (!date || !slipNumber || !outputName) continue

    // parse MM/DD/YYYY
    const dateParts = date.split('/')
    if (dateParts.length !== 3) continue
    const [mm, dd, yyyy] = dateParts
    if (!yyyy || !mm || !dd) continue
    const isoDate = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`

    const key = `${isoDate}__${slipNumber}`
    if (!orderMap.has(key)) {
      orderMap.set(key, { date, isoDate, slipNumber, items: [] })
    }

    const found = findProduct(outputName)
    const order = orderMap.get(key)!

    // merge duplicate output names (same item ordered multiple times → quantity)
    const existing = order.items.find(i => i.outputName.toLowerCase() === outputName.toLowerCase())
    if (existing) {
      existing.quantity++
    } else {
      order.items.push({ outputName, ...found, quantity: 1 })
    }
  }

  return [...orderMap.values()]
}

function ImportModal({
  onClose,
  onImported,
}: {
  onClose: () => void
  onImported: () => void
}) {
  const [products, setProducts] = useState<Product[]>([])
  const [raw, setRaw] = useState('')
  const [preview, setPreview] = useState<ImportOrder[] | null>(null)
  const [importing, setImporting] = useState(false)
  const [manualTotals, setManualTotals] = useState<Record<number, string>>({})
  const [editingTotal, setEditingTotal] = useState<number | null>(null)

  useEffect(() => { api.getProducts().then(setProducts) }, [])

  const handlePreview = () => {
    let dfOutputNames: Record<number, string> = {}
    try { dfOutputNames = JSON.parse(localStorage.getItem('pos_df_output_names') ?? '{}') } catch { /* ignore */ }
    const parsed = parseImport(raw, products, dfOutputNames)
    setPreview(parsed)
    setManualTotals({})
    setEditingTotal(null)
  }

  const doImport = async () => {
    if (!preview?.length) return
    setImporting(true)
    try {
      for (let oi = 0; oi < preview.length; oi++) {
        const order = preview[oi]
        const items_json: OrderItem[] = order.items.map(item => ({
          productId: item.productId,
          name: item.itemName,
          price: item.price,
          quantity: item.quantity,
        }))
        const calcTotal = items_json.reduce((s, i) => s + i.price * i.quantity, 0)
        const total = manualTotals[oi] !== undefined ? (parseFloat(manualTotals[oi]) || 0) : calcTotal
        await api.createOrder({
          items_json,
          total,
          source: 'walk-in',
          status: 'COMPLETED',
          slip_number: order.slipNumber,
          completed_at: new Date(`${order.isoDate}T12:00:00`).toISOString(),
        })
      }
      onImported()
      onClose()
    } finally {
      setImporting(false)
    }
  }

  const unmatchedCount = preview?.reduce((s, o) => s + o.items.filter(i => !i.matched).length, 0) ?? 0

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Import Sales</h2>
            <p className="text-xs text-gray-400 mt-0.5">Paste exported data — rows grouped by slip number become separate orders</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100">✕</button>
        </div>

        {!preview ? (
          /* ── Step 1: Paste input ── */
          <div className="flex flex-col flex-1 overflow-hidden p-6 gap-4">
            <textarea
              value={raw}
              onChange={e => setRaw(e.target.value)}
              placeholder={
                '04/28/2026\t9740563\tLiempong di tinipid Unli Rice\n' +
                '04/28/2026\t9740564\tDalawang pakpak Meal\n' +
                '04/28/2026\t9740568\tHeavygat na Pechopak Meal\n' +
                '04/28/2026\t9740568\tHeavygat na Pechopak Meal\n' +
                '...'
              }
              className="flex-1 border border-gray-200 rounded-xl p-4 text-sm font-mono text-gray-700 resize-none focus:outline-none focus:border-brand placeholder:text-gray-300 leading-relaxed"
            />
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>Format: MM/DD/YYYY &nbsp;·&nbsp; Slip# &nbsp;·&nbsp; Output Name (tab or 2+ spaces)</span>
              {raw.trim() && <span>{raw.trim().split('\n').filter(l => l.trim()).length} lines</span>}
            </div>
            <button
              onClick={handlePreview}
              disabled={!raw.trim()}
              className="w-full bg-brand text-white font-bold py-3 rounded-xl hover:bg-brand-dark disabled:opacity-40 text-sm"
            >
              Preview
            </button>
          </div>
        ) : (
          /* ── Step 2: Preview ── */
          <>
            <div className="flex-1 overflow-y-auto p-6 space-y-3">

              {/* Summary bar */}
              <div className="flex items-center gap-4 text-sm mb-1">
                <span className="font-semibold text-gray-700">{preview.length} order{preview.length !== 1 ? 's' : ''}</span>
                <span className="text-gray-400">·</span>
                <span className="text-gray-500">{preview.reduce((s, o) => s + o.items.reduce((ss, i) => ss + i.quantity, 0), 0)} items total</span>
                {unmatchedCount > 0 && (
                  <>
                    <span className="text-gray-400">·</span>
                    <span className="text-amber-600 font-medium">{unmatchedCount} unmatched (₱0)</span>
                  </>
                )}
              </div>

              {unmatchedCount > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
                  Unmatched items import at ₱0. Tap the order total to set the correct amount manually.
                </div>
              )}

              {preview.map((order, oi) => {
                const calcTotal = order.items.reduce((s, i) => s + i.price * i.quantity, 0)
                const displayTotal = manualTotals[oi] !== undefined ? parseFloat(manualTotals[oi] || '0') : calcTotal
                const isManual = manualTotals[oi] !== undefined
                return (
                  <div key={oi} className="border border-gray-100 rounded-xl overflow-hidden">
                    <div className="bg-gray-50 px-4 py-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-gray-800">Slip #{order.slipNumber}</span>
                        <span className="text-xs text-gray-400">{order.date}</span>
                      </div>
                      {editingTotal === oi ? (
                        <form onSubmit={e => { e.preventDefault(); setEditingTotal(null) }} className="flex items-center gap-1">
                          <span className="text-sm text-gray-400">₱</span>
                          <input
                            autoFocus
                            type="number"
                            step="0.01"
                            min="0"
                            value={manualTotals[oi] ?? calcTotal.toFixed(2)}
                            onChange={e => setManualTotals(prev => ({ ...prev, [oi]: e.target.value }))}
                            onBlur={() => setEditingTotal(null)}
                            className="w-24 border border-brand rounded-lg px-2 py-0.5 text-sm font-bold text-right text-brand focus:outline-none"
                          />
                        </form>
                      ) : (
                        <button
                          type="button"
                          title="Click to edit total"
                          onClick={() => {
                            if (!(oi in manualTotals)) setManualTotals(prev => ({ ...prev, [oi]: calcTotal.toFixed(2) }))
                            setEditingTotal(oi)
                          }}
                          className={`text-sm font-bold transition-colors ${isManual ? 'text-orange-500' : 'text-brand'} hover:opacity-70`}
                        >
                          ₱{displayTotal.toFixed(2)}
                          <span className="ml-1 text-[10px] font-normal opacity-50">✎</span>
                        </button>
                      )}
                    </div>
                    <div className="divide-y divide-gray-50">
                      {order.items.map((item, ii) => (
                        <div key={ii} className="px-4 py-2 flex items-center gap-3">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${item.matched ? 'bg-green-400' : 'bg-amber-400'}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-800 truncate">
                              {item.itemName}
                              {item.quantity > 1 && <span className="ml-1.5 text-xs text-gray-400 font-semibold">×{item.quantity}</span>}
                            </p>
                            {!item.matched && (
                              <p className="text-xs text-amber-500 truncate">"{item.outputName}" not found in menu</p>
                            )}
                          </div>
                          <span className={`text-sm font-semibold shrink-0 ${item.matched ? 'text-gray-600' : 'text-amber-400'}`}>
                            ₱{(item.price * item.quantity).toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="border-t border-gray-100 p-4 flex gap-3 shrink-0">
              <button
                onClick={() => setPreview(null)}
                disabled={importing}
                className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm hover:bg-gray-50 disabled:opacity-40"
              >
                Back
              </button>
              <button
                onClick={doImport}
                disabled={importing || preview.length === 0}
                className="flex-1 bg-brand text-white font-bold py-2.5 rounded-xl text-sm hover:bg-brand-dark disabled:opacity-40"
              >
                {importing ? 'Importing…' : `Import ${preview.length} order${preview.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [editOrderId, setEditOrderId] = useState<number | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    const [txns, prods] = await Promise.all([api.getTransactions(), api.getProducts()])
    setTransactions(txns)
    setProducts(prods)
  }, [])

  useEffect(() => { load() }, [load])

  const deleteTransaction = async (orderId: number) => {
    setDeleting(true)
    try {
      await api.deleteOrder(orderId)
      setConfirmDeleteId(null)
      load()
    } finally {
      setDeleting(false)
    }
  }

  const total = transactions.reduce((sum, t) => sum + parseFloat(t.total), 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Transaction History</h1>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs text-gray-400">All-time Revenue</p>
            <p className="text-xl font-bold text-green-600">₱{total.toFixed(2)}</p>
          </div>
          <button
            onClick={() => setShowImport(true)}
            className="border border-gray-200 text-gray-600 font-semibold px-4 py-2 rounded-xl hover:bg-gray-50 text-sm transition-colors"
          >
            Import
          </button>
          <button
            onClick={() => setShowExport(true)}
            disabled={transactions.length === 0}
            className="bg-brand text-white font-semibold px-4 py-2 rounded-xl hover:bg-brand-dark text-sm transition-colors disabled:opacity-40"
          >
            Export
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {transactions.length === 0 ? (
          <p className="text-gray-400 text-center py-16">No transactions yet</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-400 text-xs uppercase">
              <tr>
                <th className="px-5 py-3 text-left">#</th>
                <th className="px-5 py-3 text-left">Order</th>
                <th className="px-5 py-3 text-left">Completed</th>
                <th className="px-5 py-3 text-left">Payment</th>
                <th className="px-5 py-3 text-right">Total</th>
                <th className="px-5 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {transactions.map(t => (
                <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-4 text-gray-400">{t.id}</td>
                  <td className="px-5 py-4 font-medium text-gray-700">
                    {t.order_detail?.slip_number
                      ? <><span className="font-bold">Slip #{t.order_detail.slip_number}</span><span className="ml-1.5 text-xs text-gray-400">#{t.order}</span></>
                      : <>Order #{t.order}</>
                    }
                  </td>
                  <td className="px-5 py-4 text-gray-500">
                    {new Date(t.completed_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
                  </td>
                  <td className="px-5 py-4">
                    <PaymentBadge method={t.order_detail?.payment_method || ''} />
                  </td>
                  <td className="px-5 py-4 text-right font-bold text-gray-800">
                    ₱{parseFloat(t.total).toFixed(2)}
                  </td>
                  <td className="px-5 py-4 text-right">
                    {confirmDeleteId === t.id ? (
                      <span className="flex items-center justify-end gap-2">
                        <span className="text-xs text-red-500 font-medium">Delete?</span>
                        <button
                          onClick={() => deleteTransaction(t.order)}
                          disabled={deleting}
                          className="text-xs text-white bg-red-500 hover:bg-red-600 font-semibold px-2.5 py-1 rounded-lg disabled:opacity-40"
                        >
                          {deleting ? '…' : 'Yes'}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          disabled={deleting}
                          className="text-xs text-gray-400 hover:text-gray-700 font-medium px-1"
                        >
                          No
                        </button>
                      </span>
                    ) : (
                      <span className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => setEditOrderId(t.order)}
                          className="text-xs text-gray-400 hover:text-brand font-medium hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(t.id)}
                          className="text-xs text-gray-300 hover:text-red-500 font-medium hover:underline"
                        >
                          Delete
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editOrderId !== null && (
        <EditOrderModal
          orderId={editOrderId}
          onClose={() => setEditOrderId(null)}
          onSaved={() => load()}
        />
      )}

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImported={load}
        />
      )}

      {showExport && (
        <ExportModal
          transactions={transactions}
          products={products}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  )
}
