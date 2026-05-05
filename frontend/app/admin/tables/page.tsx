'use client'

import { useEffect, useState, useCallback } from 'react'
import { api, Table } from '@/app/lib/api'

export default function TablesPage() {
  const [tables, setTables] = useState<Table[]>([])
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

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
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
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
        <button
          onClick={onStartEdit}
          className="text-left text-sm font-bold text-gray-800 hover:text-brand transition-colors leading-tight"
        >
          {table.name}
        </button>
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
