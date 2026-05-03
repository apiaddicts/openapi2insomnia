import { describe, it, expect } from 'vitest'
import { expandOperation, DEFAULT_EXAMPLE_VALUES, DEFAULT_EXPAND_OPTIONS, type ExpandOptions } from '../src/core/tc-expander.js'
import type { OADocument, OAOperation } from '../src/core/openapi-types.js'
import { isInsomniaRequest } from '../src/core/insomnia-types.js'

const doc: OADocument = { info: { title: 'Test', version: '1' } }

const docWithOAuth: OADocument = {
  info: { title: 'Test', version: '1' },
  components: {
    securitySchemes: {
      oAuth2: {
        type: 'oauth2',
        flows: { clientCredentials: { tokenUrl: 'https://token.example.com', scopes: {} } },
      },
    },
  },
}

const opWithOAuth: OAOperation = {
  summary: 'Get users',
  security: [{ oAuth2: [] }],
  responses: { '200': { description: 'ok' }, '401': { description: 'unauthorized' }, '403': { description: 'forbidden' } },
}

const opWithPathAnd404: OAOperation = {
  summary: 'Get user',
  parameters: [{ name: 'userId', in: 'path', required: true }],
  responses: { '200': { description: 'ok' }, '404': { description: 'not found' } },
}

const getWithParams: OAOperation = {
  summary: 'List users',
  parameters: [
    { name: 'limit', in: 'query', schema: { type: 'integer' } },
    { name: 'q', in: 'query', schema: { type: 'string' } },
  ],
  responses: {
    '200': { description: 'ok' },
    '400': { description: 'bad request' },
    '401': { description: 'unauthorized' },
  },
}

const postWithBody: OAOperation = {
  summary: 'Create user',
  requestBody: {
    required: true,
    content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' } } } } },
  },
  responses: {
    '201': { description: 'created' },
  },
}

const getNoParams: OAOperation = {
  summary: 'Get status',
  responses: { '200': { description: 'ok' } },
}

const postWithBodyAnd400: OAOperation = {
  summary: 'Create item',
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['name', 'code'],
          properties: {
            name: { type: 'string' },
            code: { type: 'integer' },
            note: { type: 'string' },
          },
        },
      },
    },
  },
  responses: {
    '201': { description: 'created' },
    '400': { description: 'bad request' },
    '401': { description: 'unauthorized' },
  },
}

describe('expandOperation — sub-folder', () => {
  it('names sub-folder with op index and summary', () => {
    const { subFolder } = expandOperation('/users', 'get', getWithParams, doc, '01', '01', DEFAULT_EXAMPLE_VALUES)
    expect(subFolder.name).toBe('01.List users')
  })

  it('generates a deterministic folder ID', () => {
    const a = expandOperation('/users', 'get', getWithParams, doc, '01', '01', DEFAULT_EXAMPLE_VALUES)
    const b = expandOperation('/users', 'get', getWithParams, doc, '01', '01', DEFAULT_EXAMPLE_VALUES)
    expect(a.subFolder.meta.id).toBe(b.subFolder.meta.id)
    expect(a.subFolder.meta.id).toMatch(/^fld_[a-f0-9]{32}$/)
  })
})

describe('expandOperation — success requests', () => {
  it('generates base + one-per-optional-param requests', () => {
    const { subFolder } = expandOperation('/users', 'get', getWithParams, doc, '01', '01', DEFAULT_EXAMPLE_VALUES)
    const names = subFolder.children.filter(isInsomniaRequest).map((r) => r.name)
    expect(names).toContain('TC.01.01.200a')
    expect(names).toContain('TC.01.01.200b queryString limit')
    expect(names).toContain('TC.01.01.200c queryString q')
  })

  it('base request has no params', () => {
    const { subFolder } = expandOperation('/users', 'get', getWithParams, doc, '01', '01', DEFAULT_EXAMPLE_VALUES)
    const base = subFolder.children.filter(isInsomniaRequest).find((r) => r.name === 'TC.01.01.200a')
    expect(base?.params).toBeUndefined()
  })

  it('per-param request has exactly that param as TC env var', () => {
    const { subFolder } = expandOperation('/users', 'get', getWithParams, doc, '01', '01', DEFAULT_EXAMPLE_VALUES)
    const req = subFolder.children.filter(isInsomniaRequest).find((r) => r.name === 'TC.01.01.200b queryString limit')
    expect(req?.params).toHaveLength(1)
    expect(req?.params?.[0]?.name).toBe('limit')
    expect(req?.params?.[0]?.value).toBe('{{ _.TC_01_01_limit }}')
  })

  it('generates only a base request when there are no query params', () => {
    const { subFolder } = expandOperation('/status', 'get', getNoParams, doc, '02', '01', DEFAULT_EXAMPLE_VALUES)
    const requests = subFolder.children.filter(isInsomniaRequest)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.name).toBe('TC.02.01.200')
  })
})

