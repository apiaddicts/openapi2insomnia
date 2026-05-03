// Insomnia v5 native format (collection.insomnia.rest/5.0), verified against 12.5.0

export interface InsomniaV5Collection {
  type: 'collection.insomnia.rest/5.0'
  schema_version: '5.1'
  name: string
  meta: InsomniaV5WorkspaceMeta
  collection: InsomniaV5CollectionItem[]
  environments: InsomniaV5RootEnvironment
}

export interface InsomniaV5WorkspaceMeta {
  id: string
  created: number
  modified: number
  description: string
}

export interface InsomniaV5Meta {
  id: string
  created: number
  modified: number
  description?: string
  sortKey?: number
}

export type InsomniaV5CollectionItem = InsomniaV5Folder | InsomniaV5Request

export interface InsomniaV5Folder {
  name: string
  meta: InsomniaV5Meta
  children: InsomniaV5CollectionItem[]
}

export function isInsomniaFolder(item: InsomniaV5CollectionItem): item is InsomniaV5Folder {
  return 'children' in item
}

export function isInsomniaRequest(item: InsomniaV5CollectionItem): item is InsomniaV5Request {
  return 'url' in item && 'method' in item
}

export interface InsomniaV5Header {
  name: string
  value: string
  disabled?: boolean
  description?: string
}

export interface InsomniaV5Param {
  name: string
  value: string
  disabled?: boolean
}

export interface InsomniaV5Authentication {
  type: string
  token?: string   // bearer
  key?: string     // apiKey header name
  value?: string   // apiKey value
}

export interface InsomniaV5RequestMeta extends InsomniaV5Meta {
  isPrivate: boolean
}

export interface InsomniaV5RequestSettings {
  renderRequestBody: boolean
  encodeUrl: boolean
  followRedirects: 'global' | boolean
  cookies: { send: boolean; store: boolean }
  rebuildPath: boolean
}

export const DEFAULT_REQUEST_SETTINGS: InsomniaV5RequestSettings = {
  renderRequestBody: true,
  encodeUrl: true,
  followRedirects: 'global',
  cookies: { send: true, store: true },
  rebuildPath: true,
}

export interface InsomniaV5Request {
  url: string   // required by Insomnia importer
  name: string
  method: string
  meta: InsomniaV5RequestMeta
  description?: string
  params?: InsomniaV5Param[]
  headers?: InsomniaV5Header[]
  body?: { mimeType: string; text?: string; params?: InsomniaV5Param[] }
  authentication?: InsomniaV5Authentication
  scripts?: {
    preRequest?: string
    afterResponse?: string
  }
  settings: InsomniaV5RequestSettings
}

export interface InsomniaV5EnvironmentMeta {
  id: string
  created: number
  modified: number
  isPrivate: boolean
}

export type InsomniaEnvValue = string | number | boolean

export interface InsomniaV5RootEnvironment {
  name: string
  meta: InsomniaV5EnvironmentMeta
  data: Record<string, InsomniaEnvValue>
  subEnvironments?: InsomniaV5SubEnvironment[]
}

export interface InsomniaV5SubEnvironment {
  name: string
  meta: InsomniaV5Meta & { sortKey: number }
  data: Record<string, InsomniaEnvValue>
}
