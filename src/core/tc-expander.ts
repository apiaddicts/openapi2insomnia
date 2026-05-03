import type {
  OADocument,
  OAHttpMethod,
  OAOperation,
  OAParameter,
  OASchema,
  OASecurityScheme,
} from './openapi-types.js'
import { DEFAULT_REQUEST_SETTINGS, type InsomniaEnvValue, type InsomniaV5Authentication, type InsomniaV5Folder, type InsomniaV5Header, type InsomniaV5Param, type InsomniaV5Request } from './insomnia-types.js'
import { makeId } from './utils.js'
import { generateExample } from './schema-example.js'
import { generateAfterResponseScripts } from './script-generator.js'
import { toLetter, tcRequestName, tcVarName, tcVarNameWrong } from './tc-namer.js'

export interface ExpandOptions {
  minimalEndpoints: boolean
  generateOneOfAnyOf: boolean
  hasScopes: boolean
  applicationToken: boolean
  numberOfScopes: number
}

export const DEFAULT_EXPAND_OPTIONS: ExpandOptions = {
  minimalEndpoints: false,
  generateOneOfAnyOf: false,
  hasScopes: false,
  applicationToken: false,
  numberOfScopes: 0,
}

export interface ExampleValues {
  correct: {
    string: string
    integer: number
    number: number
    boolean: boolean
    date: string
    'date-time': string
  }
  wrong: {
    string: string
    integer: string
    number: string
    boolean: string
    date: string
    'date-time': string
  }
}

export const DEFAULT_EXAMPLE_VALUES: ExampleValues = {
  correct: {
    string: 'goodstring',
    integer: 1,
    number: 1.0,
    boolean: true,
    date: '2020-01-01',
    'date-time': '2020-01-01T23:59:59',
  },
  wrong: {
    string: 'badstring',
    integer: 'badstring',
    number: 'badstring',
    boolean: 'badboolean',
    date: '2020-40-40',
    'date-time': '2020-40-40T00:00:00',
  },
}

interface BodyProperty {
  name: string
  required: boolean
  schema: {
    type?: string
    format?: string
    minLength?: number
    maxLength?: number
    minimum?: number
    maximum?: number
  }
}

interface SharedRequestParts {
  baseUrl: string
  method: string
  headers: InsomniaV5Header[]
  body: InsomniaV5Request['body'] | undefined
  variantBodies: (InsomniaV5Request['body'] | undefined)[]
  bodyProperties: BodyProperty[]
  authentication: InsomniaV5Authentication | undefined
  afterResponseScripts: Record<string, string>
  microcksExampleNames?: Record<string, string>
  minimalEndpoints: boolean
  hasScopes: boolean
}

interface QueryParamGroups {
  all: OAParameter[]
  required: OAParameter[]
  optional: OAParameter[]
}

interface GeneratorResult {
  requests: InsomniaV5Request[]
  envVars: Record<string, InsomniaEnvValue>
}

type StatusGenerator = (
  status: string,
  fi: string,
  oi: string,
  shared: SharedRequestParts,
  queryParams: QueryParamGroups,
  examples: ExampleValues,
) => GeneratorResult

export interface TcExpandResult {
  subFolder: InsomniaV5Folder
  envVars: Record<string, InsomniaEnvValue>
}

function resolveGenerator(status: string): StatusGenerator {
  if (status.startsWith('2')) return generateSuccess
  if (status === '400') return generate400
  if (status === '401') return generate401
  if (status === '403') return generate403
  if (status === '404') return generate404
  if (status === 'default') return generateNoop
  if (status.startsWith('5')) return generateNoop
  if (status === '429') return generateNoop
  if (status === '415') return generateNoop
  if (status === '405') return generateNoop
  return generateSingle
}

