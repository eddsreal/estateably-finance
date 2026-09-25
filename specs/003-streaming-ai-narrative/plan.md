# Implementation Plan: Streaming AI narrative

**Branch**: `003-streaming-ai-narrative` | **Date**: 2026-09-24 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/003-streaming-ai-narrative/spec.md` (clarified
2026-09-24), constitution v1.1.0, feature 001 and 002 plans and the canonical contract (1.1.0).

## Summary

The AI narrative on the similar-transactions report streams instead of arriving all at once.
Three pieces change:

- **API**: `AiService` moves from a hand-written `fetch` to `@anthropic-ai/sdk` streaming
  (research R-001). `POST /reports/similar/narrative` answers `200 text/event-stream` with
  `delta` events and one closing `end` event, but only once the first text arrives. Until then,
  failures keep today's JSON errors and codes (R-004).
  - One `AbortController` per narrative is fired by an inactivity timer of `LLM_TIMEOUT_MS` or by
    the client closing the connection (R-003, R-005).
  - Failures after text end the stream as `incomplete` with a reason.
- **Prompt**: asks for one or two short paragraphs of natural prose, the most expensive group
  in bold, no list (R-007). `max_tokens` is 512. Descriptions are stripped of Markdown and
  HTML marks before they reach the provider (R-002, R-007).
- **Web**: the Similar page reads the stream through openapi-fetch's `parseAs: 'stream'` and a
  small SSE parser (R-009). The text is rendered progressively with `react-markdown` on a strict
  allow-list (R-008). The page adds Stop (with focus hand-off), a Regenerate state with a 5 s
  cooldown, an incomplete notice with reason and correlation id, and two screen-reader
  announcements (R-010).

No ledger code, table, migration, module or environment variable is added. **Contract frozen
with this plan**: [`contracts/openapi-delta.yaml`](contracts/openapi-delta.yaml) (yaml 1.1.0 →
1.2.0). The Prisma schema is unchanged.

## Technical Context

**Language/Version**: unchanged. TypeScript 7.0.2, `strict`, on Node 24 LTS.

**Primary Dependencies**: unchanged, plus two new runtime dependencies, exact-pinned:

- `@anthropic-ai/sdk` 0.128.0 in `apps/api` (R-001), which the user named as the feature's
  input;
- `react-markdown` 10.1.0 in `apps/web` (R-008), following the user's preference for libraries
  over hand-rolled widgets.

The SSE parser in the web is about 15 lines of project code (R-009).

**Storage**: none. Narratives are never stored.

**Testing**: unchanged tools (Vitest 5, supertest + ajv, Playwright). The API e2e suite now
talks to the app over a real port with `fetch`, so it can read and abort a stream (R-011). The
web test stub gains a raw-`Response` pass-through.

**Target Platform**: the same Docker Compose stack and browsers as feature 002. The browser calls
the API directly at `API_BASE_URL`, so there is no proxy that could buffer the stream.

**Project Type**: the existing pnpm monorepo (`apps/api`, `apps/web`, `packages/contract`,
`e2e`).

**Performance Goals**: SC-001, first words within 3 s; SC-005, a complete 10-group summary
within 10 s; SC-002, Stop takes effect within 1 s. The provider sets the pace. The server adds
one event write per delta.

**Constraints**: FR-002 keeps every pre-text error code and shape. There is no overall timeout
(clarification). The provider is never retried. Markdown is inert beyond
`p strong em ul ol li`. No new environment variable (FR-013).

**Scale/Scope**: 1 endpoint changed, 1 schema removed, 2 schemas added. 1 page and 1 hook
changed on the web. One user, one narrative at a time.

## Constitution Check

_GATE: evaluated before Phase 0 and again after Phase 1: **PASS**, both times. One entry is
justified in Complexity Tracking (in-band `end` errors after `200`); the rest record ceilings._

| Principle                  | How this plan complies                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Ledger integrity        | No write path. The narrative reads `ReportsService.similar` only, as today. The integrity test is unchanged.                                                                                                                                                                                                                                                                                                        |
| II. Integer money          | Unchanged from feature 001: the provider receives cent strings and writes dollars into prose, which is presentation text and is never parsed back. No new arithmetic on cents anywhere.                                                                                                                                                                                                                             |
| III. One translation point | Untouched. Nothing mentions entries, debits, credits or system accounts.                                                                                                                                                                                                                                                                                                                                            |
| IV. Contracts before code  | The delta is frozen here. It is applied verbatim to the canonical yaml as the first Foundational task, then types are regenerated. `NarrativeDeltaEvent` and `NarrativeEndEvent` types come from the generated contract in the web. The e2e suite validates every event's `data` against them.                                                                                                                      |
| V. Validate at the edges   | The request DTO is unchanged. Pre-text failures are still typed domain errors (`AiRateLimitedError`, `AiProviderError`, `AiTimeoutError`, `AiNotConfiguredError`) mapped only by the global filter. The service yields events and knows nothing about HTTP; SSE framing lives in the controller. Failures after the status line is sent are in-band `end` events defined by the contract (see Complexity Tracking). |
| VI. Domain tests first     | The ledger is untouched. `ai.service.spec.ts` is rewritten alongside the service, and the FR-012 e2e is written with the controller change (R-011). The web tests cover the parser and page behaviour.                                                                                                                                                                                                              |
| VII. Modular monolith      | The module graph is unchanged: `ai → reports` through `ReportsService.similar`. The SDK is imported only inside `modules/ai`. On the web the hook and page stay in `features/similar`; `sse.ts` goes to `shared/lib`.                                                                                                                                                                                               |

Stack constraints: two new runtime dependencies, with reasons above and in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/003-streaming-ai-narrative/
├── plan.md                 # This file
├── research.md             # R-001…R-011
├── data-model.md           # wire events, server and client state machines
├── quickstart.md           # validation scenarios 1–8
├── contracts/
│   └── openapi-delta.yaml  # FROZEN, applied to the canonical 001 yaml in Foundational
├── checklists/requirements.md
└── tasks.md                # /speckit-tasks
```

