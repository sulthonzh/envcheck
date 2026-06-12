# envcheck

Validate your `.env` files against a schema. Catch missing vars, wrong types, and sneaky typos before your app explodes in production.

## Why?

You've been there — deploy fails because `DATABASE_URL` is missing, or `PORT` is set to `"lol"`. `.env.example` files help but nobody reads them. `envcheck` lets you define a schema and validates against it. Zero deps.

## Install

```bash
npm install envcheck
```

## Usage

### 1. Create a schema file (`envcheck.schema.json`)

```json
{
  "DATABASE_URL": { "required": true, "type": "url" },
  "PORT": { "required": true, "type": "number", "default": 3000 },
  "NODE_ENV": { "required": true, "enum": ["development", "staging", "production"] },
  "API_KEY": { "required": true, "minLength": 32 },
  "DEBUG": { "required": false, "type": "boolean" },
  "MAX_CONNECTIONS": { "required": false, "type": "number", "min": 1, "max": 100 }
}
```

### 2. Run it

```bash
npx envcheck
```

Or validate a specific file:

```bash
npx envcheck --env .env.production --schema envcheck.schema.json
```

### 3. Programmatic API

```js
const { validate } = require('envcheck');

const result = validate({
  schema: './envcheck.schema.json',
  env: './.env'
});

if (!result.valid) {
  result.errors.forEach(e => console.error(e.message));
  process.exit(1);
}
```

## Schema Options

| Field | Type | Description |
|-------|------|-------------|
| `required` | boolean | Must be present (default: `false`) |
| `type` | string | `string`, `number`, `boolean`, `url`, `email`, `json` |
| `default` | any | Default value if not set |
| `enum` | array | Allowed values |
| `minLength` | number | Minimum string length |
| `maxLength` | number | Maximum string length |
| `min` | number | Minimum numeric value |
| `max` | number | Maximum numeric value |
| `pattern` | string | Regex pattern to match |
| `description` | string | Human-readable description (for docs/Errors) |

## CLI

```
Usage: envcheck [options]

Options:
  --env <path>       Path to .env file (default: .env)
  --schema <path>    Path to schema file (default: envcheck.schema.json)
  --strict           Fail on variables not in schema
  --json             Output as JSON
  --quiet            Only show errors
  -h, --help         Show help
  -v, --version      Show version
```

## Example Output

```
✗ 2 errors found in .env

  MISSING   DATABASE_URL    Required variable not set
  INVALID   PORT            Expected number, got "abc123"

✓ 6 variables checked
```

## License

MIT
