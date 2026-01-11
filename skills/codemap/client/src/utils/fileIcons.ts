import { getFileIcon } from 'file-icons-js'

/**
 * 根据文件名获取文件图标 SVG
 */
export function getFileIconSVG(fileName: string, isOpen: boolean = false): string {
  const icon = getFileIcon(fileName)
  return icon
}

/**
 * 根据文件扩展名获取图标名称
 */
export function getFileIconName(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  
  const iconMap: Record<string, string> = {
    // 编程语言
    'js': 'javascript',
    'ts': 'typescript',
    'tsx': 'react_tsx',
    'jsx': 'react_jsx',
    'vue': 'vue',
    'svelte': 'svelte',
    'rs': 'rust',
    'go': 'go',
    'java': 'java',
    'py': 'python',
    'rb': 'ruby',
    'php': 'php',
    'c': 'c',
    'cpp': 'cpp',
    'h': 'c',
    'hpp': 'cpp',
    'cs': 'csharp',
    'swift': 'swift',
    'kt': 'kotlin',
    'dart': 'dart',
    'scala': 'scala',
    'lua': 'lua',
    'r': 'r',
    'm': 'matlab',
    'sh': 'shell',
    'bash': 'shell',
    'zsh': 'shell',
    'fish': 'shell',
    'ps1': 'powershell',
    'bat': 'batch',
    'cmd': 'batch',
    
    // 配置文件
    'json': 'json',
    'xml': 'xml',
    'yaml': 'yaml',
    'yml': 'yaml',
    'toml': 'toml',
    'ini': 'ini',
    'cfg': 'config',
    'conf': 'config',
    'env': 'env',
    'dockerfile': 'docker',
    'dockerignore': 'docker',
    'docker-compose': 'docker',
    
    // 样式文件
    'css': 'css',
    'scss': 'sass',
    'sass': 'sass',
    'less': 'less',
    'styl': 'stylus',
    
    // 模板文件
    'html': 'html',
    'htm': 'html',
    'hbs': 'handlebars',
    'mustache': 'mustache',
    'ejs': 'ejs',
    'pug': 'pug',
    'jade': 'pug',
    
    // 数据库
    'sql': 'database',
    'db': 'database',
    'sqlite': 'database',
    'mdb': 'database',
    
    // 文档
    'md': 'markdown',
    'markdown': 'markdown',
    'txt': 'text',
    'log': 'log',
    'pdf': 'pdf',
    'doc': 'word',
    'docx': 'word',
    'xls': 'excel',
    'xlsx': 'excel',
    'ppt': 'powerpoint',
    'pptx': 'powerpoint',
    
    // 图片
    'png': 'image',
    'jpg': 'image',
    'jpeg': 'image',
    'gif': 'image',
    'svg': 'svg',
    'ico': 'image',
    'bmp': 'image',
    'webp': 'image',
    
    // 音视频
    'mp3': 'audio',
    'wav': 'audio',
    'ogg': 'audio',
    'flac': 'audio',
    'mp4': 'video',
    'avi': 'video',
    'mov': 'video',
    'wmv': 'video',
    'mkv': 'video',
    'webm': 'video',
    
    // 压缩文件
    'zip': 'zip',
    'rar': 'zip',
    '7z': 'zip',
    'tar': 'zip',
    'gz': 'zip',
    'bz2': 'zip',
    
    // 其他
    'lock': 'lock',
    'gitignore': 'git',
    'gitattributes': 'git',
    'gitmodules': 'git',
    'eslintignore': 'eslint',
    'eslintrc': 'eslint',
    'prettierrc': 'prettier',
    'prettierignore': 'prettier',
    'editorconfig': 'editorconfig',
    'license': 'license',
    'readme': 'info',
    'changelog': 'info',
    'contributing': 'info',
    'authors': 'info',
  }
  
  return iconMap[ext] || 'file'
}

/**
 * 获取文件颜色
 */
export function getFileColor(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  
  const colorMap: Record<string, string> = {
    // 编程语言
    'js': '#F7DF1E',
    'ts': '#3178C6',
    'tsx': '#61DAFB',
    'jsx': '#61DAFB',
    'vue': '#4FC08D',
    'svelte': '#FF3E00',
    'rs': '#DEA584',
    'go': '#00ADD8',
    'java': '#007396',
    'py': '#3776AB',
    'rb': '#CC342D',
    'php': '#777BB4',
    'c': '#555555',
    'cpp': '#00599C',
    'cs': '#239120',
    'swift': '#FA7343',
    'kt': '#7F52FF',
    'dart': '#0175C2',
    
    // 配置文件
    'json': '#F7DF1E',
    'xml': '#0060AC',
    'yaml': '#CB171E',
    'yml': '#CB171E',
    'toml': '#9C4221',
    'env': '#F7DF1E',
    
    // 样式文件
    'css': '#264DE4',
    'scss': '#C6538C',
    'sass': '#C6538C',
    'less': '#1D365D',
    'styl': '#FF6347',
    
    // 模板文件
    'html': '#E34F26',
    'hbs': '#000000',
    'mustache': '#000000',
    'ejs': '#B4CA65',
    'pug': '#A86454',
    
    // 文档
    'md': '#083FA1',
    'txt': '#6D8086',
    'log': '#6D8086',
    'pdf': '#F40F02',
    
    // 图片
    'png': '#A074C4',
    'jpg': '#A074C4',
    'jpeg': '#A074C4',
    'gif': '#A074C4',
    'svg': '#FFB13B',
    'ico': '#A074C4',
    
    // 音视频
    'mp3': '#E8D44D',
    'wav': '#E8D44D',
    'mp4': '#E8D44D',
    'avi': '#E8D44D',
    
    // 压缩文件
    'zip': '#6D8086',
    'rar': '#6D8086',
    '7z': '#6D8086',
    'tar': '#6D8086',
    'gz': '#6D8086',
  }
  
  return colorMap[ext] || '#6D8086'
}