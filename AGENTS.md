# AI deployment instructions

This repository is a sanitized, reusable ChatGPT Sites template for the CTMOAI image workbench.

## Required deployment behavior

- Treat this as a new Site. Never copy or invent another account's `project_id`; register a new private Site and let Sites write its ID into `.openai/hosting.json`.
- Preserve the Worker architecture, D1 binding `DB`, R2 binding `BUCKET`, Drizzle migrations, UI, package manager, and lockfile.
- Install dependencies with the current Sites workflow, run `npm run build`, `npm run validate`, and the simulated test suite before publishing.
- Apply all migrations in `drizzle/` through the Sites deployment flow. Never edit already-published migration files.
- Publish privately unless the owner explicitly requests another audience.
- Do not perform live image-generation calls or Google Drive uploads during validation. Tests use simulated providers and must not consume paid quota.

## Secrets and account boundaries

- Never commit API keys, OAuth tokens, Google Client Secrets, Sites credentials, user data, generated images, task records, or local `.env` files.
- The workbench intentionally asks each user for their own CTMOAI API Key at runtime. Do not convert it to a server-side secret or persist it.
- Google Drive is optional. Only a public Web OAuth Client ID is entered in the UI; each deployment must use its own Google Cloud project and authorize the newly deployed Site origin. Never request a Client Secret.
- D1/R2 runtime data from another Site is not part of this repository and must not be copied.

## Provider configuration

The current relay endpoint and supported model IDs are intentionally present as non-secret application configuration. If the deployer uses another compatible relay, update all matching constants, UI copy, tests, and `provider-config.json` together, then rerun the full simulated suite.

## Repository hygiene

- `dist/`, `site.tar.gz`, `node_modules/`, `.env*` (except `.env.example`), and `.sites-runtime/` are ignored and must remain untracked.
- The removed `plugins/ctmoai-image` directory was a stale MCP artifact. This application deliberately returns 404 for `/mcp`; do not restore that plugin unless MCP support is implemented and tested separately.
