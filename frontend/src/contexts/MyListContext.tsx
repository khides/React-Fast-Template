import { createContext, useContext, ReactNode, useCallback } from 'react'
import { MyList, Location, RouteInfo } from '@/types/maps'
import { useLocalStorage } from '@/hooks/useLocalStorage'

interface MyListContextType {
  lists: MyList[]
  routes: Record<string, RouteInfo>
  createList: (name: string, description?: string) => MyList
  updateList: (listId: string, updates: Partial<Omit<MyList, 'id' | 'createdAt'>>) => void
  deleteList: (listId: string) => void
  addLocationToList: (listId: string, location: Omit<Location, 'id' | 'createdAt'>) => void
  removeLocationFromList: (listId: string, locationId: string) => void
  reorderLocations: (listId: string, locationIds: string[]) => void
  setRouteForList: (listId: string, route: RouteInfo) => void
  clearRouteForList: (listId: string) => void
}

const MyListContext = createContext<MyListContextType | null>(null)

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

export function MyListProvider({ children }: { children: ReactNode }) {
  const [lists, setLists] = useLocalStorage<MyList[]>('myLists', [])
  const [routes, setRoutes] = useLocalStorage<Record<string, RouteInfo>>('myRoutes', {})

  const createList = useCallback((name: string, description = ''): MyList => {
    const newList: MyList = {
      id: generateId(),
      name,
      description,
      locations: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    setLists((prev) => [...prev, newList])
    return newList
  }, [setLists])

  const updateList = useCallback((listId: string, updates: Partial<Omit<MyList, 'id' | 'createdAt'>>) => {
    setLists((prev) =>
      prev.map((list) =>
        list.id === listId
          ? { ...list, ...updates, updatedAt: new Date() }
          : list
      )
    )
  }, [setLists])

  const deleteList = useCallback((listId: string) => {
    setLists((prev) => prev.filter((list) => list.id !== listId))
    setRoutes((prev) => {
      const { [listId]: _, ...rest } = prev
      return rest
    })
  }, [setLists, setRoutes])

  const addLocationToList = useCallback((listId: string, location: Omit<Location, 'id' | 'createdAt'>) => {
    const newLocation: Location = {
      ...location,
      id: generateId(),
      createdAt: new Date(),
    }
    setLists((prev) =>
      prev.map((list) =>
        list.id === listId
          ? {
              ...list,
              locations: [...list.locations, newLocation],
              updatedAt: new Date(),
            }
          : list
      )
    )
    // Clear existing route when locations change
    setRoutes((prev) => {
      const { [listId]: _, ...rest } = prev
      return rest
    })
  }, [setLists, setRoutes])

  const removeLocationFromList = useCallback((listId: string, locationId: string) => {
    setLists((prev) =>
      prev.map((list) =>
        list.id === listId
          ? {
              ...list,
              locations: list.locations.filter((loc) => loc.id !== locationId),
              updatedAt: new Date(),
            }
          : list
      )
    )
    // Clear existing route when locations change
    setRoutes((prev) => {
      const { [listId]: _, ...rest } = prev
      return rest
    })
  }, [setLists, setRoutes])

  const reorderLocations = useCallback((listId: string, locationIds: string[]) => {
    setLists((prev) =>
      prev.map((list) => {
        if (list.id !== listId) return list
        const locationMap = new Map(list.locations.map((loc) => [loc.id, loc]))
        const reorderedLocations = locationIds
          .map((id) => locationMap.get(id))
          .filter((loc): loc is Location => loc !== undefined)
        return {
          ...list,
          locations: reorderedLocations,
          updatedAt: new Date(),
        }
      })
    )
  }, [setLists])

  const setRouteForList = useCallback((listId: string, route: RouteInfo) => {
    setRoutes((prev) => ({ ...prev, [listId]: route }))
  }, [setRoutes])

  const clearRouteForList = useCallback((listId: string) => {
    setRoutes((prev) => {
      const { [listId]: _, ...rest } = prev
      return rest
    })
  }, [setRoutes])

  return (
    <MyListContext.Provider
      value={{
        lists,
        routes,
        createList,
        updateList,
        deleteList,
        addLocationToList,
        removeLocationFromList,
        reorderLocations,
        setRouteForList,
        clearRouteForList,
      }}
    >
      {children}
    </MyListContext.Provider>
  )
}

export function useMyList() {
  const context = useContext(MyListContext)
  if (!context) {
    throw new Error('useMyList must be used within a MyListProvider')
  }
  return context
}
