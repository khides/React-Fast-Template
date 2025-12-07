import { useState, useEffect, useCallback } from 'react'

interface ComponentStatus {
  status: string
  message: string
}

interface FullHealthResponse {
  status: string
  components: {
    api: ComponentStatus
    database: ComponentStatus
  }
  environment: string
}

interface DbHealthResponse {
  status: string
  message: string
  database_version: string | null
  item_count: number | null
}

interface Item {
  id: number
  title: string
  description: string | null
  created_at: string
  updated_at: string
}

function App() {
  const [fullHealth, setFullHealth] = useState<FullHealthResponse | null>(null)
  const [dbHealth, setDbHealth] = useState<DbHealthResponse | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newItemTitle, setNewItemTitle] = useState('')

  const checkHealth = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // Full health check
      const fullRes = await fetch('/api/health/full')
      if (fullRes.ok) {
        const fullData = await fullRes.json()
        setFullHealth(fullData)
      }

      // DB health check
      const dbRes = await fetch('/api/health/db')
      if (dbRes.ok) {
        const dbData = await dbRes.json()
        setDbHealth(dbData)
      }

      // Fetch items
      const itemsRes = await fetch('/api/v1/items')
      if (itemsRes.ok) {
        const itemsData = await itemsRes.json()
        setItems(itemsData)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    checkHealth()
  }, [checkHealth])

  const addItem = async () => {
    if (!newItemTitle.trim()) return

    try {
      const res = await fetch('/api/v1/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newItemTitle, description: 'Test item' }),
      })
      if (res.ok) {
        setNewItemTitle('')
        checkHealth() // Refresh
      }
    } catch (err) {
      setError('Failed to add item')
    }
  }

  const deleteItem = async (id: number) => {
    try {
      const res = await fetch(`/api/v1/items/${id}`, { method: 'DELETE' })
      if (res.ok) {
        checkHealth() // Refresh
      }
    } catch (err) {
      setError('Failed to delete item')
    }
  }

  const StatusIndicator = ({ status }: { status: string }) => (
    <span
      className={`inline-block h-3 w-3 rounded-full ${
        status === 'healthy' ? 'bg-green-500' : 'bg-red-500'
      }`}
    />
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold text-white text-center mb-8">
          React + FastAPI + PostgreSQL
        </h1>

        {/* System Status */}
        <div className="bg-gray-800 rounded-xl shadow-2xl p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-white">System Status</h2>
            <button
              onClick={checkHealth}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Checking...' : 'Refresh'}
            </button>
          </div>

          {error && (
            <div className="bg-red-900/50 border border-red-500 rounded-lg p-4 mb-4">
              <p className="text-red-400">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* API Status */}
            <div className="bg-gray-700 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-400 mb-2">API Server</h3>
              <div className="flex items-center space-x-2">
                <StatusIndicator status={fullHealth?.components.api.status || 'unhealthy'} />
                <span className={fullHealth?.components.api.status === 'healthy' ? 'text-green-400' : 'text-red-400'}>
                  {fullHealth?.components.api.message || 'Not connected'}
                </span>
              </div>
            </div>

            {/* Database Status */}
            <div className="bg-gray-700 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-400 mb-2">Database</h3>
              <div className="flex items-center space-x-2">
                <StatusIndicator status={fullHealth?.components.database.status || 'unhealthy'} />
                <span className={fullHealth?.components.database.status === 'healthy' ? 'text-green-400' : 'text-red-400'}>
                  {fullHealth?.components.database.message || 'Not connected'}
                </span>
              </div>
            </div>

            {/* Environment */}
            <div className="bg-gray-700 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-400 mb-2">Environment</h3>
              <span className="text-blue-400 font-mono">
                {fullHealth?.environment || 'unknown'}
              </span>
            </div>
          </div>

          {/* Database Details */}
          {dbHealth && dbHealth.status === 'healthy' && (
            <div className="mt-4 bg-gray-700 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-400 mb-2">Database Details</h3>
              <div className="text-sm text-gray-300 space-y-1">
                <p><span className="text-gray-500">Version:</span> {dbHealth.database_version}</p>
                <p><span className="text-gray-500">Items in DB:</span> {dbHealth.item_count}</p>
              </div>
            </div>
          )}
        </div>

        {/* Items CRUD */}
        <div className="bg-gray-800 rounded-xl shadow-2xl p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Items (CRUD Test)</h2>

          {/* Add Item */}
          <div className="flex space-x-2 mb-4">
            <input
              type="text"
              value={newItemTitle}
              onChange={(e) => setNewItemTitle(e.target.value)}
              placeholder="Enter item title..."
              className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
              onKeyDown={(e) => e.key === 'Enter' && addItem()}
            />
            <button
              onClick={addItem}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Add
            </button>
          </div>

          {/* Items List */}
          <div className="space-y-2">
            {items.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No items yet. Add one above!</p>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  className="flex justify-between items-center bg-gray-700 rounded-lg p-3"
                >
                  <div>
                    <p className="text-white font-medium">{item.title}</p>
                    <p className="text-gray-400 text-sm">{item.description}</p>
                  </div>
                  <button
                    onClick={() => deleteItem(item.id)}
                    className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                  >
                    Delete
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Tech Stack Info */}
        <div className="bg-gray-800 rounded-xl shadow-2xl p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Tech Stack</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="text-center">
              <div className="text-2xl mb-1">React</div>
              <div className="text-gray-400">React + Vite</div>
            </div>
            <div className="text-center">
              <div className="text-2xl mb-1">FastAPI</div>
              <div className="text-gray-400">Python</div>
            </div>
            <div className="text-center">
              <div className="text-2xl mb-1">PostgreSQL</div>
              <div className="text-gray-400">Database</div>
            </div>
            <div className="text-center">
              <div className="text-2xl mb-1">AWS</div>
              <div className="text-gray-400">Cloud</div>
            </div>
          </div>
        </div>

        {/* Navigation to Map Page */}
        <div className="bg-gray-800 rounded-xl shadow-2xl p-6">
          <h2 className="text-xl font-semibold text-white mb-4">機能一覧</h2>
          <a
            href="/map"
            className="flex items-center justify-between p-4 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors group"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-medium text-white">地図検索</h3>
                <p className="text-sm text-gray-400">場所を検索してマイリストに保存、ルート計算</p>
              </div>
            </div>
            <svg className="w-6 h-6 text-gray-400 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  )
}

export default App
