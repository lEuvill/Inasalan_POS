import { OrderItem, OrderType, PaymentMethod, Product, api } from './api'

export type ReceiptData = {
  slipNumber?: string
  orderType: OrderType | ''
  paymentMethod: PaymentMethod | ''
  tableNumber?: string
  items: OrderItem[]
  total: number
  amountTendered?: number
  date: Date
}

export type PrintSettings = {
  bodyWidth: number   // mm — content area width
  marginLeft: number  // mm — body left offset from driver edge
  fontSize: number    // mm — base font size
  lineHeight: number  // unitless multiplier
}

export type PrintFormat = 'receipt' | 'kitchen' | 'griller'
export type AllPrintSettings = Record<PrintFormat, PrintSettings>

const FORMAT_DEFAULTS: AllPrintSettings = {
  receipt: { bodyWidth: 40, marginLeft: 0, fontSize: 2.8, lineHeight: 1.4 },
  kitchen: { bodyWidth: 40, marginLeft: 0, fontSize: 3.5, lineHeight: 1.4 },
  griller: { bodyWidth: 40, marginLeft: 0, fontSize: 3.5, lineHeight: 1.4 },
}

const LS_KEY     = 'pos_print_settings_v2'
const LS_KEY_OLD = 'pos_print_settings'

export function loadAllPrintSettings(): AllPrintSettings {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const p = JSON.parse(raw)
      return {
        receipt: { ...FORMAT_DEFAULTS.receipt, ...p.receipt },
        kitchen: { ...FORMAT_DEFAULTS.kitchen, ...p.kitchen },
        griller: { ...FORMAT_DEFAULTS.griller, ...p.griller },
      }
    }
    // Migrate from old single-format key — apply old value to receipt only
    const old = localStorage.getItem(LS_KEY_OLD)
    if (old) {
      return { ...FORMAT_DEFAULTS, receipt: { ...FORMAT_DEFAULTS.receipt, ...JSON.parse(old) } }
    }
  } catch {}
  return { ...FORMAT_DEFAULTS }
}

export function saveAllPrintSettings(all: AllPrintSettings) {
  localStorage.setItem(LS_KEY, JSON.stringify(all))
}

function loadFormatSettings(format: PrintFormat): PrintSettings {
  return loadAllPrintSettings()[format]
}

const ORDER_TYPE_LABEL: Record<string, string> = {
  DINE_IN: 'Dine In', TAKE_OUT: 'Take Out', DELIVERY: 'Delivery', PICK_UP: 'Pick Up',
}

// ── Print queue ──────────────────────────────────────────────────────────────
// Multiple window.print() calls fired simultaneously cause each job's
// @media print { body > *:not(#X) { display:none } } to hide the other jobs'
// content. The queue ensures only one dialog is open at a time.
const printQueue: Array<() => void> = []
let printBusy = false

function enqueuePrint(job: () => void) {
  printQueue.push(job)
  if (!printBusy) startNextPrint()
}

function startNextPrint() {
  if (printQueue.length === 0) { printBusy = false; return }
  printBusy = true
  printQueue.shift()!()
}

function runPrintJob(id: string, html: string, buildCss: (hMm: number) => string, bodyWidthMm: number) {
  document.getElementById(id)?.remove()
  document.getElementById(`${id}_style`)?.remove()

  const styleEl = document.createElement('style')
  styleEl.id = `${id}_style`
  styleEl.textContent = buildCss(200)

  const wrapEl = document.createElement('div')
  wrapEl.id = id
  wrapEl.innerHTML = html
  wrapEl.style.cssText = `position:absolute;top:-9999px;width:${bodyWidthMm}mm`

  document.head.appendChild(styleEl)
  document.body.appendChild(wrapEl)

  const hMm = Math.max(Math.ceil(wrapEl.scrollHeight * 0.2646) + 6, 100)
  styleEl.textContent = buildCss(hMm)

  const finish = () => {
    clearTimeout(fallback)
    document.getElementById(id)?.remove()
    document.getElementById(`${id}_style`)?.remove()
    startNextPrint()
  }

  // Fallback in case afterprint never fires (printer error, no printer installed, etc.)
  const fallback = setTimeout(finish, 60_000)

  window.addEventListener('afterprint', finish, { once: true })

  setTimeout(() => window.print(), 50)
}

