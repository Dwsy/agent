import React, { useState, useRef, useEffect } from 'react'
import { cn } from './index'

const SelectContext = React.createContext<{
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  value: string
  onValueChange: (value: string) => void
} | null>(null)

export function Select({ value, onValueChange, children }: {
  value?: string
  onValueChange?: (value: string) => void
  children: React.ReactNode
}) {
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef<HTMLDivElement>(null)
  
  const handleClickOutside = (event: MouseEvent) => {
    if (triggerRef.current && !triggerRef.current.contains(event.target as Node)) {
      setIsOpen(false)
    }
  }
  
  useEffect(() => {
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    } else {
      document.removeEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])
  
  const handleValueChange = (newValue: string) => {
    onValueChange?.(newValue)
    setIsOpen(false)
  }
  
  return (
    <SelectContext.Provider value={{ isOpen, setIsOpen, value: value || '', onValueChange: handleValueChange }}>
      <div ref={triggerRef} className="relative">
        {React.Children.map(children, child => {
          if (React.isValidElement(child)) {
            return React.cloneElement(child as React.ReactElement<any>, {
              value: value || ''
            })
          }
          return child
        })}
      </div>
    </SelectContext.Provider>
  )
}

Select.displayName = 'Select'

function useSelectContext() {
  const context = React.useContext(SelectContext)
  if (!context) {
    throw new Error('Select components must be used within a Select component')
  }
  return context
}

const SelectTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, children, onClick, ...props }, ref) => {
  const { isOpen, setIsOpen } = useSelectContext()
  
  return (
    <button
      ref={ref}
      onClick={(e) => {
        onClick?.(e)
        setIsOpen(!isOpen)
      }}
      className={cn(
        'flex h-10 w-full items-center justify-between rounded-md border border-gray-300',
        'bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500',
        'focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    >
      {children}
      <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  )
})
SelectTrigger.displayName = 'SelectTrigger'

const SelectValue = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, children, ...props }, ref) => {
  const { value } = useSelectContext()
  
  return (
    <span ref={ref} className={cn('', className)} {...props}>
      {children || value}
    </span>
  )
})
SelectValue.displayName = 'SelectValue'

const SelectContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  const { isOpen, setIsOpen, value, onValueChange } = useSelectContext()
  
  if (!isOpen) return null
  
  return (
    <div
      ref={ref}
      className={cn(
        'absolute z-50 min-w-[8rem] overflow-hidden rounded-md border border-gray-200 bg-white',
        'text-gray-900 shadow-lg',
        'mt-1',
        className
      )}
      {...props}
    >
      <div className="p-1">
        {React.Children.map(children, child => {
          if (React.isValidElement(child) && child.type === SelectItem) {
            return React.cloneElement(child as React.ReactElement<any>, {
              onClick: () => onValueChange(child.props.value)
            })
          }
          return child
        })}
      </div>
    </div>
  )
})
SelectContent.displayName = 'SelectContent'

const SelectItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { value: string }
>(({ className, children, value, ...props }, ref) => {
  const { value: currentValue, onValueChange } = useSelectContext()
  const isActive = value === currentValue
  
  return (
    <div
      ref={ref}
      className={cn(
        'relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2',
        'text-sm outline-none hover:bg-gray-100',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        isActive && 'bg-blue-50 text-blue-900',
        className
      )}
      onClick={() => onValueChange(value)}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        {isActive && '✓'}
      </span>
      {children}
    </div>
  )
})
SelectItem.displayName = 'SelectItem'

export { Select as default, SelectTrigger, SelectValue, SelectContent, SelectItem }
