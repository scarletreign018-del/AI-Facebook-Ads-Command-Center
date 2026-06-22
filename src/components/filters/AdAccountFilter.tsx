'use client'

import { useAdAccountFilter } from '@/providers/AdAccountFilterProvider'
import { Building2, Wallet, ChevronDown, Loader2 } from 'lucide-react'

export default function AdAccountFilter() {
  const {
    selectedBusinessManagerId,
    selectedAdAccountId,
    businessManagers,
    filteredAdAccounts,
    setSelectedBusinessManager,
    setSelectedAdAccount,
    loading
  } = useAdAccountFilter()

  const hasBMs = businessManagers.length > 0

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading filters...</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3">
      {/* Business Manager Dropdown (if available) */}
      {hasBMs && (
        <div className="relative">
          <label className="block text-xs text-slate-400 mb-1">Business Portfolio</label>
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select
              value={selectedBusinessManagerId || 'all'}
              onChange={(e) => setSelectedBusinessManager(e.target.value === 'all' ? null : e.target.value)}
              className="appearance-none bg-slate-800/50 border border-slate-700 text-white pl-10 pr-10 py-2.5 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm min-w-[200px]"
            >
              <option value="all">All Portfolios</option>
              {businessManagers.map((bm) => (
                <option key={bm.id} value={bm.id}>
                  {bm.name}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>
      )}

      {/* Ad Account Dropdown */}
      <div className="relative">
        <label className="block text-xs text-slate-400 mb-1">Ad Account</label>
        <div className="relative">
          <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <select
            value={selectedAdAccountId || 'all'}
            onChange={(e) => setSelectedAdAccount(e.target.value === 'all' ? null : e.target.value)}
            className="appearance-none bg-slate-800/50 border border-slate-700 text-white pl-10 pr-10 py-2.5 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm min-w-[250px]"
          >
            <option value="all">All Ad Accounts</option>
            
            {/* Show filtered accounts */}
            {filteredAdAccounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name} ({acc.ad_account_id.replace('act_', '')})
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* Selected indicator */}
      {(selectedBusinessManagerId || selectedAdAccountId) && (
        <button
          onClick={() => {
            setSelectedBusinessManager(null)
            setSelectedAdAccount(null)
          }}
          className="text-xs text-blue-400 hover:text-blue-300 underline mt-5"
        >
          Clear filters
        </button>
      )}
    </div>
  )
}
