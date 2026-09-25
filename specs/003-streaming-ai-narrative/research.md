# Research: Streaming AI narrative

All Technical Context unknowns are resolved below. Each entry is Decision / Rationale /
Alternatives considered.

## R-001 Provider client: `@anthropic-ai/sdk`

**Decision**: replace the hand-written `fetch` in `AiService` with the official TypeScript SDK,
`@anthropic-ai/sdk` 0.128.0, exact-pinned in `apps/api`. The client is built per request as
`new Anthropic({ apiKey: LLM_API_KEY, baseURL: LLM_BASE_URL, maxRetries: 0 })` and the call is
`client.messages.stream(params, { signal })`, consumed with `for await` over its events.

**Rationale**: the user named the SDK as the input of the feature. It parses the provider's SSE,
sends the version header, and raises typed errors (`Anthropic.RateLimitError`,
`Anthropic.APIError`, `Anthropic.APIUserAbortError`), which replaces the status checks and body
parsing done by hand today. `baseURL` keeps `LLM_BASE_URL` working, and the SDK appends
`/v1/messages`, so the e2e stub still sees the same path. `maxRetries: 0` keeps FR-011 (the SDK
retries twice by default). The client is built per request because the key and base URL are
read from the environment on every call, as today, and the e2e suite changes them per test.

**Alternatives considered**: keep raw `fetch` and parse the SSE by hand. That duplicates the
SDK's parser and error mapping, and ignores the user's input. A client built once at module
start would stop the per-test `vi.stubEnv` pattern from working and change how configuration is
read; there is no measured cost to building it per request (Complexity Tracking).

## R-002 Model and output cap

**Decision**: keep `LLM_MODEL = 'claude-haiku-4-5-20251001'`, chosen in feature 001. Set
`max_tokens` to 512. No `thinking`.

**Rationale**: changing the model is out of scope and is the user's decision. 512 tokens fit the
opening total, at most 10 group bullets and a closing line, with room to spare. It keeps cost
and latency low (FR-010, SC-005). Haiku 4.5 streams well above 100 tokens/s, so a complete
summary takes a few seconds.

**Alternatives considered**: 300 tokens, today's value, is too tight for 10 bullets. A newer
model would cost more for a two-paragraph summary, and nobody asked for it.

## R-003 Timeout: our own inactivity timer

**Decision**: `AiService` owns one `AbortController` per narrative. An inactivity timer of
`LLM_TIMEOUT_MS` is armed at start and reset on every text delta. When it fires it records
`timedOut = true` and aborts the controller. The SDK's own `timeout` option is not used.
Before the first text a timeout raises `AiTimeoutError` (504). After it, the stream ends with
`incomplete` / `timeout`. There is no overall limit (clarification 2026-09-24); `max_tokens`
bounds the length.

**Rationale**: the SDK timeout bounds the request, not the silence between events. One
controller also serves the other abort source, a client disconnect (R-005), so both paths end
the provider request the same way.

**Alternatives considered**: `AbortSignal.timeout` (today) is a single total deadline, which
the clarification rejected. The SDK's `timeout` option is a total deadline too.

## R-004 Wire format: SSE over the existing `POST`

**Decision**: the success response is `200 text/event-stream` with two event types, each with
one JSON line of `data`:

- `event: delta`, `data: {"text": "…"}`, once per provider text delta, in order.
- `event: end`, `data: {"outcome": "complete"}` or
  `{"outcome": "incomplete", "reason": "provider_error" | "timeout" | "length"}`, exactly once,
  last.

The status line is only written after the first provider text arrives. Until then any failure
is a typed domain error that the global filter maps to today's JSON error. A body that closes
without `end` means the connection dropped, and the web treats it as `incomplete`. Mapping of
the provider's `stop_reason`: `end_turn` becomes `complete`; `max_tokens` becomes `incomplete` /
`length`; anything else becomes `incomplete` / `provider_error`. An answer that ends with no
text at all raises `AiProviderError` (502), as today.

