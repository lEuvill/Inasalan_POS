import { OrderItem, OrderMode, OrderType, PaymentMethod, Product, RawMaterial, api } from './api'

export type ReceiptData = {
  slipNumber?: string
  ownerName?: string
  orderType: OrderType | ''
  paymentMethod: PaymentMethod | ''
  tableNumber?: string
  items: OrderItem[]
  total: number
  amountTendered?: number
  isUnpaid?: boolean
  orderMode?: OrderMode
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

// ── Extra Rice Voucher ────────────────────────────────────────────────────────
export function printExtraRiceVoucher(qty: number, voucherNo: number) {
  const s = loadFormatSettings('receipt')
  const dateStr = new Date().toLocaleDateString('en-PH', { month: '2-digit', day: '2-digit', year: 'numeric' })
  const timeStr = new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })
  const fs = s.fontSize
  const fsSm = (fs * 0.79).toFixed(2)
  const W = '#_er'

  const html = [
    `<div class="pr-center pr-store-name">INASALAN</div>`,
    `<div class="pr-center pr-store-sub">Employee Rice Voucher</div>`,
    `<div class="pr-divider pr-solid"></div>`,
    `<div class="pr-row pr-meta"><span>${dateStr}</span><span>${timeStr}</span></div>`,
    `<div class="pr-row pr-meta"><span>Voucher #</span><span>${voucherNo}</span></div>`,
    `<div class="pr-divider pr-dashed"></div>`,
    `<div class="pr-row pr-item-row"><span class="pr-name">${qty}x Extra Rice</span></div>`,
    `<div class="pr-divider pr-solid" style="margin-top:2mm"></div>`,
    `<div class="pr-center pr-footer">For employee use only</div>`,
  ].join('')

  const buildCss = (hMm: number) => [
    `@page{size:58mm ${hMm}mm;margin:0}`,
    `@media print{body>*:not(${W}){display:none!important}${W}{position:static!important;top:auto!important;display:block!important}}`,
    `${W}{box-sizing:border-box;font-family:'Courier New',Courier,monospace;font-size:${fs}mm;font-weight:bold;line-height:${s.lineHeight};width:${s.bodyWidth}mm;margin:2mm 0 0 ${s.marginLeft}mm;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}`,
    `${W} *{margin:0;padding:0;box-sizing:border-box}`,
    `${W} .pr-center{text-align:center}`,
    `${W} .pr-row{display:flex;justify-content:space-between;align-items:flex-start;gap:1mm}`,
    `${W} .pr-name{flex:1;min-width:0;word-break:break-word}`,
    `${W} .pr-divider{margin:1.2mm 0}`,
    `${W} .pr-solid{border-top:0.3mm solid #000}`,
    `${W} .pr-dashed{border-top:0.3mm dashed #000}`,
    `${W} .pr-store-name{font-size:5mm;font-weight:bold;letter-spacing:0.2mm;line-height:1.2}`,
    `${W} .pr-store-sub{font-size:${fsSm}mm;margin-bottom:0.8mm}`,
    `${W} .pr-meta{font-size:${fsSm}mm;margin:0.5mm 0}`,
    `${W} .pr-item-row{font-size:${(fs * 1.14).toFixed(2)}mm;margin:2mm 0;text-align:center;justify-content:center}`,
    `${W} .pr-footer{font-size:${fsSm}mm;margin-top:2mm}`,
  ].join('')

  enqueuePrint(() => runPrintJob('_er', html, buildCss, s.bodyWidth))
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
  const metaName  = data.ownerName     ? `<div class="pr-row pr-meta"><span>Name</span><span>${escHtml(data.ownerName)}</span></div>` : ''
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
    metaSlip, metaName, metaType, metaPay, metaTable,
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

