'use client'

export type SpiceLevel = 'REGULAR' | 'SPICY'

export function SpicePicker({ productName, onSelect, onCancel }: {
  productName: string
  onSelect: (level: SpiceLevel) => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-[80] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-6">
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Choose spice</p>
        <h3 className="font-bold text-gray-800 text-lg mb-4">{productName}</h3>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => onSelect('REGULAR')} className="border border-gray-200 rounded-xl px-4 py-4 font-semibold text-gray-700 hover:border-brand hover:bg-orange-50">Regular</button>
          <button onClick={() => onSelect('SPICY')} className="border border-red-200 rounded-xl px-4 py-4 font-semibold text-red-600 hover:border-red-500 hover:bg-red-50">🌶️ Spicy</button>
        </div>
        <button onClick={onCancel} className="mt-4 w-full text-sm text-gray-400 hover:text-gray-600 py-2">Cancel</button>
      </div>
    </div>
  )
}
