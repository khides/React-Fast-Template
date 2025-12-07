import { MyList, Location } from '@/types/maps'

const API_BASE = '/api/v1/my-lists'

// API response types (matching backend schemas)
interface ApiLocation {
  id: number
  my_list_id: number
  name: string
  address: string
  lat: number
  lng: number
  place_id: string | null
  order_index: number
  created_at: string
}

interface ApiMyList {
  id: number
  name: string
  description: string
  created_at: string
  updated_at: string
  locations: ApiLocation[]
}

// Transform API response to frontend types
function transformLocation(apiLoc: ApiLocation): Location {
  return {
    id: String(apiLoc.id),
    name: apiLoc.name,
    address: apiLoc.address,
    lat: apiLoc.lat,
    lng: apiLoc.lng,
    placeId: apiLoc.place_id || undefined,
    createdAt: new Date(apiLoc.created_at),
  }
}

function transformMyList(apiList: ApiMyList): MyList {
  return {
    id: String(apiList.id),
    name: apiList.name,
    description: apiList.description,
    locations: apiList.locations
      .sort((a, b) => a.order_index - b.order_index)
      .map(transformLocation),
    createdAt: new Date(apiList.created_at),
    updatedAt: new Date(apiList.updated_at),
  }
}

// API functions
export async function fetchMyLists(): Promise<MyList[]> {
  const response = await fetch(API_BASE)
  if (!response.ok) {
    throw new Error('Failed to fetch lists')
  }
  const data: ApiMyList[] = await response.json()
  return data.map(transformMyList)
}

export async function createMyList(name: string, description = ''): Promise<MyList> {
  const response = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description }),
  })
  if (!response.ok) {
    throw new Error('Failed to create list')
  }
  const data: ApiMyList = await response.json()
  return transformMyList(data)
}

export async function updateMyList(
  listId: string,
  updates: { name?: string; description?: string }
): Promise<MyList> {
  const response = await fetch(`${API_BASE}${listId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  if (!response.ok) {
    throw new Error('Failed to update list')
  }
  const data: ApiMyList = await response.json()
  return transformMyList(data)
}

export async function deleteMyList(listId: string): Promise<void> {
  const response = await fetch(`${API_BASE}${listId}`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    throw new Error('Failed to delete list')
  }
}

export async function addLocationToList(
  listId: string,
  location: Omit<Location, 'id' | 'createdAt'>
): Promise<Location> {
  const response = await fetch(`${API_BASE}${listId}/locations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: location.name,
      address: location.address,
      lat: location.lat,
      lng: location.lng,
      place_id: location.placeId || null,
    }),
  })
  if (!response.ok) {
    throw new Error('Failed to add location')
  }
  const data: ApiLocation = await response.json()
  return transformLocation(data)
}

export async function removeLocationFromList(
  listId: string,
  locationId: string
): Promise<void> {
  const response = await fetch(`${API_BASE}${listId}/locations/${locationId}`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    throw new Error('Failed to remove location')
  }
}

export async function reorderLocations(
  listId: string,
  locationIds: string[]
): Promise<Location[]> {
  const response = await fetch(`${API_BASE}${listId}/locations/reorder`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location_ids: locationIds.map(Number) }),
  })
  if (!response.ok) {
    throw new Error('Failed to reorder locations')
  }
  const data: ApiLocation[] = await response.json()
  return data.map(transformLocation)
}