// ── Cashier receipt ───────────────────────────────────────────────────────────
// Same paper as customer receipt but includes a prominent PAID / UNPAID banner.
export function printCashierReceipt(data: ReceiptData) {
  const s = loadFormatSettings('receipt')

  const change =
    !data.isUnpaid &&
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
  const metaName  = data.ownerName     ? `<div class="pr-row pr-meta"><span>Name</span><span>${escHtml(data.ownerName)}</span></div>` : ''
  const metaType  = data.orderType     ? `<div class="pr-row pr-meta"><span>Type</span><span>${ORDER_TYPE_LABEL[data.orderType] ?? data.orderType}</span></div>` : ''
  const metaPay   = data.paymentMethod ? `<div class="pr-row pr-meta"><span>Payment</span><span>${data.paymentMethod === 'GCASH' ? 'GCash' : 'Cash'}</span></div>` : ''
  const metaTable = data.tableNumber   ? `<div class="pr-row pr-meta"><span>Table</span><span>${escHtml(data.tableNumber)}</span></div>` : ''
  const cashRow   = !data.isUnpaid && data.paymentMethod === 'CASH' && data.amountTendered != null
    ? `<div class="pr-row pr-totals-row"><span>Cash</span><span>&#8369;${data.amountTendered.toFixed(2)}</span></div>` : ''
  const changeBlock = change != null
    ? `<div class="pr-divider pr-solid"></div><div class="pr-row pr-change-row"><span>CHANGE</span><span>&#8369;${change.toFixed(2)}</span></div>` : ''

  const fs = s.fontSize
  const fsSm = (fs * 0.79).toFixed(2)
  const fsDisc = (fs * 0.71).toFixed(2)
  const W = '#_cr'

  const statusBanner = data.orderMode === 'EMPLOYEE'
    ? `<div class="cr-status cr-employee">** EMPLOYEE **</div>`
    : data.orderMode === 'WASTE'
    ? `<div class="cr-status cr-waste">** WASTE **</div>`
    : data.isUnpaid
    ? `<div class="cr-status cr-unpaid">** UNPAID **</div>`
    : `<div class="cr-status cr-paid">** PAID **</div>`

  const footer = data.orderMode === 'EMPLOYEE'
    ? `<div class="pr-center pr-footer">Employee order</div>`
    : data.orderMode === 'WASTE'
    ? `<div class="pr-center pr-footer">Waste record</div>`
    : data.isUnpaid
    ? `<div class="pr-center pr-footer">Collect payment before completing.</div>`
    : `<div class="pr-center pr-footer">Thank you! Come again!</div>`

  const html = [
    `<div class="pr-center pr-store-name">INASALAN</div>`,
    `<div class="pr-center pr-store-sub">Cashier Copy</div>`,
    `<div class="pr-divider pr-solid"></div>`,
    statusBanner,
    `<div class="pr-divider pr-solid"></div>`,
    `<div class="pr-row pr-meta"><span>${dateStr}</span><span>${timeStr}</span></div>`,
    metaSlip, metaName, metaType, metaPay, metaTable,
    `<div class="pr-divider pr-dashed"></div>`,
    itemRows,
    `<div class="pr-divider pr-dashed"></div>`,
    `<div class="pr-row pr-grand-row"><span>TOTAL</span><span>&#8369;${data.total.toFixed(2)}</span></div>`,
    cashRow, changeBlock,
    `<div class="pr-divider pr-solid" style="margin-top:2mm"></div>`,
    footer,
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
    `${W} .cr-status{text-align:center;font-size:${(fs * 1.3).toFixed(2)}mm;font-weight:bold;letter-spacing:0.5mm;margin:2mm 0;padding:1mm 0}`,
    `${W} .cr-unpaid{border:0.4mm solid #000}`,
    `${W} .cr-employee{border:0.4mm solid #000}`,
    `${W} .cr-waste{border:0.4mm solid #000}`,
  ].join('')

  enqueuePrint(() => runPrintJob('_cr', html, buildCss, s.bodyWidth))
}