export function expandOperation(
  path: string,
  method: OAHttpMethod,
  operation: OAOperation,
  doc: OADocument,
  fi: string,
  oi: string,
  examples: ExampleValues,
  microcksHeaders = false,
  options: ExpandOptions = DEFAULT_EXPAND_OPTIONS,
): TcExpandResult {
  const opName = operation.summary ?? operation.operationId ?? `${method.toUpperCase()} ${path}`
  const shared = buildShared(path, method, operation, doc, microcksHeaders, options)
  const queryParams = partitionQueryParams(operation)

  const sortedStatuses = Object.keys(operation.responses ?? {}).sort((a, b) => {
    const na = parseInt(a)
    const nb = parseInt(b)
    if (isNaN(na) && isNaN(nb)) return 0
    if (isNaN(na)) return 1
    if (isNaN(nb)) return -1
    return na - nb
  })

  const { requests, envVars, twoxxRequests } = sortedStatuses.reduce<{
    requests: InsomniaV5Request[]
    envVars: Record<string, InsomniaEnvValue>
    twoxxRequests: InsomniaV5Request[]
  }>(
    (acc, status) => {
      const { requests: r, envVars: v } = resolveGenerator(status)(
        status, fi, oi, shared, queryParams, examples,
      )
      acc.requests.push(...r)
      Object.assign(acc.envVars, v)
      if (status.startsWith('2')) acc.twoxxRequests.push(...r)
      return acc
    },
    { requests: [], envVars: {}, twoxxRequests: [] },
  )

  // scope post-processing: rename scope_1 TCs and insert clones for other token types
  if (options.hasScopes && twoxxRequests.length > 0) {
    // scope_1 reuses the existing access_token var — just append the suffix
    for (const req of twoxxRequests) {
      applyScopeAuth(req, 'access_token')
      req.name = `${req.name} with.user_token_scope_1`
    }

    if (options.applicationToken) envVars['application_token'] = ''
    for (let n = 2; n <= options.numberOfScopes; n++) envVars[`user_token_scope_${n}`] = ''

    const cloneTokens: string[] = []
    if (options.applicationToken) cloneTokens.push('application_token')
    for (let n = 2; n <= options.numberOfScopes; n++) cloneTokens.push(`user_token_scope_${n}`)

    if (cloneTokens.length > 0) {
      const twoxxCount = twoxxRequests.length
      const scopeClones: InsomniaV5Request[] = []

      // order: [AT_TC0, scope2_TC0, AT_TC1, scope2_TC1, ...]
      for (let i = 0; i < twoxxCount; i++) {
        for (let j = 0; j < cloneTokens.length; j++) {
          const tokenName = cloneTokens[j]!
          const cloneLetter = toLetter(twoxxCount + i * cloneTokens.length + j)
          scopeClones.push(createScopeClone(twoxxRequests[i]!, tokenName, cloneLetter))
        }
      }

      const lastTwoxxIdx = requests.indexOf(twoxxRequests[twoxxCount - 1]!)
      requests.splice(lastTwoxxIdx + 1, 0, ...scopeClones)
    }
  }

  requests.forEach((req, i) => { req.meta.sortKey = i })

  const now = Date.now()
  return {
    subFolder: {
      name: `${oi}.${opName}`,
      meta: { id: makeId('fld', `${method}:${path}:tc`), created: now, modified: now, sortKey: parseInt(oi), description: '' },
      children: requests,
    },
    envVars,
  }
}

