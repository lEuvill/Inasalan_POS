'use client'

import { useEffect, useState, useCallback } from 'react'
import { api, Product, Order, OrderItem, OrderStatus, ProductVariation } from '@/app/lib/api'
import { useWebSocket, WsMessage } from '@/app/lib/websocket'
import { VariationPicker } from '@/app/components/VariationPicker'

const WS_URL = (process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000') + '/ws/pos/'

const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Order received! Waiting to be prepared...',
  PREPARING: 'Your order is being prepared!',
  READY: 'Your order is ready for pickup!',
  COMPLETED: 'Order completed. Enjoy your meal!',
}
const STATUS_COLOR: Record<OrderStatus, string> = {
  PENDING: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  PREPARING: 'bg-orange-50 border-orange-200 text-orange-800',
  READY: 'bg-green-50 border-green-200 text-green-800',
  COMPLETED: 'bg-gray-50 border-gray-200 text-gray-600',
}

type CartItem = OrderItem & { key: number }

export default function MenuPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [activeOrder, setActiveOrder] = useState<Order | null>(null)
  const [activeCategory, setActiveCategory] = useState<string>('All')
  const [showCart, setShowCart] = useState(false)
  const [placing, setPlacing] = useState(false)
  const [pendingProduct, setPendingProduct] = useState<Product | null>(null)

  useEffect(() => {
    api.getMenu().then(setProducts)
  }, [])

  const handleMessage = useCallback((msg: WsMessage) => {
    if (msg.type === 'ORDER_STATUS_UPDATE') {
      const updated = msg as unknown as Order
      if (activeOrder && updated.id === activeOrder.id) {
        setActiveOrder(updated)
      }
    }
  }, [activeOrder])

  useWebSocket(WS_URL, handleMessage)

  const categories = ['All', ...new Set(products.map(p => p.category).filter(Boolean))]
  const visible = activeCategory === 'All' ? products : products.filter(p => p.category === activeCategory)

  const pushToCart = (productId: number, name: string, price: number) => {
    setCart(prev => {
      const existing = prev.find(i => i.name === name)
      if (existing) return prev.map(i => i.name === name ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, { key: Date.now(), productId, name, price, quantity: 1 }]
    })
  }

  const addToCart = (product: Product) => {
    if (product.variations && product.variations.length > 0) {
      setPendingProduct(product)
    } else {
      pushToCart(product.id, product.name, parseFloat(product.price))
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

  const cartTotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0)

  const placeOrder = async () => {
    if (cart.length === 0) return
    setPlacing(true)
    try {
      const order = await api.createOrder({
        items_json: cart.map(({ key, ...rest }) => rest),
        total: cartTotal,
        source: 'web',
      })
      setActiveOrder(order)
      setCart([])
      setShowCart(false)
    } finally {
      setPlacing(false)
    }
  }

  if (activeOrder) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <div className={`max-w-sm w-full rounded-2xl border-2 p-8 text-center ${STATUS_COLOR[activeOrder.status]}`}>
          <p className="text-5xl mb-4">
            {activeOrder.status === 'READY' ? '🛎️' : activeOrder.status === 'COMPLETED' ? '✅' : '⏳'}
          </p>
          <h2 className="text-xl font-bold mb-2">Order #{activeOrder.id}</h2>
          <p className="text-sm font-medium">{STATUS_LABEL[activeOrder.status]}</p>
          <p className="mt-4 font-bold text-lg">Total: ₱{parseFloat(activeOrder.total).toFixed(2)}</p>
          {activeOrder.status === 'COMPLETED' && (
            <button
              onClick={() => setActiveOrder(null)}
              className="mt-6 bg-brand text-white font-semibold px-6 py-2 rounded-xl hover:bg-brand-dark transition-colors"
            >
              Order Again
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-brand">INASALAN</h1>
            <p className="text-xs text-gray-400">Order at your table</p>
          </div>
          <button
            onClick={() => setShowCart(true)}
            className="relative bg-brand text-white px-4 py-2 rounded-xl font-semibold text-sm hover:bg-brand-dark transition-colors"
          >
            Cart
            {cartCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Category tabs */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 flex gap-2 overflow-x-auto py-3">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeCategory === cat
                  ? 'bg-brand text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Product grid */}
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {visible.map(product => {
            const hasVariations = product.variations && product.variations.length > 0
            const count = cartCountFor(product.id)
            const singleEntry = !hasVariations ? cart.find(i => i.productId === product.id) : null
            return (
              <div key={product.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="h-32 bg-orange-50 flex items-center justify-center overflow-hidden">
                  {product.image_path
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={product.image_path} alt={product.name} className="w-full h-full object-cover" />
                    : <span className="text-4xl">🍽️</span>
                  }
                </div>
                <div className="p-3">
                  <p className="font-semibold text-sm text-gray-800 line-clamp-1">{product.name}</p>
                  {hasVariations
                    ? <p className="text-xs text-gray-400 mt-0.5">{product.variations.length} options</p>
                    : <p className="text-brand font-bold text-sm mt-0.5">₱{parseFloat(product.price).toFixed(2)}</p>
                  }
                  {!hasVariations && singleEntry ? (
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => updateQty(singleEntry.name, -1)}
                        className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 font-bold hover:bg-gray-200 flex items-center justify-center"
                      >−</button>
                      <span className="text-sm font-semibold text-gray-800 w-4 text-center">{singleEntry.quantity}</span>
                      <button
                        onClick={() => updateQty(singleEntry.name, 1)}
                        className="w-7 h-7 rounded-full bg-brand text-white font-bold hover:bg-brand-dark flex items-center justify-center"
                      >+</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => addToCart(product)}
                      className="mt-2 w-full bg-brand text-white text-xs font-semibold py-1.5 rounded-xl hover:bg-brand-dark transition-colors flex items-center justify-center gap-1"
                    >
                      {hasVariations && count > 0 ? `Add more (${count})` : 'Add'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Cart drawer */}
      {showCart && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setShowCart(false)} />
          <div className="w-full max-w-sm bg-white flex flex-col shadow-2xl">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold">Your Order</h2>
              <button onClick={() => setShowCart(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="flex-1 overflow-auto p-5 space-y-3">
              {cart.length === 0 && <p className="text-gray-400 text-center py-8">Cart is empty</p>}
              {cart.map(item => (
                <div key={item.key} className="flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800">{item.name}</p>
                    <p className="text-xs text-gray-400">₱{item.price.toFixed(2)} each</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => updateQty(item.name, -1)} className="w-6 h-6 rounded-full bg-gray-100 text-gray-600 text-xs font-bold flex items-center justify-center hover:bg-gray-200">−</button>
                    <span className="text-sm font-semibold w-4 text-center">{item.quantity}</span>
                    <button onClick={() => updateQty(item.name, 1)} className="w-6 h-6 rounded-full bg-brand text-white text-xs font-bold flex items-center justify-center hover:bg-brand-dark">+</button>
                  </div>
                  <span className="text-sm font-semibold text-gray-700 w-16 text-right">₱{(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="p-5 border-t border-gray-100">
              <div className="flex justify-between mb-4 font-bold text-gray-800">
                <span>Total</span>
                <span className="text-brand">₱{cartTotal.toFixed(2)}</span>
              </div>
              <button
                onClick={placeOrder}
                disabled={cart.length === 0 || placing}
                className="w-full bg-brand text-white font-bold py-3 rounded-xl hover:bg-brand-dark transition-colors disabled:opacity-50"
              >
                {placing ? 'Placing...' : 'Place Order'}
              </button>
            </div>
          </div>
        </div>
      )}
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
    </>
  )
}