// ── Expense receipt ───────────────────────────────────────────────────────────
export function printExpenseReceipt(expense: {
  items: { description: string; amount: string; date: string }[]
  category?: string
  date?: string
  notes?: string
}) {
  const s = loadFormatSettings('receipt')
  const fs = s.fontSize
  const fsSm = (fs * 0.79).toFixed(2)
  const W = '#_exp'

  const printTimeStr = new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })
  const printDateStr = new Date().toLocaleDateString('en-PH', { month: '2-digit', day: '2-digit', year: 'numeric' })
  const catRow = expense.category
    ? `<div class="pr-row pr-meta"><span>Category</span><span>${escHtml(expense.category)}</span></div>`
    : ''
  const notesRow = expense.notes
    ? `<div class="ex-notes">${escHtml(expense.notes)}</div>`
    : ''
  const total = expense.items.reduce((s, i) => s + parseFloat(i.amount || '0'), 0)
  const itemRows = expense.items.map(item => {
    const d = new Date(item.date + 'T00:00:00')
    const itemDate = `${d.getMonth() + 1}/${d.getDate()}`
    return `<div class="pr-row ex-item-row"><span class="ex-date">${itemDate}</span><span class="pr-name">${escHtml(item.description)}</span><span class="pr-amount">&#8369;${parseFloat(item.amount).toFixed(2)}</span></div>`
  }).join('')

  const html = [
    `<div class="pr-center pr-store-name">INASALAN</div>`,
    `<div class="pr-center pr-store-sub">Expense Record</div>`,
    `<div class="pr-divider pr-solid"></div>`,
    `<div class="pr-row pr-meta"><span>${printDateStr}</span><span>${printTimeStr}</span></div>`,
    catRow,
    `<div class="pr-divider pr-dashed"></div>`,
    itemRows,
    notesRow,
    `<div class="pr-divider pr-dashed"></div>`,
    `<div class="pr-row pr-grand-row"><span>TOTAL</span><span>&#8369;${total.toFixed(2)}</span></div>`,
    `<div class="pr-divider pr-solid" style="margin-top:2mm"></div>`,
    `<div class="pr-center pr-footer">Expense recorded</div>`,
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
    `${W} .ex-item-row{font-size:${fs}mm;margin:0.8mm 0}`,
    `${W} .ex-date{flex-shrink:0;white-space:nowrap;margin-right:1mm;opacity:0.6}`,
    `${W} .ex-notes{font-size:${fsSm}mm;font-style:italic;margin:0.5mm 0 0.5mm 0}`,
    `${W} .pr-grand-row{font-size:${(fs * 1.14).toFixed(2)}mm;margin:0.8mm 0}`,
    `${W} .pr-footer{font-size:${fsSm}mm;margin-top:2mm}`,
  ].join('')

  enqueuePrint(() => runPrintJob('_exp', html, buildCss, s.bodyWidth))
}

// ── Inventory count sheet ─────────────────────────────────────────────────────
export type InventoryPrintSettings = {
  areaColumns: string[]   // area column header names
  rowHeightMm: number     // blank writing space height per cell (mm)
  colPaddingMm: number    // horizontal padding inside each cell (mm)
}

