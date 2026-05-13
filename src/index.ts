import { Command } from 'commander'
import { convertCommand } from './commands/convert.js'

declare const __VERSION__: string

const program = new Command()

program
  .name('openapi2insomnia')
  .description('Convert OpenAPI 3.0.x specs to Insomnia v5 collections')
  .version(__VERSION__)

program.addCommand(convertCommand)

program.parse()
