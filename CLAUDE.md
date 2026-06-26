# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

9Router is a **local AI routing gateway and dashboard** — a Next.js app that provides an OpenAI-compatible API endpoint (`/v1/*`) and routes traffic across 40+ AI providers with format translation, fallback chains, token refresh, and usage tracking.

## Commands

### Development (web dashboard)
```bash
npm run dev              # Next.js dev server on port 20127
npm run build            # Production build (standalone output)
npm start                # Start production server
```

### CLI package (published to npm as `9router`)
```bash
cd cli
npm run dev              # Dev with nodemon
npm run build            # Bundle with esbuild
npm run pack:cli         # Build + npm pack (produces .tgz in repo root)
npm run publish:cli      # Build + npm publish
```

### Tests
```bash
cd tests
npm test                 # Run all Vitest tests (NODE_PATH auto-set)
npm run test:watch       # Watch mode
```

### Docker
```bash
docker build -t 9router .                          # Multi-stage build
docker compose up                                   # docker-compose.yml
bash start.sh                                       # Build + run container from source
```

### Scripts (miscellaneous)
```bash
node scripts/translate-readme.js                   # Sync translated READMEs
node scripts/migrate-registry.mjs                  # Migrate provider registry
node scripts/test-combo-autoswitch.mjs             # Test combo auto-switch logic
node scripts/injectDisplayToRegistry.mjs           # Inject display names to registry
```

## Path Aliases (jsconfig.json)
- `@/*` → `./src/*`
- `open-sse/*` → `./open-sse/*`

## Architecture (Two-Layer Structure)

### Layer 1: Next.js App Routes (`src/app/`)
- **`src/app/api/v1/*`** — OpenAI-compatible API endpoints (chat, messages, models, embeddings, images, audio, responses, search, web/fetch). These are exposed at `/v1/*` via Next.js rewrites.
- **`src/app/api/*`** — Management/configuration APIs (providers, oauth, keys, combos, pricing, usage, settings, sync, cli-tools, tunnel, mcp, health, version, proxy-pools, headroom, tags, translator, locale, init, shutdown).
- **`src/app/(dashboard)/dashboard/*`** — Dashboard UI pages (providers, endpoint, usage, token-saver, translator, combos, cli-tools, proxy-pools, media-providers, mitm, quota, skills, basic-chat, console-log, profile).
- **`src/proxy.js`** — Dashboard middleware guard (matcher applies to all routes except static assets).

### Layer 2: SSE + Translation Core (`open-sse/`)
- **`open-sse/handlers/chatCore.js`** — Core chat orchestration: translation, executor dispatch, retry/refresh, stream setup.
- **`open-sse/executors/*`** — Provider-specific executors (default, antigravity, gemini-cli, github, kiro, codex, cursor, vertex, qwen, ollama-local, iflow, azure, etc.).
- **`open-sse/translator/`** — Format translation (request/response) between OpenAI, Claude, Gemini, and other formats.
- **`open-sse/providers/`** — Provider registry, model lists, pricing, capabilities.
- **`open-sse/rtk/`** — RTK Token Saver (compresses tool_result tokens to save 20-40%).
- **`open-sse/services/accountFallback.js`** — Account-level fallback logic on errors/rate-limits.
- **`open-sse/services/tokenRefresh/`** — Token refresh for OAuth providers.
- **`open-sse/services/usage/`** — Usage extraction and normalization from upstream responses.

### Entry Points (src/sse/)
- **`src/sse/handlers/chat.js`** — Request parse, combo handling, account selection loop. Invokes `open-sse/handlers/chatCore.js`.
- **`src/sse/handlers/embeddings.js`**, **`imageGeneration.js`**, **`search.js`**, **`stt.js`**, **`tts.js`**, **`fetch.js`** — Other request type handlers.

### Request Flow (`POST /v1/chat/completions`)
1. Next.js rewrites `/v1/*` → `/api/v1/*`
2. `src/app/api/v1/chat/completions/route.js` → `src/sse/handlers/chat.js`
3. Model/combo resolution, credential selection, format detection
4. `open-sse/handlers/chatCore.js` — translate request → execute → handle retry/refresh → translate response → stream to client
5. Usage recorded to `src/lib/usageDb.js`

## Database Layer (`src/lib/db/`)

SQLite with multiple adapter backends:
- **`adapters/betterSqliteAdapter.js`** — best performance (optional, native)
- **`adapters/nodeSqliteAdapter.js`** — Node 22+ built-in
- **`adapters/bunSqliteAdapter.js`** — Bun native
- **`adapters/sqljsAdapter.js`** — fallback (pure JS, no native deps)

Repository pattern in `repos/` — one per entity (connections, nodes, aliases, combos, apiKeys, settings, pricing, proxyPools, usage, disabledModels, requestDetails).

Database file: `${DATA_DIR}/db/data.sqlite` (default `~/.9router/db/data.sqlite`).

## CLI Package (`cli/`)

Published as `9router` on npm. Entry: `cli/cli.js`. Bundled with esbuild. Features:
- Starts the Next.js standalone server (`./.next/standalone/server.js`)
- System tray icon (macOS/Linux via systray2, Windows via PowerShell)
- Certificate generation for MITM proxy
- Auto-update checks
- Post-install hook sets up runtime dependencies under `~/.9router/runtime/`

## Key Design Patterns

- **Format detection + translation**: Source format is auto-detected from request shape (openai, claude, gemini, openai-responses). Translators convert request/response between formats transparently.
- **Fallback chain**: Combo models → account round-robin → next combo model → error. `accountFallback.js` drives cooldowns on per-account errors.
- **Stream safety**: Disconnect-aware stream controller, end-of-stream flush with `[DONE]` handling, usage estimation when provider metadata is missing.
- **SSRF protection**: `src/shared/utils/ssrfGuard.js` validates outbound URLs.

## Environment Variables

See `.env.example` for full reference. Key variables:
- `JWT_SECRET`, `INITIAL_PASSWORD` — auth
- `DATA_DIR` — storage path (default `~/.9router`)
- `PORT` (default 20128), `HOSTNAME` (default 0.0.0.0)
- `BASE_URL`, `NEXT_PUBLIC_BASE_URL` — instance URL
- `CLOUD_URL`, `NEXT_PUBLIC_CLOUD_URL` — sync cloud URL
- `API_KEY_SECRET`, `MACHINE_ID_SALT` — security
- `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY` — outbound proxy
- `ENABLE_REQUEST_LOGS` — debug logging toggle
- `NEXT_TRACING_ROOT_MODE=workspace` — for CLI bundling

## Important Notes

- `NODE_PATH=/tmp/node_modules` is required for running Vitest (npm workspace hoisting from the root Next.js project).
- `usageDb.js` stores under `~/.9router` and does **not** follow `DATA_DIR` — this is a known architectural debt.
- `better-sqlite3` is in `optionalDependencies` — if native build fails, `sql.js` is used as fallback.
- The dashboard login defaults to password `123456` — override via `INITIAL_PASSWORD` in production.
- Provider secrets (API keys, OAuth tokens) are persisted in `providerConnections` in SQLite — protect at filesystem level.
