'use strict';

const fs = require('fs');
const path = require('path');
const { validate, parseEnvFile, generateSchema, checkType, validateValue } = require('../src/index');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.log(`  ✗ ${msg}`);
  }
}

function section(name) {
  console.log(`\n${name}`);
}

// Setup temp files
const tmpDir = path.join(__dirname, 'fixtures');
fs.mkdirSync(tmpDir, { recursive: true });

// --- parseEnvFile ---
section('parseEnvFile');

const envContent = `
# This is a comment
DATABASE_URL=postgres://localhost:5432/mydb
PORT=3000
EMPTY_VAR=
QUOTED_VAR="hello world"
SINGLE_QUOTED='no expand'
export EXPORTED=yes
KEY_WITH_EQUALS=base64==value
# another comment
BOOL_TRUE=true
`;
const envPath = path.join(tmpDir, 'test.env');
fs.writeFileSync(envPath, envContent);

const parsed = parseEnvFile(envPath);
assert(parsed['DATABASE_URL'] === 'postgres://localhost:5432/mydb', 'parses simple values');
assert(parsed['PORT'] === '3000', 'parses numbers as strings');
assert(parsed['EMPTY_VAR'] === '', 'parses empty values');
assert(parsed['QUOTED_VAR'] === 'hello world', 'strips double quotes');
assert(parsed['SINGLE_QUOTED'] === 'no expand', 'strips single quotes');
assert(parsed['EXPORTED'] === 'yes', 'handles export prefix');
assert(parsed['KEY_WITH_EQUALS'] === 'base64==value', 'handles values with equals');
assert(parsed['BOOL_TRUE'] === 'true', 'parses boolean strings');
assert(Object.keys(parsed).length === 8, 'correct count of parsed vars');

// --- checkType ---
section('checkType');

assert(checkType('3000', 'number').valid === true, 'number: valid');
assert(checkType('abc', 'number').valid === false, 'number: invalid');
assert(checkType('true', 'boolean').valid === true, 'boolean: true');
assert(checkType('false', 'boolean').valid === true, 'boolean: false');
assert(checkType('yes', 'boolean').valid === true, 'boolean: yes');
assert(checkType('no', 'boolean').valid === true, 'boolean: no');
assert(checkType('maybe', 'boolean').valid === false, 'boolean: invalid');
assert(checkType('https://example.com', 'url').valid === true, 'url: valid');
assert(checkType('not a url', 'url').valid === false, 'url: invalid');
assert(checkType('user@example.com', 'email').valid === true, 'email: valid');
assert(checkType('no-at-sign', 'email').valid === false, 'email: invalid');
assert(checkType('{"a":1}', 'json').valid === true, 'json: valid');
assert(checkType('{invalid', 'json').valid === false, 'json: invalid');
assert(checkType('anything', 'string').valid === true, 'string: always valid');

// --- validate ---
section('validate — basic');

const schema = {
  DATABASE_URL: { required: true, type: 'url' },
  PORT: { required: true, type: 'number' },
  NODE_ENV: { required: true, enum: ['development', 'staging', 'production'] },
  API_KEY: { required: true, minLength: 32 },
  DEBUG: { required: false, type: 'boolean' },
  MAX_CONN: { required: false, type: 'number', min: 1, max: 100 },
  REGEX_VAR: { required: false, pattern: '^v\\d+\\.\\d+\\.\\d+$' }
};
const schemaPath = path.join(tmpDir, 'schema.json');
fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2));

// Test valid env
const validEnv = {
  DATABASE_URL: 'postgres://localhost:5432/db',
  PORT: '3000',
  NODE_ENV: 'production',
  API_KEY: 'abcdefghijklmnopqrstuvwxyz123456',
  DEBUG: 'true',
  MAX_CONN: '50',
  REGEX_VAR: 'v1.0.0'
};
const r1 = validate({ env: envPath, schema: schemaPath, envOverride: validEnv });
assert(r1.valid === true, 'all valid passes');
assert(r1.errors.length === 0, 'no errors');
assert(r1.checked === 7, 'checked all 7 vars');

// Test missing required
const missingEnv = { PORT: '3000' };
const r2 = validate({ env: envPath, schema: schemaPath, envOverride: missingEnv });
assert(r2.valid === false, 'missing required fails');
assert(r2.errors.length === 3, '3 missing required vars');