function generateSuccess(
  status: string,
  fi: string,
  oi: string,
  shared: SharedRequestParts,
  { required, optional }: QueryParamGroups,
  examples: ExampleValues,
): GeneratorResult {
  const envVars: Record<string, InsomniaEnvValue> = {}

  for (const param of [...required, ...optional]) {
    envVars[tcVarName(fi, oi, param.name)] = correctValueForParam(param, examples)
    envVars[tcVarNameWrong(fi, oi, param.name)] = wrongValueForParam(param, examples)
  }

  const baseParams = required.map((p) => toTcParam(p, fi, oi))
  const activeOptional = shared.minimalEndpoints ? [] : optional
  const bodies = shared.variantBodies.length > 0 ? shared.variantBodies : [shared.body]
  // letter is always used when scope clones will be inserted (they need the letter to build their name)
  const hasVariants = bodies.length > 1 || activeOptional.length > 0 || shared.hasScopes

  const requests: InsomniaV5Request[] = []
  let letterIdx = 0

  for (const variantBody of bodies) {
    const sharedMod = variantBody !== undefined ? { ...shared, body: variantBody } : shared

    requests.push(buildTcRequest(
      sharedMod,
      tcRequestName(fi, oi, status, hasVariants ? toLetter(letterIdx) : undefined, undefined),
      baseParams,
      `${fi}:${oi}:${status}${hasVariants ? ':' + toLetter(letterIdx) : ''}`,
      status,
    ))
    letterIdx++

    for (const param of activeOptional) {
      requests.push(buildTcRequest(
        sharedMod,
        tcRequestName(fi, oi, status, toLetter(letterIdx), `queryString ${param.name}`),
        [...baseParams, toTcParam(param, fi, oi)],
        `${fi}:${oi}:${status}:${toLetter(letterIdx)}:${param.name}`,
        status,
      ))
      letterIdx++
    }
  }

  return { requests, envVars }
}

function generate400(
  status: string,
  fi: string,
  oi: string,
  shared: SharedRequestParts,
  { all }: QueryParamGroups,
  examples: ExampleValues,
): GeneratorResult {
  if (shared.minimalEndpoints) {
    if (all.length > 0) return { requests: [], envVars: {} }
    if (shared.body !== undefined && shared.bodyProperties.length > 0) {
      const requiredProps = shared.bodyProperties.filter((p) => p.required)
      if (requiredProps.length === 0) return { requests: [], envVars: {} }
      const baseBody = JSON.parse(shared.body.text ?? '{}') as Record<string, unknown>
      const body = { ...baseBody }
      delete body[requiredProps[0]!.name]
      const sharedMod = { ...shared, body: { mimeType: 'application/json', text: JSON.stringify(body, null, 2) } }
      return {
        requests: [buildTcRequest(sharedMod, tcRequestName(fi, oi, status, undefined, undefined), [], `${fi}:${oi}:400:minimal`, status)],
        envVars: {},
      }
    }
    return { requests: [], envVars: {} }
  }

  if (all.length > 0) {
    const envVars: Record<string, InsomniaEnvValue> = {}
    for (const param of all) {
      envVars[tcVarNameWrong(fi, oi, param.name)] = wrongValueForParam(param, examples)
    }
    const requests = all.map((param, i) =>
      buildTcRequest(
        shared, tcRequestName(fi, oi, status, toLetter(i), `queryString ${param.name} wrong`),
        [{ name: param.name, value: `{{ _.${tcVarNameWrong(fi, oi, param.name)} }}` }],
        `${fi}:${oi}:400:${toLetter(i)}:${param.name}`, status,
      )
    )
    return { requests, envVars }
  }

  if (shared.body !== undefined && shared.bodyProperties.length > 0) {
    const baseBody = JSON.parse(shared.body.text ?? '{}') as Record<string, unknown>
    const requests: InsomniaV5Request[] = []
    let letterIndex = 0

    for (const prop of shared.bodyProperties.filter((p) => p.required)) {
      const body = { ...baseBody }
      delete body[prop.name]
      const sharedMod = { ...shared, body: { mimeType: 'application/json', text: JSON.stringify(body, null, 2) } }
      requests.push(buildTcRequest(
        sharedMod,
        tcRequestName(fi, oi, status, toLetter(letterIndex), `Error without.${prop.name}`),
        [],
        `${fi}:${oi}:400:${toLetter(letterIndex)}:without:${prop.name}`, status,
      ))
      letterIndex++
    }

    for (const prop of shared.bodyProperties) {
      const body = { ...baseBody, [prop.name]: wrongBodyValue(prop, examples) }
      const sharedMod = { ...shared, body: { mimeType: 'application/json', text: JSON.stringify(body, null, 2) } }
      requests.push(buildTcRequest(
        sharedMod,
        tcRequestName(fi, oi, status, toLetter(letterIndex), `Error with.${prop.name}.wrong`),
        [],
        `${fi}:${oi}:400:${toLetter(letterIndex)}:with:${prop.name}`, status,
      ))
      letterIndex++
    }

    return { requests, envVars: {} }
  }

  if (shared.body !== undefined) {
    const sharedEmptyBody = { ...shared, body: { mimeType: 'application/json', text: '{}' } }
    return {
      requests: [buildTcRequest(sharedEmptyBody, tcRequestName(fi, oi, status, undefined, undefined), [], `${fi}:${oi}:400`, status)],
      envVars: {},
    }
  }

  return { requests: [], envVars: {} }
}

