import { describe, it, expect, beforeAll } from 'vitest'
import { convertEnvironments, convertFolders, buildEnvironmentForConfig, resolveBaseUrl } from '../src/core/converter.js'
import { parseSpec } from '../src/core/parser.js'
import { isInsomniaFolder, isInsomniaRequest } from '../src/core/insomnia-types.js'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { OADocument, OAServer } from '../src/core/openapi-types.js'
import type { EnvironmentConfig } from '../src/core/config.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const FIXTURE = resolve(__dirname, 'fixtures/petstore-minimal.yaml')

let doc: OADocument

beforeAll(async () => {
  doc = await parseSpec(FIXTURE)
})

// -----------------------------------------------------------------------------
// convertEnvironments
// -----------------------------------------------------------------------------

describe('convertEnvironments', () => {
  it('returns an object with "Base Environment" as name', () => {
    const env = convertEnvironments(doc)
    expect(env.name).toBe('Base Environment')
  })

  it('sets base_url from servers[0].url', () => {
    const env = convertEnvironments(doc)
    expect(env.data.base_url).toBe('https://api.example.com/v1')
  })

  it('adds path parameters as environment variables', () => {
    const env = convertEnvironments(doc)
    expect(env.data).toHaveProperty('orderId')
  })

  it('sets base_url to empty string when servers is absent', () => {
    const docWithoutServers: OADocument = { info: { title: 'Test', version: '1.0.0' } }
    const env = convertEnvironments(docWithoutServers)
    expect(env.data.base_url).toBe('')
  })

  it('generates a deterministic environment ID', () => {
    const a = convertEnvironments(doc)
    const b = convertEnvironments(doc)
    expect(a.meta.id).toBe(b.meta.id)
    expect(a.meta.id).toMatch(/^env_[a-f0-9]{32}$/)
  })

  it('sets isPrivate to false', () => {
    const env = convertEnvironments(doc)
    expect(env.meta.isPrivate).toBe(false)
  })
})

// -----------------------------------------------------------------------------
// convertFolders
// -----------------------------------------------------------------------------

describe('convertFolders', () => {
  it('creates one folder per tag', () => {
    const { folders } = convertFolders(doc)
    const names = folders.map((f) => f.name)
    expect(names).toContain('users')
    expect(names).toContain('orders')
  })

  it('each folder contains one sub-folder per operation', () => {
    const { folders } = convertFolders(doc)
    const usersFolder = folders.find((f) => f.name === 'users')
    expect(usersFolder?.children).toHaveLength(2)
    expect(usersFolder?.children[0]?.name).toBe('01.Create user')
    expect(usersFolder?.children[1]?.name).toBe('02.List users')
  })

  it('TC base request has the correct method', () => {
    const { folders } = convertFolders(doc)
    const usersFolder = folders.find((f) => f.name === 'users')
    // CRUD order: POST (0) comes before GET (3) — children[0] = Create user
    const createSubFolder = usersFolder?.children[0]
    if (!createSubFolder || !isInsomniaFolder(createSubFolder)) throw new Error('expected sub-folder')
    const baseReq = createSubFolder.children[0]
    if (!baseReq || !isInsomniaRequest(baseReq)) throw new Error('expected request')
    expect(baseReq.method).toBe('POST')
  })

  it('base TC request for GET /users has no params', () => {
    const { folders } = convertFolders(doc)
    // CRUD order: children[1] = List users (GET)
    const listSubFolder = folders.find((f) => f.name === 'users')?.children[1]
    if (!listSubFolder || !isInsomniaFolder(listSubFolder)) throw new Error('expected sub-folder')
    const baseReq = listSubFolder.children[0]
    if (!baseReq || !isInsomniaRequest(baseReq)) throw new Error('expected request')
    expect(baseReq.params).toBeUndefined()
  })

  it('per-param TC request includes the param with TC var reference', () => {
    const { folders } = convertFolders(doc)
    // CRUD order: children[1] = List users (GET, op 02)
    const listSubFolder = folders.find((f) => f.name === 'users')?.children[1]
    if (!listSubFolder || !isInsomniaFolder(listSubFolder)) throw new Error('expected sub-folder')
    // children[0] = base (200a), children[1] = per-param limit (200b)
    const limitReq = listSubFolder.children[1]
    if (!limitReq || !isInsomniaRequest(limitReq)) throw new Error('expected request')
    expect(limitReq.params?.[0]?.name).toBe('limit')
    expect(limitReq.params?.[0]?.value).toBe('{{ _.TC_01_02_limit }}')
  })

  it('url uses {{ _.base_url }} prefix', () => {
    const { folders } = convertFolders(doc)
    const listSubFolder = folders.find((f) => f.name === 'users')?.children[0]
    if (!listSubFolder || !isInsomniaFolder(listSubFolder)) throw new Error('expected sub-folder')
    const req = listSubFolder.children[0]
    if (!req || !isInsomniaRequest(req)) throw new Error('expected request')
    expect(req.url).toBe('{{ _.base_url }}/users')
  })

  it('converts path params {id} to {{ _.id }} syntax', () => {
    const { folders } = convertFolders(doc)
    const ordersSubFolder = folders.find((f) => f.name === 'orders')?.children[0]
    if (!ordersSubFolder || !isInsomniaFolder(ordersSubFolder)) throw new Error('expected sub-folder')
    const req = ordersSubFolder.children[0]
    if (!req || !isInsomniaRequest(req)) throw new Error('expected request')
    expect(req.url).toBe('{{ _.base_url }}/orders/{{ _.orderId }}')
  })

  it('POST request has a JSON body with generated example', () => {
    const { folders } = convertFolders(doc)
    // CRUD order: children[0] = Create user (POST, op 01)
    const createSubFolder = folders.find((f) => f.name === 'users')?.children[0]
    if (!createSubFolder || !isInsomniaFolder(createSubFolder)) throw new Error('expected sub-folder')
    const req = createSubFolder.children[0]
    if (!req || !isInsomniaRequest(req)) throw new Error('expected request')
    expect(req.body?.mimeType).toBe('application/json')
    const parsed = JSON.parse(req.body?.text ?? '{}')
    expect(parsed).toHaveProperty('name')
  })

  it('generates deterministic sub-folder IDs', () => {
    const a = convertFolders(doc)
    const b = convertFolders(doc)
    expect(a.folders[0]?.children[0]?.meta.id).toBe(b.folders[0]?.children[0]?.meta.id)
    expect(a.folders[0]?.children[0]?.meta.id).toMatch(/^fld_[a-f0-9]{32}$/)
  })

  it('includes TC env vars for query params', () => {
    const { tcVars } = convertFolders(doc)
    // CRUD order: List users is op 02 (POST/Create user is op 01)
    expect(tcVars).toHaveProperty('TC_01_02_limit')
    expect(tcVars).toHaveProperty('TC_01_02_limit_wrong')
    expect(tcVars['TC_01_02_limit']).toBe(1)
    expect(tcVars['TC_01_02_limit_wrong']).toBe('badstring')
  })
})

