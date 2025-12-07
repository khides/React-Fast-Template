import { useState, useCallback } from 'react'
import { useJsApiLoader } from '@react-google-maps/api'
import { SearchBar } from '@/components/SearchBar'
import { MapView } from '@/components/MapView'
import { MyListPanel } from '@/components/MyListPanel'
import { MyListProvider, useMyList } from '@/contexts/MyListContext'
import { SearchResult, Location, MyList, RouteInfo } from '@/types/maps'

const libraries: ('places' | 'geometry' | 'drawing' | 'visualization')[] = ['places']

// Get API key from environment variable
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''

function MapPageContent() {
  const { setRouteForList } = useMyList()
  const [selectedLocation, setSelectedLocation] = useState<SearchResult | null>(null)
  const [activeListId, setActiveListId] = useState<string | null>(null)
  const [activeRoute, setActiveRoute] = useState<RouteInfo | null>(null)
  const [calculatingRoute, setCalculatingRoute] = useState(false)
  const [isPanelOpen, setIsPanelOpen] = useState(true)
  const { lists, routes } = useMyList()

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries,
  })

  const handlePlaceSelect = useCallback((result: SearchResult) => {
    setSelectedLocation(result)
  }, [])

  const handleLocationSelect = useCallback((location: Location) => {
    setSelectedLocation({
      placeId: location.placeId || '',
      name: location.name,
      address: location.address,
      lat: location.lat,
      lng: location.lng,
    })
  }, [])

  const calculateOptimalRoute = useCallback(
    async (list: MyList) => {
      if (list.locations.length < 2) return

      setCalculatingRoute(true)
      setActiveListId(list.id)

      try {
        const directionsService = new google.maps.DirectionsService()

        // For optimal route, we need to find the best order
        // Using the first location as origin and optimizing waypoints
        const origin = list.locations[0]
        const destination = list.locations[list.locations.length - 1]
        const waypoints = list.locations.slice(1, -1).map((loc) => ({
          location: { lat: loc.lat, lng: loc.lng },
          stopover: true,
        }))

        const result = await new Promise<google.maps.DirectionsResult>(
          (resolve, reject) => {
            directionsService.route(
              {
                origin: { lat: origin.lat, lng: origin.lng },
                destination: { lat: destination.lat, lng: destination.lng },
                waypoints,
                optimizeWaypoints: true, // This is the key for route optimization
                travelMode: google.maps.TravelMode.DRIVING,
              },
              (response, status) => {
                if (status === google.maps.DirectionsStatus.OK && response) {
                  resolve(response)
                } else {
                  reject(new Error(`Directions request failed: ${status}`))
                }
              }
            )
          }
        )

        // Extract optimized order from waypoint_order
        const route = result.routes[0]
        const waypointOrder = route.waypoint_order || []

        // Build the optimized location order
        const middleLocations = list.locations.slice(1, -1)
        const optimizedMiddle = waypointOrder.map((i) => middleLocations[i])
        const optimizedLocations = [origin, ...optimizedMiddle, destination]
        const optimizedOrder = optimizedLocations.map((loc) => loc.id)

        // Calculate total distance and duration
        let totalDistance = 0
        let totalDuration = 0
        const legs: RouteInfo['legs'] = []

        route.legs.forEach((leg, index) => {
          totalDistance += leg.distance?.value || 0
          totalDuration += leg.duration?.value || 0

          legs.push({
            startLocationId: optimizedOrder[index],
            endLocationId: optimizedOrder[index + 1],
            distance: leg.distance?.text || '',
            duration: leg.duration?.text || '',
          })
        })

        const routeInfo: RouteInfo = {
          listId: list.id,
          optimizedOrder,
          totalDistance: formatDistance(totalDistance),
          totalDuration: formatDuration(totalDuration),
          legs,
        }

        setRouteForList(list.id, routeInfo)
        setActiveRoute(routeInfo)
      } catch (error) {
        console.error('Failed to calculate route:', error)
        alert('ルートの計算に失敗しました。場所の情報を確認してください。')
      } finally {
        setCalculatingRoute(false)
      }
    },
    [setRouteForList]
  )

  // Get locations for the active list
  const activeList = lists.find((l) => l.id === activeListId)
  const displayRoute = activeRoute || (activeListId ? routes[activeListId] : null)

  if (loadError) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center p-8 bg-gray-800 rounded-xl">
          <h2 className="text-xl font-bold text-red-400 mb-4">
            Google Mapsの読み込みに失敗しました
          </h2>
          <p className="text-gray-400">
            APIキーが正しく設定されているか確認してください。
          </p>
          <p className="text-gray-500 text-sm mt-2">
            環境変数 VITE_GOOGLE_MAPS_API_KEY を設定してください。
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">地図検索</h1>
        <a
          href="/"
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors"
        >
          ホームに戻る
        </a>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Map area */}
        <div className="flex-1 relative">
          <SearchBar onPlaceSelect={handlePlaceSelect} isLoaded={isLoaded} />
          <MapView
            selectedLocation={selectedLocation}
            listLocations={activeList?.locations || []}
            route={displayRoute}
            isLoaded={isLoaded}
          />

          {/* Panel toggle button */}
          <button
            onClick={() => setIsPanelOpen(!isPanelOpen)}
            className="absolute bottom-4 right-4 z-10 p-3 bg-gray-800 hover:bg-gray-700 text-white rounded-full shadow-lg transition-colors md:hidden"
          >
            <svg
              className={`w-6 h-6 transition-transform ${isPanelOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>

        {/* Side panel */}
        <div
          className={`w-80 border-l border-gray-700 transition-all duration-300 ${
            isPanelOpen ? 'translate-x-0' : 'translate-x-full'
          } fixed right-0 top-[57px] bottom-0 md:relative md:top-0 md:translate-x-0 z-20`}
        >
          <MyListPanel
            selectedLocation={selectedLocation}
            onLocationSelect={handleLocationSelect}
            onCalculateRoute={calculateOptimalRoute}
            calculatingRoute={calculatingRoute}
          />
        </div>
      </div>
    </div>
  )
}

// Helper functions
function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`
  }
  return `${meters} m`
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (hours > 0) {
    return `${hours}時間${minutes}分`
  }
  return `${minutes}分`
}

// Wrapper with context provider
export function MapPage() {
  return (
    <MyListProvider>
      <MapPageContent />
    </MyListProvider>
  )
}