// 403: valid auth, wrong permissions — uses forbidden_access_token
function generate403(
  status: string,
  fi: string,
  oi: string,
  shared: SharedRequestParts,
): GeneratorResult {
  let sharedMod: SharedRequestParts

  const hasAuthHeader = shared.headers.some((h) => h.name === 'Authorization')
  if (hasAuthHeader) {
    sharedMod = {
      ...shared,
      headers: shared.headers.map((h) =>
        h.name === 'Authorization' ? { ...h, value: 'Bearer {{ _.forbidden_access_token }}' } : h
      ),
      authentication: undefined,
    }
  } else if (shared.authentication?.type === 'bearer') {
    sharedMod = { ...shared, authentication: { type: 'bearer', token: '{{ _.forbidden_access_token }}' } }
  } else if (shared.authentication?.type === 'apikey') {
    sharedMod = { ...shared, authentication: { ...shared.authentication, value: '{{ _.forbidden_access_token }}' } }
  } else {
    sharedMod = shared
  }

  return {
    requests: [buildTcRequest(sharedMod, tcRequestName(fi, oi, status, undefined, undefined), [], `${fi}:${oi}:403`, status)],
    envVars: { forbidden_access_token: '', wrong_scope: '' },
  }
}

// 401: strips all auth headers so the server sees an unauthenticated request
function generate401(
  status: string,
  fi: string,
  oi: string,
  shared: SharedRequestParts,
): GeneratorResult {
  const sharedNoAuth = {
    ...shared,
    headers: shared.headers.filter((h) => h.name !== 'Authorization'),
    authentication: undefined,
  }
  return {
    requests: [buildTcRequest(sharedNoAuth, tcRequestName(fi, oi, status, undefined, undefined), [], `${fi}:${oi}:401`, status)],
    envVars: {},
  }
}

function generateSingle(
  status: string,
  fi: string,
  oi: string,
  shared: SharedRequestParts,
): GeneratorResult {
  return {
    requests: [buildTcRequest(shared, tcRequestName(fi, oi, status, undefined, undefined), [], `${fi}:${oi}:${status}`, status)],
    envVars: {},
  }
}

// 404: replaces path param vars with *_not_found variants to reference a non-existent resource
function generate404(
  status: string,
  fi: string,
  oi: string,
  shared: SharedRequestParts,
): GeneratorResult {
  const notFoundVars: Record<string, string> = {}
  const notFoundUrl = shared.baseUrl.replace(
    /\{\{[ ]*_\.([a-zA-Z_]\w*)[ ]*\}\}/g,
    (match, name: string) => {
      if (name === 'base_url') return match
      const notFoundName = `${name}_not_found`
      notFoundVars[notFoundName] = 'not-a-valid-id'
      return `{{ _.${notFoundName} }}`
    },
  )
  const sharedMod = { ...shared, baseUrl: notFoundUrl }
  return {
    requests: [buildTcRequest(sharedMod, tcRequestName(fi, oi, status, undefined, undefined), [], `${fi}:${oi}:404`, status)],
    envVars: notFoundVars,
  }
}

