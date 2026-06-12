#!/usr/bin/env node
'use strict';

const path = require('path');
const { validate } = require('./index');

const args = process.argv.slice(2);

function showHelp() {
  console.log(`
Usage: envcheck [options]

Options:
  --env <path>       Path to .env file (default: .env)
  --schema <path>    Path to schema file (default: envcheck.schema.json)
  --strict           Fail on variables not in schema
  --json             Output as JSON
  --quiet            Only show errors
  -h, --help         Show help
  -v, --version      Show version
`);
}

function getArg(name) {
  const idx = args.indexOf(name);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}

function hasFlag(name) {
  return args.includes(name);
}

if (hasFlag('-h') || hasFlag('--help')) {
  showHelp();
  process.exit(0);
}

if (hasFlag('-v') || hasFlag('--version')) {
  const pkg = require('../package.json');
  console.log(pkg.version);
  process.exit(0);
}

const envPath = getArg('--env') || '.env';
const schemaPath = getArg('--schema') || 'envcheck.schema.json';
const strict = hasFlag('--strict');
const jsonOutput = hasFlag('--json');
const quiet = hasFlag('--quiet');

try {
  const result = validate({ env: envPath, schema: schemaPath, strict });

  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.valid ? 0 : 1);
  }

  if (result.valid) {
    if (!quiet) {
      console.log(`✓ All ${result.checked} variables passed`);
      if (result.warnings.length > 0) {
        console.log('');
        result.warnings.forEach(w => console.log(`  ⚠ ${w.message}`));
      }
    }
    process.exit(0);
  }

  console.log(`✗ ${result.errors.length} error${result.errors.length > 1 ? 's' : ''} found in ${envPath}\n`);
  result.errors.forEach(e => {
    const label = e.code === 'MISSING' ? 'MISSING' : 'INVALID';
    console.log(`  ${label.padEnd(9)} ${e.key.padEnd(16)} ${e.message.split(': ').slice(-1)[0]}`);
  });

  console.log(`\n✓ ${result.checked} variables checked`);
  process.exit(1);
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(2);
}
