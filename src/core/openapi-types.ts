export interface OADocument {
  info: OAInfo
  servers?: OAServer[]
  paths?: OAPaths
  components?: OAComponents
}

export interface OAInfo {
  title: string
  description?: string
  version: string
}

export interface OAServer {
  url: string
  description?: string
}

// { "/users": { get: OAOperation, post: OAOperation } }
export type OAPaths = Record<string, OAPathItem>

export type OAPathItem = {
  [method in OAHttpMethod]?: OAOperation
}

export type OAHttpMethod =
  | 'get'
  | 'put'
  | 'post'
  | 'delete'
  | 'options'
  | 'head'
  | 'patch'
  | 'trace'

export interface OAOperation {
  summary?: string
  description?: string
  operationId?: string
  tags?: string[]
  parameters?: OAParameter[]
  requestBody?: OARequestBody
  responses?: OAResponses
  security?: OASecurityRequirement[]
}

export interface OAParameter {
  name: string
  in: 'query' | 'header' | 'path' | 'cookie'
  description?: string
  required?: boolean
  example?: unknown
  schema?: OASchema
}

export interface OASchema {
  type?: 'string' | 'integer' | 'number' | 'boolean' | 'array' | 'object'
  format?: string
  example?: unknown
  default?: unknown
  enum?: unknown[]
  properties?: Record<string, OASchema>
  items?: OASchema
  required?: string[]
  allOf?: OASchema[]
  oneOf?: OASchema[]
  anyOf?: OASchema[]
  // allow additional unknown fields from dereferenced schemas
  [key: string]: unknown
}

export interface OARequestBody {
  description?: string
  required?: boolean
  content: Record<string, OAMediaType>
}

export interface OAMediaType {
  schema?: OASchema
  example?: unknown
  examples?: Record<string, { value?: unknown }>
}

export type OAResponses = Record<string, OAResponse>

export interface OAResponse {
  description?: string
  content?: Record<string, OAMediaType>
}

export interface OAComponents {
  securitySchemes?: Record<string, OASecurityScheme>
}

export interface OAOAuth2Flow {
  authorizationUrl?: string  // authorization_code, implicit
  tokenUrl?: string          // authorization_code, client_credentials, password
  scopes?: Record<string, string>
}

export interface OAOAuth2Flows {
  authorizationCode?: OAOAuth2Flow
  clientCredentials?: OAOAuth2Flow
  password?: OAOAuth2Flow
  implicit?: OAOAuth2Flow
}

export interface OASecurityScheme {
  type: 'http' | 'apiKey' | 'oauth2' | 'openIdConnect'
  scheme?: string         // e.g. "bearer" for http type
  in?: 'header' | 'query' | 'cookie' // apiKey location
  name?: string           // apiKey parameter name
  flows?: OAOAuth2Flows   // oauth2 only
}

// e.g. { bearerAuth: [] } — empty array means no specific scopes required
export type OASecurityRequirement = Record<string, string[]>