// noop for 'default', 5xx, 429, 415, 405
function generateNoop(): GeneratorResult {
  return { requests: [], envVars: {} }
}

function buildTcRequest(
  { baseUrl, method, headers, body, authentication, afterResponseScripts, microcksExampleNames }: SharedRequestParts,
  name: string,
  params: InsomniaV5Param[],
  idContent: string,
  expectedStatus: string,
): InsomniaV5Request {
  const now = Date.now()
  const request: InsomniaV5Request = {
    url: baseUrl,
    name,
    method,
    meta: { id: makeId('req', idContent), created: now, modified: now, isPrivate: false, sortKey: 0 },
    settings: DEFAULT_REQUEST_SETTINGS,
  }
  if (params.length > 0) request.params = params
  const allHeaders = microcksExampleNames
    ? [...headers, { name: 'X-Microcks-Response-Name', value: microcksExampleNames[expectedStatus] ?? 'default', disabled: false }]
    : headers
  if (allHeaders.length > 0) request.headers = allHeaders
  if (body) request.body = body
  if (authentication) request.authentication = authentication
  const afterResponse = afterResponseScripts[expectedStatus]
  if (afterResponse) request.scripts = { afterResponse }
  return request
}

function buildMicrocksExampleNames(operation: OAOperation): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [code, response] of Object.entries(operation.responses ?? {})) {
    const examples = response.content?.['application/json']?.examples
    result[code] = examples ? Object.keys(examples)[0] ?? 'default' : 'default'
  }
  return result
}

function buildShared(
  path: string,
  method: OAHttpMethod,
  operation: OAOperation,
  doc: OADocument,
  microcksHeaders: boolean,
  options: ExpandOptions,
): SharedRequestParts {
  return {
    baseUrl: buildUrl(path),
    method: method.toUpperCase(),
    headers: buildHeaders(operation, doc),
    body: buildBody(operation),
    variantBodies: buildVariantBodies(operation, options.generateOneOfAnyOf),
    bodyProperties: extractBodyProperties(operation),
    authentication: buildAuthentication(operation, doc),
    afterResponseScripts: generateAfterResponseScripts(operation),
    ...(microcksHeaders ? { microcksExampleNames: buildMicrocksExampleNames(operation) } : {}),
    minimalEndpoints: options.minimalEndpoints,
    hasScopes: options.hasScopes,
  }
}

function buildVariantBodies(
  operation: OAOperation,
  generateOneOfAnyOf: boolean,
): (InsomniaV5Request['body'] | undefined)[] {
  if (!generateOneOfAnyOf) return []
  const jsonContent = operation.requestBody?.content['application/json']
  if (!jsonContent?.schema) return []
  const variants = jsonContent.schema.oneOf ?? jsonContent.schema.anyOf
  if (!Array.isArray(variants) || variants.length <= 1) return []
  return variants.map((variant) => ({
    mimeType: 'application/json' as const,
    text: JSON.stringify(generateExample(variant), null, 2),
  }))
}

function partitionQueryParams(operation: OAOperation): QueryParamGroups {
  const all = (operation.parameters ?? []).filter((p) => p.in === 'query')
  return {
    all,
    required: all.filter((p) => p.required === true),
    optional: all.filter((p) => !p.required),
  }
}

function toTcParam(param: OAParameter, fi: string, oi: string): InsomniaV5Param {
  return { name: param.name, value: `{{ _.${tcVarName(fi, oi, param.name)} }}` }
}

function correctValueForParam(param: OAParameter, examples: ExampleValues): InsomniaEnvValue {
  const raw = param.example ?? param.schema?.example ?? param.schema?.default
  if (raw !== undefined) {
    if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') return raw
    return String(raw)
  }
  const { type, format } = param.schema ?? {}
  if (type === 'integer') return examples.correct.integer
  if (type === 'number') return examples.correct.number
  if (type === 'boolean') return examples.correct.boolean
  if (type === 'string' && format === 'date') return examples.correct.date
  if (type === 'string' && format === 'date-time') return examples.correct['date-time']
  return examples.correct.string
}