### Source Code (repository root): only what this feature touches

```text
specs/001-personal-finance-manager/contracts/openapi.yaml   # delta applied, info.version 1.2.0
packages/contract/src/types.ts                               # regenerated

apps/api/
├── package.json                                   # + @anthropic-ai/sdk 0.128.0
├── src/modules/ai/
│   ├── controllers/ai.controller.ts               # narrative: @Req/@Res, first event before headers, SSE writes, close → abort, end log line
│   ├── dtos/narrative-response.dto.ts (+ .spec)   # deleted
│   └── services/ai.service.ts (+ .spec)           # SDK stream, async generator of events, inactivity timer, prompt, max_tokens 512; plainText removed
└── test/ai-narrative.e2e-spec.ts                  # rewritten: SSE stub modes, real-port fetch, gated, cancel, event validation

apps/web/
├── package.json                                   # + react-markdown 10.1.0
└── src/
    ├── test-api-stub.ts                           # handler may return a Response (passed through)
    ├── shared/lib/sse.ts (+ sse.test.ts)          # new: parseSse over a text stream
    └── features/similar/
        ├── hooks/useNarrative.ts                  # new: start/stop, status, text, reason; abort on stop/new range/unmount
        └── components/SimilarPage/
            ├── SimilarPage.tsx                    # useMutation → useNarrative; Stop, Regenerate, spinner, incomplete notice, role=status
            ├── NarrativeText.tsx                  # new: react-markdown with the allow-list
            └── SimilarPage.test.tsx               # streaming cases

README.md                                          # AI section: streaming, Stop, incomplete
```

**Structure Decision**: the feature 001 and 002 layout and conventions apply unchanged (no
barrels, colocated tests, features never import features, token-only styling checked by
`check:tokens`). No new route.

## Story → scope (phases for tasks.md)

| Story (priority)            | API                                                                                                                                                          | Web                                                                                                                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Setup                       | add `@anthropic-ai/sdk`                                                                                                                                      | add `react-markdown`                                                                                                                                                                                     |
| Foundational                | apply delta, regenerate types; SDK streaming service, controller, abort on close, inactivity timer; unit and FR-012 e2e tests; delete `NarrativeResponseDto` | `sse.ts` + tests; `useNarrative`; test stub pass-through. The page switches to the hook and shows plain accumulated text, so the build stays green                                                       |
| US1 Progressive text (P1)   | —                                                                                                                                                            | text grows per delta; `aria-busy`; status "Generating summary…" / "Summary complete"                                                                                                                     |
| US2 Structured summary (P1) | prompt (R-007), `forPrompt` stripping (FR-008a) and `max_tokens` 512, with their unit assertions                                                             | `NarrativeText` with the allow-list; bold, bullets, inert HTML, link label only, image alt text                                                                                                          |
| US3 Stop (P2)               | — (abort on close is Foundational)                                                                                                                           | Stop button (also before the first text); "Stopped." label and announcement; focus to the summary button; new range clears, unmount aborts                                                               |
| US4 Keep partial text (P2)  | —                                                                                                                                                            | incomplete notice with reason line and correlation id, on `end` incomplete and on a body without `end`; announcement                                                                                     |
| US5 One at a time (P3)      | —                                                                                                                                                            | disabled + spinner (static with reduced motion) while streaming; "✦ Regenerate" with 5 s cooldown and countdown after any ending; "✦ Summarize with AI" after a pre-text failure; Regenerate clears text |
| Polish                      | —                                                                                                                                                            | README AI section; quickstart scenarios 6–7 by hand                                                                                                                                                      |

