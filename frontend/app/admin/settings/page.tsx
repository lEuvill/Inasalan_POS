'use client'

import { useRef, useState } from 'react'
import { api } from '@/app/lib/api'

// ── CSV helpers ────────────────────────────────────────────────────────────────

function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const escape = (v: unknown): string => {
    const s =
      v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r'))
      return `"${s.replace(/"/g, '""')}"`
    return s
  }
  return [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\r\n')
}

function parseCSV(text: string): Record<string, string>[] {
  text = text.replace(/^﻿/, '') // strip BOM
  const rows: string[][] = []
  let cur: string[] = []
  let field = ''
  let inQuote = false
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === '"') {
      if (inQuote && text[i + 1] === '"') { field += '"'; i += 2; continue }
      inQuote = !inQuote
    } else if (ch === ',' && !inQuote) {
      cur.push(field); field = ''
    } else if ((ch === '\n' || ch === '\r') && !inQuote) {
      if (ch === '\r' && text[i + 1] === '\n') i++
      if (field || cur.length > 0) { cur.push(field); rows.push(cur); cur = []; field = '' }
    } else {
      field += ch
    }
    i++
  }
  if (field || cur.length > 0) { cur.push(field); rows.push(cur) }
  if (rows.length < 2) return []
  const headers = rows[0]
  return rows
    .slice(1)
    .filter(r => r.some(v => v.trim()))
    .map(r => {
      const obj: Record<string, string> = {}
      headers.forEach((h, i) => { obj[h] = r[i] ?? '' })
      return obj
    })
}

function downloadCSV(filename: string, csv: string) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click()
  document.body.removeChild(a); URL.revokeObjectURL(url)
}

function localDateStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Table config ───────────────────────────────────────────────────────────────

type TableEntry = {
  key: string
  label: string
  description: string
  fetch: () => Promise<unknown[]>
}

const TABLES: TableEntry[] = [
  { key: 'products',      label: 'Products',       description: 'Menu items, prices, variations, stock',        fetch: api.getProducts },
  { key: 'orders',        label: 'Orders',          description: 'All orders — pending, completed, voided',       fetch: () => api.getOrders() },
  { key: 'transactions',  label: 'Transactions',    description: 'Completed sale records',                        fetch: api.getTransactions },
  { key: 'tables',        label: 'Tables',          description: 'Table names and active status',                 fetch: api.getTables },
  { key: 'raw_materials', label: 'Raw Materials',   description: 'Ingredient costing and stock records',          fetch: api.getRawMaterials },
  { key: 'recipes',       label: 'Recipes',         description: 'Product–ingredient links',                      fetch: api.getProductIngredients },
  { key: 'expenses',      label: 'Expenses',        description: 'All recorded expense slips',                    fetch: api.getExpenses },
  { key: 'cash_accounts', label: 'Cash Accounts',   description: 'Account names and balances',                    fetch: api.getAccounts },
]

// ── Import state ───────────────────────────────────────────────────────────────

type ImportPending = { rows: Record<string, string>[]; count: number }
type ImportResult  = { created: number; updated: number; errors: number }