function generateWrongValue(
  schema: { type?: string; format?: string; minLength?: number; maxLength?: number; minimum?: number; maximum?: number },
  examples: ExampleValues,
): string {
  const { type, format, minLength, maxLength, minimum, maximum } = schema
  if (type === 'integer' || type === 'number') {
    if (minimum !== undefined) return String(minimum - 1)
    if (maximum !== undefined) return String(maximum + 1)
    return type === 'integer' ? examples.wrong.integer : examples.wrong.number
  }
  if (type === 'boolean') return examples.wrong.boolean
  if (type === 'string') {
    if (format === 'date') return examples.wrong.date
    if (format === 'date-time') return examples.wrong['date-time']
    if (maxLength !== undefined) return 'z'.repeat(maxLength + 1)
    if (minLength !== undefined && minLength > 0) return ''
  }
  return examples.wrong.string
}

function wrongValueForParam(param: OAParameter, examples: ExampleValues): string {
  const s = param.schema ?? {}
  const schema: Parameters<typeof generateWrongValue>[0] = {}
  if (s.type !== undefined) schema.type = s.type
  if (s.format !== undefined) schema.format = s.format
  if (typeof s.minLength === 'number') schema.minLength = s.minLength
  if (typeof s.maxLength === 'number') schema.maxLength = s.maxLength
  if (typeof s.minimum === 'number') schema.minimum = s.minimum
  if (typeof s.maximum === 'number') schema.maximum = s.maximum
  return generateWrongValue(schema, examples)
}

function wrongBodyValue(prop: BodyProperty, examples: ExampleValues): string {
  return generateWrongValue(prop.schema, examples)
}

function extractBodyProperties(operation: OAOperation): BodyProperty[] {
  const schema = operation.requestBody?.content['application/json']?.schema
  if (!schema) return []

  let rootProps: Record<string, OASchema> | undefined = schema.properties
  let rootRequired: string[] | undefined = schema.required

  // allOf: merge properties and required from all sub-schemas
  if (!rootProps && schema.allOf?.length) {
    const merged: Record<string, OASchema> = {}
    const mergedReq: string[] = []
    for (const sub of schema.allOf) {
      if (sub.properties) Object.assign(merged, sub.properties)
      if (sub.required) mergedReq.push(...sub.required)
    }
    if (Object.keys(merged).length > 0) {
      rootProps = merged
      rootRequired = mergedReq.length > 0 ? mergedReq : undefined
    }
  }

  if (!rootProps) return []

  const required = new Set(rootRequired ?? [])
  return Object.entries(rootProps).map(([name, propSchema]) => {
    const bp: BodyProperty = { name, required: required.has(name), schema: {} }
    if (propSchema.type !== undefined) bp.schema.type = propSchema.type
    if (propSchema.format !== undefined) bp.schema.format = propSchema.format
    if (typeof propSchema.minLength === 'number') bp.schema.minLength = propSchema.minLength
    if (typeof propSchema.maxLength === 'number') bp.schema.maxLength = propSchema.maxLength
    if (typeof propSchema.minimum === 'number') bp.schema.minimum = propSchema.minimum
    if (typeof propSchema.maximum === 'number') bp.schema.maximum = propSchema.maximum
    return bp
  })
}

export function buildUrl(path: string): string {
  return `{{ _.base_url }}${path.replace(/\{(\w+)\}/g, (_, name: string) => `{{ _.${name} }}`)}`
}