describe('expandOperation — 400 requests', () => {
  it('generates one 400 request per query param', () => {
    const { subFolder } = expandOperation('/users', 'get', getWithParams, doc, '01', '01', DEFAULT_EXAMPLE_VALUES)
    const names = subFolder.children.filter(isInsomniaRequest).map((r) => r.name)
    expect(names).toContain('TC.01.01.400a queryString limit wrong')
    expect(names).toContain('TC.01.01.400b queryString q wrong')
  })

  it('400 request uses the _wrong env var', () => {
    const { subFolder } = expandOperation('/users', 'get', getWithParams, doc, '01', '01', DEFAULT_EXAMPLE_VALUES)
    const req = subFolder.children.filter(isInsomniaRequest).find((r) => r.name === 'TC.01.01.400a queryString limit wrong')
    expect(req?.params?.[0]?.value).toBe('{{ _.TC_01_01_limit_wrong }}')
  })

  it('skips 400 requests when operation has no query params', () => {
    const opWith400NoParams: OAOperation = {
      summary: 'Status',
      responses: { '200': { description: 'ok' }, '400': { description: 'bad' } },
    }
    const { subFolder } = expandOperation('/status', 'get', opWith400NoParams, doc, '01', '01', DEFAULT_EXAMPLE_VALUES)
    const names = subFolder.children.filter(isInsomniaRequest).map((r) => r.name)
    expect(names.some((n) => n.includes('400'))).toBe(false)
  })
})

describe('expandOperation — 400 requests from body fields', () => {
  it('generates "without" requests for each required field', () => {
    const { subFolder } = expandOperation('/items', 'post', postWithBodyAnd400, doc, '01', '01', DEFAULT_EXAMPLE_VALUES)
    const names = subFolder.children.filter(isInsomniaRequest).map((r) => r.name)
    expect(names).toContain('TC.01.01.400a Error without.name')
    expect(names).toContain('TC.01.01.400b Error without.code')
  })

  it('generates "with.wrong" requests for every field', () => {
    const { subFolder } = expandOperation('/items', 'post', postWithBodyAnd400, doc, '01', '01', DEFAULT_EXAMPLE_VALUES)
    const names = subFolder.children.filter(isInsomniaRequest).map((r) => r.name)
    expect(names).toContain('TC.01.01.400c Error with.name.wrong')
    expect(names).toContain('TC.01.01.400d Error with.code.wrong')
    expect(names).toContain('TC.01.01.400e Error with.note.wrong')
  })

  it('"without.name" body omits the name field', () => {
    const { subFolder } = expandOperation('/items', 'post', postWithBodyAnd400, doc, '01', '01', DEFAULT_EXAMPLE_VALUES)
    const req = subFolder.children.filter(isInsomniaRequest).find((r) => r.name === 'TC.01.01.400a Error without.name')
    const body = JSON.parse(req?.body?.text ?? '{}') as Record<string, unknown>
    expect(body).not.toHaveProperty('name')
    expect(body).toHaveProperty('code')
  })

  it('"with.code.wrong" body has wrong value for integer field', () => {
    const { subFolder } = expandOperation('/items', 'post', postWithBodyAnd400, doc, '01', '01', DEFAULT_EXAMPLE_VALUES)
    const req = subFolder.children.filter(isInsomniaRequest).find((r) => r.name === 'TC.01.01.400d Error with.code.wrong')
    const body = JSON.parse(req?.body?.text ?? '{}') as Record<string, unknown>
    expect(body['code']).toBe('badstring')
  })
})

