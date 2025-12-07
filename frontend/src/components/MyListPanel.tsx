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

  const handleCreateList = () => {
    if (newListName.trim()) {
      const newList = createList(newListName.trim())
      setNewListName('')
      setIsCreating(false)
      setExpandedListId(newList.id)
    }
  }

  const handleAddToList = (listId: string) => {
    if (selectedLocation) {
      addLocationToList(listId, {
        name: selectedLocation.name,
        address: selectedLocation.address,
        lat: selectedLocation.lat,
        lng: selectedLocation.lng,
        placeId: selectedLocation.placeId,
      })
    }
  }

  const handleStartEdit = (list: MyList) => {
    setEditingListId(list.id)
    setEditingName(list.name)
  }

  const handleSaveEdit = (listId: string) => {
    if (editingName.trim()) {
      updateList(listId, { name: editingName.trim() })
    }
    setEditingListId(null)
    setEditingName('')
  }

  const handleCancelEdit = () => {
    setEditingListId(null)
    setEditingName('')
  }

  return (
    <div className="h-full bg-gray-900 text-white overflow-hidden flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">マイリスト</h2>
          <button
            onClick={() => setIsCreating(true)}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm transition-colors"
          >
            + 新規作成
          </button>
        </div>

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
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateList()
                if (e.key === 'Escape') setIsCreating(false)
              }}
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleCreateList}
                className="flex-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded text-sm transition-colors"
              >
                作成
              </button>
              <button
                onClick={() => {
                  setIsCreating(false)
                  setNewListName('')
                }}
                className="flex-1 px-3 py-1.5 bg-gray-600 hover:bg-gray-500 rounded text-sm transition-colors"
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
        {lists.length === 0 ? (
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
                          className="flex-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded text-sm transition-colors"
                        >
                          + 場所を追加
                        </button>
                      )}
                      {list.locations.length >= 2 && (
                        <button
                          onClick={() => onCalculateRoute(list)}
                          disabled={calculatingRoute}
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
                              onClick={() =>
                                removeLocationFromList(list.id, location.id)
                              }
                              className="p-1 text-gray-400 hover:text-red-400 transition-colors"
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
                            className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-xs transition-colors"
                          >
                            保存
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-xs transition-colors"
                          >
                            キャンセル
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleStartEdit(list)}
                            className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-xs transition-colors"
                          >
                            編集
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`「${list.name}」を削除しますか？`)) {
                                deleteList(list.id)
                              }
                            }}
                            className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-xs transition-colors"
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
