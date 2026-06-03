'use client'

import { useState } from 'react'
import { api } from '@/app/lib/api'

function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const escape = (v: unknown): string => {
    const s =
      v === null || v === undefined
        ? ''
        : typeof v === 'object'
        ? JSON.stringify(v)
        : String(v)
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }
  return [
    headers.join(','),
    ...rows.map(r => headers.map(h => escape(r[h])).join(',')),
  ].join('\r\n')
}

function downloadCSV(filename: string, csv: string) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function localDateStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type ExportEntry = {
  key: string
  label: string
  description: string
  fetch: () => Promise<unknown[]>
}

const EXPORTS: ExportEntry[] = [
  {
    key: 'products',
    label: 'Products',
    description: 'Menu items, prices, variations, stock',
    fetch: api.getProducts,
  },
  {
    key: 'orders',
    label: 'Orders',
    description: 'All orders — pending, completed, voided',
    fetch: () => api.getOrders(),
  },
  {
    key: 'transactions',
    label: 'Transactions',
    description: 'Completed sale records',
    fetch: api.getTransactions,
  },
  {
    key: 'tables',
    label: 'Tables',
    description: 'Table names and active status',
    fetch: api.getTables,
  },
  {
    key: 'raw_materials',
    label: 'Raw Materials',
    description: 'Ingredient costing and stock records',
    fetch: api.getRawMaterials,
  },
  {
    key: 'recipes',
    label: 'Recipes',
    description: 'Product–ingredient links',
    fetch: api.getProductIngredients,
  },
  {
    key: 'expenses',
    label: 'Expenses',
    description: 'All recorded expense slips',
    fetch: api.getExpenses,
  },
  {
    key: 'cash_accounts',
    label: 'Cash Accounts',
    description: 'Account names and balances',
    fetch: api.getAccounts,
  },
]

export default function SettingsPage() {
  const [loading, setLoading]         = useState<Record<string, boolean>>({})
  const [downloadingAll, setDownloadingAll] = useState(false)
  const [done, setDone]               = useState<Record<string, boolean>>({})

  async function handleExport(entry: ExportEntry) {
    setLoading(prev => ({ ...prev, [entry.key]: true }))
    setDone(prev => ({ ...prev, [entry.key]: false }))
    try {
      const data = await entry.fetch()
      const csv  = toCSV(data as Record<string, unknown>[])
      downloadCSV(`inasalan_${entry.key}_${localDateStr()}.csv`, csv)
      setDone(prev => ({ ...prev, [entry.key]: true }))
      setTimeout(() => setDone(prev => ({ ...prev, [entry.key]: false })), 2000)
    } finally {
      setLoading(prev => ({ ...prev, [entry.key]: false }))
    }
  }

  async function handleExportAll() {
    setDownloadingAll(true)
    try {
      for (const entry of EXPORTS) {
        const data = await entry.fetch()
        const csv  = toCSV(data as Record<string, unknown>[])
        downloadCSV(`inasalan_${entry.key}_${localDateStr()}.csv`, csv)
        await new Promise(r => setTimeout(r, 400))
      }
    } finally {
      setDownloadingAll(false)
    }
  }

  return (
    <div className="space-y-6 pb-8">

      <div>
        <h1 className="text-2xl font-bold text-gray-800">Settings</h1>
        <p className="text-sm text-gray-400 mt-0.5">Data export and system preferences</p>
      </div>

      {/* ── Export Data ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-bold text-gray-700">Export Database</h3>
          <button
            onClick={handleExportAll}
            disabled={downloadingAll}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand text-white rounded-lg text-xs font-bold hover:bg-brand-dark transition-colors disabled:opacity-50"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {downloadingAll ? 'Downloading…' : 'Download All'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-5">
          Each table is saved as a separate CSV file — open in Excel or import to another machine.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {EXPORTS.map(entry => (
            <div
              key={entry.key}
              className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/50 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-700">{entry.label}</p>
                <p className="text-xs text-gray-400 truncate">{entry.description}</p>
              </div>
              <button
                onClick={() => handleExport(entry)}
                disabled={loading[entry.key] || downloadingAll}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors disabled:opacity-50
                  ${done[entry.key]
                    ? 'border-green-300 bg-green-50 text-green-600'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-brand hover:text-brand'}`}
              >
                {done[entry.key] ? (
                  <>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Done
                  </>
                ) : loading[entry.key] ? (
                  '…'
                ) : (
                  <>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    CSV
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