describe('expandOperation — other error requests', () => {
  it('generates one request per non-2xx non-400 status code', () => {
    const { subFolder } = expandOperation('/users', 'get', getWithParams, doc, '01', '01', DEFAULT_EXAMPLE_VALUES)
    const names = subFolder.children.filter(isInsomniaRequest).map((r) => r.name)
    expect(names).toContain('TC.01.01.401')
  })

  it('single error request has no params', () => {
    const { subFolder } = expandOperation('/users', 'get', getWithParams, doc, '01', '01', DEFAULT_EXAMPLE_VALUES)
    const req = subFolder.children.filter(isInsomniaRequest).find((r) => r.name === 'TC.01.01.401')
    expect(req?.params).toBeUndefined()
  })

  it('ignores the default response key', () => {
    const opWithDefault: OAOperation = {
      summary: 'Test',
      responses: { '200': { description: 'ok' }, 'default': { description: 'error' } },
    }
    const { subFolder } = expandOperation('/test', 'get', opWithDefault, doc, '01', '01', DEFAULT_EXAMPLE_VALUES)
    const names = subFolder.children.filter(isInsomniaRequest).map((r) => r.name)
    expect(names.some((n) => n.includes('default'))).toBe(false)
  })
})

describe('expandOperation — env vars', () => {
  it('adds correct and wrong vars for each query param', () => {
    const { envVars } = expandOperation('/users', 'get', getWithParams, doc, '01', '01', DEFAULT_EXAMPLE_VALUES)
    expect(envVars['TC_01_01_limit']).toBe(1)
    expect(envVars['TC_01_01_limit_wrong']).toBe('badstring')
    expect(envVars['TC_01_01_q']).toBe('goodstring')
    expect(envVars['TC_01_01_q_wrong']).toBe('badstring')
  })

  it('uses spec example value when available', () => {
    const opWithExample: OAOperation = {
      summary: 'Test',
      parameters: [{ name: 'page', in: 'query', example: 5, schema: { type: 'integer' } }],
      responses: { '200': { description: 'ok' } },
    }
    const { envVars } = expandOperation('/test', 'get', opWithExample, doc, '01', '01', DEFAULT_EXAMPLE_VALUES)
    expect(envVars['TC_01_01_page']).toBe(5)
  })

  it('returns no env vars when operation has no query params', () => {
    const { envVars } = expandOperation('/status', 'get', postWithBody, doc, '01', '02', DEFAULT_EXAMPLE_VALUES)
    expect(Object.keys(envVars)).toHaveLength(0)
  })
})

describe('expandOperation — method and url', () => {
  it('uppercases the HTTP method', () => {
    const { subFolder } = expandOperation('/users', 'get', getNoParams, doc, '01', '01', DEFAULT_EXAMPLE_VALUES)
    const req = subFolder.children.filter(isInsomniaRequest)[0]
    expect(req?.method).toBe('GET')
  })

  it('replaces path params with {{ _.param }} syntax', () => {
    const opWithPath: OAOperation = {
      summary: 'Get user',
      parameters: [{ name: 'userId', in: 'path', required: true }],
      responses: { '200': { description: 'ok' } },
    }
    const { subFolder } = expandOperation('/users/{userId}', 'get', opWithPath, doc, '01', '01', DEFAULT_EXAMPLE_VALUES)
    const req = subFolder.children.filter(isInsomniaRequest)[0]
    expect(req?.url).toBe('{{ _.base_url }}/users/{{ _.userId }}')
  })
})

// ---------------------------------------------------------------------------
// 401 — unauthenticated
// ---------------------------------------------------------------------------

describe('expandOperation — 401', () => {
  it('401 request has no Authorization header', () => {
    const { subFolder } = expandOperation('/users', 'get', opWithOAuth, docWithOAuth, '01', '01', DEFAULT_EXAMPLE_VALUES)
    const req = subFolder.children.filter(isInsomniaRequest).find((r) => r.name === 'TC.01.01.401')
    expect(req?.headers?.find((h) => h.name === 'Authorization')).toBeUndefined()
  })

  it('200 request has Authorization: Bearer {{ _.access_token }}', () => {
    const { subFolder } = expandOperation('/users', 'get', opWithOAuth, docWithOAuth, '01', '01', DEFAULT_EXAMPLE_VALUES)
    const req = subFolder.children.filter(isInsomniaRequest).find((r) => r.name.startsWith('TC.01.01.200'))
    expect(req?.headers?.find((h) => h.name === 'Authorization')?.value).toBe('Bearer {{ _.access_token }}')
  })
})

// ---------------------------------------------------------------------------
// 403 — forbidden token
// ---------------------------------------------------------------------------

