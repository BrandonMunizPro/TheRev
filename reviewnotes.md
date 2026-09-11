# Review Notes — Technical Copilot Phase 3B (handoff before restart)

## Status
Phase 3B complete + verified. Backend restarted healthy on :4000 (404 on `/` is normal).
A stale node backend PID 14564 exists (owns no port) — harmless, kill if wanted.

## What got done this phase
- Bounded transcription queue (latency fix). Replaced unbounded FIFO in SegmentTranscriber.js:
  - `maxQueueDepth` (default 6), drop-oldest-keep-newest on overflow, in-flight never interrupted
  - Counters: `droppedCount`, `processedCount`, `queueDepth`
  - correlation IDs + per-segment timing (`queueWaitMs`, `whisperMs`, `totalLatencyMs`)
- TranscriptThrottle.js: passes `correlationId`, adds `throttleLatencyMs`
- CopilotListeningPipeline.js: `suppressUntil(t)` no-self-feedback guard (drops segments captured
  right after a cue renders) + `capturedAt` passthrough
- app.js: `pipeline.suppressUntil(Date.now()+1800)` before cue render; dev-only `[CopilotLatency]`
  trace (enable with `localStorage['copilot-debug']='1'`), `_lastCopilotEvent` captured
- TranscriptSession.ts: `closeSession` now DELETES from map; expiry cleanup deletes too (was: mark inactive)
- TechnicalCopilotService.ts: detect/classify/retrieve timing into diagnostics + `[CopilotLatency]` dev trace;
  `pruneStaleLifecycles()` in getStats
- PromptLifecycle.ts: instant-emit for strong complete prompts (confidence>=0.70 + `topic:` evidence +
  question/imperative boundary) — no more waiting 3 transcription rounds; 3x path kept for weaker prompts
- ConceptCatalog.ts: new topics/concepts:
  - `zero_downtime_migration` (+4: expand-contract migration, dual write & backfill, reversible migration, cutover strategy)
  - `overload_protection` (+3: request queue/buffering, reject under overload, cache-heavy reads for spikes)
  - `pagination` +total_count_tradeoff; `provider_failure` +timeout_budget
- ConceptRetriever.ts: ranking tie-break by text-hit density (answer anchors over topic echo)
- New tests:
  - `src/tests/copilot/SegmentTranscriberBackpressure.test.ts` (4 tests)
  - `src/tests/ai/Phase3BRegression.test.ts` (scenarios A-F + long-session + closed-session prune)
- `src/ai/technical-copilot/types.ts`: CopilotDiagnostics += detectMs/classifyMs/retrieveMs

## Verification
- `npx tsc --noEmit` — clean
- AI/copilot jest: **159/159 pass** (14 suites)
- `npm test`: 29/30 suites, 385/388 (the 3 failures are PRE-EXISTING `src/tests/dao/threads.dao.test.ts`)
- ESLint: TS changed files 0 errors; JS browser files show `no-undef` (document/window/fetch/console)
  — PRE-EXISTING config noise, identical on HEAD baseline (verified against git show HEAD)

## Commands
- Run AI/copilot tests:      `npx jest --testPathPatterns="ai|copilot"`
- Run all unit tests:        `npm test`   (integration suites require Docker; full jest aborts w/ that message — not a hang)
- Typecheck:                 `npx tsc --noEmit`
- Backend restart (Windows): kill ts-node on 4000, then
  `Start-Process cmd.exe -ArgumentList "/c","npm run start:dev" -WorkingDirectory "C:\Users\brand\TheRev" -RedirectStandardOutput "C:\Users\brand\AppData\Local\Temp\opencode\backend.out.log" -RedirectStandardError "C:\Users\brand\AppData\Local\Temp\opencode\backend.err.log" -WindowStyle Hidden`

## Key files
- src/electron/frontend/copilot/SegmentTranscriber.js   (latency fix)
- src/electron/frontend/copilot/CopilotListeningPipeline.js
- src/electron/frontend/copilot/TranscriptThrottle.js
- src/electron/frontend/app.js
- src/ai/technical-copilot/TranscriptSession.ts
- src/ai/technical-copilot/PromptLifecycle.ts
- src/ai/technical-copilot/ConceptCatalog.ts
- src/ai/technical-copilot/ConceptRetriever.ts
- src/ai/technical-copilot/TechnicalCopilotService.ts
- src/ai/technical-copilot/types.ts

## Config defaults (env-overridable, types.ts)
maxContextFragments=20, sessionTimeoutMs=600000, minConfidenceThreshold=0.4, maxConcepts=6,
promptStabilizationMs=2500, promptDedupeWindowMs=60000, emitConfidenceHigh=0.70,
emitConfidenceTopicBacked=0.55, detectorMinConfidence=0.55

## Possible next (unplanned, out of current scope)
- Stream Whisper batch API at stt-server layer (bigger transcriber change — spec says do NOT)
- Manual smoke test in the Electron app (live system-audio listening) after reboot