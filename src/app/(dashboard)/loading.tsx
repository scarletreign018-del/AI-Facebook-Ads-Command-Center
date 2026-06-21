export default function DashboardLoading() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-8">
      <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-blue-500" />
      <p className="text-sm text-slate-400">Loading dashboard...</p>
    </div>
  )
}
