import React, { createContext, useContext, useState } from 'react'
import { cn } from './index'

interface TabsContextValue {
  activeTab: string
  onTabChange: (value: string) => void
}

const TabsContext = createContext<TabsContextValue | null>(null)

function useTabsContext() {
  const context = useContext(TabsContext)
  if (!context) {
    throw new Error('Tabs components must be used within a Tabs provider')
  }
  return context
}

export function Tabs({ className, children, defaultValue, value, onValueChange, ...props }: {
  className?: string
  children: React.ReactNode
  defaultValue?: string
  value?: string
  onValueChange?: (value: string) => void
} & React.HTMLAttributes<HTMLDivElement>) {
  const [internalActiveTab, setInternalActiveTab] = useState(defaultValue || '')
  const activeTab = value !== undefined ? value : internalActiveTab

  const onTabChange = (tabValue: string) => {
    if (onValueChange) {
      onValueChange(tabValue)
    }
    setInternalActiveTab(tabValue)
  }

  return (
    <TabsContext.Provider value={{ activeTab, onTabChange }}>
      <div className={cn('', className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  )
}
Tabs.displayName = 'Tabs'

export function TabsList({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'inline-flex h-10 items-center justify-center rounded-md bg-muted p-1',
        'text-muted-foreground',
        className
      )}
      {...props}
    />
  )
}
TabsList.displayName = 'TabsList'

export function TabsTrigger({
  value,
  className,
  ...props
}: {
  value: string
  className?: string
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { activeTab, onTabChange } = useTabsContext()
  const isActive = activeTab === value

  return (
    <button
      onClick={() => onTabChange(value)}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5',
        'text-sm font-medium ring-offset-background transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:pointer-events-none disabled:opacity-50',
        isActive && 'bg-background text-foreground',
        !isActive && 'hover:bg-muted hover:text-accent-foreground',
        'transition-colors',
        className
      )}
      {...props}
    />
  )
}
TabsTrigger.displayName = 'TabsTrigger'

export function TabsContent({
  value,
  className,
  ...props
}: {
  value: string
  className?: string
} & React.HTMLAttributes<HTMLDivElement>) {
  const { activeTab } = useTabsContext()

  if (activeTab !== value) return null

  return (
    <div
      className={cn(
        'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2',
        'focus-visible:ring-ring focus-visible:ring-offset-2',
        className
      )}
      {...props}
    />
  )
}
TabsContent.displayName = 'TabsContent'
