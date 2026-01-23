#!/usr/bin/env bun
import { Command } from 'commander'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname, basename, extname } from 'path'

interface HarEntry {
  request: {
    method: string
    url: string
    headers: { name: string; value: string }[]
    postData?: {
      mimeType: string
      text?: string
      params?: { name: string; value: string }[]
    }
  }
  response: {
    status: number
    headers: { name: string; value: string }[]
    content: {
      mimeType: string
      text?: string
      size?: number
    }
  }
}

interface HarFile {
  log: {
    entries: HarEntry[]
  }
}

interface ConversionOptions {
  mode: 'component' | 'api' | 'page'
  template: 'composition' | 'options'
  typescript: boolean
  library: 'fetch' | 'axios' | 'ky'
  output: string
  groupBy?: 'path' | 'domain'
  filterDomain?: string
  excludeExtensions?: string[]
  methods?: string[]
}

function loadHarFile(path: string): HarFile {
  const content = readFileSync(path, 'utf-8')
  return JSON.parse(content)
}

function filterEntries(entries: HarEntry[], options: ConversionOptions): HarEntry[] {
  return entries.filter(entry => {
    const url = entry.request.url
    const method = entry.request.method
    const ext = extname(new URL(url).pathname).slice(1)

    // 过滤域名
    if (options.filterDomain && !url.includes(options.filterDomain)) {
      return false
    }

    // 排除扩展名
    if (options.excludeExtensions?.includes(ext)) {
      return false
    }

    // 过滤方法
    if (options.methods && !options.methods.includes(method)) {
      return false
    }

    // 排除没有响应内容的请求
    if (!entry.response.content.text) {
      return false
    }

    return true
  })
}

function inferTypes(json: any): string {
  if (json === null) return 'null'
  if (typeof json === 'string') return 'string'
  if (typeof json === 'number') return 'number'
  if (typeof json === 'boolean') return 'boolean'
  if (Array.isArray(json)) {
    if (json.length > 0) {
      return `${inferTypes(json[0])}[]`
    }
    return 'any[]'
  }
  if (typeof json === 'object') {
    const fields = Object.entries(json).map(([key, value]) => {
      const optional = value === null ? '?' : ''
      return `  ${key}${optional}: ${inferTypes(value)}`
    })
    return `{\n${fields.join('\n')}\n}`
  }
  return 'any'
}

function generateInterface(name: string, json: any): string {
  if (!json || typeof json !== 'object') return ''
  const body = inferTypes(json)
  return `export interface ${name} ${body}`
}

function toPascalCase(str: string): string {
  return str.replace(/[-_\s](.)/g, (_, c) => c.toUpperCase()).replace(/^(.)/, c => c.toUpperCase())
}

function toCamelCase(str: string): string {
  const pascal = toPascalCase(str)
  return pascal[0].toLowerCase() + pascal.slice(1)
}

function generateFunctionName(url: string, method: string): string {
  const urlObj = new URL(url)
  const pathParts = urlObj.pathname.split('/').filter(Boolean)

  let name = method.toLowerCase()
  if (pathParts.length > 0) {
    const lastPart = pathParts[pathParts.length - 1]
    name += toPascalCase(lastPart)
  }

  // 如果只有一个路径段，使用完整路径
  if (pathParts.length === 1) {
    name = method.toLowerCase() + toPascalCase(pathParts[0])
  }

  // 如果名字太简单，保留方法前缀
  if (name.length < 4) {
    name = method.toLowerCase() + toPascalCase(name)
  }

  if (name === '' || name === method.toLowerCase()) {
    name = toPascalCase(pathParts.join('_') || 'data')
  }

  return toCamelCase(name)
}

