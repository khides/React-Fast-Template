import { useState, useEffect } from 'react'

interface HealthResponse {
  status: string
  message: string
}

function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await fetch('/api/health')
        if (!response.ok) {
          throw new Error('API is not available')
        }
        const data = await response.json()
        setHealth(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    checkHealth()
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center">
      <div className="bg-gray-800 rounded-xl shadow-2xl p-8 max-w-md w-full mx-4">
        <h1 className="text-3xl font-bold text-white mb-6 text-center">
          React + FastAPI
        </h1>

        <div className="space-y-4">
          <div className="bg-gray-700 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-gray-300 mb-2">
              API Status
            </h2>
            {loading ? (
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                <span className="text-gray-400">Checking...</span>
              </div>
            ) : error ? (
              <div className="flex items-center space-x-2">
                <span className="h-3 w-3 rounded-full bg-red-500"></span>
                <span className="text-red-400">{error}</span>
              </div>
            ) : health ? (
              <div className="flex items-center space-x-2">
                <span className="h-3 w-3 rounded-full bg-green-500"></span>
                <span className="text-green-400">{health.message}</span>
              </div>
            ) : null}
          </div>

          <div className="bg-gray-700 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-gray-300 mb-2">
              Tech Stack
            </h2>
            <ul className="text-gray-400 space-y-1">
              <li>Frontend: React + Vite + TypeScript</li>
              <li>Backend: FastAPI + Python</li>
              <li>Database: PostgreSQL</li>
              <li>Infrastructure: AWS (CloudFront, S3, Lambda, RDS)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
