import { Command } from 'commander'
import { convertCommand } from './commands/convert.js'

const program = new Command()

program
  .name('openapi2insomnia')
  .description('Convert OpenAPI 3.0.x specs to Insomnia v5 collections')
  .version('0.1.0')

program.addCommand(convertCommand)

program.parse()
