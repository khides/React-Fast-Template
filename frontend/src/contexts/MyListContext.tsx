import { createContext, useContext, ReactNode, useCallback, useState, useEffect } from 'react'
import { MyList, Location, RouteInfo } from '@/types/maps'
import * as api from '@/services/myListApi'

interface MyListContextType {
  lists: MyList[]
  routes: Record<string, RouteInfo>
  loading: boolean
  error: string | null
  refreshLists: () => Promise<void>
  createList: (name: string, description?: string) => Promise<MyList>
  updateList: (listId: string, updates: Partial<Omit<MyList, 'id' | 'createdAt'>>) => Promise<void>
  deleteList: (listId: string) => Promise<void>
  addLocationToList: (listId: string, location: Omit<Location, 'id' | 'createdAt'>) => Promise<void>
  removeLocationFromList: (listId: string, locationId: string) => Promise<void>
  reorderLocations: (listId: string, locationIds: string[]) => Promise<void>
  setRouteForList: (listId: string, route: RouteInfo) => void
  clearRouteForList: (listId: string) => void
}

const MyListContext = createContext<MyListContextType | null>(null)

export function MyListProvider({ children }: { children: ReactNode }) {
  const [lists, setLists] = useState<MyList[]>([])
  const [routes, setRoutes] = useState<Record<string, RouteInfo>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refreshLists = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await api.fetchMyLists()
      setLists(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch lists')
      console.error('Failed to fetch lists:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Load lists on mount
  useEffect(() => {
    refreshLists()
  }, [refreshLists])

  const createList = useCallback(async (name: string, description = ''): Promise<MyList> => {
    try {
      const newList = await api.createMyList(name, description)
      setLists((prev) => [newList, ...prev])
      return newList
    } catch (err) {
      console.error('Failed to create list:', err)
      throw err
    }
  }, [])

  const updateList = useCallback(async (listId: string, updates: Partial<Omit<MyList, 'id' | 'createdAt'>>) => {
    try {
      const updatedList = await api.updateMyList(listId, {
        name: updates.name,
        description: updates.description,
      })
      setLists((prev) =>
        prev.map((list) => (list.id === listId ? updatedList : list))
      )
    } catch (err) {
      console.error('Failed to update list:', err)
      throw err
    }
  }, [])

  const deleteList = useCallback(async (listId: string) => {
    try {
      await api.deleteMyList(listId)
      setLists((prev) => prev.filter((list) => list.id !== listId))
      setRoutes((prev) => {
        const { [listId]: _, ...rest } = prev
        return rest
      })
    } catch (err) {
      console.error('Failed to delete list:', err)
      throw err
    }
  }, [])

  const addLocationToList = useCallback(async (listId: string, location: Omit<Location, 'id' | 'createdAt'>) => {
    try {
      const newLocation = await api.addLocationToList(listId, location)
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
    } catch (err) {
      console.error('Failed to add location:', err)
      throw err
    }
  }, [])

  const removeLocationFromList = useCallback(async (listId: string, locationId: string) => {
    try {
      await api.removeLocationFromList(listId, locationId)
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
    } catch (err) {
      console.error('Failed to remove location:', err)
      throw err
    }
  }, [])

  const reorderLocations = useCallback(async (listId: string, locationIds: string[]) => {
    try {
      const reorderedLocations = await api.reorderLocations(listId, locationIds)
      setLists((prev) =>
        prev.map((list) =>
          list.id === listId
            ? {
                ...list,
                locations: reorderedLocations,
                updatedAt: new Date(),
              }
            : list
        )
      )
    } catch (err) {
      console.error('Failed to reorder locations:', err)
      throw err
    }
  }, [])

  const setRouteForList = useCallback((listId: string, route: RouteInfo) => {
    setRoutes((prev) => ({ ...prev, [listId]: route }))
  }, [])

  const clearRouteForList = useCallback((listId: string) => {
    setRoutes((prev) => {
      const { [listId]: _, ...rest } = prev
      return rest
    })
  }, [])

  return (
    <MyListContext.Provider
      value={{
        lists,
        routes,
        loading,
        error,
        refreshLists,
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
