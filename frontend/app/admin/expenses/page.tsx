'use client'

import { useEffect, useState } from 'react'
import { api, CashAccount, Expense, ExpenseItem } from '@/app/lib/api'
import { printExpenseReceipt } from '@/app/lib/printReceipt'

const CATEGORIES = ['Supplies', 'Utilities', 'Rent', 'Salary', 'Equipment', 'Food', 'Transport', 'Other']

function fmtPeso(n: number) {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtDateShort(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function expenseTotal(e: Expense) {
  return e.items.reduce((s, i) => s + parseFloat(i.amount || '0'), 0)
}

type DraftItem = { date: string; description: string; amount: string }

function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const emptyItem = (): DraftItem => ({ date: today(), description: '', amount: '' })

// ── Account Modal ──────────────────────────────────────────────────────────────
function AccountModal({
  account,
  onClose,
  onSave,
}: {
  account: CashAccount | null
  onClose: () => void
  onSave: (a: CashAccount) => void
}) {
  const [name, setName]       = useState(account?.name ?? '')
  const [balance, setBalance] = useState(account ? parseFloat(account.balance).toFixed(2) : '')
  const [saving, setSaving]   = useState(false)

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try {
      const bal = (parseFloat(balance) || 0).toFixed(2)
      const result = account
        ? await api.updateAccount(account.id, { name: name.trim(), balance: bal })
        : await api.createAccount({ name: name.trim(), balance: bal })
      onSave(result)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-80 space-y-4">
        <h3 className="text-sm font-bold text-gray-700">{account ? 'Edit Account' : 'New Account'}</h3>

        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1 block">Name</label>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Petty Cash"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-brand"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1 block">
            {account ? 'Balance (editable to top-up / adjust)' : 'Starting Balance'}
          </label>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold select-none">₱</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={balance}
              onChange={e => setBalance(e.target.value)}
              placeholder="0.00"
              className="w-full border border-gray-200 rounded-lg pl-6 pr-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-brand tabular-nums"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="flex-1 bg-brand text-white rounded-xl py-2 text-sm font-bold hover:bg-brand-dark transition-colors disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={onClose}
            className="px-4 bg-gray-100 text-gray-600 rounded-xl py-2 text-sm font-bold hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function ExpensesPage() {
  const [expenses, setExpenses]     = useState<Expense[]>([])
  const [accounts, setAccounts]     = useState<CashAccount[]>([])
  const [todaySalesTotal, setTodaySalesTotal] = useState(0)
  const [loading, setLoading]       = useState(true)

  // ── form ──
  const [category, setCategory]   = useState('')
  const [notes, setNotes]         = useState('')
  const [items, setItems]         = useState<DraftItem[]>([emptyItem()])
  const [accountId, setAccountId] = useState<number | null>(null)
  const [saving, setSaving]       = useState(false)

  // ── history ──
  const [deleteId, setDeleteId]   = useState<number | null>(null)
  const [expandId, setExpandId]   = useState<number | null>(null)

  // ── account management ──
  const [accountModal, setAccountModal] = useState<'new' | CashAccount | null>(null)
  const [deleteAccountId, setDeleteAccountId] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([api.getExpenses(), api.getAccounts(), api.getTodaySalesTotal()]).then(([exps, accs, salesTotal]) => {
      setExpenses(exps)
      setAccounts(accs)
      setTodaySalesTotal(salesTotal)
      setLoading(false)
    })
  }, [])

  function isTodaySalesAccount(a: CashAccount) {
    return a.name.trim().toLowerCase() === 'today sales'
  }

  function getAccountBalance(a: CashAccount): number {
    if (isTodaySalesAccount(a)) {
      const todayStr = today()
      const spent = expenses
        .filter(e => e.account === a.id && e.date === todayStr)
        .reduce((s, e) => s + expenseTotal(e), 0)
      return todaySalesTotal - spent
    }
    return parseFloat(a.balance)
  }

  function setItem(index: number, field: keyof DraftItem, value: string) {
    setItems(prev => prev.map((it, i) => i === index ? { ...it, [field]: value } : it))
  }

  function addItem() {
    const lastDate = items[items.length - 1]?.date ?? today()
    setItems(prev => [...prev, { date: lastDate, description: '', amount: '' }])
  }

  function removeItem(index: number) {
    setItems(prev => prev.length === 1 ? prev : prev.filter((_, i) => i !== index))
  }

  const validItems = items.filter(i => i.description.trim() && i.amount && parseFloat(i.amount) > 0)
  const draftTotal = items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)
  const canSave    = validItems.length > 0

  async function handleSave(andPrint: boolean) {
    if (!canSave) return
    setSaving(true)
    try {
      const expItems: ExpenseItem[] = validItems.map(i => ({
        date: i.date,
        description: i.description.trim(),
        amount: parseFloat(i.amount).toFixed(2),
      }))
      const slipDate = expItems.reduce((min, i) => i.date < min ? i.date : min, expItems[0].date)

      const saved = await api.createExpense({ date: slipDate, category, notes: notes.trim(), items: expItems, account: accountId })
      setExpenses(prev => [saved, ...prev])

      // update local account balance
      if (accountId) {
        const total = validItems.reduce((s, i) => s + parseFloat(i.amount), 0)
        setAccounts(prev => prev.map(a =>
          a.id === accountId ? { ...a, balance: (parseFloat(a.balance) - total).toFixed(2) } : a
        ))
      }

      if (andPrint) printExpenseReceipt(saved)
      setItems([emptyItem()])
      setCategory('')
      setNotes('')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    if (deleteId === id) {
      const exp = expenses.find(e => e.id === id)
      await api.deleteExpense(id)
      setExpenses(prev => prev.filter(e => e.id !== id))
      // restore account balance
      if (exp?.account) {
        const total = expenseTotal(exp)
        setAccounts(prev => prev.map(a =>
          a.id === exp.account ? { ...a, balance: (parseFloat(a.balance) + total).toFixed(2) } : a
        ))
      }
      setDeleteId(null)
    } else {
      setDeleteId(id)
      setTimeout(() => setDeleteId(null), 3000)
    }
  }

  function handleAccountSaved(a: CashAccount) {
    setAccounts(prev => {
      const exists = prev.find(x => x.id === a.id)
      return exists ? prev.map(x => x.id === a.id ? a : x) : [...prev, a].sort((x, y) => x.name.localeCompare(y.name))
    })
    setAccountModal(null)
  }

  async function handleDeleteAccount(id: number) {
    if (deleteAccountId === id) {
      await api.deleteAccount(id)
      setAccounts(prev => prev.filter(a => a.id !== id))
      if (accountId === id) setAccountId(null)
      setDeleteAccountId(null)
    } else {
      setDeleteAccountId(id)
      setTimeout(() => setDeleteAccountId(null), 3000)
    }
  }

  return (
    <div className="space-y-6 pb-8">

      {accountModal && (
        <AccountModal
          account={accountModal === 'new' ? null : accountModal}
          onClose={() => setAccountModal(null)}
          onSave={handleAccountSaved}
        />
      )}

      <div>
        <h1 className="text-2xl font-bold text-gray-800">Expenses</h1>
        <p className="text-sm text-gray-400 mt-0.5">Record expenses and print slips</p>
      </div>

      {/* ── Accounts ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-gray-700">Cash Accounts</h3>
          <button
            onClick={() => setAccountModal('new')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand text-white rounded-lg text-xs font-bold hover:bg-brand-dark transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Account
          </button>
        </div>

        {loading ? (
          <p className="text-xs text-gray-300 text-center py-4">Loading…</p>
        ) : accounts.length === 0 ? (
          <p className="text-xs text-gray-300 text-center py-4">No accounts yet — add one to track balances</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {accounts.map(a => {
              const bal = getAccountBalance(a)
              const negative = bal < 0
              const isSales = isTodaySalesAccount(a)
              return (
                <div key={a.id} className="rounded-xl border border-gray-100 bg-gray-50/50 p-4 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-semibold text-gray-600 truncate">{a.name}</p>
                      {isSales && (
                        <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-green-100 text-green-600 text-[9px] font-bold uppercase tracking-wide">live</span>
                      )}
                    </div>
                    <p className={`text-lg font-bold tabular-nums mt-0.5 ${negative ? 'text-red-500' : 'text-gray-800'}`}>
                      {fmtPeso(bal)}
                    </p>
                    {isSales && (
                      <p className="text-[10px] text-gray-400 mt-0.5">from today&apos;s sales · {fmtPeso(todaySalesTotal)} collected</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setAccountModal(a)}
                      className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-300 hover:text-gray-600 transition-colors"
                      title="Edit"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.5-6.5a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H7v-3.414a2 2 0 01.586-1.414z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDeleteAccount(a.id)}
                      className={`p-1.5 rounded-lg transition-colors ${deleteAccountId === a.id ? 'bg-red-500 text-white' : 'hover:bg-gray-200 text-gray-300 hover:text-red-400'}`}
                      title={deleteAccountId === a.id ? 'Tap again to confirm' : 'Delete'}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">

        {/* ── Form ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">

          {/* Account selector */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">
              Deduct from Account <span className="font-normal text-gray-300">(optional)</span>
            </label>
            <select
              value={accountId ?? ''}
              onChange={e => setAccountId(e.target.value ? parseInt(e.target.value) : null)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-brand bg-white"
            >
              <option value="">— none —</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name} ({fmtPeso(getAccountBalance(a))})
                </option>
              ))}
            </select>
          </div>

          {/* Category */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">
              Category <span className="font-normal text-gray-300">(optional)</span>
            </label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-brand bg-white"
            >
              <option value="">— none —</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-500">Items</label>
              <span className="text-xs text-gray-400">{items.length} line{items.length !== 1 ? 's' : ''}</span>
            </div>

            <div className="flex items-center gap-2 mb-1 px-0.5">
              <span className="text-[10px] font-semibold text-gray-300 uppercase w-28 shrink-0 text-center">Date</span>
              <span className="text-[10px] font-semibold text-gray-300 uppercase w-28 shrink-0 text-center">Amount</span>
              <span className="text-[10px] font-semibold text-gray-300 uppercase flex-1">Description</span>
            </div>

            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="date"
                    value={item.date}
                    onChange={e => setItem(idx, 'date', e.target.value)}
                    className="w-28 shrink-0 border border-gray-200 rounded-lg px-2 py-2 text-xs text-gray-600 focus:outline-none focus:border-brand"
                  />
                  <div className="relative w-28 shrink-0">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold select-none">₱</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.amount}
                      onChange={e => setItem(idx, 'amount', e.target.value)}
                      placeholder="0"
                      className="w-full border border-gray-200 rounded-lg pl-6 pr-2 py-2 text-sm text-gray-700 focus:outline-none focus:border-brand tabular-nums"
                    />
                  </div>
                  <input
                    type="text"
                    value={item.description}
                    onChange={e => setItem(idx, 'description', e.target.value)}
                    placeholder={idx === 0 ? 'Debt payment' : idx === 1 ? 'Transport fee' : 'Description'}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-brand"
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem() } }}
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    disabled={items.length === 1}
                    className="p-2 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors disabled:opacity-0 disabled:pointer-events-none shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addItem}
              className="mt-2 w-full border border-dashed border-gray-200 rounded-lg py-2 text-xs font-semibold text-gray-400 hover:border-brand hover:text-brand transition-colors"
            >
              + Add line
            </button>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">
              Notes <span className="font-normal text-gray-300">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Any extra notes..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-brand resize-none"
            />
          </div>

          {/* Total + actions */}
          <div className="border-t border-gray-100 pt-4 space-y-3">
            {accountId && (
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>Account after expense</span>
                <span className={`font-semibold tabular-nums ${(getAccountBalance(accounts.find(a => a.id === accountId)!) - draftTotal) < 0 ? 'text-red-500' : 'text-gray-600'}`}>
                  {fmtPeso(getAccountBalance(accounts.find(a => a.id === accountId)!) - draftTotal)}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-gray-600">Total</span>
              <span className="text-xl font-bold text-gray-800">{fmtPeso(draftTotal)}</span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={saving || !canSave}
                onClick={() => handleSave(true)}
                className="flex-1 bg-brand text-white rounded-xl py-2.5 text-sm font-bold hover:bg-brand-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving…' : 'Save & Print'}
              </button>
              <button
                type="button"
                disabled={saving || !canSave}
                onClick={() => handleSave(false)}
                className="px-4 bg-gray-100 text-gray-600 rounded-xl py-2.5 text-sm font-bold hover:bg-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Save only
              </button>
            </div>
          </div>
        </div>

        {/* ── Summary ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="text-sm font-bold text-gray-700 mb-4">All-time Summary</h3>
          {loading ? (
            <p className="text-sm text-gray-300 text-center py-6">Loading…</p>
          ) : expenses.length === 0 ? (
            <p className="text-sm text-gray-300 text-center py-6">No expenses recorded yet</p>
          ) : (() => {
            const byCategory = expenses.reduce<Record<string, number>>((acc, e) => {
              const cat = e.category || 'Uncategorized'
              acc[cat] = (acc[cat] ?? 0) + expenseTotal(e)
              return acc
            }, {})
            const grandTotal = expenses.reduce((s, e) => s + expenseTotal(e), 0)
            return (
              <div className="space-y-2.5">
                {Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => {
                  const pct = grandTotal > 0 ? (amt / grandTotal) * 100 : 0
                  return (
                    <div key={cat}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs text-gray-600 font-medium">{cat}</span>
                        <span className="text-xs font-semibold text-gray-700">{fmtPeso(amt)}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                        <div className="h-full rounded-full bg-red-400" style={{ width: `${Math.max(pct, 2)}%` }} />
                      </div>
                    </div>
                  )
                })}
                <div className="border-t border-gray-100 pt-3 flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-500">{expenses.length} slip{expenses.length !== 1 ? 's' : ''}</span>
                  <span className="text-base font-bold text-gray-800">{fmtPeso(grandTotal)}</span>
                </div>
              </div>
            )
          })()}
        </div>
      </div>

      {/* ── History ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <h3 className="text-sm font-bold text-gray-700 tracking-wide">Expense History</h3>
          <span className="text-xs text-gray-400">{expenses.length} record{expenses.length !== 1 ? 's' : ''}</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-24 text-gray-300 text-sm">Loading…</div>
        ) : expenses.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-gray-300 text-sm">No expenses yet</div>
        ) : (
          <div className="px-4 pb-5">
            <div className="rounded-xl border border-gray-100 overflow-hidden">
              {expenses.map((e, idx) => {
                const total    = expenseTotal(e)
                const expanded = expandId === e.id
                const itemDates = e.items.map(i => i.date).filter(Boolean).sort()
                const dateLabel = itemDates.length === 0
                  ? fmtDate(e.date)
                  : itemDates.length === 1 || itemDates[0] === itemDates[itemDates.length - 1]
                  ? fmtDate(itemDates[0])
                  : `${fmtDateShort(itemDates[0])} – ${fmtDateShort(itemDates[itemDates.length - 1])}`

                return (
                  <div key={e.id} className={`${idx > 0 ? 'border-t border-gray-50' : ''} ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}>
                    <div className="flex items-center gap-3 px-4 py-3">
                      <span className="text-xs text-gray-400 whitespace-nowrap w-28 shrink-0">{dateLabel}</span>

                      {/* Category chip */}
                      <span className="w-20 shrink-0">
                        {e.category
                          ? <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-semibold">{e.category}</span>
                          : <span className="text-gray-200 text-xs">—</span>}
                      </span>

                      {/* Account chip */}
                      <span className="w-24 shrink-0">
                        {e.account_name
                          ? <span className="px-2 py-0.5 rounded-full bg-brand/10 text-brand text-[10px] font-semibold truncate block">{e.account_name}</span>
                          : <span className="text-gray-200 text-xs">—</span>}
                      </span>

                      <button
                        type="button"
                        onClick={() => setExpandId(expanded ? null : e.id)}
                        className="flex-1 min-w-0 text-left"
                      >
                        <span className="text-xs text-gray-600 truncate block">
                          {e.items.map(i => i.description).join(' · ')}
                        </span>
                        {e.notes && <span className="text-[10px] text-gray-400 italic">{e.notes}</span>}
                      </button>

                      <span className="text-sm font-bold text-red-500 shrink-0 tabular-nums">{fmtPeso(total)}</span>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => setExpandId(expanded ? null : e.id)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-300 hover:text-gray-500 transition-colors"
                        >
                          <svg className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        <button
                          onClick={() => printExpenseReceipt(e)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-300 hover:text-gray-600 transition-colors"
                          title="Print"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(e.id)}
                          className={`p-1.5 rounded-lg transition-colors ${deleteId === e.id ? 'bg-red-500 text-white' : 'hover:bg-gray-100 text-gray-300 hover:text-red-400'}`}
                          title={deleteId === e.id ? 'Tap again to confirm' : 'Delete'}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {expanded && (
                      <div className="px-4 pb-3">
                        <div className="ml-28 border border-gray-100 rounded-xl overflow-hidden bg-white">
                          {e.items.map((item, iIdx) => (
                            <div key={iIdx} className={`flex items-center gap-3 px-4 py-2.5 ${iIdx > 0 ? 'border-t border-gray-50' : ''}`}>
                              <span className="text-[11px] font-semibold text-gray-300 w-10 shrink-0 tabular-nums">
                                {item.date ? fmtDateShort(item.date) : '—'}
                              </span>
                              <span className="flex-1 text-xs text-gray-700">{item.description}</span>
                              <span className="text-xs font-semibold text-gray-700 tabular-nums">{fmtPeso(parseFloat(item.amount))}</span>
                            </div>
                          ))}
                          <div className="flex items-center justify-between px-4 py-2.5 border-t-2 border-gray-100 bg-gray-50">
                            <span className="text-xs font-bold text-gray-500">Total</span>
                            <span className="text-xs font-bold text-red-500 tabular-nums">{fmtPeso(total)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              <div className="border-t-2 border-gray-100 bg-gray-50 flex items-center justify-between px-4 py-3">
                <span className="text-xs font-bold text-gray-500">Total ({expenses.length} slip{expenses.length !== 1 ? 's' : ''})</span>
                <span className="text-sm font-bold text-red-500 tabular-nums">
                  {fmtPeso(expenses.reduce((s, e) => s + expenseTotal(e), 0))}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
