import type { OADocument, OAHttpMethod, OAOAuth2Flows, OAOperation, OASecurityScheme, OAServer } from './openapi-types.js'
import type {
  InsomniaEnvValue,
  InsomniaV5Folder,
  InsomniaV5Request,
  InsomniaV5RootEnvironment,
} from './insomnia-types.js'
import { DEFAULT_REQUEST_SETTINGS } from './insomnia-types.js'
import type { EnvironmentConfig } from './config.js'
import { makeId } from './utils.js'
import { generateExample } from './schema-example.js'
import { expandOperation, DEFAULT_EXAMPLE_VALUES, DEFAULT_EXPAND_OPTIONS, type ExampleValues, type ExpandOptions } from './tc-expander.js'
import { VALIDATOR_FN } from './script-generator.js'
import { padIndex } from './tc-namer.js'

const HTTP_METHODS: OAHttpMethod[] = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']

// CRUD sort order: POST → PUT → PATCH → GET list → GET single → DELETE → others
const CRUD_ORDER: Partial<Record<OAHttpMethod, number>> = {
  post: 0, put: 1, patch: 2, get: 3, delete: 5,
}

function crudSortKey(path: string, method: OAHttpMethod): number {
  const base = CRUD_ORDER[method] ?? 6
  // GET with path params = single resource (comes after GET list)
  if (method === 'get' && /\{[^}]+\}/.test(path)) return 4
  return base
}

export function buildBaseEnvData(doc: OADocument): Record<string, InsomniaEnvValue> {
  const base_url = doc.servers?.[0]?.url ?? ''

  const pathParams: Record<string, string> = {}
  for (const pathItem of Object.values(doc.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method]
      if (!operation) continue
      for (const param of operation.parameters ?? []) {
        if (param.in === 'path' && !(param.name in pathParams)) {
          const raw = param.example ?? param.schema?.example ?? param.schema?.default
          const value = raw !== undefined
            ? String(raw)
            : param.schema ? String(generateExample(param.schema) ?? '') : ''
          pathParams[param.name] = value
        }
      }
    }
  }

  const oauth2Schemes = getOAuth2Schemes(doc)
  const oauth2EnvVars = oauth2Schemes.length > 0 ? buildOAuth2EnvVars(oauth2Schemes) : {}

  return { base_url, ...pathParams, ...oauth2EnvVars, __validate__: `${VALIDATOR_FN}\nreturn validate;` }
}

export function buildEnvironmentForConfig(
  env: EnvironmentConfig,
  baseData: Record<string, InsomniaEnvValue>,
  now: number,
): InsomniaV5RootEnvironment {
  const oauthOverrides: Record<string, InsomniaEnvValue> = {}
  if (env.token_url) oauthOverrides['token_url'] = env.token_url
  if (env.authorization_url) oauthOverrides['authorization_url'] = env.authorization_url
  if (env.client_id) oauthOverrides['client_id'] = env.client_id
  if (env.client_secret) oauthOverrides['client_secret'] = env.client_secret

  return {
    name: env.name,
    meta: { id: makeId('env', env.name), created: now, modified: now, isPrivate: false },
    data: { ...baseData, base_url: env.base_url, ...oauthOverrides },
  }
}

export function convertEnvironments(doc: OADocument): InsomniaV5RootEnvironment {
  const now = Date.now()
  const baseData = buildBaseEnvData(doc)

  return {
    name: 'Base Environment',
    meta: { id: makeId('env', 'base-environment'), created: now, modified: now, isPrivate: false },
    data: baseData,
  }
}

export interface ConvertFoldersResult {
  folders: InsomniaV5Folder[]
  tcVars: Record<string, InsomniaEnvValue>
}

export function convertFolders(
  doc: OADocument,
  examples: ExampleValues = DEFAULT_EXAMPLE_VALUES,
  microcksHeaders = false,
  readOnly = false,
  expandOpts: ExpandOptions = DEFAULT_EXPAND_OPTIONS,
): ConvertFoldersResult {
  const paths = doc.paths ?? {}

  const tagOrder: string[] = []
  const tagSet = new Set<string>()

  for (const pathItem of Object.values(paths)) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method]
      if (!operation) continue
      for (const tag of operation.tags ?? []) {
        if (!tagSet.has(tag)) { tagSet.add(tag); tagOrder.push(tag) }
      }
      if (!operation.tags?.length && !tagSet.has('Default')) {
        tagSet.add('Default'); tagOrder.push('Default')
      }
    }
  }

  type OpEntry = { path: string; method: OAHttpMethod; operation: OAOperation }
  const tagOps = new Map<string, OpEntry[]>()
  for (const tag of tagOrder) tagOps.set(tag, [])

  for (const [path, pathItem] of Object.entries(paths)) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method]
      if (!operation) continue
      const tag = operation.tags?.[0] ?? 'Default'
      tagOps.get(tag)?.push({ path, method, operation })
    }
  }
  for (const ops of tagOps.values()) {
    ops.sort((a, b) => crudSortKey(a.path, a.method) - crudSortKey(b.path, b.method))
  }

  const opCountPerTag = new Map<string, number>()
  const allTcVars: Record<string, InsomniaEnvValue> = {}
  const subFolderMap = new Map<string, InsomniaV5Folder[]>()
  for (const tag of tagOrder) {
    subFolderMap.set(tag, [])
    opCountPerTag.set(tag, 0)
  }

  for (const tag of tagOrder) {
    for (const { path, method, operation } of tagOps.get(tag) ?? []) {
      if (readOnly && method !== 'get') continue
      const opIndex = (opCountPerTag.get(tag) ?? 0) + 1
      opCountPerTag.set(tag, opIndex)

      const folderIndex = tagOrder.indexOf(tag) + 1
      const fi = padIndex(folderIndex)
      const oi = padIndex(opIndex)

      const { subFolder, envVars } = expandOperation(
        path, method, operation, doc, fi, oi, examples, microcksHeaders, expandOpts,
      )

      subFolderMap.get(tag)?.push(subFolder)
      Object.assign(allTcVars, envVars)
    }
  }

  const now = Date.now()
  const folders = tagOrder.map((tag, index) => ({
    name: tag,
    meta: {
      id: makeId('fld', tag),
      created: now,
      modified: now,
      sortKey: -(now + index),
      description: '',
    },
    children: subFolderMap.get(tag) ?? [],
  }))

  return { folders, tcVars: allTcVars }
}

