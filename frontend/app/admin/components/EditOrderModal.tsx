'use client'

import { useEffect, useState } from 'react'
import { api, Order, Product, OrderItem, ProductVariation, PaymentMethod } from '@/app/lib/api'
import { VariationPicker } from '@/app/components/VariationPicker'

export function EditOrderModal({
  orderId,
  onClose,
  onSaved,
}: {
  orderId: number
  onClose: () => void
  onSaved: (updated: Order) => void
}) {
  const [order, setOrder] = useState<Order | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<OrderItem[]>([])
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('')
  const [completedAt, setCompletedAt] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [pendingProduct, setPendingProduct] = useState<Product | null>(null)

  useEffect(() => {
    Promise.all([api.getOrder(orderId), api.getMenu()]).then(([ord, prods]) => {
      setOrder(ord)
      setCart(ord.items_json)
      setPaymentMethod(ord.payment_method)
      if (ord.transaction?.completed_at) {
        const d = new Date(ord.transaction.completed_at)
        const pad = (n: number) => String(n).padStart(2, '0')
        setCompletedAt(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`)
      }
      setProducts(prods)
      setLoading(false)
    })
  }, [orderId])

  const categories = ['All', ...new Set(products.map(p => p.category).filter(Boolean))]
  const visible = activeCategory === 'All' ? products : products.filter(p => p.category === activeCategory)

  const pushToCart = (productId: number, name: string, price: number) => {
    setCart(prev => {
      const existing = prev.find(i => i.name === name)
      if (existing) return prev.map(i => i.name === name ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, { productId, name, price, quantity: 1 }]
    })
  }

  const addItem = (p: Product) => {
    if (p.variations && p.variations.length > 0) {
      setPendingProduct(p)
    } else {
      pushToCart(p.id, p.name, parseFloat(p.price))
    }
  }

  const updateQty = (name: string, delta: number) => {
    setCart(prev =>
      prev.map(i => i.name === name ? { ...i, quantity: i.quantity + delta } : i)
          .filter(i => i.quantity > 0)
    )
  }

  const cartCountFor = (productId: number) =>
    cart.filter(i => i.productId === productId).reduce((s, i) => s + i.quantity, 0)

  const [pendingEdit, setPendingEdit] = useState<{ item: OrderItem; product: Product } | null>(null)

  const replaceVariation = (oldName: string, newName: string, newPrice: number, productId: number, qty: number) => {
    setCart(prev => {
      const pos = prev.findIndex(i => i.name === oldName)
      const without = prev.filter(i => i.name !== oldName)
      const existing = without.find(i => i.name === newName)
      if (existing) {
        return without.map(i => i.name === newName ? { ...i, quantity: i.quantity + qty } : i)
      }
      const result = [...without]
      result.splice(pos, 0, { productId, name: newName, price: newPrice, quantity: qty })
      return result
    })
  }

  const total = Math.round(cart.reduce((sum, i) => sum + i.price * (1 - (i.discount ?? 0) / 100) * i.quantity, 0) * 100) / 100

  const save = async () => {
    if (!order) return
    setSaving(true)
    try {
      const patchData: Parameters<typeof api.patchOrder>[1] = { items_json: cart, total }
      if (paymentMethod) patchData.payment_method = paymentMethod as PaymentMethod
      const updated = await api.patchOrder(order.id, patchData)
      // If completed, also update the linked transaction total and date
      if (updated.transaction) {
        const txPatch: { total?: number; completed_at?: string } = { total }
        if (completedAt) txPatch.completed_at = new Date(completedAt).toISOString()
        await api.patchTransaction(updated.transaction.id, txPatch)
      }
      onSaved(updated)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Edit Order #{orderId}</h2>
            {order && (
              <p className="text-xs text-gray-400 mt-0.5">
                Status: <span className="font-semibold">{order.status}</span>
                {order.status === 'COMPLETED' && ' — updating will also adjust the transaction total'}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">Loading order…</div>
        ) : (
          <div className="flex flex-1 overflow-hidden">

            {/* Left — Menu picker */}
            <div className="flex-1 flex flex-col overflow-hidden border-r border-gray-100">
              <div className="flex gap-2 px-4 py-3 overflow-x-auto border-b border-gray-100">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-colors
                      ${activeCategory === cat ? 'bg-brand text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                <p className="text-xs text-gray-400 mb-3">Tap to add items to the order</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {visible.map(p => {
                    const count = cartCountFor(p.id)
                    const hasVariations = p.variations && p.variations.length > 0
                    return (
                      <button
                        key={p.id}
                        onClick={() => addItem(p)}
                        className="bg-gray-50 hover:bg-orange-50 border border-gray-100 hover:border-brand rounded-xl p-3 text-left transition-all relative"
                      >
                        <div className="w-full h-16 rounded-lg overflow-hidden bg-orange-100 mb-2 flex items-center justify-center">
                          {p.image_path
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={p.image_path} alt={p.name} className="w-full h-full object-cover" />
                            : <span className="text-2xl">🍽️</span>
                          }
                        </div>
                        <p className="text-xs font-semibold text-gray-800 line-clamp-1">{p.name}</p>
                        {hasVariations
                          ? <p className="text-xs text-gray-400">({p.variations.length} options)</p>
                          : <p className="text-xs text-brand font-bold">₱{parseFloat(p.price).toFixed(2)}</p>
                        }
                        {count > 0 && (
                          <span className="absolute top-2 right-2 bg-brand text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                            {count}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Right — Current order items */}
            <div className="w-72 flex flex-col">
              <div className="px-4 pt-4 pb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Order Items</p>
              </div>
              <div className="flex-1 overflow-y-auto px-4 space-y-2">
                {cart.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center pt-8">No items</p>
                ) : cart.map(item => {
                  const parentProduct = products.find(p => p.id === item.productId)
                  const isVariation = parentProduct && parentProduct.variations && parentProduct.variations.length > 0
                  return (
                    <div key={item.name} className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-gray-400">₱{item.price.toFixed(2)}</p>
                          {isVariation && (
                            <button
                              onClick={() => setPendingEdit({ item, product: parentProduct! })}
                              className="text-xs text-brand font-semibold hover:underline leading-none"
                            >change</button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => updateQty(item.name, -1)}
                          className="w-6 h-6 rounded-full bg-gray-100 text-gray-600 text-sm font-bold flex items-center justify-center hover:bg-gray-200"
                        >−</button>
                        <span className="w-5 text-center text-sm font-semibold">{item.quantity}</span>
                        <button
                          onClick={() => updateQty(item.name, 1)}
                          className="w-6 h-6 rounded-full bg-brand text-white text-sm font-bold flex items-center justify-center hover:bg-brand-dark"
                        >+</button>
                      </div>
                      <span className="text-sm font-semibold text-gray-700 w-14 text-right shrink-0">
                        ₱{(item.price * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  )
                })}
              </div>

              <div className="border-t border-gray-100 p-4 space-y-3">
                <div className="flex justify-between font-bold text-gray-800">
                  <span>Total</span>
                  <span className="text-brand text-lg">₱{total.toFixed(2)}</span>
                </div>
                {/* Date/time (only for completed orders with a transaction) */}
                {order?.status === 'COMPLETED' && completedAt && (
                  <div>
                    <label className="text-xs text-gray-400 font-semibold uppercase tracking-wide block mb-1">Date &amp; Time</label>
                    <input
                      type="datetime-local"
                      value={completedAt}
                      onChange={e => setCompletedAt(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:border-brand"
                    />
                  </div>
                )}
                {/* Payment method toggle */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setPaymentMethod('CASH')}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors
                      ${paymentMethod === 'CASH'
                        ? 'bg-green-500 border-green-500 text-white'
                        : 'bg-white border-gray-200 text-gray-400 hover:border-green-400'}`}
                  >CASH</button>
                  <button
                    onClick={() => setPaymentMethod('GCASH')}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors
                      ${paymentMethod === 'GCASH'
                        ? 'bg-sky-500 border-sky-500 text-white'
                        : 'bg-white border-gray-200 text-gray-400 hover:border-sky-400'}`}
                  >GCASH</button>
                </div>
                <button
                  onClick={save}
                  disabled={cart.length === 0 || saving}
                  className="w-full bg-brand text-white font-bold py-3 rounded-xl hover:bg-brand-dark transition-colors disabled:opacity-40 text-sm"
                >
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>

    {pendingProduct && (
      <VariationPicker
        productName={pendingProduct.name}
        variations={pendingProduct.variations}
        onSelect={(v: ProductVariation) => {
          pushToCart(pendingProduct.id, `${pendingProduct.name} - ${v.name}`, parseFloat(v.price))
          setPendingProduct(null)
        }}
        onCancel={() => setPendingProduct(null)}
      />
    )}

    {pendingEdit && (
      <VariationPicker
        productName={`Change: ${pendingEdit.product.name}`}
        variations={pendingEdit.product.variations}
        onSelect={(v: ProductVariation) => {
          const newName = `${pendingEdit.product.name} - ${v.name}`
          if (newName !== pendingEdit.item.name) {
            replaceVariation(pendingEdit.item.name, newName, parseFloat(v.price), pendingEdit.product.id, pendingEdit.item.quantity)
          }
          setPendingEdit(null)
        }}
        onCancel={() => setPendingEdit(null)}
      />
    )}
    </>
  )
}