describe('expandOperation — 403', () => {
  it('403 request uses forbidden_access_token in Authorization header', () => {
    const { subFolder } = expandOperation('/users', 'get', opWithOAuth, docWithOAuth, '01', '01', DEFAULT_EXAMPLE_VALUES)
    const req = subFolder.children.filter(isInsomniaRequest).find((r) => r.name === 'TC.01.01.403')
    expect(req?.headers?.find((h) => h.name === 'Authorization')?.value).toBe('Bearer {{ _.forbidden_access_token }}')
  })

  it('403 envVars includes forbidden_access_token and wrong_scope', () => {
    const { envVars } = expandOperation('/users', 'get', opWithOAuth, docWithOAuth, '01', '01', DEFAULT_EXAMPLE_VALUES)
    expect(envVars).toHaveProperty('forbidden_access_token', '')
    expect(envVars).toHaveProperty('wrong_scope', '')
  })
})

// ---------------------------------------------------------------------------
// 404 — not found (path param rewrite)
// ---------------------------------------------------------------------------

describe('expandOperation — 404', () => {
  it('404 request replaces path param with _not_found variant in URL', () => {
    const { subFolder } = expandOperation('/users/{userId}', 'get', opWithPathAnd404, doc, '01', '01', DEFAULT_EXAMPLE_VALUES)
    const req = subFolder.children.filter(isInsomniaRequest).find((r) => r.name === 'TC.01.01.404')
    expect(req?.url).toContain('{{ _.userId_not_found }}')
    expect(req?.url).not.toContain('{{ _.userId }}')
  })

  it('404 envVars has _not_found var with placeholder value', () => {
    const { envVars } = expandOperation('/users/{userId}', 'get', opWithPathAnd404, doc, '01', '01', DEFAULT_EXAMPLE_VALUES)
    expect(envVars).toHaveProperty('userId_not_found', 'not-a-valid-id')
  })
})

// ---------------------------------------------------------------------------
// hasScopes / applicationToken
// ---------------------------------------------------------------------------

describe('expandOperation — hasScopes', () => {
  const scopeOpts: ExpandOptions = { ...DEFAULT_EXPAND_OPTIONS, hasScopes: true, applicationToken: true, numberOfScopes: 2 }
  const opWith200: OAOperation = { summary: 'Get', responses: { '200': { description: 'ok' } } }

  it('renames base 2xx TC with user_token_scope_1 suffix', () => {
    const { subFolder } = expandOperation('/x', 'get', opWith200, doc, '01', '01', DEFAULT_EXAMPLE_VALUES, false, scopeOpts)
    const names = subFolder.children.filter(isInsomniaRequest).map((r) => r.name)
    expect(names.some((n) => n.includes('with.user_token_scope_1'))).toBe(true)
  })

  it('adds application_token clone', () => {
    const { subFolder } = expandOperation('/x', 'get', opWith200, doc, '01', '01', DEFAULT_EXAMPLE_VALUES, false, scopeOpts)
    const names = subFolder.children.filter(isInsomniaRequest).map((r) => r.name)
    expect(names.some((n) => n.includes('with.application_token'))).toBe(true)
  })

  it('adds user_token_scope_2 clone', () => {
    const { subFolder } = expandOperation('/x', 'get', opWith200, doc, '01', '01', DEFAULT_EXAMPLE_VALUES, false, scopeOpts)
    const names = subFolder.children.filter(isInsomniaRequest).map((r) => r.name)
    expect(names.some((n) => n.includes('with.user_token_scope_2'))).toBe(true)
  })

  it('total: 1 base (scope_1) + 2 clones = 3 TCs', () => {
    const { subFolder } = expandOperation('/x', 'get', opWith200, doc, '01', '01', DEFAULT_EXAMPLE_VALUES, false, scopeOpts)
    expect(subFolder.children.filter(isInsomniaRequest)).toHaveLength(3)
  })

  it('envVars includes application_token and user_token_scope_2', () => {
    const { envVars } = expandOperation('/x', 'get', opWith200, doc, '01', '01', DEFAULT_EXAMPLE_VALUES, false, scopeOpts)
    expect(envVars).toHaveProperty('application_token', '')
    expect(envVars).toHaveProperty('user_token_scope_2', '')
  })
})

// ---------------------------------------------------------------------------
// minimalEndpoints
// ---------------------------------------------------------------------------

