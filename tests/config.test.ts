import { describe, it, expect } from 'vitest'
import { writeFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig, ConfigError } from '../src/core/config.js'
import { DEFAULT_EXAMPLE_VALUES } from '../src/core/tc-expander.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const tmp = (name: string) => resolve(__dirname, `fixtures/${name}`)

function writeJson(path: string, data: unknown) {
  writeFileSync(path, JSON.stringify(data), 'utf-8')
}

describe('loadConfig', () => {
  it('throws ConfigError with exit code 1 when file does not exist', () => {
    expect(() => loadConfig('/nonexistent/path/config.json')).toThrowError(ConfigError)
    try { loadConfig('/nonexistent/path/config.json') } catch (e) {
      expect(e).toBeInstanceOf(ConfigError)
      expect((e as ConfigError).exitCode).toBe(1)
      expect((e as ConfigError).message).toContain('Config file not found')
    }
  })

  it('throws ConfigError when file is not valid JSON', () => {
    const path = tmp('bad.json')
    writeFileSync(path, 'not json {{{', 'utf-8')
    try {
      expect(() => loadConfig(path)).toThrowError(ConfigError)
    } finally {
      rmSync(path)
    }
  })

  it('throws ConfigError when a field has the wrong type', () => {
    const path = tmp('wrong-type.json')
    writeJson(path, { examples: { correct: { string: 123 } } })
    try {
      expect(() => loadConfig(path)).toThrowError(ConfigError)
    } finally {
      rmSync(path)
    }
  })

  it('throws ConfigError for unknown top-level keys', () => {
    const path = tmp('unknown-key.json')
    writeJson(path, { unknownKey: true })
    try {
      expect(() => loadConfig(path)).toThrowError(ConfigError)
    } finally {
      rmSync(path)
    }
  })

  it('returns defaults for an empty config object', () => {
    const path = tmp('empty-config.json')
    writeJson(path, {})
    try {
      const result = loadConfig(path)
      expect(result.examples.correct.string).toBe(DEFAULT_EXAMPLE_VALUES.correct.string)
      expect(result.examples.correct.integer).toBe(DEFAULT_EXAMPLE_VALUES.correct.integer)
      expect(result.examples.wrong.string).toBe(DEFAULT_EXAMPLE_VALUES.wrong.string)
      expect(result.environments).toEqual([])
    } finally {
      rmSync(path)
    }
  })

  it('overrides only the provided example fields, keeps defaults for the rest', () => {
    const path = tmp('partial-config.json')
    writeJson(path, { examples: { correct: { string: 'mystring' } } })
    try {
      const result = loadConfig(path)
      expect(result.examples.correct.string).toBe('mystring')
      expect(result.examples.correct.integer).toBe(DEFAULT_EXAMPLE_VALUES.correct.integer)
      expect(result.examples.wrong.string).toBe(DEFAULT_EXAMPLE_VALUES.wrong.string)
    } finally {
      rmSync(path)
    }
  })

  it('applies all example overrides when a full examples block is provided', () => {
    const path = tmp('full-examples.json')
    writeJson(path, {
      examples: {
        correct: { string: 'cs', integer: 42, number: 3.14, boolean: false, date: '2024-06-01', 'date-time': '2024-06-01T12:00:00' },
        wrong:   { string: 'ws', integer: 'bad', number: 'bad', boolean: 'bad', date: '9999-99-99', 'date-time': '9999-99-99T00:00:00' },
      },
    })
    try {
      const result = loadConfig(path)
      expect(result.examples.correct.string).toBe('cs')
      expect(result.examples.correct.integer).toBe(42)
      expect(result.examples.correct.boolean).toBe(false)
      expect(result.examples.wrong.date).toBe('9999-99-99')
    } finally {
      rmSync(path)
    }
  })

  it('returns parsed environments when environments array is provided', () => {
    const path = tmp('envs-config.json')
    writeJson(path, {
      environments: [
        { name: 'DEV',  base_url: 'https://dev.api.example.com/v1' },
        { name: 'PROD', base_url: 'https://api.example.com/v1' },
      ],
    })
    try {
      const result = loadConfig(path)
      expect(result.environments).toHaveLength(2)
      expect(result.environments[0]?.name).toBe('DEV')
      expect(result.environments[0]?.base_url).toBe('https://dev.api.example.com/v1')
      expect(result.environments[1]?.name).toBe('PROD')
    } finally {
      rmSync(path)
    }
  })

  it('throws ConfigError when an environment entry is missing name', () => {
    const path = tmp('env-no-name.json')
    writeJson(path, { environments: [{ base_url: 'https://api.example.com' }] })
    try {
      expect(() => loadConfig(path)).toThrowError(ConfigError)
    } finally {
      rmSync(path)
    }
  })

  it('throws ConfigError when an environment entry has an unknown key', () => {
    const path = tmp('env-unknown-key.json')
    writeJson(path, { environments: [{ name: 'DEV', base_url: 'https://dev.api.com', extra: true }] })
    try {
      expect(() => loadConfig(path)).toThrowError(ConfigError)
    } finally {
      rmSync(path)
    }
  })
})