// ── Receipt ───────────────────────────────────────────────────────────────────
export function printReceipt(data: ReceiptData) {
  const s = loadFormatSettings('receipt')

  const change =
    data.paymentMethod === 'CASH' &&
    data.amountTendered != null &&
    data.amountTendered >= data.total
      ? data.amountTendered - data.total
      : null

  const dateStr = data.date.toLocaleDateString('en-PH', { month: '2-digit', day: '2-digit', year: 'numeric' })
  const timeStr = data.date.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })

  const itemRows = data.items.map(item => {
    const disc = item.discount ?? 0
    const effectivePrice = item.price * (1 - disc / 100)
    const lineTotal = effectivePrice * item.quantity
    const discSaving = item.price * (disc / 100) * item.quantity
    const discRow = disc > 0
      ? `<div class="pr-row pr-disc-row"><span>(${disc}% off)</span><span>-&#8369;${discSaving.toFixed(2)}</span></div>`
      : ''
    return `<div class="pr-row pr-item-row"><span class="pr-name">${item.quantity}x ${escHtml(item.name)}</span><span class="pr-amount">&#8369;${lineTotal.toFixed(2)}</span></div>${discRow}`
  }).join('')

  const metaSlip  = data.slipNumber    ? `<div class="pr-row pr-meta"><span>Slip #</span><span>${escHtml(data.slipNumber)}</span></div>` : ''
  const metaType  = data.orderType     ? `<div class="pr-row pr-meta"><span>Type</span><span>${ORDER_TYPE_LABEL[data.orderType] ?? data.orderType}</span></div>` : ''
  const metaPay   = data.paymentMethod ? `<div class="pr-row pr-meta"><span>Payment</span><span>${data.paymentMethod === 'GCASH' ? 'GCash' : 'Cash'}</span></div>` : ''
  const metaTable = data.tableNumber   ? `<div class="pr-row pr-meta"><span>Table</span><span>${escHtml(data.tableNumber)}</span></div>` : ''
  const cashRow   = data.paymentMethod === 'CASH' && data.amountTendered != null
    ? `<div class="pr-row pr-totals-row"><span>Cash</span><span>&#8369;${data.amountTendered.toFixed(2)}</span></div>` : ''
  const changeBlock = change != null
    ? `<div class="pr-divider pr-solid"></div><div class="pr-row pr-change-row"><span>CHANGE</span><span>&#8369;${change.toFixed(2)}</span></div>` : ''

  const fs = s.fontSize
  const fsSm = (fs * 0.79).toFixed(2)
  const fsDisc = (fs * 0.71).toFixed(2)
  const W = '#_pr'

  const html = [
    `<div class="pr-center pr-store-name">INASALAN</div>`,
    `<div class="pr-center pr-store-sub">Order Receipt</div>`,
    `<div class="pr-divider pr-solid"></div>`,
    `<div class="pr-row pr-meta"><span>${dateStr}</span><span>${timeStr}</span></div>`,
    metaSlip, metaType, metaPay, metaTable,
    `<div class="pr-divider pr-dashed"></div>`,
    itemRows,
    `<div class="pr-divider pr-dashed"></div>`,
    `<div class="pr-row pr-grand-row"><span>TOTAL</span><span>&#8369;${data.total.toFixed(2)}</span></div>`,
    cashRow, changeBlock,
    `<div class="pr-divider pr-solid" style="margin-top:2mm"></div>`,
    `<div class="pr-center pr-footer">Thank you! Come again!</div>`,
  ].join('')

  const buildCss = (hMm: number) => [
    `@page{size:58mm ${hMm}mm;margin:0}`,
    `@media print{body>*:not(${W}){display:none!important}${W}{position:static!important;top:auto!important;display:block!important}}`,
    `${W}{box-sizing:border-box;font-family:'Courier New',Courier,monospace;font-size:${fs}mm;font-weight:bold;line-height:${s.lineHeight};width:${s.bodyWidth}mm;margin:2mm 0 0 ${s.marginLeft}mm;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}`,
    `${W} *{margin:0;padding:0;box-sizing:border-box}`,
    `${W} .pr-center{text-align:center}`,
    `${W} .pr-row{display:flex;justify-content:space-between;align-items:flex-start;gap:1mm}`,
    `${W} .pr-name{flex:1;min-width:0;word-break:break-word}`,
    `${W} .pr-amount{flex-shrink:0;white-space:nowrap;text-align:right}`,
    `${W} .pr-divider{margin:1.2mm 0}`,
    `${W} .pr-solid{border-top:0.3mm solid #000}`,
    `${W} .pr-dashed{border-top:0.3mm dashed #000}`,
    `${W} .pr-store-name{font-size:5mm;font-weight:bold;letter-spacing:0.2mm;line-height:1.2}`,
    `${W} .pr-store-sub{font-size:${fsSm}mm;margin-bottom:0.8mm}`,
    `${W} .pr-meta{font-size:${fsSm}mm;margin:0.5mm 0}`,
    `${W} .pr-item-row{font-size:${fs}mm;margin:0.8mm 0}`,
    `${W} .pr-disc-row{display:flex;justify-content:space-between;font-size:${fsDisc}mm;padding-left:2mm;margin-bottom:0.5mm}`,
    `${W} .pr-totals-row{font-size:${fs}mm;margin:0.6mm 0}`,
    `${W} .pr-grand-row{font-size:${(fs * 1.14).toFixed(2)}mm;margin:0.8mm 0}`,
    `${W} .pr-change-row{font-size:${(fs * 1.25).toFixed(2)}mm;margin:0.8mm 0}`,
    `${W} .pr-footer{font-size:${fsSm}mm;margin-top:2mm}`,
  ].join('')

  enqueuePrint(() => runPrintJob('_pr', html, buildCss, s.bodyWidth))
}

