// Google Maps related types

export interface Location {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  placeId?: string
  createdAt: Date
}

export interface MyList {
  id: string
  name: string
  description: string
  locations: Location[]
  createdAt: Date
  updatedAt: Date
}

export interface RouteInfo {
  listId: string
  optimizedOrder: string[] // location IDs in optimal order
  totalDistance: string
  totalDuration: string
  legs: RouteLeg[]
}

export interface RouteLeg {
  startLocationId: string
  endLocationId: string
  distance: string
  duration: string
}

export interface SearchResult {
  placeId: string
  name: string
  address: string
  lat: number
  lng: number
}
