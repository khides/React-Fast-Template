import { useRef, useEffect, useState } from 'react'
import { SearchResult } from '@/types/maps'

interface SearchBarProps {
  onPlaceSelect: (result: SearchResult) => void
  isLoaded: boolean
}

export function SearchBar({ onPlaceSelect, isLoaded }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null)
  const [inputValue, setInputValue] = useState('')

  useEffect(() => {
    if (!isLoaded || !inputRef.current || autocompleteRef.current) return

    const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
      types: ['establishment', 'geocode'],
      fields: ['place_id', 'name', 'formatted_address', 'geometry'],
    })

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace()

      if (place.geometry?.location && place.place_id) {
        const result: SearchResult = {
          placeId: place.place_id,
          name: place.name || '',
          address: place.formatted_address || '',
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
        }
        onPlaceSelect(result)
        setInputValue(place.name || place.formatted_address || '')
      }
    })

    autocompleteRef.current = autocomplete

    return () => {
      if (autocompleteRef.current) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current)
      }
    }
  }, [isLoaded, onPlaceSelect])

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 w-full max-w-lg px-4">
      <div className="relative">
        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
          <svg
            className="w-5 h-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="場所を検索..."
          className="w-full pl-10 pr-4 py-3 bg-white rounded-xl shadow-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-500"
          disabled={!isLoaded}
        />
      </div>
    </div>
  )
}
