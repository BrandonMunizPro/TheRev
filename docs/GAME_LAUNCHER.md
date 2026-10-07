# TheRev launcher foundation

TheRev owns the library, game profiles, and TheRev session lifecycle. Steam is
the first launch provider. Discovery and launching require Windows in this slice.

## Use

Open **Games**, then **Refresh library**. Automatic discovery checks Steam's
Windows registry entries and standard installation locations. For a custom
installation, choose the Steam root containing `steam.exe` and `steamapps`.
**Use automatic discovery** clears the saved override. Secondary libraries come
from Steam's `libraryfolders.vdf`.

Launch an installed entry to request its normal Steam launch. Steam owns its
authentication, game launch settings, DRM, dependencies, and compatibility layer.
TheRev displays **Launch requested** and game running status **unknown**.
**End TheRev session** ends TheRev tracking; it does not close the game or stop
Ollama. One live TheRev session is allowed at a time in this foundation. Refresh
and profile editing remain available during a session.

Profiles currently contain favorites and personal notes (maximum 1,000 characters).
The active session keeps a snapshot of the profile selected at launch. Missing,
incomplete, or inaccessible installations remain in the library as unavailable,
preserving their IDs and profiles. Known Steam support packages are excluded;
other tools may appear because ACF manifests do not reliably identify app type.

The launcher itself does not require the backend or AI to launch games. The
existing app startup/login behavior is unchanged.

## Identity and responsibilities

- A **game library record** has an opaque persistent TheRev UUID. Its origin is
  independent of how it launches and whether it supports TheRev integration.
  This version creates only `origin: external` Steam entries. Future native or
  distributed records should retain an authoritative TheRev game identity across
  packages, versions, and launch methods, through a versioned schema migration.
- An **installation reference** belongs to a launch provider, e.g. `steam:730`.
  Discovery matches this reference exactly. Cross-store identity matching,
  creator distribution, and direct executable entries are not implemented.
- A **profile** is user configuration, separate from discovered metadata.
  It stores no credentials. `ai.enabled` is fixed to false in this version.
- A **launch provider** implements `discover(settings)` and
  `launch(installation, settings, { signal })`. It knows how to find and start
  software; it does not own AI or integration state.
- A **TheRev session** is owned by `GameSessionOrchestrator`, with states
  `preparing -> launching -> launch-requested -> ended` or `failed`.
  `running: unknown` and `integrationState: disabled` are distinct from launch
  state. A future active integration must not be inferred from a launch handoff.
  Failed launches release the live-session reservation for retry.
- A future **game integration adapter / SDK boundary** will allow supported
  games to establish an active TheRev session and request authorized capabilities.
  Game-specific external handoffs belong to those integrations, separate from the
  initial launch provider. No such adapter, SDK, game runtime, battle integration,
  marketplace, or distribution system is implemented here.

Integration preparation belongs in the orchestrator before the launch-provider
handoff. Later integrations can maintain session-owned context, connections, and
capability grants during a game session and dispose them on end or failure.
The desktop lifecycle should connect to a narrow authenticated backend service,
not import model adapters or start a second AI stack.

TheRev retains ownership of provider configuration, credentials, model routing,
health, fallback policy, and permissions. Future games receive capability-scoped,
session-bound access, never provider credentials or raw provider internals. The
existing backend `adapterFactory`, `SmartFallbackService`, provider adapters,
and Ollama startup/repair paths remain the reuse points. Provider-specific model
preferences should be per-request overrides rather than global reconfiguration.
Local-only, cost, permissions, and model availability need enforcement before
enabling any game integration. The browser-command endpoint is not a game API.

Frontend AI Settings and backend configuration currently are not fully
synchronized; Ollama configuration naming/validation also needs a focused fix
before a game AI boundary can depend on it. No changes to those systems are made
in this slice. Additional providers can join the existing AI infrastructure rather
than extending launch providers.

## Files and data flow

`frontend/launcher/GameLibrary.js -> preload.cjs -> registerLauncherIPC.cjs`
connects the UI to the library and session services. The IPC handlers validate the
specific main window, its top-level frame, and its local index document because
the existing preload is also used by browser windows.

`GameLibraryService` serializes refreshes and edits; discovery is lazy and cached
until explicit refresh. `GameProfileStore` persists schema version 1 to
`app.getPath('userData')/game-library.json` through atomic replacement.
Invalid/newer-version files are preserved and reported as errors, not overwritten.
Data is local to the OS/Electron profile, not synchronized with TheRev accounts.
Only the Steam folder override is editable through a native picker; the renderer
cannot submit arbitrary launch paths, URIs, or shell commands.

`SteamLaunchProvider` reads bounded VDF/ACF metadata asynchronously, validates
manifest identities and installation-directory containment, and re-discovers the
selected entry before constructing a fixed Steam launch URI. Unreadable libraries
and bad manifests produce partial discovery warnings. Installation folders are
not recursively searched for executables. A session cancellation prevents a pending
handoff when possible; an already requested external launch cannot be undone.

Session state is in memory, survives navigation/reload, and ends when TheRev quits.
It is not restored after app restart. Ending a future integration must release only
session-owned resources, not shared providers, models, or unrelated app sessions.

## Validation

Run launcher unit tests:

```powershell
npx jest --selectProjects "Unit Tests" --testPathPatterns=src/tests/launcher --testPathIgnorePatterns=integration --runInBand
```

The isolated UI check uses a mocked launcher and an installed Playwright Chromium:

```powershell
node scripts/check-game-library-ui.cjs
```

These tests use temporary Steam fixtures and mocked shell/registry calls; they
never launch a real game. Database integration suites remain Docker-only.

Manual Windows smoke checks:

1. Discover games in primary and secondary Steam libraries.
2. Choose a custom Steam folder; cancel the picker and reset to automatic discovery.
3. Save notes/favorites, refresh, restart, and confirm profiles remain.
4. Launch a game with Steam open and closed. Confirm launch-requested status,
   prevent duplicate launch, end the TheRev session, and launch again.
5. Remove/unmount an installation and refresh; confirm it becomes unavailable.
6. Confirm Games navigation, profile edits, and session events persist across tabs,
   and existing avatar, browser, social, and Copilot flows still work.

macOS/Linux display an unsupported discovery state. Future platform roots and
additional stores belong in providers; process supervision and active integration
support need separate implementation and validation.
