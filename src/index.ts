#!/usr/bin/env node
import { Command } from 'commander';
import * as path from 'path';
import { Generator } from './generator';
import { MockGenerator } from './mock';
import { Server } from './server';

const program = new Command();

program
  .name('fake-api')
  .description('Generate and run mock APIs from OpenAPI/Swagger specifications')
  .version('1.0.0');

program
  .command('generate')
  .description('Generate Express routes and controllers from Swagger specs')
  .option('-s, --spec-dir <dir>', 'Directory containing Swagger specs', 'swagger')
  .option('-o, --out-dir <dir>', 'Output directory for generated files', 'generated')
  .action(async (options) => {
    const generator = new Generator(
      path.resolve(process.cwd(), options.specDir),
      path.resolve(process.cwd(), options.outDir)
    );
    await generator.generate();
    console.log('✨ Generated API routes and controllers');
  });

program
  .command('mock')
  .description('Generate mock data from Swagger specs')
  .option('-s, --spec-dir <dir>', 'Directory containing Swagger specs', 'swagger')
  .option('-o, --out-dir <dir>', 'Output directory for generated files', 'generated')
  .action(async (options) => {
    const mockGenerator = new MockGenerator(
      path.resolve(process.cwd(), options.specDir),
      path.resolve(process.cwd(), options.outDir)
    );
    await mockGenerator.generate();
    console.log('✨ Generated mock data');
  });

program
  .command('serve')
  .description('Start the mock API server')
  .option('-s, --spec-dir <dir>', 'Directory containing Swagger specs', 'swagger')
  .option('-o, --out-dir <dir>', 'Directory containing generated files', 'generated')
  .option('-p, --port <number>', 'Port to run the server on', '3000')
  .action(async (options) => {
    const server = new Server(
      path.resolve(process.cwd(), options.specDir),
      path.resolve(process.cwd(), options.outDir),
      parseInt(options.port, 10)
    );
    await server.start();
  });

program.parse(); 