describe('expandOperation — minimalEndpoints', () => {
  const minOpts: ExpandOptions = { ...DEFAULT_EXPAND_OPTIONS, minimalEndpoints: true }

  it('generates only base TC for 2xx — no optional param variants', () => {
    const { subFolder } = expandOperation('/users', 'get', getWithParams, doc, '01', '01', DEFAULT_EXAMPLE_VALUES, false, minOpts)
    const names = subFolder.children.filter(isInsomniaRequest).map((r) => r.name)
    expect(names).toContain('TC.01.01.200')
    expect(names.some((n) => n.includes('queryString'))).toBe(false)
  })

  it('skips 400 TCs when query params are the only source', () => {
    const { subFolder } = expandOperation('/users', 'get', getWithParams, doc, '01', '01', DEFAULT_EXAMPLE_VALUES, false, minOpts)
    const names = subFolder.children.filter(isInsomniaRequest).map((r) => r.name)
    expect(names.some((n) => n.includes('400'))).toBe(false)
  })

  it('generates 1 generic 400 for body — removes first required field', () => {
    const { subFolder } = expandOperation('/items', 'post', postWithBodyAnd400, doc, '01', '01', DEFAULT_EXAMPLE_VALUES, false, minOpts)
    const req = subFolder.children.filter(isInsomniaRequest).find((r) => r.name === 'TC.01.01.400')
    expect(req).toBeDefined()
    const body = JSON.parse(req?.body?.text ?? '{}') as Record<string, unknown>
    expect(body).not.toHaveProperty('name')
  })
})

// ---------------------------------------------------------------------------
// generateOneOfAnyOf
// ---------------------------------------------------------------------------

describe('expandOperation — generateOneOfAnyOf', () => {
  const oneOfOpts: ExpandOptions = { ...DEFAULT_EXPAND_OPTIONS, generateOneOfAnyOf: true }

  const opWithOneOf: OAOperation = {
    summary: 'Create',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            oneOf: [
              { type: 'object', properties: { kind: { type: 'string' }, a: { type: 'string' } } },
              { type: 'object', properties: { kind: { type: 'string' }, b: { type: 'integer' } } },
            ],
          },
        },
      },
    },
    responses: { '201': { description: 'created' } },
  }

  it('generates one TC per oneOf variant (TC.01.01.201a and 201b)', () => {
    const { subFolder } = expandOperation('/items', 'post', opWithOneOf, doc, '01', '01', DEFAULT_EXAMPLE_VALUES, false, oneOfOpts)
    const names = subFolder.children.filter(isInsomniaRequest).map((r) => r.name)
    expect(names).toContain('TC.01.01.201a')
    expect(names).toContain('TC.01.01.201b')
    expect(names).toHaveLength(2)
  })

  it('each variant has different body content', () => {
    const { subFolder } = expandOperation('/items', 'post', opWithOneOf, doc, '01', '01', DEFAULT_EXAMPLE_VALUES, false, oneOfOpts)
    const reqs = subFolder.children.filter(isInsomniaRequest)
    const body0 = JSON.parse(reqs[0]?.body?.text ?? '{}') as Record<string, unknown>
    const body1 = JSON.parse(reqs[1]?.body?.text ?? '{}') as Record<string, unknown>
    expect(body0).toHaveProperty('a')
    expect(body1).toHaveProperty('b')
  })

  it('without flag generates single TC (no letter suffix)', () => {
    const { subFolder } = expandOperation('/items', 'post', opWithOneOf, doc, '01', '01', DEFAULT_EXAMPLE_VALUES)
    const names = subFolder.children.filter(isInsomniaRequest).map((r) => r.name)
    expect(names).toContain('TC.01.01.201')
    expect(names).not.toContain('TC.01.01.201a')
  })
})

// ---------------------------------------------------------------------------
// 400 from allOf body (Gap 1 fix)
// ---------------------------------------------------------------------------

describe('expandOperation — 400 from allOf body', () => {
  const opWithAllOf: OAOperation = {
    summary: 'Create',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            allOf: [
              { type: 'object', required: ['name'], properties: { name: { type: 'string' } } },
              { type: 'object', properties: { note: { type: 'string' } } },
            ],
          },
        },
      },
    },
    responses: { '201': { description: 'created' }, '400': { description: 'bad request' } },
  }

  it('generates without.name from allOf required field', () => {
    const { subFolder } = expandOperation('/items', 'post', opWithAllOf, doc, '01', '01', DEFAULT_EXAMPLE_VALUES)
    const names = subFolder.children.filter(isInsomniaRequest).map((r) => r.name)
    expect(names).toContain('TC.01.01.400a Error without.name')
  })

  it('generates with.wrong TCs for all allOf fields', () => {
    const { subFolder } = expandOperation('/items', 'post', opWithAllOf, doc, '01', '01', DEFAULT_EXAMPLE_VALUES)
    const names = subFolder.children.filter(isInsomniaRequest).map((r) => r.name)
    expect(names).toContain('TC.01.01.400b Error with.name.wrong')
    expect(names).toContain('TC.01.01.400c Error with.note.wrong')
  })
})
