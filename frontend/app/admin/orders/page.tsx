'use client'

import { useEffect, useState, useCallback } from 'react'
import { api, Order, OrderStatus } from '@/app/lib/api'
import { useWebSocket, WsMessage } from '@/app/lib/websocket'

const WS_URL = (process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000') + '/ws/pos/'

const STATUS_NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  PENDING: 'PREPARING',
  PREPARING: 'READY',
  READY: 'COMPLETED',
}

const STATUS_COLOR: Record<OrderStatus, string> = {
  PENDING: 'bg-red-100 text-red-700',
  PREPARING: 'bg-orange-100 text-orange-700',
  READY: 'bg-green-100 text-green-700',
  COMPLETED: 'bg-gray-100 text-gray-500',
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])

  const load = useCallback(async () => {
    setOrders(await api.getOrders(true))
  }, [])

  useEffect(() => { load() }, [load])

  const handleMessage = useCallback((msg: WsMessage) => {
    if (msg.type === 'NEW_ORDER') {
      setOrders(prev => [msg as unknown as Order, ...prev])
    } else if (msg.type === 'ORDER_STATUS_UPDATE') {
      const updated = msg as unknown as Order
      setOrders(prev =>
        prev.map(o => o.id === updated.id ? updated : o)
            .filter(o => o.status !== 'COMPLETED')
      )
    }
  }, [])

  useWebSocket(WS_URL, handleMessage)

  const advance = async (order: Order) => {
    const next = STATUS_NEXT[order.status]
    if (!next) return
    await api.updateOrderStatus(order.id, next)
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Active Orders</h1>
      {orders.length === 0 ? (
        <p className="text-gray-400 text-center py-16">No active orders</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {orders.map(order => (
            <div key={order.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="font-semibold text-gray-800">Order #{order.id}</span>
                  <span className="ml-2 text-xs text-gray-400">{order.source}</span>
                </div>
                <span className={`text-xs font-bold px-3 py-1 rounded-full ${STATUS_COLOR[order.status]}`}>
                  {order.status}
                </span>
              </div>

              <ul className="text-sm text-gray-600 space-y-1 mb-4 border-t border-gray-50 pt-3">
                {order.items_json.map((item, i) => (
                  <li key={i} className="flex justify-between">
                    <span>{item.name} × {item.quantity}</span>
                    <span className="text-gray-400">₱{(item.price * item.quantity).toFixed(2)}</span>
                  </li>
                ))}
              </ul>

              <div className="flex items-center justify-between pt-3 border-t border-gray-50">
                <span className="font-bold text-gray-800">₱{order.total}</span>
                {STATUS_NEXT[order.status] && (
                  <button
                    onClick={() => advance(order)}
                    className="bg-brand text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-brand-dark transition-colors"
                  >
                    → {STATUS_NEXT[order.status]}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