// ---------------------------------------------------------------------------
// buildEnvironmentForConfig
// ---------------------------------------------------------------------------

describe('buildEnvironmentForConfig', () => {
  const baseData = {
    base_url: 'https://spec-url.com',
    token_url: 'https://spec-token.com',
    authorization_url: '',
    client_id: '',
    client_secret: '',
    __validate__: 'fn',
  }

  const makeEnv = (overrides: Partial<EnvironmentConfig> = {}): EnvironmentConfig => ({
    name: 'DEV',
    base_url: 'https://dev.api.example.com/v1',
    microcksHeaders: false,
    readOnly: false,
    targetFolder: '.',
    hasScopes: false,
    applicationToken: false,
    numberOfScopes: 0,
    ...overrides,
  })

  it('overrides base_url with config value', () => {
    const env = buildEnvironmentForConfig(makeEnv(), baseData, Date.now())
    expect(env.data.base_url).toBe('https://dev.api.example.com/v1')
  })

  it('overrides token_url when provided in config', () => {
    const env = buildEnvironmentForConfig(makeEnv({ token_url: 'https://dev.keycloak.example.com/token' }), baseData, Date.now())
    expect(env.data.token_url).toBe('https://dev.keycloak.example.com/token')
  })

  it('falls back to baseData token_url when not in config', () => {
    const env = buildEnvironmentForConfig(makeEnv(), baseData, Date.now())
    expect(env.data.token_url).toBe('https://spec-token.com')
  })

  it('overrides client_id when provided', () => {
    const env = buildEnvironmentForConfig(makeEnv({ client_id: 'my-client-dev' }), baseData, Date.now())
    expect(env.data.client_id).toBe('my-client-dev')
  })

  it('preserves __validate__ from baseData', () => {
    const env = buildEnvironmentForConfig(makeEnv(), baseData, Date.now())
    expect(env.data.__validate__).toBe('fn')
  })

  it('sets env name from config', () => {
    const env = buildEnvironmentForConfig(makeEnv({ name: 'PROD' }), baseData, Date.now())
    expect(env.name).toBe('PROD')
  })

  it('generates a deterministic ID from env name', () => {
    const a = buildEnvironmentForConfig(makeEnv(), baseData, 0)
    const b = buildEnvironmentForConfig(makeEnv(), baseData, 0)
    expect(a.meta.id).toBe(b.meta.id)
    expect(a.meta.id).toMatch(/^env_[a-f0-9]{32}$/)
  })
})

// ---------------------------------------------------------------------------
// resolveBaseUrl / matchesServerPattern
// ---------------------------------------------------------------------------

describe('resolveBaseUrl', () => {
  const servers: OAServer[] = [
    { url: 'https://dev.api.example.com/v1' },
    { url: 'https://pre.api.example.com/v1' },
    { url: 'https://api.example.com/v1' },
  ]

  it('matches host_server_pattern and returns that server URL', () => {
    expect(resolveBaseUrl({ base_url: '', hostServerPattern: '%dev%' }, servers)).toBe('https://dev.api.example.com/v1')
  })

  it('pattern matching is case-insensitive', () => {
    expect(resolveBaseUrl({ base_url: '', hostServerPattern: '%DEV%' }, servers)).toBe('https://dev.api.example.com/v1')
  })

  it('falls back to explicit base_url when pattern has no match', () => {
    expect(resolveBaseUrl({ base_url: 'https://custom.example.com', hostServerPattern: '%staging%' }, servers)).toBe('https://custom.example.com')
  })

  it('uses explicit base_url when no pattern is set', () => {
    expect(resolveBaseUrl({ base_url: 'https://custom.example.com' }, servers)).toBe('https://custom.example.com')
  })

  it('falls back to servers[0] when no pattern and no base_url', () => {
    expect(resolveBaseUrl({ base_url: '' }, servers)).toBe('https://dev.api.example.com/v1')
  })

  it('returns empty string when no pattern, no base_url, and no servers', () => {
    expect(resolveBaseUrl({ base_url: '' }, [])).toBe('')
  })
})
