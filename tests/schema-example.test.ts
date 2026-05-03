import { describe, it, expect } from 'vitest'
import { generateExample } from '../src/core/schema-example.js'
import type { OASchema } from '../src/core/openapi-types.js'

describe('generateExample', () => {
  it('returns schema.example directly when present', () => {
    const schema: OASchema = { type: 'string', example: 'hello' }
    expect(generateExample(schema)).toBe('hello')
  })

  it('generates object from properties', () => {
    const schema: OASchema = {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'Alice' },
        age: { type: 'integer' },
      },
    }
    expect(generateExample(schema)).toEqual({ name: 'Alice', age: 0 })
  })

  it('generates array with one item', () => {
    const schema: OASchema = {
      type: 'array',
      items: { type: 'string', example: 'tag' },
    }
    expect(generateExample(schema)).toEqual(['tag'])
  })

  it('merges allOf schemas', () => {
    const schema: OASchema = {
      allOf: [
        { type: 'object', properties: { id: { type: 'integer', example: 1 } } },
        { type: 'object', properties: { name: { type: 'string', example: 'Alice' } } },
      ],
    }
    expect(generateExample(schema)).toEqual({ id: 1, name: 'Alice' })
  })

  it('uses default when example is absent', () => {
    const schema: OASchema = { type: 'integer', default: 10 }
    expect(generateExample(schema)).toBe(10)
  })

  it('uses first enum value when no example or default', () => {
    const schema: OASchema = { type: 'string', enum: ['active', 'inactive'] }
    expect(generateExample(schema)).toBe('active')
  })

  it('generates correct string format examples', () => {
    expect(generateExample({ type: 'string', format: 'email' })).toBe('user@example.com')
    expect(generateExample({ type: 'string', format: 'date-time' })).toBe('2024-01-01T00:00:00Z')
    expect(generateExample({ type: 'string', format: 'uuid' })).toBe('00000000-0000-0000-0000-000000000000')
  })

  it('returns false for boolean with no example', () => {
    expect(generateExample({ type: 'boolean' })).toBe(false)
  })

  it('returns null for unknown type', () => {
    expect(generateExample({})).toBeNull()
  })
})
