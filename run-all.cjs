#!/usr/bin/env node
const { execSync, spawn } = require('child_process');
const path = require('path');

function log(msg) {
  console.log(`\x1b[36m[run-all]\x1b[0m ${msg}`);
}

function run(cmd, opts = {}) {
  log(`Running: ${cmd}`);
  execSync(cmd, { stdio: 'inherit', ...opts });
}

async function main() {
  try {
    run('npm run build');
    run('npm run generate');
    run('npm run mock');

    log('Starting server in background...');
    const server = spawn('npm', ['run', 'serve'], {
      stdio: 'inherit',
      detached: true
    });
    process.on('exit', () => {
      try { process.kill(-server.pid); } catch {}
    });

    // Wait for server to be ready
    await new Promise(res => setTimeout(res, 3000));

    log('Running test-swagger.cjs...');
    run('node test-swagger.cjs');
    // Add more test scripts here if needed

    log('All tests complete. Killing server.');
    process.kill(-server.pid);
  } catch (err) {
    log('Error: ' + err.message);
    process.exit(1);
  }
}

main(); 