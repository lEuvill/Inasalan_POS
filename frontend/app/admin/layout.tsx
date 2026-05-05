'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/admin', label: 'Dashboard', icon: '▦' },
  { href: '/admin/menu', label: 'Menu', icon: '☰' },
  { href: '/admin/orders', label: 'Orders', icon: '◎' },
  { href: '/admin/history', label: 'History', icon: '⏱' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-100 flex flex-col shadow-sm">
        <div className="px-6 py-5 border-b border-gray-100">
          <span className="text-xl font-bold text-brand">INASALAN</span>
          <p className="text-xs text-gray-400 mt-0.5">POS Dashboard</p>
        </div>
        <nav className="flex-1 py-4">
          {NAV.map(({ href, label, icon }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-6 py-3 text-sm font-medium transition-colors
                  ${active
                    ? 'bg-orange-50 text-brand border-r-2 border-brand'
                    : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                  }`}
              >
                <span className="text-base">{icon}</span>
                {label}
              </Link>
            )
          })}
        </nav>
        <div className="px-6 py-4 border-t border-gray-100">
          <Link
            href="/menu"
            target="_blank"
            className="text-xs text-gray-400 hover:text-brand transition-colors"
          >
            ↗ Customer Menu
          </Link>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-8 overflow-auto">{children}</main>
    </div>
  )
}