export function buildOAuth2Folder(doc: OADocument): InsomniaV5Folder | null {
  const schemes = getOAuth2Schemes(doc)
  if (schemes.length === 0) return null

  const now = Date.now()
  return {
    name: 'OAuth2',
    meta: { id: makeId('fld', 'oauth2'), created: now, modified: now, sortKey: Number.MIN_SAFE_INTEGER, description: '' },
    children: schemes.map(([name, scheme]) => buildGetTokenRequest(name, scheme, now)),
  }
}

function getOAuth2Schemes(doc: OADocument): [string, OASecurityScheme][] {
  return Object.entries(doc.components?.securitySchemes ?? {}).filter(([, s]) => s.type === 'oauth2')
}

function buildOAuth2EnvVars(schemes: [string, OASecurityScheme][]): Record<string, InsomniaEnvValue> {
  const first = schemes[0]![1]
  const flows = first.flows ?? {}

  const tokenUrl =
    flows.clientCredentials?.tokenUrl ??
    flows.password?.tokenUrl ??
    flows.authorizationCode?.tokenUrl ??
    ''
  const authorizationUrl =
    flows.authorizationCode?.authorizationUrl ??
    flows.implicit?.authorizationUrl ??
    ''
  const hasPasswordFlow = schemes.some(([, s]) => s.flows?.password)

  return {
    token_url: tokenUrl,
    authorization_url: authorizationUrl,
    client_id: '',
    client_secret: '',
    access_token: '',
    refresh_token: '',
    ...(hasPasswordFlow ? { username: '', password: '' } : {}),
  }
}

function buildGetTokenRequest(schemeName: string, scheme: OASecurityScheme, now: number): InsomniaV5Request {
  const { grantType, extraParams } = resolveGrantConfig(scheme.flows ?? {})

  const params = [
    { name: 'grant_type', value: grantType },
    { name: 'client_id', value: '{{ _.client_id }}' },
    { name: 'client_secret', value: '{{ _.client_secret }}' },
    ...extraParams,
  ]

  return {
    url: '{{ _.token_url }}',
    name: `Get Token — ${schemeName}`,
    method: 'POST',
    meta: { id: makeId('req', `oauth2-${schemeName}`), created: now, modified: now, isPrivate: false, sortKey: 0 },
    headers: [{ name: 'Content-Type', value: 'application/x-www-form-urlencoded', disabled: false }],
    body: { mimeType: 'application/x-www-form-urlencoded', params },
    scripts: {
      afterResponse: [
        'const json = insomnia.response.json();',
        'if (insomnia.response.code === 200 && json.access_token) {',
        "  insomnia.environment.set('access_token', json.access_token);",
        '}',
        'if (insomnia.response.code === 200 && json.refresh_token) {',
        "  insomnia.environment.set('refresh_token', json.refresh_token);",
        '}',
      ].join('\n'),
    },
    settings: DEFAULT_REQUEST_SETTINGS,
  }
}

function resolveGrantConfig(flows: OAOAuth2Flows): { grantType: string; extraParams: { name: string; value: string }[] } {
  // Prefer machine-to-machine; password grant adds user credentials
  if (flows.clientCredentials) return { grantType: 'client_credentials', extraParams: [] }
  if (flows.password) return { grantType: 'password', extraParams: [{ name: 'username', value: '{{ _.username }}' }, { name: 'password', value: '{{ _.password }}' }] }
  if (flows.authorizationCode) return { grantType: 'authorization_code', extraParams: [] }
  return { grantType: 'implicit', extraParams: [] }
}

// % is a wildcard for any sequence of characters, case-insensitive (SQL LIKE semantics)
export function matchesServerPattern(url: string, pattern: string): boolean {
  const parts = pattern.split('%').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp('^' + parts.join('.*') + '$', 'i').test(url)
}

// priority: host_server_pattern match > explicit base_url > servers[0]
export function resolveBaseUrl(
  env: { base_url: string; hostServerPattern?: string },
  servers: OAServer[],
): string {
  if (env.hostServerPattern) {
    const matched = servers.find((s) => matchesServerPattern(s.url, env.hostServerPattern!))
    if (matched) return matched.url
  }
  if (env.base_url) return env.base_url
  return servers[0]?.url ?? ''
}
