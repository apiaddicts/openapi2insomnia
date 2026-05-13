# 🛠️ Openapi2Insomnia ![Release](https://img.shields.io/badge/release-1.0.x-purple) ![OpenApi](https://img.shields.io/badge/-openapi-%23Clojure?style=flat&logo=openapiinitiative&logoColor=white) ![Insomnia](https://img.shields.io/badge/Insomnia-4000BF?style=flat&logo=insomnia&logoColor=white) [![NPM](https://img.shields.io/badge/npm-%23CB3837.svg?style=flat&logo=npm&logoColor=white)](https://www.npmjs.com/package/@apiaddicts/openapi2insomnia)

Converts an OpenAPI 3.0.x specification into an Insomnia v5 collection ready to import and run tests.

Generates one test case (TC) per operation response code — base success TC, per-parameter variants, and error TCs (400, 401, 403, 404) — each with an `afterResponse` validation script that checks the status code and validates the response body against the schema.

---

## Requirements

- Node.js >= 20
- pnpm >= 9 (development only)

## Installation

```bash
npm install -g openapi2insomnia
```

### Development setup

```bash
git clone https://github.com/apiaddicts/openapi2insomnia
cd openapi2insomnia
pnpm install
pnpm build
```

---

## Usage

### Installed from npm

```bash
o2i convert -i <path|url> [options]
```

### Local development

```bash
node dist/index.js convert -i <path|url> [options]
```

### Flags

| Flag | Required | Description |
|------|----------|-------------|
| `-i, --input <path\|url>` | yes | Path to a local file or an HTTPS URL |
| `-o, --output <path>` | no | Output file path. If omitted, writes to stdout |
| `-c, --config <path>` | no | Path to an `o2i.config.json` file |

### Examples

```bash
# Output to stdout
o2i convert -i openapi.yaml

# Output to a file
o2i convert -i openapi.yaml -o collection.yaml

# With config (generates one file per environment)
o2i convert -i openapi.yaml -c o2i.config.json

# From a remote URL
o2i convert -i https://api.example.com/openapi.yaml -o collection.yaml
```

---

## Config file

Without a config file the tool generates a single collection using the spec's server URL as `base_url`.

With a config file you can generate one collection per environment, each with its own URL, OAuth2 credentials, and generation options.

```json
{
  "minimal_endpoints": false,
  "generate_oneOf_anyOf": false,
  "examples": {
    "correct": {
      "string": "goodstring",
      "integer": 1,
      "number": 1.0,
      "boolean": true,
      "date": "2020-01-01",
      "date-time": "2020-01-01T23:59:59"
    },
    "wrong": {
      "string": "badstring",
      "integer": "badstring",
      "number": "badstring",
      "boolean": "badboolean",
      "date": "2020-40-40",
      "date-time": "2020-40-40T00:00:00"
    }
  },
  "environments": [
    {
      "name": "DEV",
      "base_url": "https://dev.api.example.com/v1",
      "host_server_pattern": "%dev%",
      "token_url": "https://dev.keycloak.example.com/token",
      "authorization_url": "https://dev.keycloak.example.com/auth",
      "client_id": "my-client-dev",
      "client_secret": "",
      "target_folder": "out",
      "microcks_headers": true,
      "read_only": false,
      "has_scopes": true,
      "application_token": true,
      "number_of_scopes": 2
    }
  ]
}
```

### Global options

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `minimal_endpoints` | boolean | `false` | Generate only the base success TC per operation, skipping optional-parameter and wrong-body variants. Error TCs (401, 403, 404) and one 400 are still generated. |
| `generate_oneOf_anyOf` | boolean | `false` | When a request body uses `oneOf`/`anyOf`, generate a TC set per schema variant instead of using only the first. |
| `examples.correct` | object | — | Values used as valid inputs in success TCs and environment variables. |
| `examples.wrong` | object | — | Values used in 400 TCs to intentionally violate schema constraints. |

### Environment options

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | string | — | Environment name in Insomnia and output filename suffix. |
| `base_url` | string | `''` | Base URL of the API. Overridden if `host_server_pattern` finds a match. |
| `host_server_pattern` | string | — | SQL-LIKE pattern (`%` = wildcard) matched against the spec's `servers[]` list to pick the right URL automatically. Case-insensitive. |
| `token_url` | string | from spec | OAuth2 token endpoint. Overrides the value from the spec. |
| `authorization_url` | string | from spec | OAuth2 authorization endpoint. |
| `client_id` | string | `''` | OAuth2 client ID. |
| `client_secret` | string | `''` | OAuth2 client secret. |
| `target_folder` | string | `'.'` | Directory where the output YAML is written. Created if it does not exist. |
| `microcks_headers` | boolean | `false` | Add `X-Microcks-Response-Name` header to every request, using the example name defined in the spec response. |
| `read_only` | boolean | `false` | Generate TCs only for GET operations. |
| `has_scopes` | boolean | `false` | Duplicate each 2xx TC for every configured token type (user scopes, application token). |
| `application_token` | boolean | `false` | Include an `application_token` variant in scope clones. Requires `has_scopes: true`. |
| `number_of_scopes` | integer | `0` | Number of user token scopes to generate (`user_token_scope_1` … `user_token_scope_N`). |

---

## Development

```bash
pnpm build        # compile TypeScript → dist/
pnpm dev          # compile in watch mode
pnpm test         # run unit tests
pnpm typecheck    # type-check without emitting
```

---

## License

[GNU Lesser General Public License v3.0](LICENSE)
