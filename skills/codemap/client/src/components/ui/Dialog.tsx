import React, { useEffect, useState } from 'react'
import { cn } from './index'
import { X } from 'lucide-react'

export function Dialog({ open, onOpenChange, children }: {
  open: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}) {
  const [mounted, setMounted] = useState(false)
  
  useEffect(() => {
    if (open) {
      setMounted(true)
      document.body.style.overflow = 'hidden'
    } else {
      setTimeout(() => setMounted(false), 200)
      document.body.style.overflow = ''
    }
  }, [open])
  
  if (!open && !mounted) return null
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 animate-in fade-in"
        onClick={() => onOpenChange?.(false)}
      />
      
      {/* Dialog Content */}
      <div className="relative z-50 w-full max-w-2xl p-4 animate-in zoom-in-95">
        {children}
      </div>
    </div>
  )
}

Dialog.displayName = 'Dialog'

export function DialogContent({ children, className }: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn(
      "bg-white border border-gray-200 rounded-lg shadow-xl p-6",
      className
    )}>
      {children}
    </div>
  )
}

DialogContent.displayName = 'DialogContent'

export function DialogHeader({ children, className }: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}>
      {children}
    </div>
  )
}

DialogHeader.displayName = 'DialogHeader'

export function DialogTitle({ children, className }: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <h2 className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}>
      {children}
    </h2>
  )
}

DialogTitle.displayName = 'DialogTitle'

export function DialogFooter({ children, className }: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 gap-2 mt-6",
      className
    )}>
      {children}
    </div>
  )
}

DialogFooter.displayName = 'DialogFooter'

export function DialogClose({ onClick }: {
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
    >
      <X className="h-4 w-4" />
      <span className="sr-only">Close</span>
    </button>
  )
}

DialogClose.displayName = 'DialogClose'
