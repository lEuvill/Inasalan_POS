'use client'

import { ProductVariation } from '@/app/lib/api'

export function VariationPicker({
  productName,
  variations,
  onSelect,
  onCancel,
}: {
  productName: string
  variations: ProductVariation[]
  onSelect: (v: ProductVariation) => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-6">
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Choose variation</p>
        <h3 className="font-bold text-gray-800 text-lg mb-4">{productName}</h3>
        <div className="flex flex-col gap-2">
          {variations.map((v, i) => (
            <button
              key={i}
              onClick={() => onSelect(v)}
              className="flex justify-between items-center border border-gray-200 rounded-xl px-4 py-3 hover:border-brand hover:bg-orange-50 transition-colors text-left"
            >
              <span className="font-semibold text-gray-800">{v.name}</span>
              <span className="font-bold text-brand">₱{parseFloat(v.price).toFixed(2)}</span>
            </button>
          ))}
        </div>
        <button
          onClick={onCancel}
          className="mt-4 w-full text-sm text-gray-400 hover:text-gray-600 py-2"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