function generateApiCode(entry: HarEntry, options: ConversionOptions, index: number): string {
  const { request, response } = entry
  const url = new URL(request.url)
  const functionName = generateFunctionName(request.url, request.method)
  const endpoint = url.pathname + url.search

  let responseData: any = null
  try {
    responseData = JSON.parse(response.content.text || '{}')
  } catch {
    responseData = null
  }

  // 如果函数名可能重复，添加后缀
  const uniqueInterfaceName = toPascalCase(functionName) + 'Response' + (index > 0 ? index : '')
  const interfaceCode = responseData ? generateInterface(uniqueInterfaceName, responseData) : ''

  // HTTP 客户端代码
  let httpRequest = ''
  if (options.library === 'axios') {
    httpRequest = `return axios.${request.method.toLowerCase()}<${uniqueInterfaceName}>('${endpoint}', ${request.method === 'GET' ? 'config' : 'data'})`
  } else if (options.library === 'ky') {
    httpRequest = `return ky.${request.method.toLowerCase()}('${endpoint}', ${request.method === 'GET' ? 'config' : 'json(data)'}).json<${uniqueInterfaceName}>()`
  } else {
    httpRequest = `const resp = await fetch('${endpoint}', config)\n  if (!resp.ok) throw new Error(resp.statusText)\n  return resp.json() as Promise<${uniqueInterfaceName}>`
  }

  // 请求数据
  let requestData = ''
  let config = ''
  if (request.postData?.text) {
    try {
      const postData = JSON.parse(request.postData.text)
      requestData = `const data = ${JSON.stringify(postData, null, 2)} as any`
    } catch {
      requestData = `const data = '${request.postData.text}'`
    }
  }

  // 请求头
  const headers = request.headers
    .filter(h => h.name.toLowerCase() !== 'content-length')
    .map(h => `    '${h.name}': '${h.value}'`)
    .join(',\n')

  if (headers) {
    config += `const config = {\n  headers: {\n${headers}\n  }\n}`
  }

  const code = `
${interfaceCode}

export async function ${functionName}(): Promise<${uniqueInterfaceName}> {
${config ? config + '\n' : ''}${requestData ? requestData + '\n' : ''}
  ${httpRequest}
}
`

  return code.trim()
}

function generateComponentCode(entries: HarEntry[], options: ConversionOptions): string {
  const ts = options.typescript ? 'lang="ts"' : ''
  const setup = options.template === 'composition' ? 'setup' : ''

  // 生成状态和方法
  const dataStates = entries.map((entry, i) => {
    const name = generateFunctionName(entry.request.url, entry.request.method)
    const suffix = i > 0 ? i : ''
    const typeName = options.typescript ? `: Ref<${toPascalCase(name)}Response${suffix} | null>` : ''
    return `const ${name}Data${typeName} = ref(null)`
  }).join('\n  ')

  const methods = entries.map((entry, i) => {
    const name = generateFunctionName(entry.request.url, entry.request.method)
    return `const load${toPascalCase(name)} = async () => {
      ${name}Data.value = await ${name}()
    }`
  }).join('\n  ')

  const onMounted = entries.length > 0 ? `
onMounted(() => {
${entries.map(entry => {
  const name = generateFunctionName(entry.request.url, entry.request.method)
  return `  load${toPascalCase(name)}()`
}).join('\n')}
})` : ''

  // 生成模板
  const template = entries.map(entry => {
    const name = generateFunctionName(entry.request.url, entry.request.method)
    return `<div v-if="${name}Data">
    <pre>{{ ${name}Data }}</pre>
  </div>`
  }).join('\n  ')

  return `<script ${ts}${setup ? ' ' + setup : ''}>
import { ref, onMounted } from 'vue'
${options.library === 'axios' ? "import axios from 'axios'" : ''}

${entries.map((entry, i) => generateApiCode(entry, options, i)).join('\n\n')}

${dataStates}

${methods}
${onMounted}
</script>

<template>
  <div class="container">
${template}
  </div>
</template>

<style scoped>
.container {
  padding: 20px;
}
</style>
`
}

function groupEntries(entries: HarEntry[], groupBy: 'path' | 'domain'): Map<string, HarEntry[]> {
  const groups = new Map<string, HarEntry[]>()

  for (const entry of entries) {
    const url = new URL(entry.request.url)
    let key: string

    if (groupBy === 'domain') {
      key = url.hostname
    } else {
      const pathParts = url.pathname.split('/').filter(Boolean)
      key = pathParts[0] || 'default'
    }

    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)!.push(entry)
  }

  return groups
}

function ensureDir(path: string) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true })
  }
}

