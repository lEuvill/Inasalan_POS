'use client'

import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { api, Product, OrderItem, OrderType, PaymentMethod, ProductVariation, Table } from '@/app/lib/api'
import { useWebSocket, WsMessage } from '@/app/lib/websocket'
import { VariationPicker } from '@/app/components/VariationPicker'
import { printReceipt, printCashierReceipt, printKitchenOrder, printGrillerOrder, ReceiptData } from '@/app/lib/printReceipt'

type OrderStep = 'cart' | 'payment' | 'table'

type LastPlaced = { slip: string; total: number; table: string }

export default function TakeOrderPage() {
  const [products, setProducts]       = useState<Product[]>([])
  const [cart, setCart]               = useState<OrderItem[]>([])
  const [activeCategory, setActiveCategory] = useState('')
  const [placing, setPlacing]         = useState(false)
  const [pendingEdit, setPendingEdit] = useState<{ idx: number; item: OrderItem; product: Product } | null>(null)
  const [discountEdit, setDiscountEdit] = useState<{ idx: number; value: string } | null>(null)
  const [slipNumber, setSlipNumber]   = useState('')
  const [orderType, setOrderType]     = useState<OrderType>('DINE_IN')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH')
  const [step, setStep]               = useState<OrderStep>('cart')
  const [amountTendered, setAmountTendered] = useState('')
  const [tableNumber, setTableNumber] = useState('')
  const [tables, setTables]           = useState<Table[]>([])
  const [isUnpaid, setIsUnpaid]             = useState(false)
  const [lastPlaced, setLastPlaced]         = useState<LastPlaced | null>(null)
  const [lastReceiptData, setLastReceiptData] = useState<ReceiptData | null>(null)
  const [stockWarn, setStockWarn]           = useState<string | null>(null)
  const stockWarnTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [dfCustom, setDfCustom]       = useState<{ value: string } | null>(null)
  const [dfOutputNames, setDfOutputNames] = useState<Record<number, string>>(() => {
    if (typeof window === 'undefined') return {}
    try { return JSON.parse(localStorage.getItem('pos_df_output_names') ?? '{}') } catch { return {} }
  })
  const [showDfConfig, setShowDfConfig] = useState(false)
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { api.getMenu().then(setProducts) }, [])
  useEffect(() => { api.getTables().then(ts => setTables(ts.filter(t => t.is_active))) }, [])

  const handleWsMessage = useCallback((msg: WsMessage) => {
    if (msg.type === 'PRODUCT_UPDATE') {
      const updated = msg as unknown as Product
      setProducts(prev => prev.map(p => p.id === updated.id ? updated : p))
    }
  }, [])
  useWebSocket((process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000') + '/ws/pos/', handleWsMessage)

  useEffect(() => {
    const last = localStorage.getItem('pos_last_slip_number')
    if (last) {
      const n = parseInt(last, 10)
      setSlipNumber(isNaN(n) ? '' : String(n + 1))
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

  const dfProduct = useMemo(() =>
    products.find(p => {
      const n = p.name.toLowerCase()
      return n.includes('delivery fee') || n === 'delivery fee'
    }),
  [products])

  const dfId = dfProduct?.id ?? -1

  useEffect(() => {
    if (categoryNames.length > 0 && !activeCategory) setActiveCategory(categoryNames[0])
  }, [categoryNames, activeCategory])

  useEffect(() => {
    if (orderType === 'DELIVERY') {
      setCart(prev => {
        if (prev.some(i => i.productId === dfId)) return prev
        const name = dfOutputNames[30]
        return [...prev, {
          productId: dfId,
          name: dfProduct?.name ?? 'Delivery Fee',
          price: 30,
          quantity: 1,
          discount: 0,
          ...(name ? { output_name: name } : {}),
        }]
      })
    } else {
      setCart(prev => prev.filter(i => i.productId !== dfId))
    }
  }, [orderType, dfId, dfProduct, dfOutputNames])

  const scrollToCategory = (cat: string) => {
    setActiveCategory(cat)
    sectionRefs.current[cat]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const warnStock = (msg: string) => {
    setStockWarn(msg)
    if (stockWarnTimer.current) clearTimeout(stockWarnTimer.current)
    stockWarnTimer.current = setTimeout(() => setStockWarn(null), 3000)
  }

  const pushToCart = (productId: number, name: string, price: number) => {
    const product = products.find(p => p.id === productId)
    if (product) {
      let stock: number | null = null
      if (product.variations?.length) {
        const varName = name.startsWith(product.name + ' - ') ? name.slice(product.name.length + 3) : null
        const v = varName ? product.variations.find(v => v.name === varName) : null
        stock = v?.stock ?? null
      } else {
        stock = product.stock ?? null
      }
      if (stock !== null) {
        const currentQty = cart.filter(i => i.name === name).reduce((s, i) => s + i.quantity, 0)
        if (stock === 0 || currentQty >= stock) warnStock(`⚠ ${name} — out of stock`)
      }
    }
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
      const result = [...prev]
      result.splice(idx, 1,
        { ...item, quantity: item.quantity - 1 },
        { ...item, quantity: 1, discount: clamped },
      )
      return result
    })
    setDiscountEdit(null)
  }

  const setDfPrice = (price: number) => {
    const outputName = dfOutputNames[price]
    setCart(prev => prev.map(i =>
      i.productId === dfId
        ? { ...i, price, ...(outputName ? { output_name: outputName } : { output_name: undefined }) }
        : i
    ))
    setDfCustom(null)
  }

  const updateDfOutputName = (price: number, name: string) => {
    setDfOutputNames(prev => {
      const next = { ...prev, [price]: name }
      localStorage.setItem('pos_df_output_names', JSON.stringify(next))
      return next
    })
    setCart(prev => prev.map(i =>
      i.productId === dfId && i.price === price
        ? { ...i, ...(name ? { output_name: name } : { output_name: undefined }) }
        : i
    ))
  }

  const cartCountFor = (productId: number) =>
    cart.filter(i => i.productId === productId).reduce((s, i) => s + i.quantity, 0)

  const stockForCartItem = (item: OrderItem): number | null => {
    const product = products.find(p => p.id === item.productId)
    if (!product) return null
    if (product.variations?.length) {
      const varName = item.name.startsWith(product.name + ' - ')
        ? item.name.slice(product.name.length + 3)
        : null
      const v = varName ? product.variations.find(v => v.name === varName) : null
      return v?.stock ?? null
    }
    return product.stock ?? null
  }

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

  const quickAmounts = [...new Set([
    total,
    Math.ceil(total / 50) * 50,
    Math.ceil(total / 100) * 100,
    Math.ceil(total / 500) * 500,
  ])].filter(v => v >= total)

  const place = async (tbl: string) => {
    if (cart.length === 0) return
    setPlacing(true)
    try {
      const slip = slipNumber.trim()
      const roundedTotal = Math.round(total * 100) / 100
      await api.createOrder({
        items_json: cart,
        total: roundedTotal,
        source: 'walk-in',
        order_type: orderType,
        payment_method: paymentMethod,
        ...(slip ? { slip_number: slip } : {}),
        ...(tbl.trim() ? { table_number: tbl.trim() } : {}),
        ...(isUnpaid ? { is_unpaid: true } : {}),
      })
      if (slip) localStorage.setItem('pos_last_slip_number', slip)

      // Build and print receipt
      const receipt: ReceiptData = {
        slipNumber: slip || undefined,
        orderType,
        paymentMethod,
        tableNumber: tbl.trim() || undefined,
        items: cart,
        total: roundedTotal,
        amountTendered: !isUnpaid && paymentMethod === 'CASH' && amountTendered ? parseFloat(amountTendered) : undefined,
        isUnpaid,
        date: new Date(),
      }
      setLastReceiptData(receipt)
      printReceipt(receipt)
      printCashierReceipt(receipt)
      printKitchenOrder(receipt)
      void printGrillerOrder(receipt)

      // Show success banner then auto-dismiss
      const placed: LastPlaced = { slip: slip || '—', total: roundedTotal, table: tbl.trim() }
      setLastPlaced(placed)
      if (bannerTimer.current) clearTimeout(bannerTimer.current)
      bannerTimer.current = setTimeout(() => setLastPlaced(null), 4000)

      // Reset for next order
      setCart([])
      setStep('cart')
      setAmountTendered('')
      setTableNumber('')
      setIsUnpaid(false)
      if (slip) {
        const n = parseInt(slip, 10)
        if (!isNaN(n)) setSlipNumber(String(n + 1))
      }
    } finally {
      setPlacing(false)
    }
  }

  return (
    <>
    {/* Full-page layout — negate the admin main p-8 padding */}
    <div className="-m-8 h-screen flex flex-col overflow-hidden bg-gray-50">

      {/* ── Stock warning toast ── */}
      {stockWarn && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-amber-500 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-lg z-[60] whitespace-nowrap">
          {stockWarn}
        </div>
      )}

      {/* ── Success banner (auto-dismisses) ── */}
      {lastPlaced && (
        <div className="shrink-0 bg-green-500 text-white px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg">✓</span>
            <div>
              <p className="text-sm font-bold leading-tight">
                Order placed{lastPlaced.slip !== '—' ? ` — Slip #${lastPlaced.slip}` : ''}
                {lastPlaced.table ? ` · Table ${lastPlaced.table}` : ''}
              </p>
              <p className="text-xs text-green-100 leading-tight">₱{lastPlaced.total.toFixed(2)} · Ready for next order</p>
            </div>
          </div>
          <button onClick={() => setLastPlaced(null)} className="text-green-200 hover:text-white text-lg leading-none">✕</button>
        </div>
      )}

      {/* ── Persistent reprint bar (stays until next order) ── */}
      {lastReceiptData && (
        <div className="shrink-0 bg-gray-700 text-white px-4 py-1.5 flex items-center justify-between">
          <span className="text-xs text-gray-400 font-medium">Last order</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => printReceipt(lastReceiptData)}
              className="text-xs font-semibold bg-gray-600 hover:bg-gray-500 text-white px-3 py-1 rounded-lg transition-colors"
            >
              🧾 Customer
            </button>
            <button
              onClick={() => printCashierReceipt(lastReceiptData)}
              className={`text-xs font-semibold px-3 py-1 rounded-lg transition-colors text-white ${lastReceiptData.isUnpaid ? 'bg-red-600 hover:bg-red-500' : 'bg-gray-600 hover:bg-gray-500'}`}
            >
              🖨 Cashier{lastReceiptData.isUnpaid ? ' (UNPAID)' : ''}
            </button>
            <button
              onClick={() => printKitchenOrder(lastReceiptData)}
              className="text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded-lg transition-colors"
            >
              🍳 Kitchen
            </button>
            <button
              onClick={() => void printGrillerOrder(lastReceiptData)}
              className="text-xs font-semibold bg-orange-600 hover:bg-orange-500 text-white px-3 py-1 rounded-lg transition-colors"
            >
              🔥 Griller
            </button>
            <button onClick={() => setLastReceiptData(null)} className="text-gray-500 hover:text-gray-300 text-sm leading-none ml-1">✕</button>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-100 shrink-0">
        {/* Row 1: title + slip # */}
        <div className="flex items-center gap-4 px-6 py-3">
          <h1 className="text-base font-bold text-gray-800 shrink-0">Take Order</h1>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-gray-400 shrink-0 uppercase tracking-wide">Slip #</label>
            <input
              type="text"
              inputMode="numeric"
              value={slipNumber}
              onChange={e => setSlipNumber(e.target.value)}
              placeholder="e.g. 109850"
              className="w-36 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-semibold text-gray-800 focus:outline-none focus:border-brand tracking-wide"
            />
          </div>
        </div>

        {/* Row 2: order type + payment method */}
        <div className="flex items-center gap-6 px-6 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide shrink-0">Type</span>
            <div className="flex gap-1">
              {([['DINE_IN','Dine In'],['TAKE_OUT','Take Out'],['DELIVERY','Delivery'],['PICK_UP','Pick Up']] as [OrderType,string][]).map(([val, label]) => (
                <button key={val} type="button" onClick={() => setOrderType(val)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors
                    ${orderType === val ? 'bg-brand text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                >{label}</button>
              ))}
            </div>
            {orderType === 'DELIVERY' && (
              <button type="button" onClick={() => setShowDfConfig(true)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide shrink-0">Payment</span>
            <div className="flex gap-1">
              {([['CASH','Cash'],['GCASH','GCash']] as [PaymentMethod,string][]).map(([val, label]) => (
                <button key={val} type="button" onClick={() => setPaymentMethod(val)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors
                    ${paymentMethod === val ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                >{label}</button>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Category sidebar */}
        <div className="w-40 bg-white border-r border-gray-100 overflow-y-auto shrink-0">
          {categoryNames.map(cat => (
            <button key={cat} onClick={() => scrollToCategory(cat)}
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

        {/* Product grid */}
        <div className="flex-1 overflow-y-auto">
          {categoryNames.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-400">No menu items available</p>
            </div>
          )}
          {categoryNames.map(cat => (
            <div key={cat} ref={el => { sectionRefs.current[cat] = el }} className="p-5">
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
                      <div key={p.id} className={`bg-white rounded-xl border shadow-sm overflow-hidden relative
                        ${count > 0 ? 'border-brand ring-1 ring-brand/20' : 'border-gray-100'}`}>
                        <div className="w-full h-20 overflow-hidden bg-orange-50 flex items-center justify-center">
                          {p.image_path
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={p.image_path} alt={p.name} className="w-full h-full object-cover" />
                            : <span className="text-2xl">🍽️</span>}
                        </div>
                        <div className="px-2 pt-2 pb-1">
                          <p className="text-xs font-semibold text-gray-800 line-clamp-1 mb-1">{p.name}</p>
                          <div className="flex flex-wrap gap-1">
                            {p.variations.map((v, vi) => {
                              const varName = `${p.name} - ${v.name}`
                              const inCart = cart.find(c => c.name === varName)
                              const varQty = inCart?.quantity ?? 0
                              // Per-variation stock takes priority; fall back to shared product-level pool
                              const varRemaining = v.stock != null
                                ? Math.max(0, v.stock - varQty)
                                : p.stock != null
                                  ? Math.max(0, p.stock - count)
                                  : null
                              const outOfStock = varRemaining !== null && varRemaining === 0
                              return (
                                <button key={vi}
                                  onClick={() => pushToCart(p.id, varName, parseFloat(v.price))}
                                  disabled={outOfStock}
                                  className={`flex-1 rounded-lg py-1.5 px-1 text-center transition-all
                                    ${outOfStock ? 'bg-gray-100 cursor-not-allowed opacity-50' :
                                      inCart ? 'bg-brand text-white' : 'bg-gray-100 text-gray-700 hover:bg-orange-100 hover:text-brand'}`}>
                                  <p className="text-xs font-semibold truncate leading-tight">{v.name}</p>
                                  <p className={`text-[10px] leading-tight ${
                                    outOfStock ? 'text-red-400' : inCart ? 'text-white/80' : 'text-gray-400'
                                  }`}>
                                    {outOfStock ? 'Out of stock' : `₱${parseFloat(v.price).toFixed(2)}`}
                                  </p>
                                  {varRemaining !== null && !outOfStock && (
                                    <p className={`text-[10px] leading-tight ${
                                      varRemaining <= 5 ? (inCart ? 'text-red-300' : 'text-red-400') :
                                      varRemaining <= 10 ? (inCart ? 'text-amber-200' : 'text-amber-500') :
                                      (inCart ? 'text-white/60' : 'text-gray-400')
                                    }`}>{varRemaining} left</p>
                                  )}
                                  {inCart && !outOfStock && <p className="text-xs font-bold leading-tight">×{varQty}</p>}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                        {count > 0 && (
                          <span className="absolute top-2 right-2 bg-brand text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold shadow">{count}</span>
                        )}
                      </div>
                    )
                  }

                  const remaining = p.stock !== null ? Math.max(0, p.stock - count) : null
                  const isOutOfStock = remaining !== null && remaining === 0

                  return (
                    <div key={p.id} className={`bg-white rounded-xl border shadow-sm overflow-hidden relative
                      ${count > 0 ? 'border-brand ring-1 ring-brand/20' : 'border-gray-100'}`}>
                      <div className="w-full h-20 overflow-hidden bg-orange-50 flex items-center justify-center">
                        {p.image_path
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={p.image_path} alt={p.name} className="w-full h-full object-cover" />
                          : <span className="text-2xl">🍽️</span>}
                      </div>
                      <div className="px-2 pt-2 pb-2">
                        <p className="text-xs font-semibold text-gray-800 line-clamp-1 mb-0.5">{p.name}</p>
                        {remaining !== null && (
                          <p className={`text-[10px] font-semibold mb-1 ${remaining === 0 ? 'text-red-400' : remaining <= 10 ? 'text-amber-500' : 'text-gray-400'}`}>
                            {remaining === 0 ? 'Out of stock' : `${remaining} left`}
                          </p>
                        )}
                        <button type="button"
                          onClick={() => pushToCart(p.id, p.name, parseFloat(p.price))}
                          disabled={isOutOfStock}
                          className={`w-full rounded-lg py-1.5 text-center text-xs font-semibold transition-all
                            ${isOutOfStock ? 'bg-gray-100 text-gray-300 cursor-not-allowed' :
                              count > 0 ? 'bg-brand text-white' : 'bg-gray-100 text-gray-700 hover:bg-orange-100 hover:text-brand'}`}>
                          ₱{parseFloat(p.price).toFixed(2)}
                          {count > 0 && !isOutOfStock && <span className="ml-1 font-bold">×{count}</span>}
                        </button>
                      </div>
                      {count > 0 && (
                        <span className="absolute top-2 right-2 bg-brand text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold shadow">{count}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Cart panel */}
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
              const isDfItem = item.productId === dfId
              const DF_PRESETS: [number, string][] = [[30, 'DF1'], [50, 'DF2'], [60, 'DF3']]
              return (
                <div key={idx} className="flex items-start gap-2 py-1.5 border-b border-gray-50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate leading-tight">{item.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {isDfItem ? (
                        <>
                          <p className="text-xs text-gray-400">₱{item.price.toFixed(2)}</p>
                          {DF_PRESETS.map(([p, label]) => (
                            <button key={label} onClick={() => setDfPrice(p)}
                              className={`text-xs font-semibold px-1.5 py-0.5 rounded transition-colors
                                ${item.price === p ? 'bg-brand text-white' : 'bg-gray-100 text-gray-500 hover:bg-orange-50 hover:text-brand'}`}>
                              {label}
                            </button>
                          ))}
                          {dfCustom !== null ? (
                            <form className="flex items-center gap-1"
                              onSubmit={e => { e.preventDefault(); setDfPrice(parseFloat(dfCustom.value) || 30) }}>
                              <input autoFocus type="number" min="0"
                                value={dfCustom.value}
                                onChange={e => setDfCustom({ value: e.target.value })}
                                onBlur={() => { setDfPrice(parseFloat(dfCustom.value) || 30) }}
                                className="w-14 border border-brand rounded px-1 py-0.5 text-xs text-center focus:outline-none"
                                placeholder="0" />
                            </form>
                          ) : (
                            <button onClick={() => setDfCustom({ value: String(item.price) })}
                              className={`text-xs font-semibold px-1.5 py-0.5 rounded transition-colors
                                ${![30, 50, 60].includes(item.price) ? 'bg-brand text-white' : 'bg-gray-100 text-gray-500 hover:bg-orange-50 hover:text-brand'}`}>
                              {![30, 50, 60].includes(item.price) ? `₱${item.price}` : 'Custom'}
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          {disc > 0 ? (
                            <>
                              <p className="text-xs text-gray-300 line-through">₱{item.price.toFixed(2)}</p>
                              <p className="text-xs text-green-600 font-semibold">₱{effectivePrice.toFixed(2)}</p>
                            </>
                          ) : (
                            <p className="text-xs text-gray-400">₱{item.price.toFixed(2)}</p>
                          )}
                          {isEditingDiscount ? (
                            <form className="flex items-center gap-1"
                              onSubmit={e => { e.preventDefault(); applyDiscount(idx, parseFloat(discountEdit.value) || 0) }}>
                              <input autoFocus type="number" min="0" max="100"
                                value={discountEdit.value}
                                onChange={e => setDiscountEdit({ idx, value: e.target.value })}
                                onBlur={() => applyDiscount(idx, parseFloat(discountEdit.value) || 0)}
                                className="w-12 border border-brand rounded px-1 py-0.5 text-xs text-center focus:outline-none"
                                placeholder="0" />
                              <span className="text-xs text-gray-400">%</span>
                            </form>
                          ) : (
                            <button onClick={() => setDiscountEdit({ idx, value: disc > 0 ? String(disc) : '' })}
                              className={`text-xs font-semibold hover:underline leading-none ${disc > 0 ? 'text-green-600' : 'text-gray-300 hover:text-brand'}`}>
                              {disc > 0 ? `${disc}% off` : '%'}
                            </button>
                          )}
                          {isVariation && !isEditingDiscount && (
                            <button onClick={() => setPendingEdit({ idx, item, product: parentProduct! })}
                              className="text-xs text-brand font-semibold hover:underline leading-none">change</button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className="flex items-center gap-1">
                      <button onClick={() => updateQty(idx, -1)}
                        disabled={isDfItem && item.quantity <= 1}
                        className="w-5 h-5 rounded-full bg-gray-100 text-gray-600 text-xs font-bold flex items-center justify-center hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed">−</button>
                      <span className="w-4 text-center text-xs font-bold text-gray-700">{item.quantity}</span>
                      <button onClick={() => updateQty(idx, 1)}
                        className="w-5 h-5 rounded-full bg-brand text-white text-xs font-bold flex items-center justify-center hover:bg-brand-dark">+</button>
                    </div>
                    <span className="text-xs font-semibold text-gray-600">₱{(effectivePrice * item.quantity).toFixed(2)}</span>
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
              type="button"
              onClick={() => setIsUnpaid(prev => !prev)}
              className={`w-full py-2 rounded-xl text-xs font-bold border-2 transition-all ${
                isUnpaid
                  ? 'border-red-400 bg-red-50 text-red-600'
                  : 'border-dashed border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-500'
              }`}
            >
              {isUnpaid ? '⚠ UNPAID — collect payment later' : '+ Mark as Unpaid'}
            </button>
            <button
              onClick={() => { if (cart.length > 0) setStep('payment') }}
              disabled={cart.length === 0}
              className={`w-full text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-40 ${
                isUnpaid ? 'bg-red-500 hover:bg-red-600' : 'bg-brand hover:bg-brand-dark'
              }`}
            >
              Place Order
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

    {/* ── Delivery fee config modal ── */}
    {showDfConfig && (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs">
          <div className="px-5 pt-5 pb-3 border-b border-gray-100">
            <h3 className="font-bold text-gray-800 text-base">Delivery Fee Export Names</h3>
            <p className="text-xs text-gray-400 mt-0.5">Set the export name for each fee tier</p>
          </div>
          <div className="px-5 py-4 space-y-3">
            {([30, 50, 60] as const).map((price, i) => (
              <div key={price} className="flex items-center gap-3">
                <span className="text-xs font-bold text-gray-500 w-8">DF{i + 1}</span>
                <span className="text-xs text-gray-400 w-10">₱{price}</span>
                <input
                  type="text"
                  value={dfOutputNames[price] ?? ''}
                  onChange={e => updateDfOutputName(price, e.target.value)}
                  placeholder={`e.g. Delivery Fee ${i + 1}`}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:border-brand"
                />
              </div>
            ))}
          </div>
          <div className="px-5 pb-5">
            <button onClick={() => setShowDfConfig(false)}
              className="w-full bg-brand text-white rounded-xl py-2 text-sm font-semibold hover:bg-brand-dark transition-colors">
              Done
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Variation picker ── */}
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

    {/* ── Payment step ── */}
    {step === 'payment' && (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-bold text-gray-800">Payment</h2>
            <button onClick={() => setStep('cart')} className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-xl">✕</button>
          </div>

          <div className="px-6 py-6 text-center border-b border-gray-50 bg-gray-50">
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Total Amount Due</p>
            <p className="text-5xl font-black text-brand tracking-tight">₱{total.toFixed(2)}</p>
            <p className="text-xs text-gray-400 mt-2 font-medium">
              {paymentMethod === 'CASH' ? 'Cash' : 'GCash'} · {orderType.replace('_', ' ')}
            </p>
          </div>

          {isUnpaid ? (
            <div className="px-6 py-8 flex flex-col items-center gap-3">
              <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center">
                <span className="text-2xl">⚠</span>
              </div>
              <p className="text-sm font-bold text-red-600">UNPAID ORDER</p>
              <p className="text-sm text-gray-500 text-center">
                Order will be placed without payment. Collect{' '}
                <span className="font-bold text-gray-800">₱{total.toFixed(2)}</span> before completing.
              </p>
            </div>
          ) : paymentMethod === 'CASH' ? (
            <div className="px-6 py-5 space-y-4">
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Amount Tendered</p>
                <input type="number" inputMode="decimal" min="0"
                  value={amountTendered} onChange={e => setAmountTendered(e.target.value)}
                  placeholder="0.00" autoFocus
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-3xl font-bold text-center text-gray-800 focus:outline-none focus:border-brand" />
              </div>
              <div className="grid grid-cols-4 gap-2">
                {quickAmounts.map((amt, i) => (
                  <button key={amt} onClick={() => setAmountTendered(amt.toFixed(2))}
                    className={`py-2.5 rounded-xl text-xs font-bold transition-colors
                      ${amountTendered === amt.toFixed(2) ? 'bg-brand text-white' : 'bg-gray-100 text-gray-700 hover:bg-orange-50 hover:text-brand'}`}>
                    {i === 0 ? 'Exact' : `₱${amt}`}
                  </button>
                ))}
              </div>
              {amountTendered !== '' && parseFloat(amountTendered) > 0 && (
                parseFloat(amountTendered) >= total ? (
                  <div className="bg-green-50 border border-green-100 rounded-xl px-5 py-4 flex justify-between items-center">
                    <span className="text-sm font-bold text-green-700">Change</span>
                    <span className="text-3xl font-black text-green-600">₱{(parseFloat(amountTendered) - total).toFixed(2)}</span>
                  </div>
                ) : (
                  <div className="bg-red-50 border border-red-100 rounded-xl px-5 py-4 flex justify-between items-center">
                    <span className="text-sm font-bold text-red-600">Short by</span>
                    <span className="text-3xl font-black text-red-500">₱{(total - parseFloat(amountTendered)).toFixed(2)}</span>
                  </div>
                )
              )}
            </div>
          ) : (
            <div className="px-6 py-8 flex flex-col items-center gap-3">
              <div className="w-16 h-16 bg-sky-100 rounded-2xl flex items-center justify-center">
                <span className="text-2xl font-black text-sky-500">G</span>
              </div>
              <p className="text-sm text-gray-500 text-center">
                Collect <span className="font-bold text-gray-800">₱{total.toFixed(2)}</span> via GCash before confirming.
              </p>
            </div>
          )}

          <div className="px-6 pb-6 flex gap-3">
            <button onClick={() => setStep('cart')}
              className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-3 text-sm font-semibold hover:bg-gray-50">Back</button>
            <button onClick={() => setStep('table')}
              disabled={!isUnpaid && paymentMethod === 'CASH' && (amountTendered === '' || parseFloat(amountTendered) < total)}
              className={`flex-1 text-white font-bold py-3 rounded-xl text-sm disabled:opacity-40 transition-colors ${isUnpaid ? 'bg-red-500 hover:bg-red-600' : 'bg-brand hover:bg-brand-dark'}`}>
              {isUnpaid ? 'Place as Unpaid' : 'Confirm Payment'}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Table step ── */}
    {step === 'table' && (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div>
              <h2 className="text-base font-bold text-gray-800">Assign Table</h2>
              <p className="text-xs text-gray-400 mt-0.5">Select a table or skip</p>
            </div>
            <button onClick={() => setStep('payment')}
              className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-xl">✕</button>
          </div>

          <div className="px-5 py-4 max-h-80 overflow-y-auto">
            {tables.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-gray-400">No tables set up yet.</p>
                <p className="text-xs text-gray-300 mt-1">Go to Tables in the sidebar to add presets.</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {tables.map(t => (
                  <button key={t.id}
                    onClick={() => setTableNumber(tableNumber === t.name ? '' : t.name)}
                    className={`py-4 rounded-2xl text-sm font-bold transition-all border-2
                      ${tableNumber === t.name
                        ? 'bg-brand text-white border-brand shadow-md scale-[1.03]'
                        : 'bg-gray-50 text-gray-700 border-transparent hover:border-brand/30 hover:bg-orange-50'}`}>
                    {t.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {tableNumber && (
            <div className="px-5 pb-2">
              <p className="text-xs text-center text-brand font-semibold">Selected: {tableNumber}</p>
            </div>
          )}

          <div className="px-5 pb-5 pt-2 flex gap-3">
            <button onClick={() => { setTableNumber(''); place('') }} disabled={placing}
              className="flex-1 border border-gray-200 text-gray-500 rounded-xl py-3 text-sm font-semibold hover:bg-gray-50 disabled:opacity-40">Skip</button>
            <button onClick={() => place(tableNumber)} disabled={placing || !tableNumber.trim()}
              className="flex-1 bg-brand text-white font-bold py-3 rounded-xl text-sm hover:bg-brand-dark disabled:opacity-40 transition-colors">
              {placing ? 'Placing…' : 'Assign & Place'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