export function printInventorySheet(
  materials: RawMaterial[],
  fontSize: number,
  mode: 'list' | 'with-count',
  settings: InventoryPrintSettings,
) {
  const fsMm   = (fontSize * 0.2646).toFixed(2)
  const fsSmMm = (fontSize * 0.2646 * 0.82).toFixed(2)
  const fsLgMm = (fontSize * 0.2646 * 1.3).toFixed(2)
  const W = '#_inv'
  const showSysStock = mode === 'with-count'

  // A4 content width: 186mm (210mm - 2×12mm margin)
  const TOTAL_W  = 186
  const NAME_W   = 70
  const SYS_W    = 24
  const rawAreaCols = settings.areaColumns && settings.areaColumns.length > 0 ? settings.areaColumns : ['Count']
  const areaCols  = mode === 'list' ? [] : rawAreaCols
  const colCount  = areaCols.length
  const usedFixed = NAME_W + (showSysStock ? SYS_W : 0)
  const areaColW  = colCount > 0 ? Math.max(20, Math.floor((TOTAL_W - usedFixed) / colCount)) : 0
  const rowH      = Math.max(5, settings.rowHeightMm)
  const colPad    = Math.max(1, settings.colPaddingMm)

  const now     = new Date()
  const dateStr = now.toLocaleDateString('en-PH', { month: '2-digit', day: '2-digit', year: 'numeric' })
  const timeStr = now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })

  // Group by category, sorted alpha, uncategorized last
  const catMap = new Map<string, RawMaterial[]>()
  for (const m of [...materials].sort((a, b) => a.name.localeCompare(b.name))) {
    const cat = m.category || ''
    if (!catMap.has(cat)) catMap.set(cat, [])
    catMap.get(cat)!.push(m)
  }
  const named         = [...catMap.entries()].filter(([k]) => k !== '').sort(([a], [b]) => a.localeCompare(b))
  const uncategorized = catMap.get('') ?? []
  const groups: { label: string; items: RawMaterial[] }[] = [
    ...named.map(([label, items]) => ({ label, items })),
    ...(uncategorized.length ? [{ label: '', items: uncategorized }] : []),
  ]

  const fmtQty = (n: number) => n % 1 === 0 ? String(n) : n.toFixed(2)
  const totalCols = 1 + (showSysStock ? 1 : 0) + colCount

  const colgroup = [
    `<col style="width:${NAME_W}mm">`,
    showSysStock ? `<col style="width:${SYS_W}mm">` : '',
    ...areaCols.map(() => `<col style="width:${areaColW}mm">`),
  ].join('')

  // Header — use inline style for background so it prints in all browsers
  const thead = `<thead><tr>` +
    `<th class="iv-th iv-th-name" style="background:#000;color:#fff">INGREDIENT</th>` +
    (showSysStock ? `<th class="iv-th iv-th-c" style="background:#000;color:#fff">SYS. COUNT</th>` : '') +
    areaCols.map(col => `<th class="iv-th iv-th-c" style="background:#000;color:#fff">${escHtml(col)}</th>`).join('') +
    `</tr></thead>`

  // Body rows
  const tbodyRows: string[] = []
  for (const { label, items } of groups) {
    if (!items.length) continue
    tbodyRows.push(
      `<tr><td colspan="${totalCols}" class="iv-cat-cell">${escHtml(label || 'Uncategorized')}</td></tr>`
    )
    for (const m of items) {
      const rawStock = m.stock_qty?.trim() ?? ''
      const stockQty = parseFloat(rawStock)
      const sysDisplay = rawStock !== '' && !isNaN(stockQty) ? fmtQty(stockQty) : '—'
      tbodyRows.push(
        `<tr class="iv-data-row">` +
        `<td class="iv-td iv-td-name">${escHtml(m.name)}</td>` +
        (showSysStock ? `<td class="iv-td iv-td-c">${sysDisplay}</td>` : '') +
        areaCols.map(() => `<td class="iv-td iv-td-blank"><div class="iv-blank-inner"></div></td>`).join('') +
        `</tr>`
      )
    }
  }

  const subTitle = showSysStock ? 'Inventory Count Sheet' : 'Inventory List'

  const html = [
    `<div class="iv-center iv-title">INASALAN</div>`,
    `<div class="iv-center iv-sub">${subTitle}</div>`,
    `<div class="iv-line iv-solid"></div>`,
    `<div class="iv-meta"><span>Printed:</span><span>${dateStr} ${timeStr}</span></div>`,
    `<div class="iv-line iv-dashed"></div>`,
    `<table class="iv-table"><colgroup>${colgroup}</colgroup>${thead}<tbody>${tbodyRows.join('')}</tbody></table>`,
    `<div class="iv-sigs">`,
    `<div class="iv-sig"><div class="iv-sigline"></div><div class="iv-siglabel">Counted by</div></div>`,
    `<div class="iv-sig"><div class="iv-sigline"></div><div class="iv-siglabel">Verified by</div></div>`,
    `<div class="iv-sig"><div class="iv-sigline"></div><div class="iv-siglabel">Date &amp; Time</div></div>`,
    `</div>`,
  ].join('')

  const buildCss = (_hMm: number) => [
    `@page{size:A4;margin:10mm 12mm}`,
    `@media print{body>*:not(${W}){display:none!important}${W}{position:static!important;top:auto!important;display:block!important}}`,
    `${W}{box-sizing:border-box;font-family:'Courier New',Courier,monospace;font-size:${fsMm}mm;font-weight:bold;line-height:1.4;width:${TOTAL_W}mm;margin:0;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}`,
    `${W} *{margin:0;padding:0;box-sizing:border-box}`,
    `${W} .iv-center{text-align:center}`,
    `${W} .iv-title{font-size:${fsLgMm}mm;letter-spacing:0.3mm}`,
    `${W} .iv-sub{font-size:${fsMm}mm;margin-bottom:1mm}`,
    `${W} .iv-line{margin:1.2mm 0}`,
    `${W} .iv-solid{border-top:0.4mm solid #000}`,
    `${W} .iv-dashed{border-top:0.4mm dashed #000}`,
    `${W} .iv-meta{display:flex;justify-content:space-between;font-size:${fsSmMm}mm;margin:0.5mm 0}`,
    // Table: border on every cell for vertical + horizontal lines
    `${W} .iv-table{width:100%;border-collapse:collapse;table-layout:fixed;border:0.4mm solid #000}`,
    `${W} .iv-th{font-size:${fsSmMm}mm;padding:1mm ${colPad}mm;text-align:left;border:0.4mm solid #000;overflow:hidden}`,
    `${W} .iv-th-c{text-align:center}`,
    `${W} .iv-cat-cell{font-size:${fsSmMm}mm;padding:1.5mm ${colPad}mm 0.5mm;text-transform:uppercase;letter-spacing:0.1mm;border-left:0.4mm solid #000;border-right:0.4mm solid #000;font-style:italic;background:#f0f0f0}`,
    `${W} .iv-data-row{}`,
    `${W} .iv-td{padding:1mm ${colPad}mm;vertical-align:middle;border:0.4mm solid #000;overflow:hidden}`,
    `${W} .iv-td-name{font-size:${fsMm}mm;word-break:break-word;white-space:normal}`,
    `${W} .iv-td-c{text-align:center;font-size:${fsMm}mm}`,
    `${W} .iv-td-blank{border:0.4mm solid #000;padding:0}`,
    `${W} .iv-blank-inner{height:${rowH}mm;display:block}`,
    `${W} .iv-sigs{display:flex;justify-content:space-between;margin-top:8mm}`,
    `${W} .iv-sig{width:55mm}`,
    `${W} .iv-sigline{border-bottom:0.4mm solid #000;height:8mm;margin-bottom:1.5mm}`,
    `${W} .iv-siglabel{font-size:${fsSmMm}mm;text-align:center}`,
  ].join('')

  enqueuePrint(() => runPrintJob('_inv', html, buildCss, TOTAL_W))
}

