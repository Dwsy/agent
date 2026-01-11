import React from 'react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * 合并 Tailwind CSS 类名
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export * from './Button'
export * from './Input'
export * from './Dialog'
export * from './Tabs'
export * from './ScrollArea'
export * from './Select'