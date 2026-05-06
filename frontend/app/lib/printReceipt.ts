import { OrderItem, OrderType, PaymentMethod } from './api'

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

const DEFAULTS: PrintSettings = { bodyWidth: 40, marginLeft: 0, fontSize: 2.8, lineHeight: 1.4 }
const LS_KEY = 'pos_print_settings'

export function loadPrintSettings(): PrintSettings {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {}
  return { ...DEFAULTS }
}

export function savePrintSettings(s: PrintSettings) {
  localStorage.setItem(LS_KEY, JSON.stringify(s))
}

const ORDER_TYPE_LABEL: Record<string, string> = {
  DINE_IN: 'Dine In', TAKE_OUT: 'Take Out', DELIVERY: 'Delivery', PICK_UP: 'Pick Up',
}

// XP-58C: 58mm paper, 48mm printable, 203 DPI
// @page size uses "auto" height — W3C roll-paper standard: page height = content height.
// This prevents the driver from feeding blank paper up to the 3276mm roll definition.
// @page margin:0 so CSS margins don't compound with the driver's own hardware margins.
export function printReceipt(data: ReceiptData) {
  const s = loadPrintSettings()

  const change =
    data.paymentMethod === 'CASH' &&
    data.amountTendered != null &&
    data.amountTendered >= data.total
      ? data.amountTendered - data.total
      : null

  const dateStr = data.date.toLocaleDateString('en-PH', {
    month: '2-digit', day: '2-digit', year: 'numeric',
  })
  const timeStr = data.date.toLocaleTimeString('en-PH', {
    hour: '2-digit', minute: '2-digit',
  })

  const itemRows = data.items.map(item => {
    const disc = item.discount ?? 0
    const effectivePrice = item.price * (1 - disc / 100)
    const lineTotal = effectivePrice * item.quantity
    const discSaving = item.price * (disc / 100) * item.quantity
    const discRow = disc > 0
      ? `<div class="row disc-row"><span>(${disc}% off)</span><span>-&#8369;${discSaving.toFixed(2)}</span></div>`
      : ''
    return `<div class="row item-row"><span class="name">${item.quantity}x ${escHtml(item.name)}</span><span class="amount">&#8369;${lineTotal.toFixed(2)}</span></div>${discRow}`
  }).join('')

  const metaSlip    = data.slipNumber   ? `<div class="row meta"><span>Slip #</span><span>${escHtml(data.slipNumber)}</span></div>` : ''
  const metaType    = data.orderType    ? `<div class="row meta"><span>Type</span><span>${ORDER_TYPE_LABEL[data.orderType] ?? data.orderType}</span></div>` : ''
  const metaPay     = data.paymentMethod ? `<div class="row meta"><span>Payment</span><span>${data.paymentMethod === 'GCASH' ? 'GCash' : 'Cash'}</span></div>` : ''
  const metaTable   = data.tableNumber  ? `<div class="row meta"><span>Table</span><span>${escHtml(data.tableNumber)}</span></div>` : ''
  const cashRow     = data.paymentMethod === 'CASH' && data.amountTendered != null
    ? `<div class="row totals-row"><span>Cash</span><span>&#8369;${data.amountTendered.toFixed(2)}</span></div>`
    : ''
  const changeBlock = change != null
    ? `<div class="divider solid"></div><div class="row change-row"><span>CHANGE</span><span>&#8369;${change.toFixed(2)}</span></div>`
    : ''

  const fs      = s.fontSize
  const fsSm    = (fs * 0.79).toFixed(2)   // meta rows: date, slip#, type, payment, table, footer
  const fsDisc  = (fs * 0.71).toFixed(2)   // discount sub-row

  const css = [
    `@page{size:58mm auto;margin:0}`,
    `*{margin:0;padding:0;box-sizing:border-box}`,
    `html,body{height:fit-content;overflow:visible}`,
    `body{font-family:'Courier New',Courier,monospace;font-size:${fs}mm;font-weight:bold;line-height:${s.lineHeight};width:${s.bodyWidth}mm;margin:2mm 0 0 ${s.marginLeft}mm;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}`,
    `.center{text-align:center}`,
    `.row{display:flex;justify-content:space-between;align-items:flex-start;gap:1mm}`,
    `.name{flex:1;min-width:0;word-break:break-word}`,
    `.amount{flex-shrink:0;white-space:nowrap;text-align:right}`,
    `.divider{margin:1.2mm 0}`,
    `.solid{border-top:0.3mm solid #000}`,
    `.dashed{border-top:0.3mm dashed #000}`,
    `.store-name{font-size:5mm;font-weight:bold;letter-spacing:0.2mm;line-height:1.2}`,
    `.store-sub{font-size:${fsSm}mm;margin-bottom:0.8mm}`,
    `.meta{font-size:${fsSm}mm;margin:0.5mm 0}`,
    `.item-row{font-size:${fs}mm;margin:0.8mm 0}`,
    `.disc-row{font-size:${fsDisc}mm;padding-left:2mm;margin-bottom:0.5mm}`,
    `.totals-row{font-size:${fs}mm;margin:0.6mm 0}`,
    `.grand-row{font-size:${(fs * 1.14).toFixed(2)}mm;margin:0.8mm 0}`,
    `.change-row{font-size:${(fs * 1.25).toFixed(2)}mm;margin:0.8mm 0}`,
    `.footer{font-size:${fsSm}mm;margin-top:2mm}`,
  ].join('')

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt</title><style>${css}</style></head><body><div class="center store-name">INASALAN</div><div class="center store-sub">Official Receipt</div><div class="divider solid"></div><div class="row meta"><span>${dateStr}</span><span>${timeStr}</span></div>${metaSlip}${metaType}${metaPay}${metaTable}<div class="divider dashed"></div>${itemRows}<div class="divider dashed"></div><div class="row grand-row"><span>TOTAL</span><span>&#8369;${data.total.toFixed(2)}</span></div>${cashRow}${changeBlock}<div class="divider solid" style="margin-top:2mm"></div><div class="center footer">Thank you! Come again!</div></body></html>`

  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument ?? iframe.contentWindow!.document
  doc.open()
  doc.write(html)
  doc.close()
  setTimeout(() => {
    iframe.contentWindow!.focus()
    iframe.contentWindow!.print()
    iframe.contentWindow!.addEventListener('afterprint', () => {
      if (document.body.contains(iframe)) document.body.removeChild(iframe)
    })
  }, 250)
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
