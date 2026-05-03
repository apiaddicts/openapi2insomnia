import { describe, it, expect } from 'vitest'
import { generateAfterResponseScripts } from '../src/core/script-generator.js'
import type { OAOperation } from '../src/core/openapi-types.js'

const operationWithResponses: OAOperation = {
  summary: 'Get user',
  responses: {
    '200': {
      description: 'A user',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['id', 'name'],
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              age: { type: 'integer' },
            },
          },
        },
      },
    },
    '404': {
      description: 'Not found',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: { message: { type: 'string' } },
          },
        },
      },
    },
  },
}

describe('generateAfterResponseScripts', () => {
  it('returns empty object when operation has no responses', () => {
    const op: OAOperation = { summary: 'No responses' }
    expect(generateAfterResponseScripts(op)).toEqual({})
  })

  it('returns one script per numeric status code', () => {
    const scripts = generateAfterResponseScripts(operationWithResponses)
    expect(Object.keys(scripts)).toContain('200')
    expect(Object.keys(scripts)).toContain('404')
  })

  it('each script checks only its own status code', () => {
    const scripts = generateAfterResponseScripts(operationWithResponses)
    expect(scripts['200']).toContain('equal(200)')
    expect(scripts['200']).not.toContain('equal(404)')
    expect(scripts['404']).toContain('equal(404)')
    expect(scripts['404']).not.toContain('equal(200)')
  })

  it('includes schema validation when schema is present', () => {
    const scripts = generateAfterResponseScripts(operationWithResponses)
    expect(scripts['200']).toContain('response matches schema')
    expect(scripts['200']).toContain("insomnia.environment.get('__validate__')")
  })

  it('strips description and example fields from embedded schema', () => {
    const scripts = generateAfterResponseScripts(operationWithResponses)
    expect(scripts['200']).not.toContain('"description"')
  })

  it('includes required fields in embedded schema', () => {
    const scripts = generateAfterResponseScripts(operationWithResponses)
    expect(scripts['200']).toContain('"required"')
    expect(scripts['200']).toContain('"id"')
  })

  it('skips the default response key', () => {
    const op: OAOperation = {
      responses: {
        '200': { description: 'ok' },
        'default': { description: 'error' },
      },
    }
    const scripts = generateAfterResponseScripts(op)
    expect(Object.keys(scripts)).toContain('200')
    expect(Object.keys(scripts)).not.toContain('default')
  })

  it('generates status-only script when response has no JSON schema', () => {
    const op: OAOperation = {
      responses: { '204': { description: 'No content' } },
    }
    const scripts = generateAfterResponseScripts(op)
    expect(scripts['204']).toContain('equal(204)')
    expect(scripts['204']).not.toContain('function validate(')
  })
})
