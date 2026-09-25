# Feature Specification: Streaming AI narrative

**Feature Branch**: `003-streaming-ai-narrative`

**Created**: 2026-09-24

**Status**: Draft

**Input**: User description (translated from Spanish): "@anthropic-ai/sdk — what I would add on
top, in order of value/effort: a cancel button wired to the stream's AbortController; progressive
Markdown rendering (bold on the most expensive, one list item per group); button state (disabled
with a spinner while streaming, 'Regenerate' when done); a graceful partial timeout (keep the text
already received with an 'incomplete response' notice); a low max_tokens and a prompt using the
challenge's words ('group similar, highlight the most expensive'); an e2e test against the
LLM_BASE_URL stub emitting SSE that checks the endpoint forwards the chunks."

## Overview

Feature 001 delivered the optional AI narrative (FR-015): on the similar-transactions report, a
button sends the grouped report to the LLM provider and shows a short plain-text summary. Today the
summary arrives all at once, after the whole answer is ready, and any failure discards it.

**Terms**: "narrative" and "summary" name the same thing, the AI-written text. "Report" always
means the deterministic grouped report of feature 001.

This feature makes the narrative arrive progressively. The owner sees the summary being written,
can stop it, and keeps whatever already arrived if the provider fails part-way. The summary
becomes short and structured (one item per group, the most expensive one emphasised) instead
of two or three plain sentences. The provider integration moves to the provider's official client
library, which the user named as the input of this feature.

The deterministic grouped report (FR-014) is untouched. No money rule changes: the narrative is
presentation text and never writes to the ledger.

## Clarifications

### Session 2026-09-24

- Q: Should a summary that keeps producing text also have an overall time limit, on top of the
  limit on silence between pieces? → A: No. `LLM_TIMEOUT_MS` bounds only the wait for the first
  piece and each gap between pieces; the output length cap bounds the total duration.
- Q: How should the narrative be announced to a screen reader while text arrives? → A: Only at
  the end. While it is written, a single "Generating summary…" status is announced; when it ends,
  its final state (complete, stopped or incomplete) is announced and the full text is readable.
  Individual pieces are not announced.
- Q: Is the current one-shot JSON narrative endpoint replaced by the streaming version, or do both
  exist? → A: Replaced. Same path and request body; the success response becomes a stream and the
  one-shot JSON response is removed.
- Q: How many list items does the summary have when the report has many groups? → A: One per
  group, largest first, at most 10, then one line saying how many smaller groups were left out.
- Q: What happens to text already received when a report for another range is generated while
  the summary is being written? → A: The summary stops and its text is cleared, since it
  describes another range.
- Q: What does the incomplete notice show? → A: "The summary is incomplete.", a short line naming
  the reason (provider error, no answer in time, length limit, connection lost) and the
  correlation id with a Copy ID action, like the existing failure notice.
- Q: Where does keyboard focus go when Stop disappears? → A: If focus was on Stop, it moves to the
  summary button (now "Regenerate"); otherwise it does not move.
- Q: What does a link, image or raw HTML in the answer show? → A: A link shows its label only, as
  plain text, with no URL; an image shows its alternative text; raw HTML is shown escaped.
