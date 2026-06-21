'use client'

import { useEffect } from 'react'
import { TriangleAlert as AlertTriangle, RefreshCw } from 'lucide-react'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Dashboard error:', error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-8">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
        <AlertTriangle className="h-8 w-8 text-red-400" />
      </div>
      <h2 className="mb-2 text-xl font-semibold text-white">Something went wrong</h2>
      <p className="mb-6 max-w-md text-center text-sm text-slate-400">
        We encountered an error loading this page. This has been logged and our team will investigate.
      </p>
      {error.digest && (
        <p className="mb-4 font-mono text-xs text-slate-500">Error ID: {error.digest}</p>
      )}
      <button
        onClick={reset}
        className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
      >
        <RefreshCw className="h-4 w-4" />
        Try again
      </button>
    </div>
  )
}
