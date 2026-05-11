'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { api, Order, Transaction, OrderStatus } from '@/app/lib/api'
import { useWebSocket, WsMessage } from '@/app/lib/websocket'
import { EditOrderModal } from '@/app/admin/components/EditOrderModal'
import { printReceipt, printCashierReceipt, printKitchenOrder, printGrillerOrder, ReceiptData, loadAllPrintSettings, saveAllPrintSettings, AllPrintSettings, PrintSettings, PrintFormat } from '@/app/lib/printReceipt'

function orderToReceipt(order: Order): ReceiptData {
  return {
    slipNumber:    order.slip_number ?? undefined,
    orderType:     order.order_type,
    paymentMethod: order.payment_method,
    tableNumber:   order.table_number || undefined,
    items:         order.items_json,
    total:         parseFloat(order.total),
    isUnpaid:      order.is_unpaid,
    date:          new Date(order.created_at),
  }
}

const WS_URL = (process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000') + '/ws/pos/'

const STATUS_COLOR: Record<string, string> = {
  PENDING:   'bg-red-100 text-red-700',
  PREPARING: 'bg-orange-100 text-orange-700',
  READY:     'bg-green-100 text-green-700',
  COMPLETED: 'bg-gray-100 text-gray-500',
}

const STATUS_NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  PENDING:   'PREPARING',
  PREPARING: 'READY',
  READY:     'COMPLETED',
}

// ── Void confirm modal ────────────────────────────────────────────────────────

const VOID_PIN = process.env.NEXT_PUBLIC_VOID_PIN ?? '0000'

