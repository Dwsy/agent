#!/usr/bin/env bun
import { readFile, writeFile } from 'node:fs/promises'

const API_URL = 'https://models.dev/api.json'
const MODELS_PATH = `${process.env.HOME}/.pi/agent/models.json`

interface Cost {
  input: number
  output: number
  cache_read?: number
  cache_write?: number
}

interface ModelConfig {
  id: string
  name: string
  cost?: Cost
  [key: string]: any
}

interface ProviderConfig {
  baseUrl: string
  apiKey: string
  api: string
  authHeader: boolean
  models: ModelConfig[]
}

interface ModelsJson {
  providers: Record<string, ProviderConfig>
}

interface ApiModel {
  id: string
  name: string
  cost?: Cost
  [key: string]: any
}

interface ApiProvider {
  id: string
  models: Record<string, ApiModel>
}

interface ApiResponse {
  [providerId: string]: ApiProvider
}

async function fetchPrices(): Promise<ApiResponse> {
  console.log(`Fetching prices from ${API_URL}...`)
  const response = await fetch(API_URL)
  if (!response.ok) {
    throw new Error(`Failed to fetch API: ${response.statusText}`)
  }
  return await response.json()
}

function calculateSimilarity(str1: string, str2: string): number {
  // Levenshtein distance-based similarity
  const len1 = str1.length
  const len2 = str2.length
  const matrix: number[][] = []

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      )
    }
  }

  const distance = matrix[len1][len2]
  return 1 - distance / Math.max(len1, len2)
}

function normalizeModelId(id: string): string {
  // Normalize model ID for matching
  return id
    .toLowerCase()
    .replace(/_/g, '-') // Replace underscores with hyphens
    .replace(/anthropic\/claude-/, 'claude-')
    .replace(/openai\//, '')
    .replace(/google\//, '')
    .replace(/^z-ai\//, '')
    .replace(/^minimaxai\//, '')
    .replace(/^claude-opus-4-5-20251101$/, 'claude-opus-4-5')
    .replace(/^claude-sonnet-4-5-20250929$/, 'claude-sonnet-4-5')
    .replace(/^claude-haiku-4-5-20251001$/, 'claude-haiku-4-5')
    .replace(/^opus4\.5$/, 'claude-opus-4-5')
    .replace(/v1$/, '') // Remove version suffix
    .replace(/-preview$/, '') // Remove preview suffix
    .replace(/-turbo$/, '') // Remove turbo suffix
}

function findModelPrice(apiData: ApiResponse, modelId: string): Cost | null {
  const normalizedId = normalizeModelId(modelId)
  const SIMILARITY_THRESHOLD = 0.7 // 70% similarity required

  let bestMatch: { cost: Cost; similarity: number; apiId: string; hasPrice: boolean } | null = null

  // Search through all providers and models
  for (const providerId in apiData) {
    const provider = apiData[providerId]
    if (!provider?.models) continue

    for (const apiModelId in provider.models) {
      const apiModel = provider.models[apiModelId]
      if (!apiModel?.cost) continue

      const normalizedApiId = normalizeModelId(apiModelId)

      // Extract base model names (remove provider prefixes, versions, dates)
      const baseTarget = normalizedId.replace(/-\d{8}$/, '').replace(/-\d+\.\d+$/, '')
      const baseApi = normalizedApiId.replace(/-\d{8}$/, '').replace(/-\d+\.\d+$/, '')

      // Check if one contains the other (substring match) or exact match
      const isExactMatch = normalizedApiId === normalizedId
      const isSubstringMatch = normalizedId.includes(baseApi) || normalizedApiId.includes(baseTarget)

      if (isExactMatch || isSubstringMatch) {
        const similarity = isExactMatch
          ? 1.0
          : Math.max(
              calculateSimilarity(normalizedId, normalizedApiId),
              calculateSimilarity(baseTarget, baseApi)
            )

        if (similarity >= SIMILARITY_THRESHOLD) {
          const hasPrice = apiModel.cost.input > 0 || apiModel.cost.output > 0

          // Prefer matches with non-zero prices
          if (!bestMatch) {
            bestMatch = { cost: apiModel.cost, similarity, apiId: apiModelId, hasPrice }
          } else {
            // Prefer non-zero prices over zero prices
            if (hasPrice && !bestMatch.hasPrice) {
              bestMatch = { cost: apiModel.cost, similarity, apiId: apiModelId, hasPrice }
            } else if (hasPrice === bestMatch.hasPrice) {
              // Same price status, prefer higher similarity (exact match wins)
              if (similarity > bestMatch.similarity) {
                bestMatch = { cost: apiModel.cost, similarity, apiId: apiModelId, hasPrice }
              }
            }
          }
        }
      }
    }
  }

  // Return best match if found
  if (bestMatch && bestMatch.similarity >= SIMILARITY_THRESHOLD) {
    const priceNote = bestMatch.hasPrice ? '' : ' (free model)'
    const matchNote = bestMatch.similarity === 1.0 ? 'Exact match' : `Fuzzy matched`
    console.log(`  ${matchNote}: "${modelId}" -> "${bestMatch.apiId}" (${(bestMatch.similarity * 100).toFixed(1)}% similarity${priceNote})`)
    return bestMatch.cost
  }

  return null
}

async function updatePrices() {
  try {
    // Fetch API data
    const apiData = await fetchPrices()

    // Read current models.json
    const modelsContent = await readFile(MODELS_PATH, 'utf-8')
    const modelsJson: ModelsJson = JSON.parse(modelsContent)

    let updatedCount = 0
    let notFoundCount = 0
    const notFoundModels: string[] = []

    // Update prices for each provider
    for (const providerId in modelsJson.providers) {
      const provider = modelsJson.providers[providerId]
      if (!provider?.models) continue

      for (const model of provider.models) {
        const price = findModelPrice(apiData, model.id)

        if (price) {
          const oldCost = model.cost
          model.cost = {
            input: price.input,
            output: price.output,
            cacheRead: price.cache_read ?? 0,
            cacheWrite: price.cache_write ?? 0
          }

          if (JSON.stringify(oldCost) !== JSON.stringify(model.cost)) {
            console.log(`✓ Updated: ${model.id}`)
            console.log(`  Old: ${JSON.stringify(oldCost)}`)
            console.log(`  New: ${JSON.stringify(model.cost)}`)
            updatedCount++
          }
        } else {
          notFoundCount++
          if (!notFoundModels.includes(model.id)) {
            notFoundModels.push(model.id)
          }
        }
      }
    }

    // Write back to models.json
    await writeFile(MODELS_PATH, JSON.stringify(modelsJson, null, 2), 'utf-8')

    console.log(`\n=== Summary ===`)
    console.log(`Updated: ${updatedCount} models`)
    console.log(`Not found: ${notFoundCount} models`)

    if (notFoundModels.length > 0) {
      console.log(`\nModels without price data:`)
      notFoundModels.forEach(m => console.log(`  - ${m}`))
    }

    console.log(`\n✓ Prices updated successfully!`)

  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : error}`)
    process.exit(1)
  }
}

// Run
updatePrices()