// ── Kitchen ───────────────────────────────────────────────────────────────────
export function printKitchenOrder(data: ReceiptData) {
  const s = loadFormatSettings('kitchen')
  const dateStr = data.date.toLocaleDateString('en-PH', { month: '2-digit', day: '2-digit', year: 'numeric' })
  const timeStr = data.date.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })
  const fs = s.fontSize
  const W  = '#_kp'

  const html = [
    `<div class="kp-row kp-datetime"><span>Date: ${dateStr}</span><span>Time: ${timeStr}</span></div>`,
    data.slipNumber  ? `<div class="kp-slip">Slip#: ${escHtml(data.slipNumber)}</div>` : '',
    data.orderType   ? `<div class="kp-type">${ORDER_TYPE_LABEL[data.orderType] ?? data.orderType}</div>` : '',
    data.tableNumber ? `<div class="kp-table">${escHtml(data.tableNumber)}</div>` : '',
    `<div class="kp-divider"></div>`,
    data.items.map(i => `<div class="kp-item">${i.quantity}x ${escHtml(i.name)}</div>`).join(''),
  ].join('')

  const buildCss = (hMm: number) => [
    `@page{size:58mm ${hMm}mm;margin:0}`,
    `@media print{body>*:not(${W}){display:none!important}${W}{position:static!important;top:auto!important;display:block!important}}`,
    `${W}{box-sizing:border-box;font-family:'Courier New',Courier,monospace;font-size:${fs}mm;font-weight:bold;line-height:1.3;width:${s.bodyWidth}mm;margin:2mm 0 0 ${s.marginLeft}mm;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}`,
    `${W} *{margin:0;padding:0;box-sizing:border-box}`,
    `${W} .kp-row{display:flex;justify-content:space-between}`,
    `${W} .kp-datetime{font-size:${(fs * 0.85).toFixed(2)}mm;margin-bottom:1mm}`,
    `${W} .kp-slip{font-size:${(fs * 0.85).toFixed(2)}mm;margin-bottom:1mm}`,
    `${W} .kp-type{font-size:${(fs * 1.14).toFixed(2)}mm;font-weight:bold;text-align:center;margin:1mm 0}`,
    `${W} .kp-table{font-size:${(fs * 1.5).toFixed(2)}mm;font-weight:bold;text-align:center;margin:2mm 0}`,
    `${W} .kp-divider{border-top:0.4mm solid #000;margin:2mm 0}`,
    `${W} .kp-item{font-size:${(fs * 1.14).toFixed(2)}mm;margin:1.5mm 0}`,
  ].join('')

  enqueuePrint(() => runPrintJob('_kp', html, buildCss, s.bodyWidth))
}

