import { useCallback, useState, useRef, useEffect } from 'react'
import { GoogleMap, Marker, DirectionsRenderer } from '@react-google-maps/api'
import { Location, RouteInfo } from '@/types/maps'

interface MapViewProps {
  selectedLocation: { lat: number; lng: number; name?: string } | null
  listLocations: Location[]
  route: RouteInfo | null
  onMapClick?: (lat: number, lng: number) => void
  isLoaded: boolean
}

const mapContainerStyle = {
  width: '100%',
  height: '100%',
}

const defaultCenter = {
  lat: 35.6762,
  lng: 139.6503,
}

const mapOptions: google.maps.MapOptions = {
  disableDefaultUI: false,
  zoomControl: true,
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: true,
}

export function MapView({
  selectedLocation,
  listLocations,
  route,
  onMapClick,
  isLoaded,
}: MapViewProps) {
  const mapRef = useRef<google.maps.Map | null>(null)
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null)

  const onLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map
  }, [])

  const onUnmount = useCallback(() => {
    mapRef.current = null
  }, [])

  const handleMapClick = useCallback(
    (e: google.maps.MapMouseEvent) => {
      if (e.latLng && onMapClick) {
        onMapClick(e.latLng.lat(), e.latLng.lng())
      }
    },
    [onMapClick]
  )

  // Pan to selected location
  useEffect(() => {
    if (selectedLocation && mapRef.current) {
      mapRef.current.panTo({ lat: selectedLocation.lat, lng: selectedLocation.lng })
      mapRef.current.setZoom(15)
    }
  }, [selectedLocation])

  // Calculate directions when route is set
  useEffect(() => {
    if (!route || !isLoaded || listLocations.length < 2) {
      setDirections(null)
      return
    }

    const orderedLocations = route.optimizedOrder
      .map((id) => listLocations.find((loc) => loc.id === id))
      .filter((loc): loc is Location => loc !== undefined)

    if (orderedLocations.length < 2) {
      setDirections(null)
      return
    }

    const directionsService = new google.maps.DirectionsService()

    const origin = orderedLocations[0]
    const destination = orderedLocations[orderedLocations.length - 1]
    const waypoints = orderedLocations.slice(1, -1).map((loc) => ({
      location: { lat: loc.lat, lng: loc.lng },
      stopover: true,
    }))

    directionsService.route(
      {
        origin: { lat: origin.lat, lng: origin.lng },
        destination: { lat: destination.lat, lng: destination.lng },
        waypoints,
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === google.maps.DirectionsStatus.OK && result) {
          setDirections(result)
        } else {
          console.error('Directions request failed:', status)
          setDirections(null)
        }
      }
    )
  }, [route, listLocations, isLoaded])

  // Fit bounds to show all locations
  useEffect(() => {
    if (!mapRef.current || listLocations.length === 0) return

    const bounds = new google.maps.LatLngBounds()
    listLocations.forEach((loc) => {
      bounds.extend({ lat: loc.lat, lng: loc.lng })
    })

    if (selectedLocation) {
      bounds.extend({ lat: selectedLocation.lat, lng: selectedLocation.lng })
    }

    if (listLocations.length > 1 || (listLocations.length === 1 && selectedLocation)) {
      mapRef.current.fitBounds(bounds, 50)
    }
  }, [listLocations, selectedLocation])

  if (!isLoaded) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-800">
        <div className="text-white">地図を読み込み中...</div>
      </div>
    )
  }

  return (
    <GoogleMap
      mapContainerStyle={mapContainerStyle}
      center={selectedLocation || defaultCenter}
      zoom={12}
      onLoad={onLoad}
      onUnmount={onUnmount}
      onClick={handleMapClick}
      options={mapOptions}
    >
      {/* Selected location marker (blue) */}
      {selectedLocation && (
        <Marker
          position={{ lat: selectedLocation.lat, lng: selectedLocation.lng }}
          title={selectedLocation.name || '選択した場所'}
          icon={{
            url: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png',
          }}
        />
      )}

      {/* List locations markers (red with numbers) - only show if no route directions */}
      {!directions &&
        listLocations.map((location, index) => (
          <Marker
            key={location.id}
            position={{ lat: location.lat, lng: location.lng }}
            title={location.name}
            label={{
              text: String(index + 1),
              color: 'white',
              fontWeight: 'bold',
            }}
          />
        ))}

      {/* Directions renderer */}
      {directions && (
        <DirectionsRenderer
          directions={directions}
          options={{
            suppressMarkers: false,
            polylineOptions: {
              strokeColor: '#4285F4',
              strokeWeight: 5,
            },
          }}
        />
      )}
    </GoogleMap>
  )
}
