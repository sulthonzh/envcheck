'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Parse a .env file into key-value pairs.
 * Handles comments, quoted values, multiline, and exports.
 */
function parseEnvFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const result = {};
  const lines = content.split('\n');
  let i = 0;

  while (i < lines.length) {
    let line = lines[i];

    // Strip inline comments (but not inside quotes)
    const stripped = stripInlineComment(line);
    const trimmed = stripped.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      i++;
      continue;
    }

    // Remove leading 'export '
    const noExport = trimmed.replace(/^export\s+/, '');

    // Match KEY=VALUE
    const match = noExport.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      i++;
      continue;
    }

    let key = match[1];
    let value = match[2];

    // Handle multiline values (start with quote, no closing quote on same line)
    if ((value.startsWith('"') && !value.endsWith('"')) ||
        (value.startsWith("'") && !value.endsWith("'"))) {
      const quote = value[0];
      let multiline = value;
      i++;
      while (i < lines.length) {
        multiline += '\n' + lines[i];
        if (lines[i].trim().endsWith(quote)) break;
        i++;
      }
      value = multiline;
    }

    result[key] = unquote(value.trim());
    i++;
  }

  return result;
}

function stripInlineComment(line) {
  // Simple: only strip # that's not inside quotes
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === '#' && !inSingle && !inDouble) {
      return line.substring(0, i);
    }
  }
  return line;
}

function unquote(value) {
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * Load and parse a JSON schema file.
 */
function loadSchema(schemaPath) {
  const resolved = path.resolve(schemaPath);
  const content = fs.readFileSync(resolved, 'utf-8');
  return JSON.parse(content);
}

/**
 * Validate a single value against its schema definition.
 */
function validateValue(key, value, schema) {
  const errors = [];
  const def = schema[key];
  if (!def) return errors;

  // Type checking
  if (def.type) {
    const typeCheck = checkType(value, def.type);
    if (!typeCheck.valid) {
      errors.push({
        key,
        value,
        code: 'INVALID_TYPE',
        message: `${key}: Expected ${def.type}, got "${value}"`
      });
      return errors; // skip further checks if type is wrong
    }
    // For number types, validate min/max
    if (def.type === 'number') {
      const num = Number(value);
      if (def.min !== undefined && num < def.min) {
        errors.push({
          key, value,
          code: 'MIN_VIOLATION',
          message: `${key}: Value ${num} is below minimum ${def.min}`
        });
      }
      if (def.max !== undefined && num > def.max) {
        errors.push({
          key, value,
          code: 'MAX_VIOLATION',
          message: `${key}: Value ${num} exceeds maximum ${def.max}`
        });
      }
    }
  }

  // Enum check
  if (def.enum && !def.enum.includes(value)) {
    errors.push({
      key, value,
      code: 'INVALID_ENUM',
      message: `${key}: Must be one of [${def.enum.join(', ')}], got "${value}"`
    });
  }

  // String length checks
  if (def.minLength !== undefined && value.length < def.minLength) {
    errors.push({
      key, value,
      code: 'MIN_LENGTH',
      message: `${key}: Must be at least ${def.minLength} characters, got ${value.length}`
    });
  }
  if (def.maxLength !== undefined && value.length > def.maxLength) {
    errors.push({
      key, value,
      code: 'MAX_LENGTH',
      message: `${key}: Must be at most ${def.maxLength} characters, got ${value.length}`
    });
  }

  // Pattern check
  if (def.pattern) {
    const re = new RegExp(def.pattern);
    if (!re.test(value)) {
      errors.push({
        key, value,
        code: 'PATTERN_MISMATCH',
        message: `${key}: Does not match pattern /${def.pattern}/`
      });
    }
  }

  return errors;
}

function checkType(value, type) {
  switch (type) {
    case 'string':
      return { valid: true };
    case 'number':
      return { valid: !isNaN(Number(value)) && value.trim() !== '' };
    case 'boolean':
      return { valid: ['true', 'false', '1', '0', 'yes', 'no'].includes(value.toLowerCase()) };
    case 'url':
      try {
        new URL(value);
        return { valid: true };
      } catch {
        return { valid: false };
      }
    case 'email':
      return { valid: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) };
    case 'json':
      try {
        JSON.parse(value);
        return { valid: true };
      } catch {
        return { valid: false };
      }
    default:
      return { valid: true };
  }
}

/**
 * Main validate function.
 * @param {Object} options
 * @param {string} options.schema - Path to schema JSON
 * @param {string} options.env - Path to .env file
 * @param {boolean} options.strict - Fail on unknown vars
 * @param {Object} options.envOverride - Override env vars (for testing)
 * @returns {{ valid: boolean, errors: Array, warnings: Array, checked: number }}
 */
function validate(options) {
  const schema = loadSchema(options.schema);
  const envVars = options.envOverride || parseEnvFile(options.env);
  const errors = [];
  const warnings = [];
  let checked = 0;

  // Check required vars and validate present ones
  for (const [key, def] of Object.entries(schema)) {
    checked++;
    const value = envVars[key];

    if (value === undefined || value === '') {
      if (def.required) {
        errors.push({
          key,
          value: undefined,
          code: 'MISSING',
          message: `${key}: Required variable not set` + (def.description ? ` — ${def.description}` : '')
        });
      }
      continue;
    }

    const varErrors = validateValue(key, value, schema);
    errors.push(...varErrors);
  }

  // Strict mode: check for unknown vars
  if (options.strict) {
    for (const key of Object.keys(envVars)) {
      if (!schema[key]) {
        warnings.push({
          key,
          code: 'UNKNOWN_VAR',
          message: `${key}: Not defined in schema`
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    checked
  };
}

/**
 * Generate a starter schema from an existing .env file.
 */
function generateSchema(envPath) {
  const envVars = parseEnvFile(envPath);
  const schema = {};

  for (const [key, value] of Object.entries(envVars)) {
    const def = { required: false };

    // Infer type
    if (!isNaN(Number(value)) && value.trim() !== '') {
      def.type = 'number';
    } else if (['true', 'false', 'yes', 'no', '1', '0'].includes(value.toLowerCase())) {
      def.type = 'boolean';
    } else {
      try {
        new URL(value);
        def.type = 'url';
      } catch {
        // keep as string
      }
    }

    schema[key] = def;
  }

  return schema;
}

module.exports = { validate, parseEnvFile, loadSchema, generateSchema, validateValue, checkType };