// ── Griller ───────────────────────────────────────────────────────────────────
const GRILLER_CATEGORIES = ['chicken', 'pork']

export async function printGrillerOrder(data: ReceiptData) {
  let products: Product[] = []
  try { products = await api.getProducts() } catch { return }

  const items = data.items.filter(item => {
    const p = products.find(p => p.id === item.productId)
    return p ? GRILLER_CATEGORIES.some(c => p.category.toLowerCase().includes(c)) : false
  })

  if (items.length === 0) return

  const s = loadFormatSettings('griller')
  const dateStr = data.date.toLocaleDateString('en-PH', { month: '2-digit', day: '2-digit', year: 'numeric' })
  const timeStr = data.date.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })
  const fs = s.fontSize
  const W  = '#_gr'

  const html = [
    `<div class="gr-row gr-datetime"><span>Date: ${dateStr}</span><span>Time: ${timeStr}</span></div>`,
    data.slipNumber  ? `<div class="gr-slip">Slip#: ${escHtml(data.slipNumber)}</div>` : '',
    data.tableNumber ? `<div class="gr-table">${escHtml(data.tableNumber)}</div>` : '',
    `<div class="gr-divider"></div>`,
    items.map(i => `<div class="gr-item">${i.quantity}x ${escHtml(i.name)}</div>`).join(''),
  ].join('')

  const buildCss = (hMm: number) => [
    `@page{size:58mm ${hMm}mm;margin:0}`,
    `@media print{body>*:not(${W}){display:none!important}${W}{position:static!important;top:auto!important;display:block!important}}`,
    `${W}{box-sizing:border-box;font-family:'Courier New',Courier,monospace;font-size:${fs}mm;font-weight:bold;line-height:1.3;width:${s.bodyWidth}mm;margin:2mm 0 0 ${s.marginLeft}mm;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}`,
    `${W} *{margin:0;padding:0;box-sizing:border-box}`,
    `${W} .gr-row{display:flex;justify-content:space-between}`,
    `${W} .gr-datetime{font-size:${(fs * 0.85).toFixed(2)}mm;margin-bottom:1mm}`,
    `${W} .gr-slip{font-size:${(fs * 0.85).toFixed(2)}mm;margin-bottom:1mm}`,
    `${W} .gr-table{font-size:${(fs * 1.5).toFixed(2)}mm;font-weight:bold;text-align:center;margin:2mm 0}`,
    `${W} .gr-divider{border-top:0.4mm solid #000;margin:2mm 0}`,
    `${W} .gr-item{font-size:${(fs * 1.14).toFixed(2)}mm;margin:1.5mm 0}`,
  ].join('')

  enqueuePrint(() => runPrintJob('_gr', html, buildCss, s.bodyWidth))
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
