import { Command } from 'commander'
import chalk from 'chalk'
import { dump } from 'js-yaml'
import { z } from 'zod'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseSpec } from '../core/parser.js'
import { convertEnvironments, convertFolders, buildOAuth2Folder, buildBaseEnvData, buildEnvironmentForConfig, resolveBaseUrl } from '../core/converter.js'
import { buildCollection } from '../core/generator.js'
import { loadConfig, ConfigError, type O2IConfig } from '../core/config.js'
import { DEFAULT_EXAMPLE_VALUES, DEFAULT_EXPAND_OPTIONS } from '../core/tc-expander.js'

const ArgsSchema = z.object({
  input: z.string().min(1, 'input path or URL cannot be empty'),
  output: z.string().min(1).optional(),
  config: z.string().min(1).optional(),
})

function sanitizeApiName(title: string): string {
  return title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export const convertCommand = new Command('convert')
  .description('Convert an OpenAPI 3.0.x spec to an Insomnia v5 collection')
  .requiredOption('-i, --input <path|url>', 'path to a local file or an HTTPS URL')
  .option('-o, --output <path>', 'output file path (default: stdout)')
  .option('-c, --config <path>', 'path to an o2i.config.json file')
  .action(async (opts: { input: string; output?: string; config?: string }) => {
    const args = ArgsSchema.safeParse(opts)
    if (!args.success) {
      console.error(chalk.red(`Error: ${args.error.issues[0]?.message ?? 'invalid arguments'}`))
      process.exit(1)
    }

    const { input, output, config } = args.data

    // Load config or use defaults — fail fast before parsing the spec
    let o2iConfig: O2IConfig | undefined
    if (config) {
      try {
        o2iConfig = loadConfig(config)
      } catch (err) {
        if (err instanceof ConfigError) {
          console.error(chalk.red(`Error: ${err.message}`))
          process.exit(err.exitCode)
        }
        throw err
      }
    }

    try {
      const doc = await parseSpec(input)
      const examples = o2iConfig?.examples ?? DEFAULT_EXAMPLE_VALUES
      const oauth2Folder = buildOAuth2Folder(doc)

      if (o2iConfig && o2iConfig.environments.length > 0) {
        // Multi-collection mode: one YAML file per environment
        const baseData = buildBaseEnvData(doc)
        const apiName = sanitizeApiName(doc.info.title)
        const now = Date.now()

        for (const env of o2iConfig.environments) {
          const resolvedBaseUrl = resolveBaseUrl(env, doc.servers ?? [])
          const environment = buildEnvironmentForConfig({ ...env, base_url: resolvedBaseUrl }, baseData, now)
          const expandOpts = {
            minimalEndpoints: o2iConfig.minimalEndpoints,
            generateOneOfAnyOf: o2iConfig.generateOneOfAnyOf,
            hasScopes: env.hasScopes,
            applicationToken: env.applicationToken,
            numberOfScopes: env.numberOfScopes,
          }
          const { folders, tcVars } = convertFolders(doc, examples, env.microcksHeaders, env.readOnly, expandOpts)
          environment.data = { ...environment.data, ...tcVars }
          const collection = buildCollection(doc.info, environment, oauth2Folder ? [oauth2Folder, ...folders] : folders)
          const yaml = dump(collection, { indent: 2, lineWidth: -1, noRefs: true })
          const filename = `${apiName}_${env.name}.yaml`
          const outPath = join(env.targetFolder, filename)
          mkdirSync(env.targetFolder, { recursive: true })
          writeFileSync(outPath, yaml, 'utf-8')
          console.error(chalk.green(`✓ Collection written to ${outPath}`))
        }
      } else {
        // Single-file mode (no config or config without environments)
        const environments = convertEnvironments(doc)
        const expandOpts = o2iConfig ? {
          minimalEndpoints: o2iConfig.minimalEndpoints,
          generateOneOfAnyOf: o2iConfig.generateOneOfAnyOf,
          hasScopes: false,
          applicationToken: false,
          numberOfScopes: 0,
        } : DEFAULT_EXPAND_OPTIONS
        const { folders, tcVars } = convertFolders(doc, examples, false, false, expandOpts)
        environments.data = { ...environments.data, ...tcVars }
        const collection = buildCollection(doc.info, environments, oauth2Folder ? [oauth2Folder, ...folders] : folders)
        const yaml = dump(collection, { indent: 2, lineWidth: -1, noRefs: true })

        if (output) {
          writeFileSync(output, yaml, 'utf-8')
          console.error(chalk.green(`✓ Collection written to ${output}`))
        } else {
          process.stdout.write(yaml)
        }
      }

      process.exit(0)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)

      const isUserError =
        message.includes('only HTTPS URLs are supported') ||
        message.includes('ENOENT') ||
        message.includes('not a valid OpenAPI') ||
        message.includes('Swagger/OpenAPI spec')

      if (isUserError) {
        console.error(chalk.red(`Error: ${message}`))
        process.exit(1)
      }

      console.error(chalk.red(`Unexpected error: ${message}`))
      process.exit(2)
    }
  })
