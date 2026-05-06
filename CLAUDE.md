# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## What this project is

**Inasalan POS** — Django REST + Channels backend with a Next.js admin dashboard and customer-facing menu. Syncs in real-time with an Android POS app over the local network via WebSocket and REST sync endpoints.

Three surfaces:
- `http://localhost:3000/admin` — staff dashboard (orders, menu, history, analytics, inventory)
- `http://localhost:3000/menu` — customer self-ordering SPA
- `kitchen/index.html` — standalone Kitchen Display System (open directly in browser, no build step)

## Commands

### Backend
```bash
cd backend
python -m venv venv
.\venv\Scripts\activate          # Windows PowerShell
pip install -r requirements.txt
.\venv\Scripts\python manage.py migrate
daphne -b 0.0.0.0 -p 8000 inasalan_pos.asgi:application
```

> **Must use `daphne`**, not `manage.py runserver` — Django Channels WebSocket requires ASGI.
> On Windows, always use `.\venv\Scripts\python manage.py` instead of bare `python manage.py`.

### Frontend
```bash
cd frontend
npm install
npm run dev       # http://localhost:3000
npm run build
npx tsc --noEmit  # type-check only
```

### Environment variables (`frontend/.env.local`)
```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
NEXT_PUBLIC_VOID_PIN=0000
```
For LAN access from other devices, replace `localhost` with the host machine's local IP.

## Architecture

### Data models (`backend/pos/models.py`)

- **`Product`** — menu items. `variations` is a `JSONField` holding `[{name, price, output_name?}]`. `output_name` / `output_code` are for TSV sales export only. `stock` is a nullable integer for menu-item stock tracking. `android_id` ties the record to Android Room DB.
- **`Order`** — statuses: `PENDING → PREPARING → READY → COMPLETED` (or `VOIDED`). `items_json` is `[{productId, name, price, quantity, discount?, output_name?}]`. `discount` is a percentage (0–100). `source` is `'web'`, `'android'`, or `'walk-in'`. `table_number` is a string.
- **`Transaction`** — auto-created when an order reaches `COMPLETED`. One-to-one with `Order`.
- **`Table`** — named tables with `is_active` flag.
- **`RawMaterial`** — ingredient costing records. Fields: `name`, `purchase_unit`, `batch_qty`, `batch_price`, `serving_unit`, `yield_min`, `yield_max`, `stock_qty` (current on-hand in purchase_unit), `notes`.
- **`ProductIngredient`** — recipe link between a `Product` and a `RawMaterial`. `qty_per_serving` is how many `serving_unit`s of the ingredient go into one serving of the menu item. Unique on `(product, raw_material)`.

### API (`backend/pos/`)

REST via DRF router at `/api/`:

| Endpoint | Notes |
|---|---|
| `products/` | `?available=true` filters to is_available |
| `orders/` | `?status=active` excludes COMPLETED/VOIDED |
| `transactions/` | GET + PATCH only |
| `tables/` | full CRUD |
| `raw-materials/` | full CRUD |
| `product-ingredients/` | full CRUD; `?product=<id>` filter |
| `POST sync/push/` | Android bulk-pushes Room records on reconnect |
| `GET sync/pull/?since=<iso>` | Android delta-pulls changes since timestamp |

Every mutating view calls `_broadcast()` → WebSocket event to `pos_updates` group. Event types: `NEW_ORDER`, `ORDER_STATUS_UPDATE`, `PRODUCT_UPDATE`.

### WebSocket (`backend/pos/consumers.py`)
`PosConsumer` joined to `pos_updates` group. In-memory channel layer (no Redis needed).

### Frontend shared code (`frontend/app/lib/`)
- **`api.ts`** — all TypeScript types and the `api` object wrapping every REST call. All fetches go through `request<T>()`. `BASE` = `NEXT_PUBLIC_API_URL`.
- **`websocket.ts`** — `useWebSocket` hook with 3 s auto-reconnect.

### Frontend pages (all `'use client'`)

| Route | Description |
|---|---|
| `/admin` | Main dashboard — active orders, inline `TakeOrderModal`, void PIN gate, real-time via WS |
| `/admin/orders` | Active-orders board, same WS pattern |
| `/admin/menu` | Product CRUD — image upload (base64), variation editor, copy-variations modal, JSON export/import |
| `/admin/history` | Transaction table — TSV export (oldest-first), TSV import (paste → preview → create COMPLETED orders) |
| `/admin/analytics` | Sales analytics — time-frame presets, variance cards, 7 charts (recharts) |
| `/admin/inventory` | 4 tabs: Stock, Raw Stock, Costing, Recipes (see below) |
| `/admin/tables` | Table CRUD |
| `/menu` | Customer SPA — place order, poll status via WS |

### Inventory tabs (`/admin/inventory`)

- **Stock** — tracks `product.stock` per menu item with ±1 buttons. Auto-populated from Raw Stock when recipes are configured.
- **Raw Stock** — set `raw_material.stock_qty` (e.g. 25 kg of rice). On save, triggers `recalcProductStocks()` which: fetches all ProductIngredient records, calculates bottleneck yield per product (`floor(stock_qty × yield_min ÷ qty_per_serving)`), patches `product.stock` for every product with a complete recipe, and updates the Stock tab live.
- **Costing** — CRUD for RawMaterial records. Shows batch price ÷ quantity × yield = cost per serving (range if yield_min ≠ yield_max). Stock on hand also editable here.
- **Recipes** — links ingredients to menu items. Select a product, add ingredients with `qty_per_serving`. Shows per-ingredient yield from current stock and the overall bottleneck estimate (orange card).

### Delivery fee handling (`/admin/take-order`)

The "Delivery Fee" product may be deleted from the menu. The system handles this via:
- Sentinel product ID `-1` used in cart when the product doesn't exist
- Per-tier export name config stored in `localStorage` key `pos_df_output_names` as `{30: "DF1", 50: "DF2", 60: "DF3"}`
- Gear icon (visible only when DELIVERY type is selected) opens a config modal for DF1/DF2/DF3 export names
- History import reverse-maps configured DF names to delivery fee cart items

### Order discount logic
Discounts live on individual `OrderItem` entries. When a discount is applied to a line with `quantity > 1`, the item is split: `qty-1` keeps the old discount, a new line `qty=1` takes the new one. Order `total` is rounded to 2 dp before sending to the API.

### History import
TSV format: `MM/DD/YYYY \t slip_number \t output_name`, one row per item per quantity. Import groups rows by `(date, slip_number)`. Product matching: checks configured DF export names first, then `Product.output_name` / `ProductVariation.output_name` (case-insensitive). Unmatched products show in preview with an editable total field.

### Sales export
TSV sorted oldest-first. Each item uses `output_name` field on the cart item if present, otherwise looks up `Product.output_name`.

### Tailwind custom tokens (`frontend/tailwind.config.ts`)
- `bg-brand` / `text-brand` → `#F5A623` (orange)
- `bg-brand-dark` → `#E09316`
- `bg-surface` → `#F8F9FA`

## Migration history

| Migration | Description |
|---|---|
| 0001–0009 | Core models (Product, Order, Transaction, Table) |
| 0010 | `product.stock` nullable integer |
| 0011 | `RawMaterial` model |
| 0012 | `RawMaterial.stock_qty` + `ProductIngredient` model |