// ── Page ───────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [exportLoading,   setExportLoading]   = useState<Record<string, boolean>>({})
  const [exportDone,      setExportDone]      = useState<Record<string, boolean>>({})
  const [downloadingAll,  setDownloadingAll]  = useState(false)

  const [importPending,   setImportPending]   = useState<Record<string, ImportPending>>({})
  const [importLoading,   setImportLoading]   = useState<Record<string, boolean>>({})
  const [importResult,    setImportResult]    = useState<Record<string, ImportResult | string>>({})

  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // ── Export ──────────────────────────────────────────────────────────────────

  async function handleExport(entry: TableEntry) {
    setExportLoading(p => ({ ...p, [entry.key]: true }))
    setExportDone(p => ({ ...p, [entry.key]: false }))
    try {
      const data = await entry.fetch()
      downloadCSV(`inasalan_${entry.key}_${localDateStr()}.csv`, toCSV(data as Record<string, unknown>[]))
      setExportDone(p => ({ ...p, [entry.key]: true }))
      setTimeout(() => setExportDone(p => ({ ...p, [entry.key]: false })), 2000)
    } finally {
      setExportLoading(p => ({ ...p, [entry.key]: false }))
    }
  }

  async function handleExportAll() {
    setDownloadingAll(true)
    try {
      for (const entry of TABLES) {
        const data = await entry.fetch()
        downloadCSV(`inasalan_${entry.key}_${localDateStr()}.csv`, toCSV(data as Record<string, unknown>[]))
        await new Promise(r => setTimeout(r, 400))
      }
    } finally {
      setDownloadingAll(false)
    }
  }

  // ── Import ──────────────────────────────────────────────────────────────────

  function handleFileChange(key: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      const rows = parseCSV(text)
      if (rows.length === 0) {
        setImportResult(p => ({ ...p, [key]: 'No valid rows found in file.' }))
        return
      }
      setImportPending(p => ({ ...p, [key]: { rows, count: rows.length } }))
      setImportResult(p => { const n = { ...p }; delete n[key]; return n })
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  async function handleImportConfirm(key: string) {
    const pending = importPending[key]
    if (!pending) return
    setImportLoading(p => ({ ...p, [key]: true }))
    setImportPending(p => { const n = { ...p }; delete n[key]; return n })
    try {
      const result = await api.importTable(key, pending.rows)
      setImportResult(p => ({ ...p, [key]: result }))
    } catch (err) {
      setImportResult(p => ({ ...p, [key]: String(err) }))
    } finally {
      setImportLoading(p => ({ ...p, [key]: false }))
    }
  }

  function handleImportCancel(key: string) {
    setImportPending(p => { const n = { ...p }; delete n[key]; return n })
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 pb-8">

      <div>
        <h1 className="text-2xl font-bold text-gray-800">Settings</h1>
        <p className="text-sm text-gray-400 mt-0.5">Data export and import</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-bold text-gray-700">Database Export &amp; Import</h3>
          <button
            onClick={handleExportAll}
            disabled={downloadingAll}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand text-white rounded-lg text-xs font-bold hover:bg-brand-dark transition-colors disabled:opacity-50"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {downloadingAll ? 'Downloading…' : 'Export All'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-1">
          Export each table as CSV, then import those files on another computer.
        </p>
        <p className="text-xs text-amber-500 mb-5">
          Import order: Products → Tables → Raw Materials → Cash Accounts → Orders → Transactions → Recipes → Expenses
        </p>

        <div className="space-y-3">
          {TABLES.map(entry => {
            const pending = importPending[entry.key]
            const result  = importResult[entry.key]
            const isLoading = importLoading[entry.key]
            const isDone    = exportDone[entry.key]
            const isExporting = exportLoading[entry.key]

            return (
              <div key={entry.key} className="rounded-xl border border-gray-100 bg-gray-50/50 px-4 py-3 space-y-2">

                {/* Row: label + buttons */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-700">{entry.label}</p>
                    <p className="text-xs text-gray-400 truncate">{entry.description}</p>
                  </div>

                  {/* Export button */}
                  <button
                    onClick={() => handleExport(entry)}
                    disabled={isExporting || downloadingAll}
                    title="Export CSV"
                    className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors disabled:opacity-50
                      ${isDone
                        ? 'border-green-300 bg-green-50 text-green-600'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-brand hover:text-brand'}`}
                  >
                    {isDone ? (
                      <><svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>Done</>
                    ) : isExporting ? '…' : (
                      <><svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>Export</>
                    )}
                  </button>

                  {/* Import button */}
                  <button
                    onClick={() => fileRefs.current[entry.key]?.click()}
                    disabled={isLoading || !!pending}
                    title="Import CSV"
                    className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors disabled:opacity-50"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4 4l4-4m0 0l4 4m-4-4V4" />
                    </svg>
                    {isLoading ? 'Importing…' : 'Import'}
                  </button>

                  <input
                    ref={el => { fileRefs.current[entry.key] = el }}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={e => handleFileChange(entry.key, e)}
                  />
                </div>

                {/* Pending confirmation */}
                {pending && (
                  <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <p className="text-xs text-amber-700 font-medium">
                      {pending.count} row{pending.count !== 1 ? 's' : ''} found — existing IDs will be updated, new ones created.
                    </p>
                    <div className="flex gap-2 shrink-0 ml-3">
                      <button
                        onClick={() => handleImportConfirm(entry.key)}
                        className="px-3 py-1 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600 transition-colors"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => handleImportCancel(entry.key)}
                        className="px-3 py-1 bg-white border border-gray-200 text-gray-500 rounded-lg text-xs font-semibold hover:bg-gray-50 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Result */}
                {result && !pending && (
                  <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium
                    ${typeof result === 'string'
                      ? 'bg-red-50 border border-red-200 text-red-600'
                      : 'bg-green-50 border border-green-200 text-green-700'}`}
                  >
                    {typeof result === 'string' ? (
                      <span>Error: {result}</span>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        <span>
                          {result.created} created · {result.updated} updated
                          {result.errors > 0 && <span className="text-amber-600"> · {result.errors} skipped</span>}
                        </span>
                      </>
                    )}
                  </div>
                )}

              </div>
            )
          })}
        </div>
      </div>

    </div>
  )
}