Foundational applies the whole delta and finishes the API with its tests, as feature 002 did.
That way `contract:check` never sees the yaml and the routes out of step, and removing
`NarrativeResponse` never leaves the web without a compiling consumer. Every story after
Foundational is web-only, except US2's prompt.

## Complexity Tracking

| Entry                                                            | Why needed                                                                                                                                                                                                                                                                                                                                               | Simpler alternative rejected because                                                                                                                        |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Errors after `200` are in-band `end` events, not the error shape | Principle V wants one error shape mapped in one place. Once the first delta is written, the status line is gone and an HTTP error cannot be sent. The contract defines `end` / `incomplete` / `reason`, the service yields it, and the controller only serialises it. Every failure before text still goes through the global filter unchanged (FR-002). | Holding all output until the end: removes streaming, the point of the feature. Sending `200` at once: moves every pre-text error in-band and breaks FR-002. |
| New runtime dependency `@anthropic-ai/sdk` (R-001)               | Named by the user. It replaces hand-written SSE parsing and status mapping with typed errors, and keeps `LLM_BASE_URL` through `baseURL`.                                                                                                                                                                                                                | Raw `fetch` plus a hand-written provider SSE parser: more code to own, against the stated input.                                                            |
| New runtime dependency `react-markdown` (R-008)                  | Safe by default (React elements, raw HTML escaped), with an allow-list that makes everything else inert (FR-009). Follows the user's preference for libraries.                                                                                                                                                                                           | A hand-written Markdown subset: against the stated preference, and its escaping would need its own tests.                                                   |
| Markdown re-parsed on every delta (R-008)                        | Simplest progressive render: the whole text in, the tree out. Ceiling: work grows with the square of the answer length. At 512 tokens that is well under a millisecond per delta. Upgrade path: parse once per animation frame.                                                                                                                          | Incremental parsing: no library does it for Markdown, and there is no measured need.                                                                        |
| SDK client built per request (R-001)                             | Key and base URL are read from the environment per call, as today, which is what lets the e2e suite switch them per test. Ceiling: no connection reuse across narratives, about one extra TLS handshake per summary. Upgrade path: cache the client by `(key, baseURL)`.                                                                                 | A module-level client: configuration fixed at boot, which changes feature 001's behaviour and breaks per-test env stubbing.                                 |
| Regenerate cooldown enforced in the web only (R-010)             | SC-007 and the 5 s cooldown are about the owner's own button. Ceiling: a client calling the API directly can request narratives back to back. Upgrade path: a per-process rate limit in the controller, which returns a new error code and needs a contract change.                                                                                      | A server-side limit now: a new error code, state on the server and a contract change, for a single-user app.                                                |
| Hand-written SSE parser in the web (R-009)                       | The server emits two event types with one-line JSON `data`. Ceiling: it does not handle multi-line `data`, comments, `id` or `retry`, which this server never sends. Upgrade path: `eventsource-parser` if the stream ever carries other producers' events.                                                                                              | `eventsource-parser`: a dependency for about 15 lines.                                                                                                      |
| No overall time limit (clarification 2026-09-24)                 | A steady stream is bounded by `max_tokens` 512. Ceiling: a provider that trickles one token just under every `LLM_TIMEOUT_MS` could hold the request for 512 × 10 s. Upgrade path: an overall deadline, which needs a spec change.                                                                                                                       | An overall deadline now: a second clock and more tests for a case not observed.                                                                             |

## Phase 1 re-evaluation

The design artifacts add no violation beyond the justified entry above:

- The contract change is one response type. It uses existing error responses and no money
  field (II ✓, V ✓).
- Nothing touches entries (I ✓, III ✓).
- The module graph is unchanged (VII ✓).
- The contract is frozen before any code (IV ✓).
- The e2e suite checks every event against the frozen schemas (VI ✓).

Gate: **PASS**.