function VoidConfirmModal({
  orderId,
  onConfirmed,
  onCancel,
}: {
  orderId: number
  onConfirmed: () => void
  onCancel: () => void
}) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [voiding, setVoiding] = useState(false)

  const submit = async () => {
    if (pin !== VOID_PIN) { setError(true); setPin(''); return }
    setVoiding(true)
    try {
      await api.voidOrder(orderId)
      onConfirmed()
    } finally {
      setVoiding(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-6">
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Void Order</p>
        <h3 className="font-bold text-gray-800 text-lg mb-1">Order #{orderId}</h3>
        <p className="text-sm text-gray-500 mb-5">Enter manager PIN to cancel this order. This cannot be undone.</p>

        <input
          type="password"
          inputMode="numeric"
          maxLength={8}
          placeholder="PIN"
          value={pin}
          onChange={e => { setPin(e.target.value); setError(false) }}
          onKeyDown={e => e.key === 'Enter' && submit()}
          autoFocus
          className={`w-full border rounded-xl px-4 py-3 text-center text-lg tracking-widest font-bold focus:outline-none mb-1
            ${error ? 'border-red-400 bg-red-50 text-red-700' : 'border-gray-200 focus:border-brand'}`}
        />
        {error && <p className="text-xs text-red-500 text-center mb-3">Incorrect PIN</p>}
        {!error && <div className="mb-3" />}

        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2 text-sm hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={pin.length === 0 || voiding}
            className="flex-1 bg-red-500 text-white rounded-xl py-2 text-sm font-semibold hover:bg-red-600 disabled:opacity-40"
          >
            {voiding ? 'Voiding…' : 'Void Order'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Print settings modal ──────────────────────────────────────────────────────

function SettingRow({
  label, hint, value, min, max, step, onChange,
}: {
  label: string; hint: string; value: number
  min: number; max: number; step: number
  onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <input
          type="number"
          value={value}
          min={min} max={max} step={step}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:border-brand"
        />
      </div>
      <input
        type="range"
        value={value}
        min={min} max={max} step={step}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full accent-brand"
      />
      <p className="text-xs text-gray-400 mt-0.5">{hint}</p>
    </div>
  )
}

const FORMAT_LABELS: Record<PrintFormat, { label: string; icon: string }> = {
  receipt: { label: 'Receipt', icon: '🧾' },
  kitchen: { label: 'Kitchen', icon: '🍳' },
  griller: { label: 'Griller', icon: '🔥' },
}

function PrintSettingsModal({ onClose }: { onClose: () => void }) {
  const [all, setAll] = useState<AllPrintSettings>(() => loadAllPrintSettings())
  const [tab, setTab] = useState<PrintFormat>('receipt')

  const s = all[tab]
  const upd = (key: keyof PrintSettings, v: number) =>
    setAll(prev => ({ ...prev, [tab]: { ...prev[tab], [key]: v } }))

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Thermal Printer</p>
        <h3 className="font-bold text-gray-800 text-lg mb-4">Print Settings</h3>

        {/* Format tabs */}
        <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1">
          {(Object.keys(FORMAT_LABELS) as PrintFormat[]).map(f => (
            <button
              key={f}
              onClick={() => setTab(f)}
              className={`flex-1 text-xs font-semibold py-1.5 rounded-lg transition-colors ${
                tab === f ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {FORMAT_LABELS[f].icon} {FORMAT_LABELS[f].label}
            </button>
          ))}
        </div>

        <div className="space-y-5">
          <SettingRow
            label="Body Width (mm)" hint="Content area width — shrink if right side clips"
            value={s.bodyWidth} min={28} max={50} step={0.5}
            onChange={v => upd('bodyWidth', v)}
          />
          <SettingRow
            label="Left Offset (mm)" hint="Shift content right (+) or left (−) from driver edge"
            value={s.marginLeft} min={-6} max={10} step={0.5}
            onChange={v => upd('marginLeft', v)}
          />
          <SettingRow
            label="Font Size (mm)" hint="Base size for item rows"
            value={s.fontSize} min={1.5} max={5} step={0.1}
            onChange={v => upd('fontSize', v)}
          />
          <SettingRow
            label="Line Height" hint="Spacing between lines"
            value={s.lineHeight} min={1.0} max={2.5} step={0.1}
            onChange={v => upd('lineHeight', v)}
          />
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2 text-sm hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => { saveAllPrintSettings(all); onClose() }}
            className="flex-1 bg-brand text-white rounded-xl py-2 text-sm font-semibold hover:bg-brand-dark"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [activeOrders, setActiveOrders] = useState<Order[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [editOrderId, setEditOrderId] = useState<number | null>(null)
  const [voidOrderId, setVoidOrderId] = useState<number | null>(null)
  const [showPrintSettings, setShowPrintSettings] = useState(false)

  const load = useCallback(async () => {
    const [orders, txns] = await Promise.all([api.getOrders(true), api.getTransactions()])
    setActiveOrders(orders)
    setTransactions(txns)
  }, [])

  useEffect(() => { load() }, [load])

  const handleMessage = useCallback((msg: WsMessage) => {
    if (msg.type === 'NEW_ORDER') {
      const incoming = msg as unknown as Order
      setActiveOrders(prev =>
        prev.some(o => o.id === incoming.id) ? prev : [incoming, ...prev]
      )
    } else if (msg.type === 'ORDER_STATUS_UPDATE') {
      const updated = msg as unknown as Order
      if (updated.status === 'COMPLETED' || updated.status === 'VOIDED') {
        setActiveOrders(prev => prev.filter(o => o.id !== updated.id))
        load()
      } else {
        setActiveOrders(prev => prev.map(o => o.id === updated.id ? updated : o))
      }
    }
  }, [load])

  useWebSocket(WS_URL, handleMessage)

  const toLocalDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const todayStr = toLocalDate(new Date())
  const todayTxns = transactions.filter(t => toLocalDate(new Date(t.completed_at)) === todayStr)
  const todayRevenue = todayTxns.reduce((sum, t) => sum + parseFloat(t.total), 0)

  const advance = async (order: Order) => {
    const next = STATUS_NEXT[order.status]
    if (!next) return
    await api.updateOrderStatus(order.id, next)
  }

  const markPaid = async (order: Order) => {
    const updated = await api.markPaid(order.id)
    setActiveOrders(prev => prev.map(o => o.id === updated.id ? updated : o))
  }

  const SOURCE_LABEL: Record<string, string> = {
    'walk-in': 'Walk-in',
    'web': 'Web',
    'android': 'Android',
  }

  const ORDER_TYPE_STYLE: Record<string, string> = {
    DINE_IN:  'bg-gray-100 text-gray-600',
    TAKE_OUT: 'bg-blue-100 text-blue-700',
    DELIVERY: 'bg-purple-100 text-purple-700',
    PICK_UP:  'bg-orange-100 text-orange-700',
  }
  const ORDER_TYPE_LABEL: Record<string, string> = {
    DINE_IN: 'Dine In', TAKE_OUT: 'Take Out', DELIVERY: 'Delivery', PICK_UP: 'Pick Up',
  }
  const PAYMENT_STYLE: Record<string, string> = {
    CASH:  'bg-green-100 text-green-700',
    GCASH: 'bg-sky-100 text-sky-700',
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPrintSettings(true)}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title="Print settings"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <Link
            href="/admin/take-order"
            className="bg-brand text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-brand-dark transition-colors text-sm flex items-center gap-2"
          >
            <span className="text-base">+</span> Take Order
          </Link>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard label="Active Orders" value={activeOrders.length} color="text-orange-500" />
        <StatCard label="Today's Sales" value={todayTxns.length} color="text-blue-500" />
        <StatCard label="Today's Revenue" value={`₱${todayRevenue.toFixed(2)}`} color="text-green-600" />
      </div>

      {/* Active orders */}
      <h2 className="text-lg font-semibold text-gray-700 mb-3">Active Orders</h2>
      {activeOrders.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400 mb-4">No active orders right now</p>
          <Link href="/admin/take-order" className="text-brand text-sm font-semibold hover:underline">
            + Take a walk-in order
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {activeOrders.map(order => (
            <div key={order.id} className={`rounded-2xl shadow-sm border p-4 ${order.is_unpaid ? 'bg-red-50 border-red-200' : 'bg-white border-gray-100'}`}>
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {order.slip_number ? (
                      <>
                        <span className="font-bold text-base text-gray-800">Slip #{order.slip_number}</span>
                        <span className="text-xs text-gray-400">#{order.id}</span>
                      </>
                    ) : (
                      <span className="font-semibold text-sm text-gray-800">Order #{order.id}</span>
                    )}
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                      {SOURCE_LABEL[order.source] ?? order.source}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    {order.order_type && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ORDER_TYPE_STYLE[order.order_type] ?? 'bg-gray-100 text-gray-500'}`}>
                        {ORDER_TYPE_LABEL[order.order_type] ?? order.order_type}
                      </span>
                    )}
                    {order.payment_method && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PAYMENT_STYLE[order.payment_method] ?? 'bg-gray-100 text-gray-500'}`}>
                        {order.payment_method === 'GCASH' ? 'GCash' : order.payment_method}
                      </span>
                    )}
                    {order.table_number && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                        Table {order.table_number}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {order.is_unpaid && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">
                      UNPAID
                    </span>
                  )}
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_COLOR[order.status]}`}>
                    {order.status}
                  </span>
                </div>
              </div>

              <ul className="text-xs text-gray-500 space-y-0.5 mb-3">
                {order.items_json.map((item, i) => (
                  <li key={i} className="flex justify-between">
                    <span>{item.name} × {item.quantity}</span>
                    <span>₱{(item.price * item.quantity).toFixed(2)}</span>
                  </li>
                ))}
              </ul>

              <div className={`pt-2 border-t space-y-2 ${order.is_unpaid ? 'border-red-200' : 'border-gray-100'}`}>
                {/* Print buttons row */}
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-xs text-gray-400 font-medium mr-0.5">Print:</span>
                  <button
                    onClick={() => printReceipt(orderToReceipt(order))}
                    className="text-xs text-gray-400 hover:text-brand px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors"
                  >
                    Customer
                  </button>
                  <button
                    onClick={() => printCashierReceipt(orderToReceipt(order))}
                    className={`text-xs px-2 py-1 rounded-lg transition-colors ${order.is_unpaid ? 'text-red-400 hover:text-red-600 hover:bg-red-100' : 'text-gray-400 hover:text-brand hover:bg-orange-50'}`}
                  >
                    Cashier
                  </button>
                  <button
                    onClick={() => printKitchenOrder(orderToReceipt(order))}
                    className="text-xs text-gray-400 hover:text-blue-500 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors"
                  >
                    Kitchen
                  </button>
                  <button
                    onClick={() => void printGrillerOrder(orderToReceipt(order))}
                    className="text-xs text-gray-400 hover:text-orange-500 px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors"
                  >
                    Griller
                  </button>
                </div>
                {/* Action row */}
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-gray-800">₱{order.total}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditOrderId(order.id)}
                      className="text-xs text-gray-400 hover:text-brand px-2 py-1.5 rounded-lg hover:bg-orange-50 transition-colors"
                    >
                      + Add Items
                    </button>
                    <button
                      onClick={() => setVoidOrderId(order.id)}
                      className="text-xs text-red-300 hover:text-red-500 px-2 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      Void
                    </button>
                    {order.is_unpaid && order.status === 'READY' ? (
                      <button
                        onClick={() => markPaid(order)}
                        className="bg-red-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-red-600 transition-colors"
                      >
                        Mark Paid
                      </button>
                    ) : STATUS_NEXT[order.status] && (
                      <button
                        onClick={() => advance(order)}
                        className="bg-brand text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-brand-dark transition-colors"
                      >
                        → {STATUS_NEXT[order.status]}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit / Add Items modal */}
      {editOrderId !== null && (
        <EditOrderModal
          orderId={editOrderId}
          onClose={() => setEditOrderId(null)}
          onSaved={(updated) =>
            setActiveOrders(prev => prev.map(o => o.id === updated.id ? updated : o))
          }
        />
      )}

      {/* Void confirm modal */}
      {voidOrderId !== null && (
        <VoidConfirmModal
          orderId={voidOrderId}
          onConfirmed={() => {
            setActiveOrders(prev => prev.filter(o => o.id !== voidOrderId))
            setVoidOrderId(null)
          }}
          onCancel={() => setVoidOrderId(null)}
        />
      )}

      {/* Print settings modal */}
      {showPrintSettings && (
        <PrintSettingsModal onClose={() => setShowPrintSettings(false)} />
      )}
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
    </div>
  )
}