function buildHeaders(operation: OAOperation, doc: OADocument): InsomniaV5Header[] {
  const paramHeaders = (operation.parameters ?? [])
    .filter((p) => p.in === 'header')
    .map((p) => ({ name: p.name, value: '', disabled: false }))

  const hasJsonBody = !!operation.requestBody?.content['application/json']
  const contentTypeHeader = hasJsonBody
    ? [{ name: 'Content-Type', value: 'application/json', disabled: false }]
    : []

  const scheme = resolveSecurityScheme(operation, doc)
  const authHeader = scheme?.type === 'oauth2'
    ? [{ name: 'Authorization', value: 'Bearer {{ _.access_token }}', disabled: false }]
    : []

  return [...paramHeaders, ...contentTypeHeader, ...authHeader]
}

function buildBody(operation: OAOperation): InsomniaV5Request['body'] | undefined {
  const jsonContent = operation.requestBody?.content['application/json']
  if (!jsonContent) return undefined
  if (jsonContent.example !== undefined) {
    return { mimeType: 'application/json', text: JSON.stringify(jsonContent.example, null, 2) }
  }
  const firstExample = jsonContent.examples && Object.values(jsonContent.examples)[0]
  if (firstExample?.value !== undefined) {
    return { mimeType: 'application/json', text: JSON.stringify(firstExample.value, null, 2) }
  }
  if (jsonContent.schema) {
    return { mimeType: 'application/json', text: JSON.stringify(generateExample(jsonContent.schema), null, 2) }
  }
  return { mimeType: 'application/json', text: '{}' }
}

function buildAuthentication(
  operation: OAOperation,
  doc: OADocument,
): InsomniaV5Authentication | undefined {
  const scheme = resolveSecurityScheme(operation, doc)
  if (!scheme) return undefined
  if (scheme.type === 'http' && scheme.scheme === 'bearer') return { type: 'bearer', token: '' }
  if (scheme.type === 'apiKey' && scheme.name) return { type: 'apikey', key: scheme.name, value: '' }
  // oauth2 handled via Authorization header — no native auth block
  return undefined
}

function resolveSecurityScheme(operation: OAOperation, doc: OADocument): OASecurityScheme | undefined {
  const requirements = operation.security ?? []
  if (requirements.length === 0) return undefined
  const schemeName = Object.keys(requirements[0] ?? {})[0]
  if (!schemeName) return undefined
  return doc.components?.securitySchemes?.[schemeName]
}

function applyScopeAuth(req: InsomniaV5Request, tokenName: string): void {
  const authHeader = req.headers?.find((h) => h.name === 'Authorization')
  if (authHeader) {
    authHeader.value = `Bearer {{ _.${tokenName} }}`
    return
  }
  if (req.authentication?.type === 'bearer') {
    req.authentication = { ...req.authentication, token: `{{ _.${tokenName} }}` }
    return
  }
  if (req.authentication?.type === 'apikey') {
    req.authentication = { ...req.authentication, value: `{{ _.${tokenName} }}` }
    return
  }
  req.headers = [...(req.headers ?? []), { name: 'Authorization', value: `Bearer {{ _.${tokenName} }}`, disabled: false }]
}

function createScopeClone(
  original: InsomniaV5Request,
  tokenName: string,
  cloneLetter: string,
): InsomniaV5Request {
  const now = Date.now()
  const clone: InsomniaV5Request = {
    ...original,
    ...(original.headers !== undefined ? { headers: original.headers.map((h) => ({ ...h })) } : {}),
    ...(original.authentication !== undefined ? { authentication: { ...original.authentication } } : {}),
    meta: {
      ...original.meta,
      id: makeId('req', `scope:${tokenName}:${original.meta.id}`),
      created: now,
      modified: now,
    },
  }

  applyScopeAuth(clone, tokenName)

  const scope1Suffix = ' with.user_token_scope_1'
  const nameBase = clone.name.endsWith(scope1Suffix) ? clone.name.slice(0, -scope1Suffix.length) : clone.name
  const m = nameBase.match(/^(TC\.\d+\.\d+\.\d+)([a-z]+)(.*)$/)
  clone.name = m
    ? `${m[1]}${cloneLetter}${m[3]} with.${tokenName}`
    : `${nameBase} with.${tokenName}`

  return clone
}