function convertHarToVue(harPath: string, options: ConversionOptions) {
  const har = loadHarFile(harPath)
  let entries = filterEntries(har.log.entries, options)

  if (entries.length === 0) {
    console.error('没有找到符合条件的请求')
    process.exit(1)
  }

  console.log(`找到 ${entries.length} 个请求`)

  if (options.mode === 'api' && options.groupBy) {
    const groups = groupEntries(entries, options.groupBy)

    for (const [groupName, groupEntries] of groups) {
      const groupDir = join(options.output, groupName)
      ensureDir(groupDir)

      const code = groupEntries.map((entry, i) => generateApiCode(entry, options, i)).join('\n\n')
      const fileName = `${toCamelCase(groupName)}.ts`
      const filePath = join(groupDir, fileName)

      writeFileSync(filePath, code)
      console.log(`生成: ${filePath}`)
    }

    // 生成 index.ts
    const indexContent = Array.from(groups.keys()).map(group => {
      return `export * from './${group}/${toCamelCase(group)}'`
    }).join('\n')

    writeFileSync(join(options.output, 'index.ts'), indexContent)
    console.log(`生成: ${join(options.output, 'index.ts')}`)

  } else if (options.mode === 'component') {
    ensureDir(options.output)
    const code = generateComponentCode(entries, options)
    const filePath = join(options.output, 'GeneratedComponent.vue')
    writeFileSync(filePath, code)
    console.log(`生成: ${filePath}`)

  } else if (options.mode === 'page') {
    const pageDir = join(options.output, 'generated-page')
    ensureDir(pageDir)

    // 页面组件
    const componentCode = generateComponentCode(entries, options)
    writeFileSync(join(pageDir, 'index.vue'), componentCode)
    console.log(`生成: ${join(pageDir, 'index.vue')}`)

    // API 服务
    const apiDir = join(pageDir, 'api')
    ensureDir(apiDir)
    const apiCode = entries.map((entry, i) => generateApiCode(entry, options, i)).join('\n\n')
    writeFileSync(join(apiDir, 'index.ts'), apiCode)
    console.log(`生成: ${join(apiDir, 'index.ts')}`)

    // 类型定义
    if (options.typescript) {
      const typesCode = entries.map((entry, i) => {
        const name = generateFunctionName(entry.request.url, entry.request.method)
        const suffix = i > 0 ? i : ''
        try {
          const responseData = JSON.parse(entry.response.content.text || '{}')
          return generateInterface(toPascalCase(name) + 'Response' + suffix, responseData)
        } catch {
          return ''
        }
      }).filter(Boolean).join('\n\n')
      writeFileSync(join(pageDir, 'types.ts'), typesCode)
      console.log(`生成: ${join(pageDir, 'types.ts')}`)
    }
  }

  console.log('转换完成!')
}

const program = new Command()

program
  .name('har-to-vue')
  .description('将 HAR 文件转换为 Vue 源代码')
  .argument('<har-file>', 'HAR 文件路径')
  .option('-o, --output <path>', '输出目录', './output')
  .option('-m, --mode <mode>', '转换模式: component, api, page', 'component')
  .option('-t, --template <template>', '模板类型: composition, options', 'composition')
  .option('--typescript', '生成 TypeScript 代码', false)
  .option('-l, --library <library>', 'HTTP 客户端: fetch, axios, ky', 'fetch')
  .option('--group-by <strategy>', '分组策略: path, domain')
  .option('--filter-domain <domain>', '过滤域名')
  .option('--exclude-extensions <exts>', '排除的文件扩展名', 'css,js,png,jpg,jpeg,gif,svg,woff,woff2,ttf,eot')
  .option('--methods <methods>', '包含的 HTTP 方法', 'GET,POST,PUT,DELETE')
  .action((harFile, options) => {
    const conversionOptions: ConversionOptions = {
      mode: options.mode as any,
      template: options.template as any,
      typescript: options.typescript,
      library: options.library as any,
      output: options.output,
      groupBy: options.groupBy as any,
      filterDomain: options.filterDomain,
      excludeExtensions: options.excludeExtensions?.split(','),
      methods: options.methods?.split(','),
    }

    convertHarToVue(harFile, conversionOptions)
  })

program.parse()