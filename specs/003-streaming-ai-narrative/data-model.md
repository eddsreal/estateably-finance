# Data model: Streaming AI narrative

Nothing is stored. There is no Prisma change and no migration. The entities below live only in
memory for the duration of one request (server) or one page visit (web).

## Narrative event (wire, server → browser)

Frozen in [`contracts/openapi-delta.yaml`](contracts/openapi-delta.yaml).

| Event   | `data` schema         | Fields                                                                                                     | Cardinality            |
| ------- | --------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------- |
| `delta` | `NarrativeDeltaEvent` | `text`: non-empty string                                                                                   | 0…n, in provider order |
| `end`   | `NarrativeEndEvent`   | `outcome`: `complete` \| `incomplete`; `reason` when incomplete: `provider_error` \| `timeout` \| `length` | exactly 1, always last |

Rules:

- `delta` events are written only after the first provider text arrives. Before that, failures
  are JSON errors with today's status codes (FR-002).
- In the web, a body that closes without `end` counts as `incomplete` (connection lost).

## Server-side narrative (inside `AiService.similarNarrative`)

An async generator of `{ type: 'delta'; text: string } | { type: 'end'; outcome; reason? }`,
driven by the SDK stream.

| State       | Enters when                       | Leaves to                                                                                                                                                                                                                 |
| ----------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `waiting`   | request accepted, provider called | `streaming` on the first text delta; throws `AiRateLimitedError`, `AiProviderError` (including an answer with no text) or `AiTimeoutError`; silent stop on abort                                                          |
| `streaming` | first text delta                  | `ended(complete)` on `end_turn`; `ended(incomplete, length)` on `max_tokens`; `ended(incomplete, provider_error)` on any other stop reason or SDK error; `ended(incomplete, timeout)` on inactivity; silent stop on abort |
| `ended`     | `end` event yielded               | —                                                                                                                                                                                                                         |

Inactivity timer: `LLM_TIMEOUT_MS`, armed when the provider is called and reset on each text
delta. Abort sources: the timer and the client disconnect, both through one `AbortController`
(research R-003, R-005).

## Client-side narrative (`useNarrative`, web)

| Field           | Type                                                                   | Notes                                                                          |
| --------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `status`        | `idle` \| `streaming` \| `complete` \| `stopped` \| `incomplete`       | `failed` pre-text errors stay in the page's existing `aiError`                 |
| `text`          | string                                                                 | concatenation of every `delta.text` received                                   |
| `reason`        | `provider_error` \| `timeout` \| `length` \| `connection` \| undefined | `connection` is client-only: the body ended without `end`                      |
| `correlationId` | string \| undefined                                                    | from the `X-Correlation-Id` response header; shown in the incomplete notice    |
| `coolingDown`   | boolean                                                                | true for 5 s after any ending; the summary button is disabled while it is true |

Transitions:

```text
idle ──start──▶ streaming ──end(complete)──────────────▶ complete
                   │      ──end(incomplete, reason)───▶ incomplete
                   │      ──body closed without end──▶ incomplete(connection)
                   │      ──stop()──────────────────▶ stopped (text kept; empty if stopped before any text)
                   │      ──clear() (new range) / unmount──▶ idle (text cleared)
                   └──pre-text error──▶ idle + page aiError (today's notice) or aiRejected
complete | stopped | incomplete ──(5 s cooldown)──start (Regenerate)──▶ streaming (text cleared)
complete | stopped | incomplete ──clear() (new range)──▶ idle (text cleared; cooldown still runs)
```

The summary button is disabled while `status === 'streaming'` or `coolingDown`. Only text
containing at least one non-whitespace character counts as text (spec FR-003); the server never
sends a `delta` without it.
