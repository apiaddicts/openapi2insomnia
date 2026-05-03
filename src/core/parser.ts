import SwaggerParser from '@apidevtools/swagger-parser'
import type { OADocument } from './openapi-types.js'

export async function parseSpec(input: string): Promise<OADocument> {
  if (input.startsWith('http://')) {
    throw new Error('only HTTPS URLs are supported')
  }

  const doc = await SwaggerParser.dereference(input)
  return doc as OADocument
}
