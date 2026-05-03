import { describe, it, expect } from 'vitest'
import { buildCollection } from '../src/core/generator.js'
import type { OAInfo } from '../src/core/openapi-types.js'
import type { InsomniaV5CollectionItem, InsomniaV5RootEnvironment } from '../src/core/insomnia-types.js'

const info: OAInfo = {
  title: 'My API',
  description: 'A test API',
  version: '1.0.0',
}

const environments: InsomniaV5RootEnvironment = {
  name: 'Base Environment',
  meta: { id: 'env_test', created: 0, modified: 0, isPrivate: false },
  data: { base_url: 'https://api.example.com' },
}

const collection: InsomniaV5CollectionItem[] = [
  {
    name: 'users',
    meta: { id: 'fld_test', created: 0, modified: 0 },
    children: [],
  },
]

describe('buildCollection', () => {
  it('sets the correct type field', () => {
    const result = buildCollection(info, environments, collection)
    expect(result.type).toBe('collection.insomnia.rest/5.0')
  })

  it('sets schema_version to 5.1', () => {
    const result = buildCollection(info, environments, collection)
    expect(result.schema_version).toBe('5.1')
  })

  it('uses info.title as collection name', () => {
    const result = buildCollection(info, environments, collection)
    expect(result.name).toBe('My API')
  })

  it('generates a deterministic workspace ID from the title', () => {
    const a = buildCollection(info, environments, collection)
    const b = buildCollection(info, environments, collection)
    expect(a.meta.id).toBe(b.meta.id)
    expect(a.meta.id).toMatch(/^wrk_[a-f0-9]{32}$/)
  })

  it('includes description in meta when present', () => {
    const result = buildCollection(info, environments, collection)
    expect(result.meta.description).toBe('A test API')
  })

  it('sets meta.description to empty string when description is absent', () => {
    const infoWithoutDesc: OAInfo = { title: 'My API', version: '1.0.0' }
    const result = buildCollection(infoWithoutDesc, environments, collection)
    expect(result.meta.description).toBe('')
  })

  it('passes environments through unchanged', () => {
    const result = buildCollection(info, environments, collection)
    expect(result.environments).toBe(environments)
  })

  it('places collection items at root level', () => {
    const result = buildCollection(info, environments, collection)
    expect(result.collection).toBe(collection)
    expect(result.collection).toHaveLength(1)
  })
})
