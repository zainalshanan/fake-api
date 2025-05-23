const { execSync } = require('child_process');

function runStep(cmd, desc) {
  console.log(`\n=== ${desc} ===`);
  try {
    execSync(cmd, { stdio: 'inherit' });
  } catch (e) {
    console.error(`Step failed: ${desc}`);
    process.exit(1);
  }
}

runStep('npm run generate', 'Generating routes and controllers');
runStep('npm run mock', 'Generating mock data');
runStep('npx tsc', 'Transpiling TypeScript');

console.log('\n=== Restart your server manually if needed, then press Enter to continue ===');
process.stdin.once('data', () => {
  runStep('node test-swagger.cjs', 'Running test-swagger.cjs');
}); 