// ── Snapshot print sheet ──────────────────────────────────────────────────────
export function printSnapshotSheet(
  savedAt: string,
  groups: { category: string; items: { name: string; purchase_unit: string; stock_qty: number | null }[] }[],
  fontSize: number,
) {
  const fsMm   = (fontSize * 0.2646).toFixed(2)
  const fsSmMm = (fontSize * 0.2646 * 0.82).toFixed(2)
  const fsLgMm = (fontSize * 0.2646 * 1.3).toFixed(2)
  const W = '#_snap'
  const TOTAL_W = 186
  const NAME_W  = 110
  const QTY_W   = 36
  const UNIT_W  = 40

  const snapDate = new Date(savedAt)
  const dateStr  = snapDate.toLocaleDateString('en-PH', { month: '2-digit', day: 'numeric', year: 'numeric' })
  const timeStr  = snapDate.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })

  const fmtQty = (n: number | null) =>
    n === null || isNaN(n) ? '—' : n % 1 === 0 ? String(n) : n.toFixed(2)

  const colgroup = [
    `<col style="width:${NAME_W}mm">`,
    `<col style="width:${QTY_W}mm">`,
    `<col style="width:${UNIT_W}mm">`,
  ].join('')

  const thead = `<thead><tr>` +
    `<th class="iv-th iv-th-name" style="background:#000;color:#fff">INGREDIENT</th>` +
    `<th class="iv-th iv-th-c" style="background:#000;color:#fff">QTY</th>` +
    `<th class="iv-th iv-th-c" style="background:#000;color:#fff">UNIT</th>` +
    `</tr></thead>`

  const tbodyRows: string[] = []
  for (const { category, items } of groups) {
    if (!items.length) continue
    tbodyRows.push(
      `<tr><td colspan="3" class="iv-cat-cell">${escHtml(category || 'Uncategorized')}</td></tr>`
    )
    for (const m of items) {
      tbodyRows.push(
        `<tr class="iv-data-row">` +
        `<td class="iv-td iv-td-name">${escHtml(m.name)}</td>` +
        `<td class="iv-td iv-td-c">${fmtQty(m.stock_qty)}</td>` +
        `<td class="iv-td iv-td-c">${escHtml(m.purchase_unit)}</td>` +
        `</tr>`
      )
    }
  }

  const html = [
    `<div class="iv-center iv-title">INASALAN</div>`,
    `<div class="iv-center iv-sub">Stock Snapshot</div>`,
    `<div class="iv-line iv-solid"></div>`,
    `<div class="iv-meta"><span>Snapshot:</span><span>${dateStr} ${timeStr}</span></div>`,
    `<div class="iv-line iv-dashed"></div>`,
    `<table class="iv-table"><colgroup>${colgroup}</colgroup>${thead}<tbody>${tbodyRows.join('')}</tbody></table>`,
  ].join('')

  const buildCss = (_hMm: number) => [
    `@page{size:A4;margin:10mm 12mm}`,
    `@media print{body>*:not(${W}){display:none!important}${W}{position:static!important;top:auto!important;display:block!important}}`,
    `${W}{box-sizing:border-box;font-family:'Courier New',Courier,monospace;font-size:${fsMm}mm;font-weight:bold;line-height:1.4;width:${TOTAL_W}mm;margin:0;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}`,
    `${W} *{margin:0;padding:0;box-sizing:border-box}`,
    `${W} .iv-center{text-align:center}`,
    `${W} .iv-title{font-size:${fsLgMm}mm;letter-spacing:0.3mm}`,
    `${W} .iv-sub{font-size:${fsMm}mm;margin-bottom:1mm}`,
    `${W} .iv-line{margin:1.2mm 0}`,
    `${W} .iv-solid{border-top:0.4mm solid #000}`,
    `${W} .iv-dashed{border-top:0.4mm dashed #000}`,
    `${W} .iv-meta{display:flex;justify-content:space-between;font-size:${fsSmMm}mm;margin:0.5mm 0}`,
    `${W} .iv-table{width:100%;border-collapse:collapse;table-layout:fixed;border:0.4mm solid #000}`,
    `${W} .iv-th{font-size:${fsSmMm}mm;padding:1mm 2mm;text-align:left;border:0.4mm solid #000;overflow:hidden}`,
    `${W} .iv-th-c{text-align:center}`,
    `${W} .iv-cat-cell{font-size:${fsSmMm}mm;padding:1.5mm 2mm 0.5mm;text-transform:uppercase;letter-spacing:0.1mm;border-left:0.4mm solid #000;border-right:0.4mm solid #000;font-style:italic;background:#f0f0f0}`,
    `${W} .iv-data-row{}`,
    `${W} .iv-td{padding:1mm 2mm;vertical-align:middle;border:0.4mm solid #000;overflow:hidden}`,
    `${W} .iv-td-name{font-size:${fsMm}mm;word-break:break-word;white-space:normal}`,
    `${W} .iv-td-c{text-align:center;font-size:${fsMm}mm}`,
  ].join('')

  enqueuePrint(() => runPrintJob('_snap', html, buildCss, TOTAL_W))
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
