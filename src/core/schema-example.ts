import type { OASchema } from './openapi-types.js'

export function generateExample(schema: OASchema): unknown {
  if (schema.example !== undefined) return schema.example

  if (schema.allOf?.length) {
    return mergeSchemas(schema.allOf)
  }

  const composites = schema.oneOf ?? schema.anyOf
  if (composites?.length && composites[0]) {
    return generateExample(composites[0])
  }

  const type = schema.type

  if (type === 'object' || schema.properties) {
    const result: Record<string, unknown> = {}
    const props = schema.properties ?? {}
    for (const [key, propSchema] of Object.entries(props)) {
      result[key] = generateExample(propSchema)
    }
    return result
  }

  if (type === 'array') {
    if (schema.items) return [generateExample(schema.items)]
    return []
  }

  if (schema.default !== undefined) return schema.default
  if (schema.enum?.length) return schema.enum[0]

  if (type === 'string') return exampleString(schema.format)
  if (type === 'integer') return 0
  if (type === 'number') return 0.0
  if (type === 'boolean') return false

  return null
}

function mergeSchemas(schemas: OASchema[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const schema of schemas) {
    const generated = generateExample(schema)
    if (generated !== null && typeof generated === 'object' && !Array.isArray(generated)) {
      Object.assign(result, generated)
    }
  }
  return result
}

function exampleString(format: string | undefined): string {
  switch (format) {
    case 'date-time': return '2024-01-01T00:00:00Z'
    case 'date':      return '2024-01-01'
    case 'time':      return '00:00:00'
    case 'email':     return 'user@example.com'
    case 'uri':       return 'https://example.com'
    case 'uuid':      return '00000000-0000-0000-0000-000000000000'
    case 'password':  return '********'
    default:          return ''
  }
}
