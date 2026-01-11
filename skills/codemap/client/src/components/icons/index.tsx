import React, { useState } from 'react'
import {
  Map,
  Plus,
  Search,
  Settings,
  HelpCircle,
  BookOpen,
  FileCode,
  FileJson,
  Clock,
  Share2,
  Save,
  Download,
  Upload,
  Trash2,
  X,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  GitBranch,
  Layers,
  Zap,
  Brain,
  Network,
  FileText,
  ExternalLink,
  Copy,
  MoreVertical,
  RefreshCw,
  Filter,
  Tag,
  MessageSquare,
  Star,
  FolderOpen,
  File,
  CheckCircle,
  AlertCircle,
  Loader2,
  ArrowRight,
  ArrowDown,
  Sun,
  Moon,
  Send,
  Edit,
  Globe
} from 'lucide-react'

/**
 * Icon 组件映射
 * 提供统一的图标接口
 */
export const Icon = {
  // 应用图标
  Logo: Map,
  Map,
  Plus,
  Search,
  Settings,
  HelpCircle,

  // 文件图标
  FileCode,
  FileText,
  FileJson,
  File,
  FolderOpen,

  // 操作图标
  Save,
  Download,
  Upload,
  Trash2,
  Share2,
  Copy,
  ExternalLink,
  RefreshCw,
  Send,
  Edit,
  X,
  Globe,

  // 导航图标
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  ArrowDown,
  
  // 视图图标
  Layers,
  Network,
  GitBranch,
  
  // 功能图标
  Zap,
  Brain,
  BookOpen,
  Clock,
  MessageSquare,
  Star,
  
  // 状态图标
  CheckCircle,
  AlertCircle,
  Loader2,
  
  // 更多图标
  MoreVertical,
  Filter,
  Tag,
  Sun,
  Moon,
}

/**
 * 图标包装器
 * 提供统一的样式和大小
 */
interface IconWrapperProps {
  icon: React.ElementType
  size?: number
  className?: string
  onClick?: () => void
  title?: string
}

export const IconWrapper: React.FC<IconWrapperProps> = ({
  icon: IconComponent,
  size = 16,
  className = '',
  onClick,
  title,
}) => {
  return (
    <IconComponent 
      size={size} 
      className={className}
      onClick={onClick}
      title={title}
    />
  )
}

/**
 * 获取文件类型图标
 */
export const getFileIcon = (fileType: string): React.ElementType => {
  const type = fileType.toLowerCase()
  
  if (['js', 'jsx', 'ts', 'tsx'].includes(type)) {
    return FileCode
  }
  if (['md', 'txt', 'rst'].includes(type)) {
    return FileText
  }
  if (['html', 'css', 'scss', 'sass'].includes(type)) {
    return FileCode
  }
  if (['json', 'yaml', 'yml', 'toml'].includes(type)) {
    return FileText
  }
  
  return File
}

/**
 * 获取节点类型图标
 */
export const getNodeIcon = (nodeTitle: string): React.ElementType => {
  const title = nodeTitle.toLowerCase()
  
  if (title.includes('controller') || title.includes('endpoint') || title.includes('route')) {
    return GitBranch
  }
  if (title.includes('service') || title.includes('manager') || title.includes('handler')) {
    return Layers
  }
  if (title.includes('model') || title.includes('entity') || title.includes('schema')) {
    return FileText
  }
  if (title.includes('repository') || title.includes('dao') || title.includes('mapper')) {
    return FileCode
  }
  if (title.includes('config') || title.includes('setting')) {
    return Settings
  }
  if (title.includes('test') || title.includes('spec')) {
    return CheckCircle
  }
  
  return FileCode
}

/**
 * 获取模型档位图标
 */
export const getModelTierIcon = (tier: 'fast' | 'smart'): React.ElementType => {
  return tier === 'fast' ? Zap : Brain
}

/**
 * 获取视图模式图标
 */
export const getViewModeIcon = (mode: 'tree' | 'graph'): React.ElementType => {
  return mode === 'tree' ? Layers : Network
}

/**
 * 获取边类型图标
 */
export const getEdgeTypeIcon = (edgeType: string): React.ElementType => {
  switch (edgeType) {
    case 'calls':
      return ArrowRight
    case 'data_flow':
      return ArrowDown
    case 'depends':
      return GitBranch
    default:
      return ArrowRight
  }
}

/**
 * 带有工具提示的图标
 */
interface IconWithTooltipProps {
  icon: React.ElementType
  tooltip: string
  size?: number
  className?: string
  onClick?: () => void
}

export const IconWithTooltip: React.FC<IconWithTooltipProps> = ({
  icon: IconComponent,
  tooltip,
  size = 16,
  className = '',
  onClick,
}) => {
  return (
    <div className="relative inline-flex group">
      <IconComponent 
        size={size} 
        className={className}
        onClick={onClick}
      />
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
        {tooltip}
      </div>
    </div>
  )
}

/**
 * 加载动画图标
 */
export const LoadingSpinner: React.FC<{ size?: number; className?: string }> = ({ 
  size = 24, 
  className = '' 
}) => {
  return (
    <Loader2 
      size={size} 
      className={`animate-spin ${className}`} 
    />
  )
}

/**
 * 状态图标
 */
interface StatusIconProps {
  status: 'success' | 'error' | 'warning' | 'loading'
  size?: number
  className?: string
}

export const StatusIcon: React.FC<StatusIconProps> = ({ 
  status, 
  size = 16, 
  className = '' 
}) => {
  switch (status) {
    case 'success':
      return <CheckCircle size={size} className={`text-green-500 ${className}`} />
    case 'error':
      return <AlertCircle size={size} className={`text-red-500 ${className}`} />
    case 'warning':
      return <AlertCircle size={size} className={`text-yellow-500 ${className}`} />
    case 'loading':
      return <LoadingSpinner size={size} className={className} />
    default:
      return null
  }
}

export default Icon