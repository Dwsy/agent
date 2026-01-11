import React, { useState } from 'react'
import { useCodeMapStore } from '@stores/codemapStore'
import { Icon, getFileIcon } from '@components/icons'
import { Button } from '@components/ui/Button'
import { Input } from '@components/ui/Input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@components/ui/Tabs'
import { ScrollArea } from '@components/ui/ScrollArea'
import { HistoryEditDialog } from './HistoryEditDialog'
import { open } from '@tauri-apps/plugin-dialog'
import type { CodeMapMeta } from 'codemap'

/**
 * Sidebar 组件
 * 包含历史记录和建议主题
 */
const Sidebar: React.FC = () => {
  const {
    history,
    suggestedTopics,
    searchQuery,
    setSearchQuery,
    loadCodeMapById,
    removeFromHistory,
    updateHistory,
    exportHistory,
    importHistory,
    setShowCreateDialog,
    setInitialPrompt
  } = useCodeMapStore()

  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<CodeMapMeta | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [activeTab, setActiveTab] = useState<'history' | 'suggestions'>('history')

  // 过滤历史记录和建议主题
  const filteredHistory = history.filter(item =>
    item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.query.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const filteredSuggestions = suggestedTopics.filter(topic =>
    topic.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    topic.description.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleSuggestedTopicClick = async (topic: import('codemap').SuggestedTopic) => {
    const fullPrompt = topic.title + ': ' + topic.description
    setInitialPrompt(fullPrompt)
    setShowCreateDialog(true)
  }

  const handleEditClick = (item: CodeMapMeta) => {
    setSelectedItem(item)
    setEditDialogOpen(true)
  }

  const handleImport = async () => {
    try {
      setIsImporting(true)
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'CodeMap',
          extensions: ['json']
        }]
      })

      if (selected && typeof selected === 'string') {
        await importHistory(selected)
      }
    } catch (error) {
      console.error('Failed to import:', error)
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <aside className="w-80 border-r border-border flex flex-col bg-card">
      {/* Search */}
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Icon.Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search codemaps..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>
      
      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'history' | 'suggestions')}
        className="flex-1 flex flex-col"
      >
        <TabsList className="grid w-full grid-cols-2 m-0 rounded-none border-b border-border">
          <TabsTrigger 
            value="suggestions" 
            className="text-xs"
          >
            <Icon.Star size={14} className="mr-1" />
            Suggestions
          </TabsTrigger>
          <TabsTrigger 
            value="history" 
            className="text-xs"
          >
            <Icon.Clock size={14} className="mr-1" />
            History
          </TabsTrigger>
        </TabsList>
        <TabsContent value="suggestions" className="flex-1 flex-1 m-0">
          <ScrollArea className="h-[calc(100vh-8rem)]">
            <div className="p-3 space-y-2">
              {filteredSuggestions.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <Icon.BookOpen size={32} className="mx-auto mb-2 opacity-50" />
                  <p>No suggestions found</p>
                  <p className="text-xs mt-1">Try a different search term</p>
                </div>
              ) : (
                filteredSuggestions.map((topic) => (
                  <SuggestedTopicItem
                    key={topic.id}
                    topic={topic}
                    onClick={() => handleSuggestedTopicClick(topic)}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>
        
        <TabsContent value="history" className="flex-1 flex-1 m-0">
          {/* Import Button */}
          <div className="p-2 border-b border-border">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={handleImport}
              disabled={isImporting}
            >
              {isImporting ? (
                <>
                  <Icon.Loader2 size={14} className="mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Icon.Upload size={14} className="mr-2" />
                  Import CodeMap
                </>
              )}
            </Button>
          </div>
          <ScrollArea className="h-[calc(100vh-11rem)]">
            <div className="p-3 space-y-2">
              {filteredHistory.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <Icon.Clock size={32} className="mx-auto mb-2 opacity-50" />
                  <p>No history found</p>
                  <p className="text-xs mt-1">Create your first codemap</p>
                </div>
              ) : (
                filteredHistory.map((item) => (
                  <HistoryItem
                    key={item.id}
                    item={item}
                    onClick={() => loadCodeMapById(item.id)}
                    onDelete={() => removeFromHistory(item.id)}
                    onEdit={() => handleEditClick(item)}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <HistoryEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        item={selectedItem}
        onSave={updateHistory}
        onExport={exportHistory}
      />
    </aside>
  )
}

/**
 * 建议主题项
 */
interface SuggestedTopicItemProps {
  topic: import('codemap').SuggestedTopic
  onClick: (topic: import('codemap').SuggestedTopic) => void
}

const SuggestedTopicItem: React.FC<SuggestedTopicItemProps> = ({ topic, onClick }) => {
  return (
    <button
      onClick={() => onClick(topic)}
      className="w-full text-left p-3 rounded-lg hover:bg-muted transition-colors group"
    >
      <div className="flex items-start gap-2">
        <div className="flex-shrink-0 mt-0.5">
          {topic.icon ? (
            <span className="text-lg">{topic.icon}</span>
          ) : (
            <Icon.Star size={16} className="text-primary" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium line-clamp-2 group-hover:text-primary transition-colors">
            {topic.title}
          </h4>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {topic.description}
          </p>
        </div>
      </div>
    </button>
  )
}

/**
 * 历史记录项
 */
interface HistoryItemProps {
  item: import('codemap').CodeMapMeta
  onClick: () => void
  onDelete: () => void
  onEdit: () => void
}

const HistoryItem: React.FC<HistoryItemProps> = ({ item, onClick, onDelete, onEdit }) => {
  const [showActions, setShowActions] = useState(false)

  return (
    <div
      className="group relative p-3 rounded-lg hover:bg-muted transition-colors cursor-pointer"
      onClick={onClick}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="flex items-start gap-2">
        <div className="flex-shrink-0 mt-0.5">
          <Icon.Map size={16} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium line-clamp-2">
            {item.title}
          </h4>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
            {item.query}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-muted-foreground">
              {new Date(item.created_at).toLocaleDateString()}
            </span>
            {item.tags.length > 0 && (
              <>
                <span className="text-xs text-muted-foreground">•</span>
                <div className="flex gap-1">
                  {item.tags.slice(0, 2).map((tag) => (
                    <span
                      key={tag}
                      className="text-xs px-1.5 py-0.5 bg-primary/10 text-primary rounded"
                    >
                      {tag}
                    </span>
                  ))}
                  {item.tags.length > 2 && (
                    <span className="text-xs text-muted-foreground">
                      +{item.tags.length - 2}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      {showActions && (
        <div className="absolute top-2 right-2 flex gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onEdit()
            }}
            className="p-1 rounded hover:bg-primary/10 hover:text-primary transition-colors"
            title="Edit"
          >
            <Icon.Edit size={14} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            className="p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-colors"
            title="Delete"
          >
            <Icon.Trash2 size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

export default Sidebar
