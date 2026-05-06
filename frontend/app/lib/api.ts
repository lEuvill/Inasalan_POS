const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export type ProductVariation = {
  name: string
  price: string
  output_name?: string
}

export type Product = {
  id: number
  android_id: number | null
  name: string
  price: string
  category: string
  image_path: string
  is_available: boolean
  variations: ProductVariation[]
  output_name: string
  stock: number | null
}

export type OrderItem = {
  productId: number
  name: string
  price: number
  quantity: number
  discount?: number
  output_name?: string
}

export type OrderStatus = 'PENDING' | 'PREPARING' | 'READY' | 'COMPLETED' | 'VOIDED'

export type OrderType = 'DINE_IN' | 'TAKE_OUT' | 'DELIVERY' | 'PICK_UP'
export type PaymentMethod = 'CASH' | 'GCASH'

export type Order = {
  id: number
  android_id: number | null
  slip_number: string | null
  order_type: OrderType | ''
  payment_method: PaymentMethod | ''
  table_number: string
  items_json: OrderItem[]
  total: string
  status: OrderStatus
  source: string
  created_at: string
  transaction?: Transaction
}

export type Transaction = {
  id: number
  order: number
  android_id: number | null
  total: string
  completed_at: string
  order_detail: {
    id: number
    slip_number: string | null
    order_type: OrderType | ''
    payment_method: PaymentMethod | ''
    items_json: OrderItem[]
  }
}

export type Table = {
  id: number
  name: string
  is_active: boolean
}

export type RawMaterial = {
  id: number
  name: string
  purchase_unit: string
  batch_qty: string
  batch_price: string
  serving_unit: string
  yield_min: string
  yield_max: string
  notes: string
  updated_at: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  // Products
  getMenu: () => request<Product[]>('/api/products/?available=true'),
  getProducts: () => request<Product[]>('/api/products/'),
  createProduct: (data: Omit<Product, 'id' | 'android_id'>) =>
    request<Product>('/api/products/', { method: 'POST', body: JSON.stringify(data) }),
  updateProduct: (id: number, data: Partial<Product>) =>
    request<Product>(`/api/products/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteProduct: (id: number) =>
    request<void>(`/api/products/${id}/`, { method: 'DELETE' }),

  // Orders
  getOrders: (activeOnly = false) =>
    request<Order[]>(`/api/orders/${activeOnly ? '?status=active' : ''}`),
  getOrder: (id: number) =>
    request<Order>(`/api/orders/${id}/`),
  createOrder: (data: { items_json: OrderItem[]; total: number; source?: string; slip_number?: string; order_type?: OrderType; payment_method?: PaymentMethod; table_number?: string; status?: OrderStatus; completed_at?: string }) =>
    request<Order>('/api/orders/', { method: 'POST', body: JSON.stringify(data) }),
  deleteOrder: (id: number) =>
    request<void>(`/api/orders/${id}/`, { method: 'DELETE' }),
  updateOrderStatus: (id: number, status: OrderStatus) =>
    request<Order>(`/api/orders/${id}/`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  voidOrder: (id: number) =>
    request<Order>(`/api/orders/${id}/`, { method: 'PATCH', body: JSON.stringify({ status: 'VOIDED' }) }),
  patchOrder: (id: number, data: { items_json: OrderItem[]; total: number }) =>
    request<Order>(`/api/orders/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),

  // Transactions
  getTransactions: () => request<Transaction[]>('/api/transactions/'),
  patchTransaction: (id: number, data: { total: number }) =>
    request<Transaction>(`/api/transactions/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),

  // Tables
  getTables: () => request<Table[]>('/api/tables/'),
  createTable: (data: { name: string; is_active?: boolean }) =>
    request<Table>('/api/tables/', { method: 'POST', body: JSON.stringify(data) }),
  updateTable: (id: number, data: Partial<Pick<Table, 'name' | 'is_active'>>) =>
    request<Table>(`/api/tables/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTable: (id: number) =>
    request<void>(`/api/tables/${id}/`, { method: 'DELETE' }),

  // Raw Materials
  getRawMaterials: () => request<RawMaterial[]>('/api/raw-materials/'),
  createRawMaterial: (data: Omit<RawMaterial, 'id' | 'updated_at'>) =>
    request<RawMaterial>('/api/raw-materials/', { method: 'POST', body: JSON.stringify(data) }),
  updateRawMaterial: (id: number, data: Partial<Omit<RawMaterial, 'id' | 'updated_at'>>) =>
    request<RawMaterial>(`/api/raw-materials/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteRawMaterial: (id: number) =>
    request<void>(`/api/raw-materials/${id}/`, { method: 'DELETE' }),
}