// Test wrong type
const wrongTypeEnv = {
  DATABASE_URL: 'not-a-url',
  PORT: 'abc',
  NODE_ENV: 'production',
  API_KEY: 'abcdefghijklmnopqrstuvwxyz123456',
  MAX_CONN: '999'
};
const r3 = validate({ env: envPath, schema: schemaPath, envOverride: wrongTypeEnv });
assert(r3.valid === false, 'wrong types fail');
assert(r3.errors.some(e => e.key === 'PORT' && e.code === 'INVALID_TYPE'), 'PORT invalid type');
assert(r3.errors.some(e => e.key === 'MAX_CONN' && e.code === 'MAX_VIOLATION'), 'MAX_CONN exceeds max');

// Test minLength
const shortKeyEnv = {
  DATABASE_URL: 'https://example.com',
  PORT: '3000',
  NODE_ENV: 'development',
  API_KEY: 'short'
};
const r4 = validate({ env: envPath, schema: schemaPath, envOverride: shortKeyEnv });
assert(r4.valid === false, 'short key fails');
assert(r4.errors.some(e => e.key === 'API_KEY' && e.code === 'MIN_LENGTH'), 'API_KEY minLength');

// Test enum
const badEnumEnv = {
  DATABASE_URL: 'https://example.com',
  PORT: '3000',
  NODE_ENV: 'testing',
  API_KEY: 'abcdefghijklmnopqrstuvwxyz123456'
};
const r5 = validate({ env: envPath, schema: schemaPath, envOverride: badEnumEnv });
assert(r5.valid === false, 'bad enum fails');
assert(r5.errors.some(e => e.key === 'NODE_ENV' && e.code === 'INVALID_ENUM'), 'NODE_ENV invalid enum');

// Test pattern
const badPatternEnv = {
  DATABASE_URL: 'https://example.com',
  PORT: '3000',
  NODE_ENV: 'development',
  API_KEY: 'abcdefghijklmnopqrstuvwxyz123456',
  REGEX_VAR: 'not-a-version'
};
const r6 = validate({ env: envPath, schema: schemaPath, envOverride: badPatternEnv });
assert(r6.valid === false, 'bad pattern fails');
assert(r6.errors.some(e => e.key === 'REGEX_VAR' && e.code === 'PATTERN_MISMATCH'), 'REGEX_VAR pattern mismatch');

// --- strict mode ---
section('validate — strict mode');

const strictEnv = {
  DATABASE_URL: 'postgres://localhost/db',
  PORT: '3000',
  NODE_ENV: 'development',
  API_KEY: 'abcdefghijklmnopqrstuvwxyz123456',
  UNKNOWN_VAR: 'surprise'
};
const r7 = validate({ env: envPath, schema: schemaPath, envOverride: strictEnv, strict: true });
assert(r7.valid === true, 'strict: still valid (unknown is warning)');
assert(r7.warnings.length === 1, 'strict: 1 warning for unknown var');
assert(r7.warnings[0].code === 'UNKNOWN_VAR', 'strict: UNKNOWN_VAR warning');

// --- generateSchema ---
section('generateSchema');

const genEnv = {
  PORT: '3000',
  DEBUG: 'true',
  URL: 'https://example.com',
  NAME: 'myapp'
};
// Write gen.env first, then test inference
// Test inference directly

fs.writeFileSync(path.join(tmpDir, 'gen.env'), 'PORT=3000\nDEBUG=true\nURL=https://example.com\nNAME=myapp\n');
const schema2 = generateSchema(path.join(tmpDir, 'gen.env'));
assert(schema2.PORT.type === 'number', 'inferred number type');
assert(schema2.DEBUG.type === 'boolean', 'inferred boolean type');
assert(schema2.URL.type === 'url', 'inferred url type');
assert(schema2.NAME.required === false, 'defaults to not required');

// --- validateValue ---
section('validateValue');

const v1 = validateValue('TEST', '5', { TEST: { type: 'number', min: 1, max: 10 } });
assert(v1.length === 0, 'validateValue: number in range');

const v2 = validateValue('TEST', '15', { TEST: { type: 'number', min: 1, max: 10 } });
assert(v2.length === 1 && v2[0].code === 'MAX_VIOLATION', 'validateValue: exceeds max');

const v3 = validateValue('TEST', 'hello', { TEST: { maxLength: 3 } });
assert(v3.length === 1 && v3[0].code === 'MAX_LENGTH', 'validateValue: maxLength');

// --- Cleanup ---
fs.rmSync(tmpDir, { recursive: true });

// --- Results ---
console.log(`\n${'='.repeat(40)}`);
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
