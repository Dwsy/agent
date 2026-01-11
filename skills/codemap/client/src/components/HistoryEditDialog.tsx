import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/Dialog'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Icon } from './icons'
import type { CodeMapMeta } from 'codemap'

interface HistoryEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: CodeMapMeta | null
  onSave: (id: string, updates: { title?: string; note?: string; tags?: string[] }) => Promise<void>
  onExport: (id: string, format: 'json' | 'markdown' | 'html') => Promise<string>
}

export const HistoryEditDialog: React.FC<HistoryEditDialogProps> = ({
  open,
  onOpenChange,
  item,
  onSave,
  onExport,
}) => {
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportSuccess, setExportSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (item) {
      setTitle(item.title || '')
      setNote(item.note || '')
      setTagsInput(item.tags?.join(', ') || '')
      setExportSuccess(null)
    }
  }, [item])

  const handleSave = async () => {
    if (!item) return

    setIsSaving(true)
    try {
      const tags = tagsInput
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0)

      await onSave(item.id, { title, note, tags })
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to save:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleExport = async (format: 'json' | 'markdown' | 'html') => {
    if (!item) return

    setIsExporting(true)
    setExportSuccess(null)
    try {
      const path = await onExport(item.id, format)
      setExportSuccess(`Exported to: ${path}`)
    } catch (error) {
      console.error('Failed to export:', error)
    } finally {
      setIsExporting(false)
    }
  }

  if (!item) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit History</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Title */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter title..."
            />
          </div>

          {/* Note */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Note</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note..."
              className="w-full h-24 px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Tags (comma separated)</label>
            <Input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="tag1, tag2, tag3..."
            />
          </div>

          {/* Info */}
          <div className="text-xs text-gray-500 space-y-1">
            <p>ID: {item.id}</p>
            <p>Created: {new Date(item.created_at).toLocaleString()}</p>
            <p>Updated: {new Date(item.updated_at).toLocaleString()}</p>
          </div>

          {/* Export Section */}
          <div className="border-t pt-4">
            <label className="text-sm font-medium mb-2 block">Export</label>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport('json')}
                disabled={isExporting}
              >
                <Icon.FileJson size={14} className="mr-1" />
                JSON
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport('markdown')}
                disabled={isExporting}
              >
                <Icon.FileText size={14} className="mr-1" />
                Markdown
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport('html')}
                disabled={isExporting}
              >
                <Icon.Globe size={14} className="mr-1" />
                HTML
              </Button>
            </div>
            {exportSuccess && (
              <p className="text-xs text-green-600 mt-2">{exportSuccess}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Icon.Loader2 size={16} className="mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default HistoryEditDialog
