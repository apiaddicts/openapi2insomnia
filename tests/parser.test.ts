import { describe, it, expect } from 'vitest'
import { parseSpec } from '../src/core/parser.js'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const FIXTURE = resolve(__dirname, 'fixtures/petstore-minimal.yaml')

describe('parseSpec', () => {
  it('parses a local YAML file and returns a document', async () => {
    const doc = await parseSpec(FIXTURE)

    expect(doc.info.title).toBe('Petstore Minimal')
    expect(doc.info.version).toBe('1.0.0')
    expect(doc.servers?.[0]?.url).toBe('https://api.example.com/v1')
  })

  it('resolves $ref — no $ref strings remain in the document', async () => {
    const doc = await parseSpec(FIXTURE)
    const serialized = JSON.stringify(doc)

    expect(serialized).not.toContain('"$ref"')
  })

  it('contains the expected paths', async () => {
    const doc = await parseSpec(FIXTURE)

    expect(doc.paths).toBeDefined()
    expect(Object.keys(doc.paths ?? {})).toEqual(['/users', '/orders/{orderId}'])
  })

  it('throws for HTTP URLs (only HTTPS allowed)', async () => {
    await expect(parseSpec('http://api.example.com/openapi.yaml')).rejects.toThrow(
      'only HTTPS URLs are supported'
    )
  })
})
