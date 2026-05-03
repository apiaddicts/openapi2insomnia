import type { OAInfo } from './openapi-types.js'
import type {
  InsomniaV5Collection,
  InsomniaV5CollectionItem,
  InsomniaV5RootEnvironment,
} from './insomnia-types.js'
import { makeId } from './utils.js'

export function buildCollection(
  info: OAInfo,
  environments: InsomniaV5RootEnvironment,
  collection: InsomniaV5CollectionItem[],
): InsomniaV5Collection {
  const now = Date.now()
  return {
    type: 'collection.insomnia.rest/5.0',
    schema_version: '5.1',
    name: info.title,
    meta: {
      id: makeId('wrk', info.title),
      created: now,
      modified: now,
      description: info.description ?? '',
    },
    collection,
    environments,
  }
}
