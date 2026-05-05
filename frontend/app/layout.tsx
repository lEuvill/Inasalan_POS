import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'INASALAN POS',
  description: 'Point of Sale — Web Dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-surface text-gray-800 antialiased">{children}</body>
    </html>
  )
}
