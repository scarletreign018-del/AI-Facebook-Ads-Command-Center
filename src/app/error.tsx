'use client'

import { useEffect } from 'react'
import { TriangleAlert as AlertTriangle, Hop as Home, RefreshCw } from 'lucide-react'
import Link from 'next/link'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Global error:', error)
  }, [error])

  return (
    <html>
      <body className="bg-slate-950">
        <div className="flex min-h-screen flex-col items-center justify-center p-8">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-500/10">
            <AlertTriangle className="h-10 w-10 text-red-400" />
          </div>
          <h1 className="mb-2 text-2xl font-bold text-white">Something went wrong</h1>
          <p className="mb-6 max-w-md text-center text-slate-400">
            We encountered an unexpected error. This has been logged and our team will investigate.
          </p>
          {error.digest && (
            <p className="mb-6 font-mono text-xs text-slate-500">Error ID: {error.digest}</p>
          )}
          <div className="flex gap-3">
            <button
              onClick={reset}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              <RefreshCw className="h-4 w-4" />
              Try again
            </button>
            <Link
              href="/dashboard"
              className="flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800"
            >
              <Home className="h-4 w-4" />
              Go home
            </Link>
          </div>
        </div>
      </body>
    </html>
  )
}
