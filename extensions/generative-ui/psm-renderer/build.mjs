import { mkdir, copyFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const dist = resolve(root, '..', 'dist')

await mkdir(dist, { recursive: true })
await copyFile(resolve(root, 'index.mjs'), resolve(dist, 'index.mjs'))

console.log('Built dist/index.mjs')
