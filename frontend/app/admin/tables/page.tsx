'use client'

import { useEffect, useState, useCallback } from 'react'
import { api, Table } from '@/app/lib/api'
import QRCode from 'react-qr-code'

export default function TablesPage() {
  const [tables, setTables] = useState<Table[]>([])
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [qrTable, setQrTable] = useState<Table | null>(null)

  const load = useCallback(() => api.getTables().then(setTables), [])
  useEffect(() => { load() }, [load])

  const addTable = async () => {
    const name = newName.trim()
    if (!name) return
    setAdding(true)
    try {
      await api.createTable({ name })
      setNewName('')
      load()
    } finally {
      setAdding(false)
    }
  }

  const saveEdit = async (id: number) => {
    const name = editName.trim()
    if (!name) { setEditId(null); return }
    await api.updateTable(id, { name })
    setEditId(null)
    load()
  }

  const toggleActive = async (t: Table) => {
    await api.updateTable(t.id, { is_active: !t.is_active })
    load()
  }

  const deleteTable = async (id: number) => {
    await api.deleteTable(id)
    setConfirmDeleteId(null)
    load()
  }

  const active = tables.filter(t => t.is_active)
  const inactive = tables.filter(t => !t.is_active)

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Tables</h1>
          <p className="text-sm text-gray-400 mt-0.5">Manage table presets used during order placement</p>
        </div>
        <span className="text-sm text-gray-400">{active.length} active</span>
      </div>

      {/* Add form */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Add Table</p>
        <div className="flex gap-3">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addTable() }}
            placeholder="e.g. Table 1, VIP Room, Counter"
            className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:border-brand"
          />
          <button
            onClick={addTable}
            disabled={adding || !newName.trim()}
            className="bg-brand text-white font-bold px-5 py-2.5 rounded-xl text-sm hover:bg-brand-dark disabled:opacity-40 transition-colors"
          >
            {adding ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>

      {/* Active tables */}
      {tables.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          No tables yet — add one above to get started.
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <div className="mb-6">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Active</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {active.map(t => (
                  <TableCard
                    key={t.id}
                    table={t}
                    editId={editId}
                    editName={editName}
                    confirmDeleteId={confirmDeleteId}
                    onStartEdit={() => { setEditId(t.id); setEditName(t.name) }}
                    onEditName={setEditName}
                    onSaveEdit={() => saveEdit(t.id)}
                    onCancelEdit={() => setEditId(null)}
                    onToggle={() => toggleActive(t)}
                    onConfirmDelete={() => setConfirmDeleteId(t.id)}
                    onCancelDelete={() => setConfirmDeleteId(null)}
                    onDelete={() => deleteTable(t.id)}
                    onShowQr={() => setQrTable(t)}
                  />
                ))}
              </div>
            </div>
          )}

          {inactive.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Inactive</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {inactive.map(t => (
                  <TableCard
                    key={t.id}
                    table={t}
                    editId={editId}
                    editName={editName}
                    confirmDeleteId={confirmDeleteId}
                    onStartEdit={() => { setEditId(t.id); setEditName(t.name) }}
                    onEditName={setEditName}
                    onSaveEdit={() => saveEdit(t.id)}
                    onCancelEdit={() => setEditId(null)}
                    onToggle={() => toggleActive(t)}
                    onConfirmDelete={() => setConfirmDeleteId(t.id)}
                    onCancelDelete={() => setConfirmDeleteId(null)}
                    onDelete={() => deleteTable(t.id)}
                    onShowQr={() => setQrTable(t)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {qrTable && (
        <QrModal table={qrTable} onClose={() => setQrTable(null)} />
      )}
    </div>
  )
}

function QrModal({ table, onClose }: { table: Table; onClose: () => void }) {
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? ''
  const lanHost = apiBase ? new URL(apiBase).hostname : window.location.hostname
  const menuUrl = `http://${lanHost}:3000/menu?table=${encodeURIComponent(table.name)}`

  const handlePrint = () => {
    const win = window.open('', '_blank')
    if (!win) return
    const svgEl = document.getElementById('qr-svg')
    const svgContent = svgEl ? svgEl.outerHTML : ''
    win.document.write(`
      <html><head><title>QR — ${table.name}</title>
      <style>
        body { margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; font-family: sans-serif; }
        h2 { font-size: 24px; margin-bottom: 8px; }
        p { font-size: 12px; color: #888; margin-bottom: 24px; word-break: break-all; max-width: 240px; text-align: center; }
        svg { width: 240px; height: 240px; }
      </style></head>
      <body>
        <h2>${table.name}</h2>
        <p>${menuUrl}</p>
        ${svgContent}
        <script>window.onload = () => { window.print(); window.close(); }<\/script>
      </body></html>
    `)
    win.document.close()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-5 max-w-xs w-full mx-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-full flex items-center justify-between">
          <div>
            <p className="text-lg font-bold text-gray-800">{table.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">Scan to order</p>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 text-xl leading-none">✕</button>
        </div>

        <div className="p-3 border-2 border-gray-100 rounded-xl">
          <QRCode
            id="qr-svg"
            value={menuUrl}
            size={200}
            bgColor="#ffffff"
            fgColor="#1a1a1a"
          />
        </div>

        <p className="text-xs text-gray-400 text-center break-all">{menuUrl}</p>

        <div className="flex gap-3 w-full">
          <button
            onClick={handlePrint}
            className="flex-1 bg-brand text-white font-bold py-2.5 rounded-xl text-sm hover:bg-brand-dark transition-colors"
          >
            Print QR
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-gray-100 text-gray-600 font-semibold py-2.5 rounded-xl text-sm hover:bg-gray-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function TableCard({
  table,
  editId,
  editName,
  confirmDeleteId,
  onStartEdit,
  onEditName,
  onSaveEdit,
  onCancelEdit,
  onToggle,
  onConfirmDelete,
  onCancelDelete,
  onDelete,
  onShowQr,
}: {
  table: Table
  editId: number | null
  editName: string
  confirmDeleteId: number | null
  onStartEdit: () => void
  onEditName: (v: string) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onToggle: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
  onDelete: () => void
  onShowQr: () => void
}) {
  const isEditing = editId === table.id
  const isConfirmingDelete = confirmDeleteId === table.id

  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-4 flex flex-col gap-3 transition-opacity
      ${table.is_active ? 'border-gray-100' : 'border-gray-100 opacity-50'}`}
    >
      {/* Name / edit input */}
      {isEditing ? (
        <form
          onSubmit={e => { e.preventDefault(); onSaveEdit() }}
          className="flex gap-2"
        >
          <input
            autoFocus
            value={editName}
            onChange={e => onEditName(e.target.value)}
            onBlur={onSaveEdit}
            className="flex-1 min-w-0 border border-brand rounded-lg px-2 py-1 text-sm font-semibold text-gray-800 focus:outline-none"
          />
        </form>
      ) : (
        <div className="flex items-center justify-between gap-1">
          <button
            onClick={onStartEdit}
            className="text-left text-sm font-bold text-gray-800 hover:text-brand transition-colors leading-tight flex-1 min-w-0 truncate"
          >
            {table.name}
          </button>
          {table.is_active && (
            <button
              onClick={onShowQr}
              title="Show QR code"
              className="shrink-0 text-gray-300 hover:text-brand transition-colors text-base leading-none"
            >
              ▦
            </button>
          )}
        </div>
      )}

      {/* Actions */}
      {isConfirmingDelete ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-red-500 font-medium flex-1">Delete?</span>
          <button
            onClick={onDelete}
            className="text-xs text-white bg-red-500 hover:bg-red-600 font-semibold px-2 py-1 rounded-lg"
          >Yes</button>
          <button
            onClick={onCancelDelete}
            className="text-xs text-gray-400 hover:text-gray-700 font-medium"
          >No</button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <button
            onClick={onToggle}
            className={`flex-1 text-xs font-semibold py-1 rounded-lg transition-colors
              ${table.is_active
                ? 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
          >
            {table.is_active ? 'Disable' : 'Enable'}
          </button>
          <button
            onClick={onConfirmDelete}
            className="text-xs text-gray-300 hover:text-red-500 font-semibold px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
