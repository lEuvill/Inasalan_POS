'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { api, Order, Transaction, Product, OrderItem, OrderStatus, OrderType, PaymentMethod, ProductVariation } from '@/app/lib/api'
import { useWebSocket, WsMessage } from '@/app/lib/websocket'
import { EditOrderModal } from '@/app/admin/components/EditOrderModal'
import { VariationPicker } from '@/app/components/VariationPicker'

const WS_URL = (process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000') + '/ws/pos/'

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'bg-red-100 text-red-700',
  PREPARING: 'bg-orange-100 text-orange-700',
  READY: 'bg-green-100 text-green-700',
  COMPLETED: 'bg-gray-100 text-gray-500',
}

const STATUS_NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  PENDING: 'PREPARING',
  PREPARING: 'READY',
  READY: 'COMPLETED',
}

// ── Take Order Modal ──────────────────────────────────────────────────────────

function TakeOrderModal({
  onClose,
  onPlaced,
}: {
  onClose: () => void
  onPlaced: (order: Order) => void
}) {
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<OrderItem[]>([])
  const [activeCategory, setActiveCategory] = useState('')
  const [placing, setPlacing] = useState(false)
  const [pendingEdit, setPendingEdit] = useState<{ idx: number; item: OrderItem; product: Product } | null>(null)
  const [discountEdit, setDiscountEdit] = useState<{ idx: number; value: string } | null>(null)
  const [slipNumber, setSlipNumber] = useState('')
  const [orderType, setOrderType] = useState<OrderType>('DINE_IN')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH')
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})

  useEffect(() => { api.getMenu().then(setProducts) }, [])

  useEffect(() => {
    const last = localStorage.getItem('pos_last_slip_number')
    if (last) {
      const next = parseInt(last, 10)
      setSlipNumber(isNaN(next) ? '' : String(next + 1))
    }
  }, [])

  const grouped = useMemo(() => {
    const map: Record<string, Product[]> = {}
    products.forEach(p => {
      const cat = p.category || 'Uncategorized'
      if (!map[cat]) map[cat] = []
      map[cat].push(p)
    })
    return map
  }, [products])

  const categoryNames = useMemo(() => Object.keys(grouped), [grouped])

  useEffect(() => {
    if (categoryNames.length > 0 && !activeCategory) setActiveCategory(categoryNames[0])
  }, [categoryNames, activeCategory])

  const scrollToCategory = (cat: string) => {
    setActiveCategory(cat)
    sectionRefs.current[cat]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const pushToCart = (productId: number, name: string, price: number) => {
    setCart(prev => {
      const existing = prev.find(i => i.name === name && !(i.discount ?? 0))
      if (existing) return prev.map(i => (i.name === name && !(i.discount ?? 0)) ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, { productId, name, price, quantity: 1, discount: 0 }]
    })
  }

  const updateQty = (idx: number, delta: number) => {
    setCart(prev =>
      prev.map((i, ii) => ii === idx ? { ...i, quantity: i.quantity + delta } : i)
          .filter(i => i.quantity > 0)
    )
  }

  const applyDiscount = (idx: number, pct: number) => {
    setCart(prev => {
      const item = prev[idx]
      if (!item) return prev
      const clamped = Math.min(100, Math.max(0, pct))
      if (item.quantity <= 1 || clamped === 0) {
        return prev.map((i, ii) => ii === idx ? { ...i, discount: clamped } : i)
      }
      // Split: leave qty-1 at existing discount, add 1 at new discount
      const result = [...prev]
      result.splice(idx, 1,
        { ...item, quantity: item.quantity - 1 },
        { ...item, quantity: 1, discount: clamped },
      )
      return result
    })
    setDiscountEdit(null)
  }

  const cartCountFor = (productId: number) =>
    cart.filter(i => i.productId === productId).reduce((s, i) => s + i.quantity, 0)

  const replaceVariation = (idx: number, newName: string, newPrice: number, productId: number, qty: number, discount: number) => {
    setCart(prev => {
      const item = prev[idx]
      if (!item) return prev
      const without = prev.filter((_, ii) => ii !== idx)
      const existingIdx = without.findIndex(i => i.name === newName && (i.discount ?? 0) === discount)
      if (existingIdx >= 0) {
        return without.map((i, ii) => ii === existingIdx ? { ...i, quantity: i.quantity + qty } : i)
      }
      const result = [...without]
      result.splice(Math.min(idx, result.length), 0, { productId, name: newName, price: newPrice, quantity: qty, discount })
      return result
    })
  }

  const total = cart.reduce((sum, i) => sum + i.price * (1 - (i.discount ?? 0) / 100) * i.quantity, 0)
  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0)

  const place = async () => {
    if (cart.length === 0) return
    setPlacing(true)
    try {
      const order = await api.createOrder({
        items_json: cart,
        total,
        source: 'walk-in',
        order_type: orderType,
        payment_method: paymentMethod,
        ...(slipNumber.trim() ? { slip_number: slipNumber.trim() } : {}),
      })
      if (slipNumber.trim()) localStorage.setItem('pos_last_slip_number', slipNumber.trim())
      onPlaced(order)
      onClose()
    } finally {
      setPlacing(false)
    }
  }

  return (
    <>
    <div className="fixed inset-0 bg-black/60 z-50 flex items-stretch justify-stretch p-3">
      <div className="bg-gray-50 rounded-2xl shadow-2xl w-full flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-white border-b border-gray-100 shrink-0">
          {/* Row 1: title, slip #, close */}
          <div className="flex items-center justify-between px-6 py-3 gap-4">
            <h2 className="text-lg font-bold text-gray-800 shrink-0">Take Order</h2>
            <div className="flex items-center gap-2 flex-1 max-w-xs">
              <label className="text-xs font-semibold text-gray-400 shrink-0 uppercase tracking-wide">Slip #</label>
              <input
                type="text"
                inputMode="numeric"
                value={slipNumber}
                onChange={e => setSlipNumber(e.target.value)}
                placeholder="e.g. 109850"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-semibold text-gray-800 focus:outline-none focus:border-brand tracking-wide"
              />
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 shrink-0">✕</button>
          </div>

          {/* Row 2: order type + payment method */}
          <div className="flex items-center gap-6 px-6 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide shrink-0">Type</span>
              <div className="flex gap-1">
                {([['DINE_IN','Dine In'],['TAKE_OUT','Take Out'],['DELIVERY','Delivery'],['PICK_UP','Pick Up']] as [OrderType,string][]).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setOrderType(val)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors
                      ${orderType === val ? 'bg-brand text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide shrink-0">Payment</span>
              <div className="flex gap-1">
                {([['CASH','Cash'],['GCASH','GCash']] as [PaymentMethod,string][]).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setPaymentMethod(val)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors
                      ${paymentMethod === val ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">

          {/* ── Category sidebar ── */}
          <div className="w-40 bg-white border-r border-gray-100 overflow-y-auto shrink-0">
            {categoryNames.map(cat => (
              <button
                key={cat}
                onClick={() => scrollToCategory(cat)}
                className={`w-full text-left px-4 py-3 border-b border-gray-50 transition-colors
                  ${activeCategory === cat
                    ? 'bg-orange-50 border-l-2 border-l-brand text-brand font-semibold'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'}`}
              >
                <p className="text-sm leading-tight">{cat}</p>
                <p className="text-xs text-gray-400 mt-0.5">{grouped[cat].length} item{grouped[cat].length !== 1 ? 's' : ''}</p>
              </button>
            ))}
          </div>

          {/* ── Product sections ── */}
          <div className="flex-1 overflow-y-auto">
            {categoryNames.length === 0 && (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-400">No menu items available</p>
              </div>
            )}
            {categoryNames.map(cat => (
              <div
                key={cat}
                ref={el => { sectionRefs.current[cat] = el }}
                className="p-5"
              >
                <div className="flex items-center gap-3 mb-4">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">{cat}</h3>
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-xs text-gray-300">{grouped[cat].length}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                  {grouped[cat].map(p => {
                    const count = cartCountFor(p.id)
                    const hasVariations = p.variations && p.variations.length > 0

                    if (hasVariations) {
                      return (
                        <div
                          key={p.id}
                          className={`bg-white rounded-xl border shadow-sm overflow-hidden relative
                            ${count > 0 ? 'border-brand ring-1 ring-brand/20' : 'border-gray-100'}`}
                        >
                          <div className="w-full h-20 overflow-hidden bg-orange-50 flex items-center justify-center">
                            {p.image_path
                              // eslint-disable-next-line @next/next/no-img-element
                              ? <img src={p.image_path} alt={p.name} className="w-full h-full object-cover" />
                              : <span className="text-2xl">🍽️</span>
                            }
                          </div>
                          <div className="px-2 pt-2 pb-1">
                            <p className="text-xs font-semibold text-gray-800 line-clamp-1 mb-1.5">{p.name}</p>
                            <div className="flex flex-wrap gap-1">
                              {p.variations.map((v, vi) => {
                                const varName = `${p.name} - ${v.name}`
                                const inCart = cart.find(c => c.name === varName)
                                return (
                                  <button
                                    key={vi}
                                    onClick={() => pushToCart(p.id, varName, parseFloat(v.price))}
                                    className={`flex-1 rounded-lg py-1.5 px-1 text-center transition-all
                                      ${inCart
                                        ? 'bg-brand text-white'
                                        : 'bg-gray-100 text-gray-700 hover:bg-orange-100 hover:text-brand'}`}
                                  >
                                    <p className="text-xs font-semibold truncate leading-tight">{v.name}</p>
                                    <p className={`text-[10px] leading-tight ${inCart ? 'text-white/80' : 'text-gray-400'}`}>
                                      ₱{parseFloat(v.price).toFixed(2)}
                                    </p>
                                    {inCart && (
                                      <p className="text-xs font-bold leading-tight">×{inCart.quantity}</p>
                                    )}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                          {count > 0 && (
                            <span className="absolute top-2 right-2 bg-brand text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold shadow">
                              {count}
                            </span>
                          )}
                        </div>
                      )
                    }

                    return (
                      <div
                        key={p.id}
                        className={`bg-white rounded-xl border shadow-sm overflow-hidden relative
                          ${count > 0 ? 'border-brand ring-1 ring-brand/20' : 'border-gray-100'}`}
                      >
                        <div className="w-full h-20 overflow-hidden bg-orange-50 flex items-center justify-center">
                          {p.image_path
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={p.image_path} alt={p.name} className="w-full h-full object-cover" />
                            : <span className="text-2xl">🍽️</span>
                          }
                        </div>
                        <div className="px-2 pt-2 pb-2">
                          <p className="text-xs font-semibold text-gray-800 line-clamp-1 mb-1.5">{p.name}</p>
                          <button
                            type="button"
                            onClick={() => pushToCart(p.id, p.name, parseFloat(p.price))}
                            className={`w-full rounded-lg py-1.5 text-center text-xs font-semibold transition-all
                              ${count > 0
                                ? 'bg-brand text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-orange-100 hover:text-brand'}`}
                          >
                            ₱{parseFloat(p.price).toFixed(2)}
                            {count > 0 && <span className="ml-1 font-bold">×{count}</span>}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* ── Cart panel ── */}
          <div className="w-72 bg-white border-l border-gray-100 flex flex-col shrink-0">
            <div className="px-4 pt-4 pb-3 border-b border-gray-100">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                Order{cartCount > 0 ? ` · ${cartCount} item${cartCount !== 1 ? 's' : ''}` : ''}
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full pb-10 gap-2">
                  <p className="text-3xl">🛒</p>
                  <p className="text-gray-400 text-sm text-center">Tap items on the left to add them</p>
                </div>
              ) : cart.map((item, idx) => {
                const parentProduct = products.find(p => p.id === item.productId)
                const isVariation = parentProduct?.variations && parentProduct.variations.length > 0
                const disc = item.discount ?? 0
                const effectivePrice = item.price * (1 - disc / 100)
                const isEditingDiscount = discountEdit?.idx === idx
                return (
                  <div key={idx} className="flex items-start gap-2 py-1.5 border-b border-gray-50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate leading-tight">{item.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {disc > 0 ? (
                          <>
                            <p className="text-xs text-gray-300 line-through">₱{item.price.toFixed(2)}</p>
                            <p className="text-xs text-green-600 font-semibold">₱{effectivePrice.toFixed(2)}</p>
                          </>
                        ) : (
                          <p className="text-xs text-gray-400">₱{item.price.toFixed(2)}</p>
                        )}
                        {isEditingDiscount ? (
                          <form
                            className="flex items-center gap-1"
                            onSubmit={e => { e.preventDefault(); applyDiscount(idx, parseFloat(discountEdit.value) || 0) }}
                          >
                            <input
                              autoFocus
                              type="number"
                              min="0"
                              max="100"
                              value={discountEdit.value}
                              onChange={e => setDiscountEdit({ idx, value: e.target.value })}
                              onBlur={() => applyDiscount(idx, parseFloat(discountEdit.value) || 0)}
                              className="w-12 border border-brand rounded px-1 py-0.5 text-xs text-center focus:outline-none"
                              placeholder="0"
                            />
                            <span className="text-xs text-gray-400">%</span>
                          </form>
                        ) : (
                          <button
                            onClick={() => setDiscountEdit({ idx, value: disc > 0 ? String(disc) : '' })}
                            className={`text-xs font-semibold hover:underline leading-none ${disc > 0 ? 'text-green-600' : 'text-gray-300 hover:text-brand'}`}
                          >
                            {disc > 0 ? `${disc}% off` : '%'}
                          </button>
                        )}
                        {isVariation && !isEditingDiscount && (
                          <button
                            onClick={() => setPendingEdit({ idx, item, product: parentProduct! })}
                            className="text-xs text-brand font-semibold hover:underline leading-none"
                          >change</button>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => updateQty(idx, -1)}
                          className="w-5 h-5 rounded-full bg-gray-100 text-gray-600 text-xs font-bold flex items-center justify-center hover:bg-gray-200"
                        >−</button>
                        <span className="w-4 text-center text-xs font-bold text-gray-700">{item.quantity}</span>
                        <button
                          onClick={() => updateQty(idx, 1)}
                          className="w-5 h-5 rounded-full bg-brand text-white text-xs font-bold flex items-center justify-center hover:bg-brand-dark"
                        >+</button>
                      </div>
                      <span className="text-xs font-semibold text-gray-600">
                        ₱{(effectivePrice * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="border-t border-gray-100 p-4 space-y-3 bg-gray-50">
              <div className="flex justify-between items-baseline">
                <span className="text-sm font-semibold text-gray-600">Total</span>
                <span className="text-xl font-bold text-brand">₱{total.toFixed(2)}</span>
              </div>
              <button
                onClick={place}
                disabled={cart.length === 0 || placing}
                className="w-full bg-brand text-white font-bold py-3 rounded-xl hover:bg-brand-dark transition-colors disabled:opacity-40"
              >
                {placing ? 'Placing…' : 'Place Order'}
              </button>
              {cart.length > 0 && (
                <button onClick={() => setCart([])} className="w-full text-xs text-gray-400 hover:text-gray-600 py-1">
                  Clear all
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>

    {pendingEdit && (
      <VariationPicker
        productName={`Change: ${pendingEdit.product.name}`}
        variations={pendingEdit.product.variations}
        onSelect={(v: ProductVariation) => {
          const newName = `${pendingEdit.product.name} - ${v.name}`
          if (newName !== pendingEdit.item.name) {
            replaceVariation(pendingEdit.idx, newName, parseFloat(v.price), pendingEdit.product.id, pendingEdit.item.quantity, pendingEdit.item.discount ?? 0)
          }
          setPendingEdit(null)
        }}
        onCancel={() => setPendingEdit(null)}
      />
    )}
    </>
  )
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

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [activeOrders, setActiveOrders] = useState<Order[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [showTakeOrder, setShowTakeOrder] = useState(false)
  const [editOrderId, setEditOrderId] = useState<number | null>(null)
  const [voidOrderId, setVoidOrderId] = useState<number | null>(null)

  const load = useCallback(async () => {
    const [orders, txns] = await Promise.all([api.getOrders(true), api.getTransactions()])
    setActiveOrders(orders)
    setTransactions(txns)
  }, [])

  useEffect(() => { load() }, [load])

  const handleMessage = useCallback((msg: WsMessage) => {
    if (msg.type === 'NEW_ORDER') {
      const incoming = msg as unknown as Order
      // Deduplicate: onPlaced already adds it optimistically; WS fires a moment later
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
        <button
          onClick={() => setShowTakeOrder(true)}
          className="bg-brand text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-brand-dark transition-colors text-sm flex items-center gap-2"
        >
          <span className="text-base">+</span> Take Order
        </button>
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
          <button
            onClick={() => setShowTakeOrder(true)}
            className="text-brand text-sm font-semibold hover:underline"
          >
            + Take a walk-in order
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {activeOrders.map(order => (
            <div key={order.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
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
                  </div>
                </div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLOR[order.status]}`}>
                  {order.status}
                </span>
              </div>

              <ul className="text-xs text-gray-500 space-y-0.5 mb-3">
                {order.items_json.map((item, i) => (
                  <li key={i} className="flex justify-between">
                    <span>{item.name} × {item.quantity}</span>
                    <span>₱{(item.price * item.quantity).toFixed(2)}</span>
                  </li>
                ))}
              </ul>

              <div className="flex items-center justify-between pt-2 border-t border-gray-50">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-gray-800">₱{order.total}</span>
                  <button
                    onClick={() => setVoidOrderId(order.id)}
                    className="text-xs text-red-300 hover:text-red-500 px-1.5 py-1 rounded-lg hover:bg-red-50 transition-colors"
                    title="Void order"
                  >
                    Void
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditOrderId(order.id)}
                    className="text-xs text-gray-400 hover:text-brand px-2 py-1.5 rounded-lg hover:bg-orange-50 transition-colors"
                  >
                    + Add Items
                  </button>
                  {STATUS_NEXT[order.status] && (
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
          ))}
        </div>
      )}

      {/* Take Order modal */}
      {showTakeOrder && (
        <TakeOrderModal
          onClose={() => setShowTakeOrder(false)}
          onPlaced={(order) => setActiveOrders(prev =>
            prev.some(o => o.id === order.id) ? prev : [order, ...prev]
          )}
        />
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