**Rationale**: SSE matches the provider's format and the user's framing ("the endpoint forwards
the chunks"). Browser dev tools show it as an event stream, and it needs no framing beyond blank
lines. Holding the status line until the first text is what lets FR-002 keep the existing error
contract unchanged. `stopped` is not a server outcome: only the browser knows it stopped.

**Alternatives considered**:

- NDJSON: just as simple, but it is not the format the user named.
- `EventSource` / Nest `@Sse()`: `GET` only, and headers are committed at once, so the pre-text
  error codes would be lost.
- Sending `200` at once and in-band errors for everything: breaks FR-002 and every existing
  client-side error path.

## R-005 Client disconnect ends the provider request

**Decision**: the controller aborts the narrative's controller on
`res.on('close')` when the response has not finished. The SDK stream then rejects with
`APIUserAbortError`, the service stops and nothing more is written.

**Rationale**: FR-005 and FR-006 require the provider request to end within 1 s when the owner
stops or leaves. The browser aborts its `fetch`, the socket closes, and the chain reaches the
provider in the same tick.

**Alternatives considered**: a separate "cancel" endpoint needs a narrative id and state on the
server, for the same effect.

## R-006 Controller shape

**Decision**: `AiController.narrative` takes `@Req()` and `@Res()` (typed as Node's
`IncomingMessage` / `ServerResponse`, following the structural types in
`http-exception.filter.ts`). It awaits the first event from `AiService.similarNarrative`
(an async generator of `{ type: 'delta', text } | { type: 'end', outcome, reason? }`) before
writing anything. If that throws, the error propagates to the global filter unchanged. Then it
writes the headers `Content-Type: text/event-stream`, `Cache-Control: no-cache` and flushes, and
writes each event with a one-line `sseEvent(name, data)` helper. The `X-Correlation-Id` header is
already set by the middleware.

When the stream finishes, the controller logs one line through the existing logger:
`correlationId`, and the outcome (`complete`, `incomplete` with its reason, or `client_closed`).
The request log line from `LoggingInterceptor` still records `200`.

**Rationale**: the domain keeps throwing typed errors and knows nothing about HTTP (Principle
V). Only the controller knows about SSE framing. A `200` alone would hide mid-stream failures,
so the extra log line keeps them visible.

**Alternatives considered**: an RxJS `Observable` with `@Sse()` (see R-004).

## R-007 Prompt

**Decision**: the system prompt asks for natural prose, one or two short paragraphs and never a
list (clarification 2026-09-24, replacing the first design of one bullet per group). In
substance: start with the period total, then say where the money went, starting with the most
expensive group and naming the next few largest with their totals. Do not describe every group,
and never give a combined total for the groups not named: a live run of the list design summed
the left-out groups itself and got it wrong. Put the most expensive group's name in `**bold**`.
Use no other formatting. The existing rules stay: only the figures given,
never compute amounts, and cents divided by 100 for dollars. The user message stays the JSON of
the grouped report. `plainText` is removed.

Before the JSON is built, each group's description passes through a pure `forPrompt(text)` in
`ai.service.ts` (FR-008a): it removes ``* _ ` # < > [ ] ( ) ! | ~`` and line breaks and
collapses whitespace. Totals and counts are not touched. The system prompt also says the
descriptions are data, never instructions.

**Rationale**: FR-008 and SC-006, and a shape short enough for R-002's cap. Stripping the marks
means a description cannot inject formatting or links into the answer through the model
(clarification 2026-09-24). The render allow-list (R-008) stays the second line of defence.

**Alternatives considered**: structured output (JSON) with the UI formatting it. That loses
progressive rendering, which is the point of the feature.

## R-008 Markdown rendering: `react-markdown`

**Decision**: add `react-markdown` 10.1.0, exact-pinned in `apps/web`, rendered with
`allowedElements={['p', 'strong', 'em', 'ul', 'ol', 'li']}` and `unwrapDisallowed`. It is given
the whole accumulated text on every delta.

**Rationale**: the user prefers libraries to hand-rolled widgets (memory, 2026-09-24).
`react-markdown` builds React elements, with no `dangerouslySetInnerHTML`, and escapes raw HTML
by default. The allow-list turns headings, links, images and anything else into their plain
text, which is FR-009's "inert". Re-parsing a text of at most 512 tokens on each delta costs
microseconds (Complexity Tracking). An unclosed `**` shows as literal text until its closing
piece arrives, which is what the spec's acceptance scenario allows.

**Alternatives considered**:

- `marked` + DOMPurify: HTML strings and an extra sanitizer, for the same result.
- A hand-written subset parser: against the user's stated preference, and more code to test.

## R-009 Web: reading the stream

**Decision**: a colocated hook, `features/similar/hooks/useNarrative.ts`, calls
`api.POST('/reports/similar/narrative', { body, parseAs: 'stream', signal })` from
`openapi-fetch`. The path, body and error types stay generated from the contract. On `error` it
behaves as today (`AI_NOT_CONFIGURED` disables the button; anything else shows the failure
notice). On `data` it reads the `ReadableStream` through `TextDecoderStream` with a small
`parseSse` function in `shared/lib/sse.ts`: split on blank lines, read `event:` and `data:`, and
`JSON.parse` the data, typed as the generated `NarrativeDeltaEvent` / `NarrativeEndEvent`. The
hook exposes `{ status, text, reason, correlationId, coolingDown, start(range), stop(),
clear() }`. `stop()`, `clear()` and unmount abort the controller; `start` aborts any previous one
first. `correlationId` is read from the response's `X-Correlation-Id` header, which CORS already
exposes. When the stream ends, `coolingDown` is true for 5 s (one `setTimeout`, cleared on
unmount), and a counter that ticks each second drives the countdown label.

**Rationale**: openapi-fetch 0.17 supports `parseAs: 'stream'`, so no second HTTP client is
needed. The server writes JSON on one line, so the SSE parser needs only the two fields it
emits.

**Alternatives considered**: `eventsource-parser`, a dependency for about 15 lines. A hand-built
`fetch` loses the generated types.

## R-010 Button, status and announcements

**Decision** (spec FR-005 to FR-007a, as clarified 2026-09-24):

- **Summary button while streaming** (from the request until the end, including before the
  first text): disabled, a spinner and the label "Summarizing…". Under
  `prefers-reduced-motion` the spinner is static. "Stop" sits next to it and exists only in this
  state.
- **Summary button after an ending**: "✦ Regenerate", disabled for 5 s with "✦ Regenerate (4)"
  style countdown and a hint next to it, "Available again in a few seconds." After a pre-text
  failure the button is "✦ Summarize with AI" at once, and the failure notice keeps its
  Try again.
- **Focus**: when Stop unmounts while it holds focus, focus moves to the summary button (checked
  with `document.activeElement` before the state change).
- **Stopped**: the text stays, followed by "Stopped." in secondary text. Stop before any text
  leaves nothing on screen.
- **Incomplete notice**: a warning banner under the text with "The summary is incomplete.", a
  reason line ("The AI provider failed.", "The AI provider stopped answering.", "The summary hit
  its length limit.", "The connection was lost.") and the correlation id with Copy ID, the same
  pattern as the existing failure notice. "Regenerate" is the action.
- **Announcements**: the narrative card carries `aria-busy` while streaming and is not a live
  region. One visually hidden `role="status"` element reads "Generating summary…", then exactly
  one of "Summary complete.", "Summary stopped." or "Summary incomplete.". A pre-text failure
  empties it, and the existing `role="alert"` notice speaks.
- **New range**: generating a report calls `clear()`: abort, empty text, status `idle`.

**Rationale**: disabling the button is the only guard against duplicate requests (SC-004), and
the cooldown covers SC-007; no locking is needed. The one-status pattern gives screen readers two
announcements, not one per token. The cooldown lives in the web only (Complexity Tracking).

**Alternatives considered**: a live region over the text, which the clarification rejected.

## R-011 Tests

**Decision**:

- **API unit** (`ai.service.spec.ts`, rewritten): `global.fetch` stubbed with a `Response`
  whose body is an SSE `ReadableStream`. Covered: deltas in order; `end_turn`, `max_tokens` and
  other stop reasons mapped; empty answer → `AiProviderError`; 429 → `AiRateLimitedError`; 500
  → `AiProviderError`; silence before text → `AiTimeoutError`; silence after text → `incomplete`
  / `timeout`; abort from outside → no further events; `maxRetries: 0` (one fetch call);
  request body (model, `max_tokens` 512, system prompt, key and version headers);
  `forPrompt` (every stripped mark, line breaks, collapsed whitespace, figures untouched) and
  that the group descriptions in the request body are stripped; whitespace-only text is not
  text.
- **API e2e** (`ai-narrative.e2e-spec.ts`, rewritten, FR-012): the existing `node:http` stub
  answers in the provider's SSE format, with modes `ok`, `gated`, `mid-error`, `mid-hang`,
  `length`, `empty`, `error`, `rate-limited` and `hang`. The app listens on an ephemeral port
  and the test uses `fetch` with a body reader, so it can see events arrive and abort mid-way.
  - `gated`: the stub holds its second delta until the test has received the first, proving
    pieces are forwarded before the provider finishes. The test also asserts each delta arrives
    within 500 ms of the stub writing it, and `end` within 500 ms of the stub finishing (SC-001,
    SC-005).
  - Cancel: the test aborts after the first delta, and the stub's request `close` fires within
    1 s.
  - Every `data` is validated against `NarrativeDeltaEvent` / `NarrativeEndEvent` with the
    existing `expectValid`.
  - The pre-text cases keep their status and error-shape assertions.
  - `length` ends `incomplete` / `length`; `empty` answers 502; a refusal stop after text ends
    `incomplete` / `provider_error`.
  - The server log line of FR-014a is asserted for one complete, one incomplete and one
    client-closed stream.
- **Web**: `sse.test.ts` (split across chunk boundaries, multiple events per chunk); the
  `useNarrative` behaviour through `SimilarPage.test.tsx`. For that, `test-api-stub.ts` gains
  one branch: a handler may return a `Response`, which is passed through, so the tests control a
  `ReadableStream`. Cases: progressive text, markdown formatting, raw HTML inert, Stop, the
  incomplete notice (reason line and correlation id) on `end`/`incomplete` and on a body without
  `end`, Stop before any text, focus moving from Stop to the summary button, button states, the
  5 s cooldown (fake timers), status announcements, a link showing its label only, an image its
  alt text, and a new range clearing the text.
- **Browser e2e**: `story-6-similar.spec.ts` keeps its no-key case; no live-provider test (spec
  Assumptions).

**Rationale**: FR-012 is the proof of the integration. The gated mode turns "forwarded
progressively" into an assertion instead of a timing guess.
