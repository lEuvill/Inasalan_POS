# INASALAN POS — Web Server

Django backend + Next.js frontend that syncs in real-time with the Android POS app over the local network.

## Quick Start

### 1. Django Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser   # optional, for /admin
daphne -b 0.0.0.0 -p 8000 inasalan_pos.asgi:application
```

> `daphne` (included in requirements) is required — it handles both HTTP and WebSocket. Do NOT use `manage.py runserver` as it does not support Django Channels WebSocket.

### 2. Next.js Frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000
```

Edit `.env.local` to point at the machine's local IP if accessing from another device:
```
NEXT_PUBLIC_API_URL=http://192.168.1.x:8000
NEXT_PUBLIC_WS_URL=ws://192.168.1.x:8000
```

### 3. Android App Sync

In the Android app → **Settings → Web Sync (Django)**:
- Enable the toggle
- Enter the host machine's local IP and port, e.g. `192.168.1.100:8000`

The app will pull any missed changes on startup and maintain a live WebSocket connection for real-time events.

## URL Summary

| URL | Purpose |
|-----|---------|
| `http://localhost:3000/admin` | Admin dashboard (orders, menu, history) |
| `http://localhost:3000/menu` | Customer ordering SPA |
| `http://localhost:8000/api/` | DRF browsable API |
| `http://localhost:8000/admin/` | Django admin |
| `ws://localhost:8000/ws/pos/` | WebSocket endpoint |
| `http://localhost:8000/api/sync/push/` | Android bulk sync push |
| `http://localhost:8000/api/sync/pull/` | Android delta pull |