- Q: How is text injected through transaction descriptions handled? → A: Before the grouped data
  is sent to the provider, the descriptions are stripped of Markdown and HTML marks
  (``* _ ` # < > [ ] ( ) ! | ~``) and line breaks, and whitespace is collapsed. Only the copy
  sent to the provider changes; stored descriptions, the report and the figures do not.
- Q: Is the number of regenerations limited? → A: After every summary that ends (complete,
  stopped or incomplete), the summary button stays disabled for 5 seconds, with a visible
  countdown and its reason next to it.
- Q: How are the timing criteria measured when they depend on the provider's speed? → A:
  Relative to the provider, against the stub: each piece is on screen within 500 ms of the
  provider emitting it, and the ending within 500 ms of the provider finishing. Absolute seconds
  with the live provider are a reference, not a criterion.
- Q: What counts as text, when does the inactivity limit start, and can the owner stop before
  the first text? → A: Text is at least one non-whitespace character; an answer with none is
  empty (`AI_PROVIDER_ERROR`). The limit starts when the provider is called. Stop is available
  from the moment the summary is requested; stopping before any text leaves no text and no
  notice.
- Q: Which interface and logging details apply? → A: Stop sits next to the summary button and
  exists only while a summary is being written. After a failure before any text, the button reads
  "✦ Summarize with AI" again. With reduced motion the busy indicator does not spin and the label
  "Summarizing…" remains. A failure before any text is announced only by the existing alert, and
  the "Generating summary…" status is cleared. Every summary leaves one log line with its ending
  and its correlation id.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Watch the summary arrive as it is written (Priority: P1)

The owner generates the similar-transactions report and asks for the AI summary. Text starts
appearing as soon as the provider produces it and keeps growing until the summary is complete, instead of a
blank wait followed by the whole answer.

**Why this priority**: it is the core of the feature. Every other story (stop, keep partial text,
structured output) depends on the summary arriving in pieces.

**Independent Test**: with the provider replaced by a stub that sends its answer in several
pieces with a delay between them, request the summary and observe the visible text grow piece by
piece, in order, until it matches the full answer.

**Acceptance Scenarios**:

1. **Given** a generated report and a configured provider, **When** the owner asks for the
   summary, **Then** the first words appear before the provider has finished answering, and the
   text grows in the order the provider sent it.
2. **Given** a summary is being written, **When** the provider finishes, **Then** the displayed
   text equals the full answer, with nothing duplicated or missing.
3. **Given** no provider key is configured, **When** the owner views the report, **Then** the
   summary action stays disabled with its current explanation, exactly as today.
4. **Given** the provider refuses the request before sending any text (rate limit, provider
   error, or no answer within the timeout), **When** the owner asks for the summary, **Then** the
   same failure notice as today appears, with the same distinguishing error codes, and the report
   stays on screen.

---

### User Story 2 - Structured summary that highlights the most expensive group (Priority: P1)

The summary is short and structured: one list item per group of similar transactions (at most
10, largest first), with the most expensive group emphasised. Formatting (emphasis, list items) is rendered as it arrives,
not shown as raw markup.

**Why this priority**: it is what makes the progressive text readable and useful; a stream of
raw markup characters would look broken.

**Independent Test**: with the stub sending a structured answer split mid-formatting (e.g. the
emphasis marker in one piece and the words in the next), the page shows a list and emphasised
text, never raw formatting characters once the piece that closes them has arrived.

**Acceptance Scenarios**:

1. **Given** a report with several groups, **When** the summary completes, **Then** it contains
   one list item per group, largest first, at most 10, followed by one line with the number of
   groups left out when there are more than 10, and the most expensive group is visually
   emphasised.
2. **Given** a piece of the answer opens a formatting mark that a later piece closes, **When**
   the later piece arrives, **Then** the text is shown formatted, not with the raw marks.
3. **Given** the provider's answer contains markup that could run code or load content (scripts,
   raw HTML, images, links to external pages), **When** it is displayed, **Then** nothing
   executes or loads: a link shows its label only, an image its alternative text, and raw HTML
   appears escaped.

---

### User Story 3 - Stop a summary in progress (Priority: P2)

While the summary is being written, a Stop control is available. Pressing it ends the summary
immediately, keeps the text already shown, and ends the request to the provider so it stops
producing (and billing) the rest.

**Why this priority**: it gives the owner control over a slow or unwanted answer and ends
provider work that nobody will read.

**Independent Test**: with the stub sending pieces slowly, start a summary, press Stop after the
first piece, and check that the text stops growing, the text already shown remains, and the stub
sees its connection closed.

**Acceptance Scenarios**:

1. **Given** a summary is being written, **When** the owner presses Stop, **Then** no more text is
   added, the text already shown remains, and it is labelled as stopped.
2. **Given** the owner pressed Stop, **When** the system handles it, **Then** the request to the
   provider is ended within 1 second.
3. **Given** a summary is being written, **When** the owner generates a report for a different
   range, **Then** the summary stops, the provider request is ended, and its text is cleared.
4. **Given** a summary is being written, **When** the owner leaves the page, **Then** the provider
   request is ended.
5. **Given** keyboard focus is on Stop, **When** Stop disappears (pressed, or the summary ended),
   **Then** focus moves to the summary button.
6. **Given** a summary was requested and no text has arrived yet, **When** the owner presses
   Stop, **Then** the provider request is ended and no text or notice is shown.

---

### User Story 4 - Keep partial text when the provider fails part-way (Priority: P2)

If the provider fails or goes silent after some text has already arrived, the text stays on
screen with a visible "The summary is incomplete." notice naming the reason, instead of being
replaced by an error.

**Why this priority**: part of a summary is more useful than none, and it is the graceful failure
mode that streaming makes possible.

**Independent Test**: with the stub sending two pieces and then an error (or then going silent
past the timeout), request the summary and check that both pieces stay visible with the
incomplete notice.

**Acceptance Scenarios**:

1. **Given** some text has arrived, **When** the provider sends an error, **Then** the text stays
   visible with a notice that the response is incomplete, and the owner can regenerate.
2. **Given** some text has arrived, **When** no further text arrives within the configured
   timeout, **Then** the summary ends with the same incomplete notice and the provider request is
   ended.
3. **Given** a summary ended incomplete, **When** the owner looks at the grouped report, **Then**
   the report is unchanged.

---

### User Story 5 - One summary at a time, then Regenerate (Priority: P3)

While a summary is being written the summary button is disabled and shows a busy indicator, so a
second request cannot start. When the summary ends (complete, stopped or incomplete) the button
reads "Regenerate", stays disabled for 5 seconds with a countdown, and then starting it replaces
the previous summary.

**Why this priority**: it prevents duplicate provider calls and makes the next action obvious,
with no extra behaviour beyond the button's state.

**Independent Test**: start a summary, try to activate the button again while it streams (it is
disabled), wait for the end, and check that the button now reads "Regenerate" and that pressing it
clears the old text and streams a new one.

**Acceptance Scenarios**:

1. **Given** a summary is being written, **When** the owner tries to request another, **Then** the
   button is disabled, shows a busy indicator, and only one provider request exists.
2. **Given** a summary has ended in any way, **When** the owner views the button, **Then** it reads
   "Regenerate" and is disabled for 5 seconds, showing the seconds left and the reason next to it.
3. **Given** a previous summary is shown and 5 seconds have passed, **When** the owner presses
   Regenerate, **Then** the old text is cleared and the new summary streams in its place.
4. **Given** a summary failed before any text, **When** the owner views the button, **Then** it
   reads "✦ Summarize with AI" and is enabled; the failure notice's Try again is also available.

---

### Edge Cases

- **Provider returns an empty answer** (no non-whitespace character): treated as a provider error
  before any text (today's `AI_PROVIDER_ERROR` behaviour), not as a complete empty summary.
- **Provider stops for a reason other than finishing or the length cap** (e.g. it declines):
  after some text, the summary ends incomplete with reason "provider error"; before any text, it
  is an empty answer.
- **Connection between browser and API drops mid-summary**: the received text stays with the
  incomplete notice, reason "connection lost".
- **Owner closes the tab or navigates away**: the provider request is ended; nothing is stored.
- **Answer reaches the length limit**: the limit is set so a normal report fits (see
  Assumptions). If it is still reached, the summary ends as incomplete so the owner is not misled
  into thinking a cut-off list is the whole report.
- **A formatting mark is still open**: while the summary is being written, the mark shows as
  plain characters until the piece that closes it arrives. If the answer ends with it still open,
  it stays as plain text.
- **Transaction descriptions contain Markdown, HTML or instructions**: they are stripped of
  marks before reaching the provider (Clarifications), and anything the provider still writes is
  rendered under FR-009.
- **Report range changes while the button is in Regenerate state**: the old summary is cleared,
  since it describes a different range (today's behaviour on generate).
- **Key removed while the server runs**: the next request answers "not configured" as today.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST deliver the narrative to the browser progressively, forwarding each
  piece of text as the provider produces it, in the order produced, without waiting for the full
  answer.
- **FR-002**: Failures that happen before any text has been sent MUST keep today's FR-015
  behaviour of feature 001: the structured error shape, the same codes (`AI_NOT_CONFIGURED`,
  `AI_RATE_LIMITED`, `AI_PROVIDER_ERROR`, `AI_TIMEOUT`) and the same failure notice in the UI.
- **FR-003**: Failures that happen after some text has been sent MUST end the narrative with an
  explicit "incomplete" signal carrying its reason, which the browser can tell apart from a normal
  completion and which is always the last thing sent. The UI MUST keep the received text and show
  the notice "The summary is incomplete.", one line naming the reason (provider error, no answer
  in time, length limit, connection lost) and the correlation id with a Copy ID action. "Text"
  means at least one non-whitespace character.
- **FR-004**: The provider timeout (`LLM_TIMEOUT_MS`, default 10000) MUST bound the wait for the
  first piece of text, counted from the provider call, and the wait between any two consecutive
  pieces. When it elapses before the
  first piece, FR-002 applies (`AI_TIMEOUT`); after it, FR-003 applies. There is no overall time
  limit on a narrative that keeps producing text; the output length cap (FR-010) bounds it.
- **FR-005**: The UI MUST show a Stop control next to the summary button from the moment a
  narrative is requested until it ends, and only then. Stopping MUST keep the received text, label
  it "Stopped.", and end the provider request within 1 second. Stopping before any text leaves no
  text and no notice. When Stop disappears while it has keyboard focus, focus MUST move to the
  summary button.
- **FR-006**: Generating a report for another range while a narrative is being written MUST end
  the provider request as in FR-005 and clear the narrative's text. Leaving the page MUST end the
  provider request.
- **FR-007**: While a narrative is being written, the summary button MUST be disabled and show a
  busy indicator with the label "Summarizing…"; with reduced motion the indicator does not move.
  Once it ends (complete, stopped or incomplete) the button MUST read "✦ Regenerate" and stay
  disabled for 5 seconds, showing the seconds left and, next to it, the reason; after that, using
  it MUST clear the previous text and request a new narrative. After a failure before any text,
  the button MUST read "✦ Summarize with AI" and be enabled at once.
- **FR-007a**: Assistive technology MUST hear "Generating summary…" once when a narrative starts
  and exactly one of "Summary complete.", "Summary stopped." or "Summary incomplete." when it
  ends. Individual pieces of text MUST NOT be announced as they arrive. A failure before any text
  is announced only by the existing failure alert, and the "Generating summary…" status is
  cleared.
- **FR-008**: The narrative MUST be short and structured: one list item per group of similar
  transactions, largest first, at most 10, then one line with the number of groups left out when
  there are more, with the most expensive group emphasised. The instructions sent to the provider
  MUST ask it to group similar transactions and highlight the most expensive, using only the
  figures given (the existing rule against computing amounts stays).
- **FR-008a**: Before the grouped data is sent to the provider, each transaction description MUST
  be stripped of the marks ``* _ ` # < > [ ] ( ) ! | ~`` and of line breaks, with whitespace
  collapsed. Stored descriptions, the report and every figure MUST be unchanged.
- **FR-009**: The UI MUST render the narrative's formatting (emphasis and lists) progressively
  as it arrives, and MUST treat every other construct as inert text: a heading shows as plain
  text, a link shows its label only with no URL and no link, an image shows its alternative text,
  and raw HTML (including scripts) appears escaped. Nothing in the narrative may execute code or
  load content _(amended 2026-09-24 during planning: headings dropped, since the prompt never
  asks for them)_.
- **FR-010**: The provider answer MUST be capped at a low output length so a typical report
  (up to 10 groups) completes, and cost and latency stay bounded. Reaching the cap MUST be
  reported as incomplete (FR-003).
- **FR-011**: The provider MUST be called at most once per narrative request and never retried,
  as in feature 001.
- **FR-012**: The API end-to-end suite MUST cover, against a local stub at `LLM_BASE_URL` that
  answers in the provider's streaming format: pieces forwarded in order and completely; the first
  piece reaching the client while the stub still holds back the rest of its answer; a failure
  after the first piece ending as incomplete; silence past the timeout after the first piece
  ending as incomplete; the length cap ending as incomplete; an empty answer; each pre-text
  failure code of FR-002; and the stub's connection being closed when the client stops.
- **FR-013**: No new environment variable is introduced. `LLM_API_KEY`, `LLM_TIMEOUT_MS` and
  `LLM_BASE_URL` keep their meaning and defaults, and `LLM_BASE_URL` MUST still redirect every
  provider call so the stub in FR-012 works.
- **FR-014**: A narrative failure of any kind MUST NOT affect the grouped report or any other
  endpoint, as in feature 001.
- **FR-014a**: Every narrative MUST leave one server log line with its correlation id and its
  ending (complete, incomplete with its reason, or ended by the client), because the request
  itself reports success once text has flowed.

### Key Entities

- **Narrative stream**: the progressive answer for one report range. It has an ordered sequence
  of text pieces and exactly one ending: complete, stopped (by the owner) or incomplete (with the
  reason: provider error, timeout, length cap, or connection lost as seen by the browser). It is
  never stored.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Measured against the stub, each piece of text is on screen within 500 ms of the
  provider emitting it, in every run of the suite. As a reference only, with the live provider the
  first words usually appear within 3 seconds.
- **SC-002**: After pressing Stop, the text stops growing within 1 second and the provider request
  is ended within 1 second.
- **SC-003**: In 100% of part-way failures exercised by the end-to-end suite, all text received
  before the failure remains visible with the incomplete notice.
- **SC-004**: Repeated presses of the summary button while a summary is being written produce
  exactly one provider request.
- **SC-005**: Measured against the stub, the ending (complete or incomplete) is shown within
  500 ms of the provider finishing or failing. As a reference only, with the live provider a
  10-group summary usually completes within 10 seconds.
- **SC-006**: No formatting characters from the provider's markup remain visible in a completed
  summary whose markup is well formed, meaning every emphasis mark is closed and every list item
  starts on its own line.
- **SC-007**: A second summary cannot start within 5 seconds of the previous one ending.

## Assumptions

- **Official client library**: the provider call moves from a hand-written HTTP request to the
  provider's official client library, as the input names. This is a new runtime dependency; the
  plan records the reason, as the constitution requires. The library must honour `LLM_BASE_URL`.
- **Premise correction**: the input says the stream "already uses" a cancellation handle. Today
  the call is not streamed; its cancellation handle only enforces the timeout. Streaming and the
  owner-driven stop are both new in this feature.
- **Plain-text rule reversed**: feature 001 asks the provider for plain text and strips Markdown.
  This feature deliberately asks for lightweight Markdown and renders it; the plain-text step is
  removed.
- **Contract change**: the narrative endpoint's success response changes from one JSON body to a
  progressive stream. It keeps its path and request body, and the one-shot JSON response is
  removed rather than kept alongside; the web app is its only client. The new response is
  described in this feature's plan and frozen there before implementation (Principle IV).
- **Length cap**: the output cap stays low, of the order of today's (300 tokens), tuned in the
  plan so FR-010's 10-group report fits.
- **Data sent to the provider**: the same grouped data as feature 001 (period, per-group
  description, count and total in cents, the most expensive group), with descriptions stripped
  as in FR-008a. No account names, ids or other transactions' details are added.
- **Amounts in the narrative**: the provider keeps converting cents to dollars in its prose, as
  today. The narrative is presentation text; it is never parsed back into amounts.
- **Stopped and incomplete summaries are not stored**: nothing about narratives is persisted, as
  today.
- **Browser end-to-end**: the browser suite keeps skipping the live narrative when a real key is
  configured; the streaming integration is proven by the API end-to-end suite (FR-012) and the
  web component tests.
