import React from 'react'
import { cn } from './index'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'ghost' | 'link'
  size?: 'default' | 'sm' | 'lg' | 'icon'
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-md text-sm font-medium transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
        'disabled:pointer-events-none disabled:opacity-50',
        {
          'bg-blue-600 text-white hover:bg-blue-700':
          variant === 'default',
          'bg-red-600 text-white hover:bg-red-700':
          variant === 'destructive',
          'border border-gray-300 bg-white text-gray-900 hover:bg-gray-50':
          variant === 'outline',
          'hover:bg-gray-100 text-gray-900':
          variant === 'ghost',
          'text-blue-600 underline-offset-4 hover:underline':
          variant === 'link',
        },
        {
          'h-10 px-4 py-2':
            size === 'default',
          'h-9 rounded-md px-3':
            size === 'sm',
          'h-11 rounded-md px-8':
            size === 'lg',
          'h-10 w-10':
            size === 'icon',
        },
        className
      )}
      ref={ref}
      {...props}
    />
  )
}
)
Button.displayName = 'Button'

export { Button }
