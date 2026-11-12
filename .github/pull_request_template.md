## Task

<!-- Task ID from README.md (Tasks), e.g. API-06. One task per PR. -->

Task:

- [ ] This is a **contract PR** (schemas + `openapi.json` + `501` stub). Web owner requested for review.

## What changed

-

## Example requests

<!-- Required for endpoint changes: one success and one error, with the response envelope. -->

```http
POST /api/v1/...
```

## Definition of Done

- [ ] Acceptance criteria in the task are met
- [ ] Tests added (unit for services/middleware; integration for repositories/endpoints)
- [ ] User-data queries scoped by `userId`, with a user-A/user-B isolation test
- [ ] `pnpm check` green; no new boundary violations or lint disables
- [ ] `pnpm openapi` re-run and `openapi/openapi.json` committed (if any schema changed)
- [ ] Module `README.md` updated
- [ ] No secrets, tokens or student data in code, logs, fixtures or this description
- [ ] Tech-lead review requested (billing, release of marks, cut-over)
