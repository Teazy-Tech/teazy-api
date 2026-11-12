# teazy-api

Backend for **Teazy AI** (ai.teazytech.online): the REST API under `/api/v1` and the background job worker. It replaces the 17 Supabase edge functions and the browser's direct table access in the Lovable-built `teazy-legacy` app.

The frontend is [`teazy-web`](https://github.com/Teazy-Tech/teazy-web). The two repositories share one contract, `openapi/openapi.json`, generated from this repo's Zod schemas.

This README is the single source of project documentation: setup, rules, architecture, decisions and tasks. Source: the Teazy AI repository restructuring plan and intern task assignments (11 Nov 2026), and the target architecture and design document (24 Oct 2026). When this file and those documents disagree, change this file in a PR and add an entry under [Decisions](#8-decisions).

**Contents:** [1. Getting started](#1-getting-started) · [2. Rules](#2-rules-read-before-your-first-task) · [3. Architecture](#3-architecture) · [4. Request pipeline](#4-request-pipeline) · [5. API conventions](#5-api-conventions) · [6. Modules and folders](#6-modules-and-folders) · [7. Workflow](#7-workflow) · [8. Decisions](#8-decisions) · [9. Tasks](#9-tasks)

|                       |                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------- |
| Runtime               | Node.js 22, TypeScript strict, ESM                                                           |
| HTTP                  | Express 5, layered modules (`routes → controller → service → repository`) enforced by ESLint |
| Validation + contract | Zod 4 → OpenAPI 3.1 (`@asteasolutions/zod-to-openapi`), Swagger UI, Prism mock               |
| Database              | Postgres on Supabase, Drizzle ORM + drizzle-kit migrations                                   |
| Jobs                  | pg-boss on the same Postgres; the worker is the same image with a different command          |
| Auth                  | Supabase Auth JWTs verified with `jose` (JWKS)                                               |
| AI                    | Teazy-owned AI gateway in `src/ai` (Gemini first; OpenAI and Claude as fallbacks)            |
| Payments              | Paystack and Flutterwave behind one `PaymentGateway` interface                               |
| Observability         | pino JSON logs, Sentry, `ai_calls` cost metering                                             |
| Tests                 | Vitest + Supertest (unit), Testcontainers Postgres (integration)                             |

---

## 1. Getting started

Requirements: Node 22+ (`.nvmrc`), pnpm 10 (`npm i -g pnpm` or `corepack enable`), and Docker for the local database and integration tests.

```sh
pnpm install
cp .env.example .env            # fill in from the team password manager
docker compose up -d db         # local Postgres 17 on :5432
pnpm dev                        # http://localhost:4000/healthz
```

| Command                                                     | What it does                                                          |
| ----------------------------------------------------------- | --------------------------------------------------------------------- |
| `pnpm dev`                                                  | API with reload (`tsx watch`, loads `.env`)                           |
| `pnpm dev:worker`                                           | Job worker with reload (from API-12)                                  |
| `pnpm build` / `pnpm start`                                 | Compile to `dist/` / run the compiled API                             |
| `pnpm lint`                                                 | ESLint, including the **layer rules**                                 |
| `pnpm typecheck`                                            | `tsc` over src, tests and configs                                     |
| `pnpm test`                                                 | Unit tests. One file: `pnpm vitest run path/to/x.test.ts`             |
| `pnpm test:integration`                                     | Integration tests against Postgres in Docker                          |
| `pnpm openapi`                                              | Regenerates `openapi/openapi.json` from the Zod schemas (from API-05) |
| `pnpm mock`                                                 | Prism mock server on :4010 from `openapi.json` (from API-05)          |
| `pnpm db:generate` / `db:migrate` / `db:pull` / `db:studio` | drizzle-kit                                                           |
| `pnpm format`                                               | Prettier                                                              |
| `pnpm check`                                                | lint + typecheck + test + build, the same as CI                       |

| Problem                              | Fix                                                             |
| ------------------------------------ | --------------------------------------------------------------- |
| `pnpm: command not found`            | `npm i -g pnpm` (or `corepack enable`)                          |
| `docker: command not found`          | Install Docker Desktop (Windows/macOS) or Docker Engine (Linux) |
| `pnpm mock` fails: no `openapi.json` | The OpenAPI pipeline arrives in API-05                          |
| `.env not found` on `pnpm dev`       | `cp .env.example .env`                                          |

---

## 2. Rules (read before your first task)

These apply to people and to coding assistants alike.

### Product rules that never change

- Generated content follows **NERDC (Nigeria), NaCCA (Ghana) and CBC (Kenya)**. Money is `Money { minor: bigint; currency: "NGN" | "GHS" | "KES" }`, never a float.
- **No mark reaches a student without a teacher review.** Every mark change records who, when, old value, new value and reason (`assessment_reviews`).
- **Payments are fulfilled exactly once:** one idempotent `fulfil(payment)` in `billing`, keyed on the payment reference, writing an outbox event in the same transaction.
- A failed or unreadable upload can **never** become "ready to mark" (`UNREADABLE_UPLOAD`).
- A failed generation never uses up the teacher's quota (reserve, then commit or release).
- Never use real student data in development, staging, tests, eval sets or logs.

### Architecture rules

1. **One folder per feature** in `src/modules/<name>/` (template in [§6](#6-modules-and-folders)). Copy the reference module (`me` + `curriculum`, API-06) once it exists.
2. **Requests flow one way:** `routes → controller → service → repository → db`.

   | Layer      | May                                                                                                               | Must not                                     |
   | ---------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
   | routes     | Declare path, method and middleware chain                                                                         | Contain logic                                |
   | controller | Read validated input, call **one** service method, map `Result` to HTTP                                           | Query the DB, call AI, hold business rules   |
   | service    | Business rules, orchestration, state transitions; call `ai/`, `integrations/`, `jobs/`, other modules' `index.ts` | Import Express, touch `req`/`res`, write SQL |
   | repository | Drizzle queries. **Every query on user data filters by `userId`**                                                 | Hold business rules                          |
   | core       | Pure helpers (errors, Result, Money, logger, http)                                                                | Import anything else in `src`                |

3. **Enforced by ESLint** in `eslint.config.js`: `boundaries/dependencies` (folders are elements, module files are classified by suffix, `checkInternals: true` so wrong-direction imports inside one module fail too), `no-restricted-imports` (no Express in services, repositories or core) and `no-console`. Another module is imported **only through its `index.ts`**. A lint failure means the import is wrong; don't disable the rule.
4. **Authorisation lives in code.** The API connects with a role that bypasses row-level security. The user id comes **only from the verified JWT** (`req.user`), never from the body or query. Existing RLS policies stay as a second line of defence.
5. **Every endpoint** has a Zod schema in `<module>.schemas.ts`, an OpenAPI registration, and at least one test.
6. **AI calls go only through `src/ai/gateway.ts`.** No provider SDK is imported outside `src/ai/providers/`. Prompts are versioned files; changing one requires the eval run to pass.
7. **Outside services** (payments, storage, email) sit behind interfaces in `src/integrations/`.
8. **Configuration** is read only from `src/config/env.ts`, validated with Zod at startup. Never read `process.env` elsewhere.
9. Log with pino, with `requestId` and `userId`. Never log tokens, keys, raw scripts or student names.

### Working rules

- **Work only inside your task's module or folder.** Shared files (`src/app.ts`, `src/modules/index.ts`, `src/core/`, `src/middleware/`, `eslint.config.js`, `package.json`) change only in a PR whose purpose is that change. Registering a module is one line in `src/modules/index.ts`.
- **Contract first** for any new or changed endpoint ([§7](#contract-prs)).
- **Never hand-edit generated files:** `openapi/openapi.json` (`pnpm openapi`), `src/db/migrations/*` (`pnpm db:generate`), `pnpm-lock.yaml`. On a conflict, regenerate.
- Breaking API changes need `/api/v2` for that resource or a deprecation period.
- **pnpm only.** Add dependencies in their own PR, or list them in the PR description.
- **Secrets** never go in code, chat, logs or screenshots. Use `.env` (from `.env.example`).
- Module status and module-level decisions go in the [module table](#planned-modules) in this README. PRs that change `billing`, the release of assessment marks, or the cut-over plan need tech-lead review.

### Definition of Done (every task)

- [ ] Acceptance criteria in the task ([§9](#9-tasks)) are met
- [ ] Tests added (unit for services and middleware; integration for repositories and endpoints, including a user-A/user-B isolation test for user data)
- [ ] `pnpm check` green; no new boundary violations or lint disables
- [ ] `openapi.json` regenerated and committed if any schema changed
- [ ] This README updated if the change affects structure, rules, modules or decisions
- [ ] Reviewed and approved by the folder owner (CODEOWNERS) or the named reviewer

---

## 3. Architecture

```text
                    ┌──────────────────────────────────────────┐
  Teachers ───────► │ teazy-web  (Next.js, Vercel)             │
                    └───────────────┬──────────────────────────┘
                     Supabase Auth  │  HTTPS, Bearer JWT
                     (sign-in only) │  /api/v1/*   (OpenAPI contract)
                    ┌───────────────▼──────────────────────────┐
                    │ teazy-api  (Express + TypeScript)        │
                    │  middleware chain → modules → services   │
                    │  ai/ gateway · integrations/ · jobs/     │
                    └──┬──────────────┬──────────────┬─────────┘
                       │              │              │
                 Postgres (Supabase)  Storage        AI providers
                 Drizzle, pg-boss     (Supabase/R2)  Gemini, OpenAI, Claude
                                                     Payments: Paystack, Flutterwave
```

The web app talks to Supabase **only to sign in**; every data read and write comes through this API. It is a **modular monolith**: one deployable service split into feature modules with enforced boundaries. The API and the worker are the **same Docker image** started with different commands (`node dist/server.js`, `node dist/worker.js`).

```text
routes ──► controller ──► service ──► repository ──► db
                            │
                            ├──► ai/ (gateway)
                            ├──► integrations/ (payments, storage, email)
                            ├──► jobs/ (enqueue)
                            └──► other module's index.ts (its public service only)
```

### Design principles

- **Strategy + Adapter for AI providers.** Each provider implements `LlmProvider` (`generate`, `stream`). `routes.config.ts` maps each task to `[primary, fallback]` models. Decorators add caching, metering, retry with jitter and a circuit breaker without touching providers.
- **Schema-first AI output:** ask for JSON matching a Zod schema → validate → repair (port of `normalizeWorksheet`) → one retry with the validation error attached.
- **Adapter for payments:** `PaymentGateway` (`initialize`, `verify`, `parseWebhook`) per provider; fulfilment once in `billing`.
- **Explicit state machines,** with a DB `CHECK` constraint on the state column and every transition logged. Transitions are pure functions: `transition(state, event) → state | Error`.

  ```text
  Script:  uploaded → ocr_pending → ocr_failed ⇄ ocr_pending
                                 → ocr_done → teacher_checked → marking → marked → reviewed → released
  Payment: created → pending → succeeded → fulfilled   (or failed / refunded)
  Batch:   draft → queued → processing → completed | completed_with_failures
  ```

- **Idempotency + transactional outbox** for every webhook and every retryable data-changing request.
- **Reserve, then commit** for quotas, with an atomic `UPDATE … WHERE used < limit RETURNING`.
- **Errors as values:** services return `Result<T, E>`; one `errorHandler` maps codes to HTTP.
- **Value objects:** `Money`; branded `ClassLevel` and `CurriculumId`.
- **Dependency inversion:** services receive repositories and providers as parameters, so tests pass fakes.
- Data structures that earn their keep: a content-addressed cache (SHA-256 of the normalised request + prompt version), token-bucket rate limits, keyset pagination on `(user_id, created_at, id)`, a pg-boss priority queue with `SKIP LOCKED`, and a Myers diff of AI vs teacher edits.

### Database

1. **Baseline:** `pnpm db:pull` against the staging database turns the existing tables into Drizzle code in `src/db/schema/`. From then on, change the schema in code and run `pnpm db:generate`.
2. **History:** the legacy `supabase/migrations` and `drizzle/migrations` histories are frozen; the pulled schema becomes migration `0000`.
3. **New tables:** `ai_calls`, `idempotency_keys`, `outbox`, `plans`, `assessment_reviews`, `curricula` (seeded), and the pg-boss schema. Every user-owned table keeps RLS enabled with owner policies.
4. The unified `generations` table is introduced **behind** the `workspace` repository. The API reads the old `saved_*` tables first and moves data later, without the frontend noticing.

### Environments

| Environment | API + worker                                                                      | Database                              | Data           |
| ----------- | --------------------------------------------------------------------------------- | ------------------------------------- | -------------- |
| Local       | `pnpm dev` (+ `pnpm dev:worker`)                                                  | Postgres in Docker                    | Seed data      |
| Staging     | Container host (Render / Railway / Fly.io, to confirm), auto-deployed from `main` | Separate Supabase **staging** project | Seed data only |
| Production  | Same host, production service                                                     | Teazy-owned Supabase project          | Real           |

### CI

On every PR: `install → format check → lint (incl. boundaries) → typecheck → unit tests → build`, then integration tests and a Docker build. Added by their tasks: `openapi.json` freshness and `openapi-diff` (API-05), staging deploy on merge (API-07), and an eval regression run when prompts or `routes.config.ts` change (AI-04).

---

## 4. Request pipeline

**Global chain (`app.ts`, in this order):**

1. `requestContext`: request ID (or accept `X-Request-Id`), child logger, timing.
2. `security`: `helmet`, CORS allowlist (web origins per environment), request timeouts.
3. Webhook routes mounted with `rawBody` **before** JSON parsing (signatures are checked on the exact bytes).
4. `express.json({ limit })`, with the limit set per route group.
5. Module routers under `/api/v1`.
6. `notFound`, then `errorHandler` (always last).

**Per-route chain (in each `*.routes.ts`):**

```ts
router.post(
  "/lessons",
  authenticate(), // Supabase JWT → req.user (id from token only)
  validate({ body: CreateLessonBody }), // Zod; 400 with field errors
  rateLimit("generate"), // abuse guard: token bucket per user + route
  quota("lesson"), // reserve; commit on success, release on failure
  lessonsController.create,
);
```

| Middleware                          | Responsibility                                                                       | Replaces in legacy                       |
| ----------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------- |
| `authenticate({ optional? })`       | Verify the Supabase access token (JWKS via `jose`); set `req.user`                   | `requireUser` in `_shared/authz.ts`      |
| `authorize(role)`                   | Role checks (`admin`) from `user_roles`                                              | Ad-hoc checks                            |
| `validate({ body, query, params })` | Zod parsing; replaces `req.body` with the typed value                                | `readJsonBody`, `str`, `optStr`          |
| `rateLimit(bucket)`                 | Token bucket in Postgres; `RateLimit-*` headers; 429 on breach                       | `enforceRateLimit`                       |
| `quota(kind)`                       | Reserve, then commit or release                                                      | `consumeQuota` (charged before the call) |
| `idempotency()`                     | Reads `Idempotency-Key`; replays the stored response on retry                        | Nothing                                  |
| `rawBody`                           | Raw bytes for Paystack/Flutterwave signature checks                                  | Per-function code                        |
| `errorHandler`                      | `AppError` code → HTTP status + friendly message; hides internals; reports to Sentry | Raw error strings sent to users (F-22)   |

---

## 5. API conventions

| Concern                  | Convention                                                                                                                                                                                                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base path and versioning | `/api/v1/...`. Breaking changes need `/api/v2` for that resource; additive changes are fine in v1                                                                                                                                                         |
| Naming                   | Plural nouns, kebab-case: `/api/v1/marking-schemes/:id`                                                                                                                                                                                                   |
| Success response         | `{ "data": ..., "meta"?: { "nextCursor": "..." } }`                                                                                                                                                                                                       |
| Error response           | `{ "error": { "code": "QUOTA_EXCEEDED", "message": "You've used all 10 lesson notes this month.", "details"?: {...}, "requestId": "..." } }`                                                                                                              |
| Error codes              | One catalogue in `core/errors.ts`: `VALIDATION_FAILED`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `QUOTA_EXCEEDED`, `PROVIDER_UNAVAILABLE`, `UNREADABLE_UPLOAD`, `PAYMENT_FAILED`, ... The frontend shows messages by code |
| Pagination               | Keyset on `(created_at, id)`: `?limit=20&cursor=...`                                                                                                                                                                                                      |
| Long AI output           | Server-Sent Events for lesson streaming; jobs for anything over ~30 s (video, bulk marking) with `GET /jobs/:id` polling                                                                                                                                  |
| Uploads                  | `multipart/form-data` (multer) with per-route size and MIME allowlists; no base64 JSON bodies                                                                                                                                                             |
| Retry safety             | `Idempotency-Key` required on payment and generation `POST`s                                                                                                                                                                                              |
| Documentation            | OpenAPI 3.1 from Zod; Swagger UI at `/api/docs` outside production; contract at `/api/v1/openapi.json`                                                                                                                                                    |
| Health                   | `GET /healthz` (process up), `GET /readyz` (database reachable)                                                                                                                                                                                           |
| Observability            | pino JSON logs with `requestId` and `userId`; Sentry; every AI call recorded in `ai_calls`                                                                                                                                                                |

---

## 6. Modules and folders

Planned folders exist in the repo (kept with `.gitkeep`). This is what goes in each and which task fills it.

```text
teazy-api/
├── src/
│   ├── server.ts                  # starts the HTTP server (and nothing else)
│   ├── app.ts                     # builds the Express app; side-effect free so tests can import it
│   ├── worker.ts                  # API-12  starts job workers
│   ├── config/env.ts              # API-01  every env var, Zod-validated at startup (keep in sync with .env.example)
│   ├── core/                      # framework-free; imports nothing else in src (owner: Toye)
│   │   ├── errors.ts              # API-02  AppError + error code catalogue
│   │   ├── result.ts              # API-02  Result<T, E>
│   │   ├── money.ts               # API-13  Money value object
│   │   ├── logger.ts              # API-01  pino (pretty in dev, JSON otherwise)
│   │   └── http.ts                # API-02  asyncHandler, envelope helpers
│   ├── middleware/                # API-02 (+ rateLimit, quota, idempotency in API-04); one unit test each
│   ├── modules/
│   │   ├── index.ts               # registers every module router under /api/v1, one line per module
│   │   └── <name>/                # template below
│   ├── ai/                        # owner: Goodness
│   │   ├── gateway.ts             # AI-01  generate(), generateStructured(), stream()
│   │   ├── providers/             # AI-01  gemini.ts, openai.ts, claude.ts; the only place vendor SDKs are imported
│   │   ├── routes.config.ts       # AI-01  task → [primary, fallback] models, max tokens, timeouts
│   │   ├── decorators/            # AI-02, AI-03  cache, meter, retry, circuitBreaker
│   │   ├── prompts/<task>/vN.md   # AI-00  versioned prompts; never edit a released version
│   │   └── evals/                 # AI-04  20–30 reviewed examples per feature + runner; no real student data
│   ├── integrations/
│   │   ├── payments/              # API-13  PaymentGateway + paystack.ts, flutterwave.ts (fetch-based)
│   │   ├── storage/               # FileStorage + supabaseStorage.ts (bucket workspace-files, keys under <user_id>/; signed URLs only)
│   │   └── email/                 # not scheduled; record a decision when a provider is chosen
│   ├── db/
│   │   ├── client.ts              # API-03  Drizzle over postgres.js
│   │   ├── schema/                # API-03  table definitions, one file per area
│   │   ├── migrations/            # generated by drizzle-kit, never hand-edited
│   │   └── seed/                  # API-06, API-13  curricula and plans; fake data only
│   ├── jobs/
│   │   ├── queue.ts               # API-12  pg-boss setup, retries with backoff, dead letter
│   │   └── workers/               # bulkMarking.ts (AI-15), video.ts (AI-17), images.ts; call module services, no logic
│   └── openapi/
│       ├── registry.ts            # API-05  shared OpenAPIRegistry
│       └── generate.ts            # API-05  writes openapi/openapi.json
├── openapi/openapi.json           # API-05  generated contract, committed, never hand-edited
├── test/integration/              # API-03  Testcontainers Postgres; user-A/user-B isolation tests (QA-02)
├── .github/                       # CI, PR template, issue templates, CODEOWNERS
├── Dockerfile · docker-compose.yml · drizzle.config.ts · .env.example
```

**Module template:**

```text
modules/<name>/
├── <name>.routes.ts       # URL + middleware chain → controller
├── <name>.controller.ts   # HTTP only: read validated req, call one service method, send response
├── <name>.service.ts      # business logic; no req/res, no Express, no SQL; returns Result
├── <name>.repository.ts   # Drizzle queries only; every user-data query filters by userId
├── <name>.schemas.ts      # Zod request/response schemas + OpenAPI registration
├── <name>.types.ts
├── index.ts               # public surface: the router, and the service other modules may call
└── __tests__/
```

### Planned modules

Update the **Status** column as modules are built.

| Module            | Owner            | Task          | Endpoints                                                                                                                                                                                              | Replaces in `teazy-legacy`                                                                                              | Status      |
| ----------------- | ---------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ----------- |
| `me`              | Toye             | API-06        | `GET /me`, `PATCH /me`                                                                                                                                                                                 | `profiles`, `user_roles` reads in the browser                                                                           | Not started |
| `curriculum`      | Toye             | API-06        | `GET /curricula`, `GET /curricula/:id`                                                                                                                                                                 | `src/lib/curricula.ts`, form lists, `_shared/curriculum.ts` data. One class list per curriculum (fixes "SSS 2 vs SS 2") | Not started |
| `lessons`         | Goodness         | AI-10         | `POST /lessons` (SSE), `POST /lessons/:id/images`, `GET/PATCH/DELETE /lessons/:id`                                                                                                                     | `generate-lesson`, `generate-lesson-images`, `saved_lessons`, `cached_lessons`                                          | Not started |
| `quizzes`         | Goodness         | AI-11         | `POST /quizzes`, `GET/PATCH/DELETE /quizzes/:id`                                                                                                                                                       | `generate-quiz`, `saved_quizzes`, `cached_quizzes`                                                                      | Not started |
| `resources`       | Goodness         | AI-12         | `POST /resources` (`worksheet`, `slides`, `rubric`), `POST /resources/images`, CRUD                                                                                                                    | `generate-resource`, `slide-images`, `saved_resources`                                                                  | Not started |
| `simplifier`      | Goodness         | AI-16         | `POST /simplifications`                                                                                                                                                                                | New: the Content Simplifier                                                                                             | Not started |
| `videos`          | Goodness         | AI-17         | `POST /videos` (job), `GET /videos`, `DELETE /videos/:id`                                                                                                                                              | `video-scene`, `video_jobs`, `video_credits`                                                                            | Not started |
| `documents`       | Goodness         | AI-13         | `POST /documents/ocr` (multipart)                                                                                                                                                                      | `ocr-handwriting` (MIME allowlist and encoding stay together)                                                           | Not started |
| `assessments`     | Goodness + Toye  | AI-14         | `POST /assessments`, `PATCH /assessments/:id/marks`, `POST /assessments/:id/release`                                                                                                                   | `assess-script`, `assess-writing`, `saved_assessments`                                                                  | Not started |
| `batches`         | Goodness + Toye  | API-15, AI-15 | `POST /batches`, `POST /batches/:id/items`, `GET /batches/:id`                                                                                                                                         | `assess-batch`, `assessment_batches`, `assessment_batch_items`                                                          | Not started |
| `folders`         | Toye             | API-14        | CRUD, dashboard aggregates                                                                                                                                                                             | `assessment_folders`                                                                                                    | Not started |
| `marking-schemes` | Toye             | API-14        | CRUD                                                                                                                                                                                                   | `saved_marking_schemes`                                                                                                 | Not started |
| `workspace`       | Toye             | API-10        | `GET /workspace?kind=&q=&cursor=`, `DELETE` per item                                                                                                                                                   | Six table queries in `MyWorkspacePage`                                                                                  | Not started |
| `usage`           | Oba + Toye       | API-11        | `GET /usage`                                                                                                                                                                                           | `get_feature_usage`, `get_my_assessment_quota` RPCs                                                                     | Not started |
| `billing`         | Toye + tech lead | API-13        | `GET /plans`, `POST /checkouts`, `POST /payments/:ref/verify`, `POST /webhooks/paystack`, `POST /webhooks/flutterwave`, `POST /promo-codes/validate`, `GET /subscription`, `POST /subscription/cancel` | 7 payment functions, `subscriptions`, `entitlements`, `payments`, `promo_*`, `*_credits`, `src/lib/pricing.ts` limits   | Not started |
| `admin`           | Toye             | API-16        | Feature flags, app settings, promo codes (`authorize("admin")`)                                                                                                                                        | `AdminPage` direct table access                                                                                         | Not started |

---

## 7. Workflow

### Picking up a task

1. Find the task on the GitHub Projects board (IDs match [§9](#9-tasks)). Move it to **In progress** and assign yourself.
2. Branch from `main`: `git switch -c feat/API-06-curriculum-module`. Format: `<type>/<TASK-ID>-short-name`; types `feat`, `fix`, `chore`, `docs`, `test`, `refactor`.
3. Read the task row, §2 of this README, and the module's row in [Planned modules](#planned-modules).
4. If the task adds or changes an endpoint, open the contract PR first.

### Contract PRs

The frontend generates its API hooks from `openapi/openapi.json`, so the contract changes first and on its own.

1. Branch `feat/<TASK-ID>-contract`.
2. Add or change the schemas in `src/modules/<name>/<name>.schemas.ts` and register them with the OpenAPI registry.
3. Add the route with a controller that returns `501 Not Implemented`.
4. Run `pnpm openapi` and commit the regenerated `openapi/openapi.json`.
5. Request review from the **web owner of the slice** ([Slice pairing](#slice-pairing)). CI's `openapi-diff` flags breaking changes.
6. Once merged, the frontend runs `pnpm codegen` and builds against `pnpm mock` while the real endpoint is built in a second PR.

### Commits and PRs

- [Conventional Commits](https://www.conventionalcommits.org/) with the task ID as scope: `feat(API-06): add GET /curricula`.
- One task per PR, ideally under ~400 changed lines (generated files excluded). Fill in the PR template, including **example requests and responses**.
- Run `pnpm check` before pushing, plus `pnpm test:integration` if you touched a repository or the schema.
- `main` is protected: 1 approval from the folder owner (CODEOWNERS), green CI, squash merge only. Nobody pushes to `main` directly, bots included.
- After merge: update the module's status above, move the card to **Done**, and post the staging link in the daily update.

### Reviews

Reviewers check, in order: (1) acceptance criteria met; (2) layering: logic in services, SQL only in repositories, thin controllers, cross-module imports only via `index.ts`; (3) authorisation: user id only from `req.user`, every user-data query scoped by `userId`, an isolation test exists; (4) errors are typed `AppError` codes with no leaked internals, and retries are safe; (5) tests cover failure paths (provider down, invalid input, quota exhausted, duplicate webhook). Review within one working day.

### Rhythm

- **Daily:** short written update in the team channel (done / doing / blocked). Stuck for more than half a day? Post what you've tried.
- **Weekly (30 min):** demo of merged work from staging, then re-plan on the board. Facilitator rotates: Oba (Wk 1, 4, 7), Toye (Wk 2, 5, 8), Goodness (Wk 3, 6).

---

## 8. Decisions

Each decision needs tech-lead approval. Status: **Proposed** until sign-off (plan §11, question 1). To change one, add a new entry that supersedes it; don't rewrite history.

| #   | Decision                                                                                                                                                                                | Why                                                                             | Alternatives rejected                                                                                                       | Consequences                                                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Two repositories:** `teazy-web` and `teazy-api`. The current repo becomes `teazy-legacy`, serving production until the 21 Jan cut-over                                                | Separate ownership, CI and deploys; frontend and backend never block each other | pnpm + Turborepo monorepo (couples pipelines, more tooling); keep evolving legacy (Lovable commits collide, no review gate) | No shared types package; the OpenAPI contract (D6) replaces it. Cross-repo changes need two PRs, contract first                                          |
| D3  | **Express 5 + TypeScript strict**, a modular monolith with `routes → controller → service → repository`, enforced by ESLint rather than by the framework                                | Most widely known framework, easiest for interns to learn and review            | Hono (smaller ecosystem); NestJS (decorators/DI, steep curve for an 8-week deadline); Fastify (less familiar)               | Layer rules live in `eslint.config.js` with `checkInternals: true`; one `errorHandler` and response envelope; validation and contract come from Zod (D6) |
| D6  | **OpenAPI is the contract** between the repos: OpenAPI 3.1 generated from Zod into `openapi/openapi.json`, committed; the web app generates RTK Query hooks from it; Prism serves mocks | Frontend and backend build in parallel against one written agreement            | Shared TypeScript package (impossible across two repos)                                                                     | Contract PRs first, reviewed by the consumer; CI fails on a stale `openapi.json`; `openapi-diff` flags breaking changes                                  |
| D8  | **TypeScript 5.9** (not 7.x)                                                                                                                                                            | `typescript-eslint` supports only TypeScript < 6.1                              | TypeScript 7 (breaks linting)                                                                                               | Upgrade when `typescript-eslint` supports it                                                                                                             |

D2, D4, D5 and D7 (frontend decisions) are recorded in `teazy-web`.

---

## 9. Tasks

**Deadline:** Fri 22 Jan 2027. Production cut-over Thu 21 Jan. Code freeze Tue 19 Jan. Holiday break (no work) Mon 21 Dec – Fri 1 Jan. Every PR is merged or parked by Fri 18 Dec. Effort: S = 0.5 day, M = 2 days, L = 4 days. The GitHub Projects board is the live status; these tables are the reference for scope.

### Owners

| Intern       | Track                                      | Owns in this repo                                                                                                                                                                  |
| ------------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Toye**     | API platform and business modules          | Setup, `core/`, `middleware/`, `db/`, `jobs/`, `integrations/payments`; modules `me`, `curriculum`, `workspace`, `billing`, `folders`, `marking-schemes`, `admin`; CI/CD; cut-over |
| **Goodness** | AI layer and generation/assessment modules | `src/ai/**`; modules `lessons`, `quizzes`, `resources`, `documents`, `assessments`, `batches`, `videos`, `simplifier`; batch marking worker; evals                                 |
| **Oba**      | Frontend (consumer)                        | `usage` module; reviews every contract PR and `openapi.json` change                                                                                                                |

**Tech lead:** approves decisions and any PR that changes `billing`, the release of assessment marks, or the cut-over plan.

### Phase 0: repository setup (done)

- [x] `package.json` (ESM, Node 22, pnpm 10) with every planned runtime dependency
- [x] TypeScript strict (NodeNext), tsx, ESLint + typescript-eslint + layer rules (tested against deliberate violations), Prettier, Vitest + Supertest + coverage, Testcontainers, drizzle-kit, Prism
- [x] Minimal `app.ts` / `server.ts` with `GET /healthz` and one test, so `pnpm dev/test/lint/typecheck/build` all work
- [x] Folder skeleton (§6), `Dockerfile`, `docker-compose.yml`, `.env.example`, `drizzle.config.ts`
- [x] CI workflow, PR template with the Definition of Done, issue templates, CODEOWNERS (placeholder handles)

Still open from setup: protect `main`, real CODEOWNERS handles, Projects board (OPS-01); staging Supabase project and secrets (OPS-02).

### Toye: API platform and business modules

| ID         | Task                                                                                                                                                                                        | Wk  | Size | Depends on             | Acceptance criteria                                                                                                                                                                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ---- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OPS-01** | Repos, protected `main`, CODEOWNERS, PR + issue templates, Projects board with every task ID                                                                                                | 1   | M    | Tech-lead org access   | Direct pushes to `main` rejected; PR template has the DoD; board has all tasks with owners                                                                                                                                                                                  |
| **OPS-02** | Staging Supabase project with production **schema only** + seed data; secrets via password manager                                                                                          | 1   | M    | Tech-lead access       | Every intern runs the API locally against local Postgres and the web app against staging auth; no real student data in staging                                                                                                                                              |
| **API-01** | Scaffold: `config/env.ts`, pino logger, `/readyz`, **basic CI** green                                                                                                                       | 1   | M    | OPS-01                 | `pnpm dev/test/lint/typecheck/build` work; importing `modules/*` from `core/` fails lint; CI runs on PRs. _Toolchain, lint rules, Dockerfile, `/healthz` and CI workflow done in Phase 0; remaining: `config/env.ts`, `core/logger.ts`, `/readyz`, confirming CI on GitHub_ |
| **API-03** | DB layer: `drizzle-kit pull` from staging; baseline migration `0000`; `db/client.ts`; repository pattern example; Testcontainers Postgres                                                   | 1–2 | M    | OPS-02, API-01         | Schema matches staging; migrations run on an empty database; one integration test passes in CI                                                                                                                                                                              |
| **API-02** | Middleware chain (§4); `AppError` catalogue; response envelope; `asyncHandler`                                                                                                              | 2   | L    | API-01                 | Unit test per middleware; bad JWT → 401 envelope; Zod failure → 400 with field errors; no stack traces leak; every log line has a `requestId`                                                                                                                               |
| **API-05** | OpenAPI: registry, `pnpm openapi`, Swagger UI at `/api/docs` (non-prod), `pnpm mock`, CI freshness check + `openapi-diff`                                                                   | 3   | M    | API-02                 | Oba runs `pnpm mock` and `pnpm codegen` against it; CI fails if `openapi.json` is stale. **Merged by Wed 2 Dec**                                                                                                                                                            |
| **API-04** | `rateLimit` (token bucket) and `quota` (reserve → commit/release) in Wk 3; `idempotency` (table + replay) in Wk 4                                                                           | 3–4 | M    | API-03                 | 20 parallel requests never exceed the quota; a failed handler releases its reservation; the same `Idempotency-Key` returns the same response                                                                                                                                |
| **API-06** | **Reference module** `me` + `curriculum`; `curricula` seeded from legacy, **one class list per curriculum**; `GET /curricula`                                                               | 3–4 | M    | API-02, API-03, API-05 | Contract **merged by Wed 2 Dec**; follows the layer rules exactly; Goodness and Oba sign off that it's the template to copy                                                                                                                                                 |
| **API-07** | Full CI + staging deploy of the API and worker image on merge to `main`                                                                                                                     | 4   | M    | API-01, API-05         | A merged PR is live on staging within 10 minutes; `/readyz` is green                                                                                                                                                                                                        |
| **API-10** | `workspace`: `GET /workspace` over the `saved_*` tables with filters and cursor pagination; `DELETE` per item                                                                               | 4   | M    | API-06                 | One request returns a mixed, paginated list; a user-A/user-B isolation test passes                                                                                                                                                                                          |
| **API-12** | Jobs: pg-boss, `worker.ts`, `GET /jobs/:id`, retries with backoff, dead-letter handling                                                                                                     | 5   | M    | API-07                 | A test job retries 3× and ends `failed` with a reason; the worker runs as a separate process                                                                                                                                                                                |
| **API-13** | `billing`: plans, `PaymentGateway` + Paystack and Flutterwave adapters, checkouts, verify, signed webhooks, **one idempotent `fulfil`** + outbox, promo validation, subscription get/cancel | 5–6 | L    | API-04, API-12         | Replaying a webhook 5× grants once; verify and webhook racing grants once; every legacy purpose covered; **tech-lead review**                                                                                                                                               |
| **API-14** | `folders` + `marking-schemes` CRUD; dashboard aggregates endpoint                                                                                                                           | 6   | M    | API-06                 | CRUD + isolation tests; a duplicate folder name returns `CONFLICT`                                                                                                                                                                                                          |
| **API-16** | `admin` module: feature flags, app settings, promo codes (`authorize("admin")`)                                                                                                             | 7   | M    | API-06                 | Non-admins get 403; every admin change is logged                                                                                                                                                                                                                            |
| **OPS-05** | Cut-over: runbook, staging rehearsal (Wed 20 Jan), webhook + callback re-pointing, Google OAuth redirect, DNS, reconciliation job, rollback plan                                            | 8   | L    | Everything             | Rehearsal passes without data loss; tech lead signs off the runbook; production live Thu 21 Jan                                                                                                                                                                             |

### Goodness: AI layer and generation/assessment modules

| ID         | Task                                                                                                                                                                                 | Wk  | Size | Depends on                        | Acceptance criteria                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --- | ---- | --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **AI-00**  | Inventory every prompt and model call in the 17 legacy functions and `_shared/curriculum.ts`; copy prompts to `src/ai/prompts/<task>/v1.md`; collect 20–30 eval examples per feature | 1   | M    | —                                 | One table: function → task → model → prompt file → output shape; no real student names in eval data         |
| **AI-01**  | AI gateway: `LlmProvider`, Gemini and OpenAI adapters, `routes.config.ts` (primary + fallback), timeouts, typed `AiError`                                                            | 1   | L    | API-01                            | With fake providers, primary fails → fallback answers; no provider-specific code outside `providers/`       |
| **AI-03**  | `generateStructured(schema)`: validate → repair → one retry; retry with jitter + circuit breaker                                                                                     | 1–2 | M    | AI-01                             | Malformed output is repaired or retried once; once the breaker opens, traffic goes to the fallback          |
| **AI-02**  | Decorators: `meter` (writes `ai_calls`), `cache` (content-addressed, prompt version in key), model price table                                                                       | 2   | M    | AI-01, API-03                     | Every call creates one `ai_calls` row; a repeated identical request is a cache hit with zero provider calls |
| **AI-04**  | Eval harness with rubric scoring; **baseline** the current models; CI gate on prompt/route changes                                                                                   | 2   | M    | AI-00, AI-01                      | Baseline report committed; a prompt change that lowers the score fails CI                                   |
| **AI-10**  | `lessons`: `POST /lessons` over SSE with `quota("lesson")`, persistence, `PATCH` for teacher edits (stores the AI-vs-teacher diff), images endpoint                                  | 3   | L    | API-04, API-06 contract, AI-02/03 | First text in under 3 s on staging; a failed generation uses no quota; edits persist                        |
| **AI-11**  | `quizzes`: structured output (MCQ + short answer + marking guide), CRUD                                                                                                              | 3–4 | M    | AI-10                             | Output always matches the schema; quiz stores subject and class                                             |
| **AI-12**  | `resources`: worksheet, slides, rubric (structured), images endpoint, CRUD                                                                                                           | 4   | M    | AI-10                             | Worksheet output passes the schema without frontend repair                                                  |
| **AI-13**  | `documents`: OCR with MIME allowlist + encoding together, multipart upload, `UNREADABLE_UPLOAD` error                                                                                | 4   | M    | AI-03                             | An unreadable upload returns a typed error and can never be marked "ready"                                  |
| **AI-14**  | `assessments`: script state machine, single-script marking, marks `PATCH` writing `assessment_reviews`, `release` only after review                                                  | 5   | L    | AI-13, API-04                     | Every mark change records who/when/old/new/reason; no release without review; **tech-lead review**          |
| **OPS-04** | Cost dashboard: SQL views over `ai_calls` (per feature, user, day) + Sentry                                                                                                          | 5   | S    | AI-02                             | Tech lead can see yesterday's AI cost per feature                                                           |
| **AI-17**  | `videos` on the job queue (port of `video-scene`), pricing decision applied                                                                                                          | 6   | M    | API-12, open question 5           | A video job survives a worker restart                                                                       |
| **API-15** | `batches`: state machine with a DB `CHECK`, items, progress                                                                                                                          | 6   | M    | API-12, AI-14                     | Invalid transitions rejected in code and in the database; progress computed in one place                    |
| **AI-15**  | Batch marking worker (`jobs/workers/bulkMarking.ts`) using the assessments service                                                                                                   | 7   | M    | API-15                            | A 30-script batch completes; one bad script ends `failed` without stopping the others                       |
| **AI-16**  | `simplifier` module (with its web page)                                                                                                                                              | 7–8 | M    | AI-11                             | Teacher pastes text, picks a class, gets a simpler version; saved to the workspace                          |
| **QA-02**  | Authorisation suite: user-A/user-B isolation test for every module; payment idempotency tests                                                                                        | 8   | M    | All API modules                   | Runs in CI; no endpoint returns another user's rows                                                         |

### Oba: work in this repository

| ID         | Task                                                                  | Wk  | Size | Depends on | Acceptance criteria                                                                                                                                 |
| ---------- | --------------------------------------------------------------------- | --- | ---- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OPS-03** | Rules and contributing docs for both repos; decision records D1–D6    | 1   | M    | OPS-01     | An intern with only this README and a task ID puts files in the right place. _Drafted; finish = walk-through with each intern + tech-lead approval_ |
| **API-11** | `usage` module: `GET /usage` with every monthly limit and amount used | 5   | S    | API-06     | Numbers match the legacy RPCs for the same user on staging                                                                                          |
| —          | Review every contract PR and `openapi.json` change as the consumer    | all | —    | —          | —                                                                                                                                                   |

If the team falls behind, scope moves out in this order: videos (AI-17), admin (API-16 / WEB-19), simplifier (AI-16). The cut-over depends on none of them.

### Critical path and hand-offs

`OPS-01 → API-01 → API-03/02 → API-05 + API-06 → every feature module`

| Date       | Hand-off                                               | Unblocks                            |
| ---------- | ------------------------------------------------------ | ----------------------------------- |
| Wed 2 Dec  | API-05 and the API-06 **contract** merged              | Web codegen (WEB-02), AI-10 lessons |
| Mon 7 Dec  | API-06 implemented and approved as the module template | All feature modules                 |
| Fri 18 Dec | API-12 job queue live on staging                       | AI-17 videos, API-15 batches        |
| Fri 18 Dec | All PRs merged or parked before the break              | —                                   |
| Tue 19 Jan | Code freeze                                            | OPS-05 cut-over                     |

### Slice pairing

| Slice                                  | API owner                      | Web owner |
| -------------------------------------- | ------------------------------ | --------- |
| Profile + curriculum (reference slice) | Toye                           | Oba       |
| Lessons, quizzes, resources            | Goodness                       | Oba       |
| Workspace                              | Toye                           | Oba       |
| Usage                                  | Oba                            | Oba       |
| Billing (plans, checkout, account)     | Toye                           | Oba       |
| Single assessment + OCR                | Goodness                       | Oba       |
| Bulk marking + batches                 | Goodness (on Toye's job queue) | Goodness  |
| Simplifier, videos                     | Goodness                       | Goodness  |
| Admin                                  | Toye                           | Toye      |
