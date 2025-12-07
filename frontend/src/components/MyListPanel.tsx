import { useState } from 'react'
import { useMyList } from '@/contexts/MyListContext'
import { MyList, Location, SearchResult } from '@/types/maps'

interface MyListPanelProps {
  selectedLocation: SearchResult | null
  onLocationSelect: (location: Location) => void
  onCalculateRoute: (list: MyList) => void
  calculatingRoute: boolean
}

export function MyListPanel({
  selectedLocation,
  onLocationSelect,
  onCalculateRoute,
  calculatingRoute,
}: MyListPanelProps) {
  const {
    lists,
    routes,
    loading,
    error,
    createList,
    updateList,
    deleteList,
    addLocationToList,
    removeLocationFromList,
  } = useMyList()

  const [isCreating, setIsCreating] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [expandedListId, setExpandedListId] = useState<string | null>(null)
  const [editingListId, setEditingListId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [operationLoading, setOperationLoading] = useState(false)

  const handleCreateList = async () => {
    if (newListName.trim() && !operationLoading) {
      setOperationLoading(true)
      try {
        const newList = await createList(newListName.trim())
        setNewListName('')
        setIsCreating(false)
        setExpandedListId(newList.id)
      } catch (err) {
        console.error('Failed to create list:', err)
      } finally {
        setOperationLoading(false)
      }
    }
  }

  const handleAddToList = async (listId: string) => {
    if (selectedLocation && !operationLoading) {
      setOperationLoading(true)
      try {
        await addLocationToList(listId, {
          name: selectedLocation.name,
          address: selectedLocation.address,
          lat: selectedLocation.lat,
          lng: selectedLocation.lng,
          placeId: selectedLocation.placeId,
        })
      } catch (err) {
        console.error('Failed to add location:', err)
      } finally {
        setOperationLoading(false)
      }
    }
  }

  const handleStartEdit = (list: MyList) => {
    setEditingListId(list.id)
    setEditingName(list.name)
  }

  const handleSaveEdit = async (listId: string) => {
    if (editingName.trim() && !operationLoading) {
      setOperationLoading(true)
      try {
        await updateList(listId, { name: editingName.trim() })
        setEditingListId(null)
        setEditingName('')
      } catch (err) {
        console.error('Failed to update list:', err)
      } finally {
        setOperationLoading(false)
      }
    }
  }

  const handleCancelEdit = () => {
    setEditingListId(null)
    setEditingName('')
  }

  const handleDeleteList = async (list: MyList) => {
    if (confirm(`「${list.name}」を削除しますか？`) && !operationLoading) {
      setOperationLoading(true)
      try {
        await deleteList(list.id)
      } catch (err) {
        console.error('Failed to delete list:', err)
      } finally {
        setOperationLoading(false)
      }
    }
  }

  const handleRemoveLocation = async (listId: string, locationId: string) => {
    if (!operationLoading) {
      setOperationLoading(true)
      try {
        await removeLocationFromList(listId, locationId)
      } catch (err) {
        console.error('Failed to remove location:', err)
      } finally {
        setOperationLoading(false)
      }
    }
  }

  return (
    <div className="h-full bg-gray-900 text-white overflow-hidden flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">マイリスト</h2>
          <button
            onClick={() => setIsCreating(true)}
            disabled={operationLoading}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg text-sm transition-colors"
          >
            + 新規作成
          </button>
        </div>

        {/* Error display */}
        {error && (
          <div className="mb-3 p-2 bg-red-900/50 rounded-lg border border-red-700">
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {/* Create new list form */}
        {isCreating && (
          <div className="mt-3 p-3 bg-gray-800 rounded-lg">
            <input
              type="text"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder="リスト名を入力..."
              className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 focus:outline-none text-sm"
              autoFocus
              disabled={operationLoading}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateList()
                if (e.key === 'Escape') setIsCreating(false)
              }}
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleCreateList}
                disabled={operationLoading}
                className="flex-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded text-sm transition-colors"
              >
                {operationLoading ? '作成中...' : '作成'}
              </button>
              <button
                onClick={() => {
                  setIsCreating(false)
                  setNewListName('')
                }}
                disabled={operationLoading}
                className="flex-1 px-3 py-1.5 bg-gray-600 hover:bg-gray-500 disabled:opacity-50 rounded text-sm transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        )}

        {/* Selected location info */}
        {selectedLocation && (
          <div className="mt-3 p-3 bg-blue-900/50 rounded-lg border border-blue-700">
            <p className="text-sm text-blue-300 mb-1">選択中の場所:</p>
            <p className="font-medium truncate">{selectedLocation.name}</p>
            <p className="text-xs text-gray-400 truncate">{selectedLocation.address}</p>
          </div>
        )}
      </div>

      {/* Lists */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-gray-500">
            <p>読み込み中...</p>
          </div>
        ) : lists.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            <p>マイリストがありません</p>
            <p className="text-sm mt-1">「新規作成」で作成してください</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-700">
            {lists.map((list) => (
              <div key={list.id} className="bg-gray-800/50">
                {/* List header */}
                <div
                  className="p-3 cursor-pointer hover:bg-gray-700/50 transition-colors"
                  onClick={() =>
                    setExpandedListId(expandedListId === list.id ? null : list.id)
                  }
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <svg
                        className={`w-4 h-4 transition-transform ${
                          expandedListId === list.id ? 'rotate-90' : ''
                        }`}
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
                      {editingListId === list.id ? (
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit(list.id)
                            if (e.key === 'Escape') handleCancelEdit()
                          }}
                          className="flex-1 px-2 py-1 bg-gray-600 rounded border border-gray-500 focus:border-blue-500 focus:outline-none text-sm"
                          autoFocus
                          disabled={operationLoading}
                        />
                      ) : (
                        <span className="font-medium truncate">{list.name}</span>
                      )}
                    </div>
                    <span className="text-sm text-gray-400 ml-2">
                      {list.locations.length}件
                    </span>
                  </div>
                </div>

                {/* Expanded content */}
                {expandedListId === list.id && (
                  <div className="px-3 pb-3">
                    {/* Action buttons */}
                    <div className="flex gap-2 mb-3">
                      {selectedLocation && (
                        <button
                          onClick={() => handleAddToList(list.id)}
                          disabled={operationLoading}
                          className="flex-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded text-sm transition-colors"
                        >
                          {operationLoading ? '追加中...' : '+ 場所を追加'}
                        </button>
                      )}
                      {list.locations.length >= 2 && (
                        <button
                          onClick={() => onCalculateRoute(list)}
                          disabled={calculatingRoute || operationLoading}
                          className="flex-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded text-sm transition-colors"
                        >
                          {calculatingRoute ? '計算中...' : 'ルート計算'}
                        </button>
                      )}
                    </div>

                    {/* Route info */}
                    {routes[list.id] && (
                      <div className="mb-3 p-2 bg-purple-900/30 rounded border border-purple-700">
                        <p className="text-sm text-purple-300">
                          総距離: {routes[list.id].totalDistance} /
                          所要時間: {routes[list.id].totalDuration}
                        </p>
                      </div>
                    )}

                    {/* Locations list */}
                    {list.locations.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-2">
                        場所が登録されていません
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {list.locations.map((location, index) => (
                          <div
                            key={location.id}
                            className="flex items-center gap-2 p-2 bg-gray-700/50 rounded hover:bg-gray-700 transition-colors"
                          >
                            <span className="w-6 h-6 flex items-center justify-center bg-blue-600 rounded-full text-xs font-bold">
                              {index + 1}
                            </span>
                            <div
                              className="flex-1 min-w-0 cursor-pointer"
                              onClick={() => onLocationSelect(location)}
                            >
                              <p className="text-sm font-medium truncate">
                                {location.name}
                              </p>
                              <p className="text-xs text-gray-400 truncate">
                                {location.address}
                              </p>
                            </div>
                            <button
                              onClick={() => handleRemoveLocation(list.id, location.id)}
                              disabled={operationLoading}
                              className="p-1 text-gray-400 hover:text-red-400 disabled:opacity-50 transition-colors"
                              title="削除"
                            >
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M6 18L18 6M6 6l12 12"
                                />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* List actions */}
                    <div className="flex gap-2 mt-3 pt-3 border-t border-gray-700">
                      {editingListId === list.id ? (
                        <>
                          <button
                            onClick={() => handleSaveEdit(list.id)}
                            disabled={operationLoading}
                            className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded text-xs transition-colors"
                          >
                            {operationLoading ? '保存中...' : '保存'}
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            disabled={operationLoading}
                            className="px-3 py-1 bg-gray-600 hover:bg-gray-500 disabled:opacity-50 rounded text-xs transition-colors"
                          >
                            キャンセル
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleStartEdit(list)}
                            disabled={operationLoading}
                            className="px-3 py-1 bg-gray-600 hover:bg-gray-500 disabled:opacity-50 rounded text-xs transition-colors"
                          >
                            編集
                          </button>
                          <button
                            onClick={() => handleDeleteList(list)}
                            disabled={operationLoading}
                            className="px-3 py-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded text-xs transition-colors"
                          >
                            削除
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
