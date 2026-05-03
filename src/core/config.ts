import { z } from 'zod'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ExampleValues } from './tc-expander.js'
import { DEFAULT_EXAMPLE_VALUES } from './tc-expander.js'

const ExampleSetSchema = z.object({
  string: z.string().optional(),
  integer: z.union([z.number().int(), z.string()]).optional(),
  number: z.union([z.number(), z.string()]).optional(),
  boolean: z.union([z.boolean(), z.string()]).optional(),
  date: z.string().optional(),
  'date-time': z.string().optional(),
}).strict()

const EnvironmentSchema = z.object({
  name: z.string().min(1),
  base_url: z.string().optional(),
  host_server_pattern: z.string().optional(),
  token_url: z.string().optional(),
  authorization_url: z.string().optional(),
  client_id: z.string().optional(),
  client_secret: z.string().optional(),
  microcks_headers: z.boolean().optional(),
  read_only: z.boolean().optional(),
  target_folder: z.string().optional(),
  has_scopes: z.boolean().optional(),
  application_token: z.boolean().optional(),
  number_of_scopes: z.number().int().min(0).optional(),
}).strict()

const ConfigSchema = z.object({
  environments: z.array(EnvironmentSchema).optional(),
  examples: z.object({
    correct: ExampleSetSchema.optional(),
    wrong: ExampleSetSchema.optional(),
  }).strict().optional(),
  minimal_endpoints: z.boolean().optional(),
  generate_oneOf_anyOf: z.boolean().optional(),
}).strict()

type RawConfig = z.infer<typeof ConfigSchema>

export interface EnvironmentConfig {
  name: string
  base_url: string          // always resolved: explicit > host_server_pattern > servers[0]
  hostServerPattern?: string
  token_url?: string | undefined
  authorization_url?: string | undefined
  client_id?: string | undefined
  client_secret?: string | undefined
  microcksHeaders: boolean
  readOnly: boolean
  targetFolder: string
  hasScopes: boolean
  applicationToken: boolean
  numberOfScopes: number
}

export interface O2IConfig {
  examples: ExampleValues
  environments: EnvironmentConfig[]
  minimalEndpoints: boolean
  generateOneOfAnyOf: boolean
}

export function loadConfig(configPath: string): O2IConfig {
  const resolved = resolve(configPath)

  if (!existsSync(resolved)) {
    throw new ConfigError(`Config file not found: ${resolved}`, 1)
  }

  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(resolved, 'utf-8'))
  } catch {
    throw new ConfigError(`Config file is not valid JSON: ${resolved}`, 1)
  }

  const result = ConfigSchema.safeParse(raw)
  if (!result.success) {
    const msg = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')
    throw new ConfigError(`Invalid config: ${msg}`, 1)
  }

  const config: O2IConfig = {
    examples: mergeExamples(result.data),
    environments: (result.data.environments ?? []).map((env) => ({
      name: env.name,
      base_url: env.base_url ?? '',   // '' = unresolved; resolved later in convert.ts using host_server_pattern or servers[0]
      ...(env.host_server_pattern !== undefined ? { hostServerPattern: env.host_server_pattern } : {}),
      token_url: env.token_url,
      authorization_url: env.authorization_url,
      client_id: env.client_id,
      client_secret: env.client_secret,
      microcksHeaders: env.microcks_headers ?? false,
      readOnly: env.read_only ?? false,
      targetFolder: env.target_folder ?? '.',
      hasScopes: env.has_scopes ?? false,
      applicationToken: env.application_token ?? false,
      numberOfScopes: env.number_of_scopes ?? 0,
    })),
    minimalEndpoints: result.data.minimal_endpoints ?? false,
    generateOneOfAnyOf: result.data.generate_oneOf_anyOf ?? false,
  }
  return config
}

export class ConfigError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number,
  ) {
    super(message)
    this.name = 'ConfigError'
  }
}

function mergeExamples(config: RawConfig): ExampleValues {
  const d = DEFAULT_EXAMPLE_VALUES
  const correct = config.examples?.correct
  const wrong = config.examples?.wrong

  return {
    correct: {
      string: (correct?.string ?? d.correct.string) as string,
      integer: (correct?.integer ?? d.correct.integer) as number,
      number: (correct?.number ?? d.correct.number) as number,
      boolean: (correct?.boolean ?? d.correct.boolean) as boolean,
      date: correct?.date ?? d.correct.date,
      'date-time': correct?.['date-time'] ?? d.correct['date-time'],
    },
    wrong: {
      string: wrong?.string ?? d.wrong.string,
      integer: String(wrong?.integer ?? d.wrong.integer),
      number: String(wrong?.number ?? d.wrong.number),
      boolean: String(wrong?.boolean ?? d.wrong.boolean),
      date: wrong?.date ?? d.wrong.date,
      'date-time': wrong?.['date-time'] ?? d.wrong['date-time'],
    },
  }
}
