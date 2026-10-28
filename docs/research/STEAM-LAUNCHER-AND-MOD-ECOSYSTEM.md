# STEAM LAUNCHER AND MOD ECOSYSTEM

**Document ID:** STEAM-LAUNCHER-AND-MOD-ECOSYSTEM-001  
**Status:** Research & Extension Plan  
**Date:** 2026-10-27  
**Author:** Principal Software Architect - The Rev Research

---

## Executive Summary

The Rev already has a working game launcher foundation (Steam on Windows). This needs to be extended to coordinate Rev AI startup, mod activation, and game bridge setup. Mod ecosystem design is split between prototype (private registry) and full marketplace (future).

---

## 1. Current Launcher State (Verified)

### Implemented Components
- **GameLibraryService.cjs** - Discovery, caching, profiles
- **SteamLaunchProvider.cjs** - Registry/VDF parsing, steam://rungameid launch
- **GameSessionOrchestrator.cjs** - Session lifecycle
- **GameProfileStore.cjs** - Local JSON persistence
- **Frontend UI** - Games tab

### Capabilities
- Steam discovery on Windows (primary + secondary libraries)
- Custom Steam root override
- Launch via Steam URI (respects Steam auth/DRM)
- Session tracking
- Profiles (favorites, notes)
- Prevents duplicate launches

### Limitations (by design)
- AI integrations disabled (line 60-67 in orchestrator)
- No mod management
- No bridge coordination
- No Rev AI startup
- Windows only for Steam discovery
- No standalone launcher support yet

---

## 2. Extending for Rev AI Gaming

### 2.1 Session Orchestration Changes

**Current flow:**
```
preparing → launching → launch-requested → ended/failed
```

**Extended flow:**
```
preparing → ai-starting → mods-activating → bridge-preparing → launching → launch-requested → ended/failed
```

**New responsibilities:**
1. Check if game has Rev AI integration enabled
2. Start Rev AI Runtime if not running
3. Load and activate compatible mods
4. Start Rev Game Bridge Host
5. Generate bridge connection info (port/token)
6. Pass connection info to game (env vars or config file)
7. Wait for bridge connection (with timeout)
8. Launch game
9. Monitor bridge connection
10. Cleanup on end

### 2.2 Rev AI Runtime Coordination
- **Singleton service** - One Rev AI instance can serve multiple games? Or per session?
- **Recommendation:** Single shared Rev AI Runtime, manages model lifecycle
- **Start on demand** - Start when first game with AI enabled launches
- **Keep running** - Don't stop immediately when game ends (user might launch another)
- **Resource management** - Unload models if no active sessions and idle
- **Configuration** - Use existing provider config but hide UI

### 2.3 Bridge Setup
- **Port allocation** - Find available port or use fixed range
- **Authentication token** - Generate per session, pass to game
- **Connection waiting** - Poll/wait for game to connect within timeout (e.g., 30s)
- **Fallback** - If bridge doesn't connect, warn but allow game launch? Or block?
- **Recommendation:** For AI-enabled games, require bridge connection; for others, proceed without

### 2.4 Mod Activation
- **Mod discovery** - Scan game mod directories or use mod manager integration
- **Manifest validation** - Check Rev compatibility
- **Dependency resolution** - Simple for prototype
- **Load order** - Respect order
- **Activation** - Mark active for this session

---

## 3. Steam Integration Details

### Steamworks Considerations
- **Steam ownership checks** - Must respect, can't bypass
- **DRM** - Steam handles
- **Launch options** - Can pass command line args? Need to check
- **steam://rungameid/** - Current approach uses this, Steam handles everything
- **Mod installation** - Different from Steam Workshop items

**Important:** The Rev must NOT redistribute game binaries, bypass ownership checks, alter protected executables, or install unauthorized modifications.

**Separation of concerns:**
- **Game launching** = Using Steam's mechanisms (steam:// protocol)
- **Mod distribution** = Separate Rev mod system, installs to appropriate locations
- **Mod activation** = Tell game/mods via bridge or config files

### Passing Bridge Info to Game
Since using steam://rungameid/, can't easily pass custom command line args. Options:
1. **Environment variables** - Set before launching? Steam may not inherit
2. **Config file** - Write to known location (e.g., %APPDATA%/RevGameBridge/session.json)
3. **Named pipe/socket discovery** - Game connects and Rev tells it session info
4. **Mod reads from Rev's local API** - Game mod queries Rev for session info

**Recommendation:** Write session config file that Rev-compatible mods read. Also support environment variables as fallback.

---

## 4. Mod Ecosystem Architecture

### 4.1 Mod Manifest Format
```json
{
  "manifestVersion": "1.0",
  "id": "com.example.historical-ai-mod",
  "name": "Historical AI Characters",
  "version": "1.0.0",
  "description": "...",
  "author": { "name": "...", "id": "..." },
  "game": {
    "id": "historicalparadoxdei",
    "versions": ["*"] 
  },
  "rev": {
    "minSdkVersion": "1.0.0",
    "capabilities": ["characters.dialogue"],
    "permissions": ["read.world_state", "execute.dialogue"]
  },
  "dependencies": [],
  "files": [...],
  "checksum": "sha256:...",
  "signature": "..." 
}
```

### 4.2 Mod Package Structure
```
mod-rev-package.zip
├── manifest.json
├── mod/
│   ├── (mod files for game)
└── rev-bridge/
    └── (bridge integration files if needed)
```

### 4.3 Installation Flow
1. **Download** package from registry
2. **Validate** manifest, checksums
3. **Check dependencies**
4. **Check game compatibility**
5. **Install to mod directory** (game-specific location or managed location)
6. **Register in library**
7. **Enable/disable** as needed

### 4.4 Local vs Remote Registry
| Aspect | Private Registry (Prototype) | Public Marketplace (Future) |
|--------|-------------------------------|----------------------------|
| **Hosting** | Local file system or simple HTTP server | Cloud infrastructure |
| **Auth** | None or simple | Creator accounts, auth system |
| **Publishing** | Manual file copy | Web UI, upload, review |
| **Moderation** | None needed | Content moderation, security review |
| **Payments** | None | Payment processing (complex) |
| **Discovery** | Browse local folder | Search, ratings, recommendations |
| **Updates** | Manual | Auto-update system |
| **Signing** | Optional | Required for verification |
| **Complexity** | Low | Very high |
| **Timeline** | Phase 5 early | Much later |

**Recommendation:** Start with **private registry** for prototype/testing. Only build public marketplace if there's demand and resources.

---

## 5. Integration with Existing Infrastructure

### Reusable Components
| Component | Usage |
|-----------|-------|
| **GameLibraryService** | Extend to track mods |
| **GameSessionOrchestrator** | Add AI/bridge/mod coordination |
| **AIPermissionService** | Extend for mod/game permissions |
| **adapterFactory/SmartFallbackService** | Route game AI requests |
| **ErrorHandler** | Handle mod/bridge errors |
| **Electron IPC** | Mod management UI |

### New Components Needed
- **RevAIRuntime** service
- **RevGameBridgeHost** service
- **ModManager** service
- **ModValidator** service
- **ModRegistry** (local first)

---

## 6. Security Considerations

### Mod Security
- **Sandboxing** - Mods can't access Rev's internal APIs
- **Capability restrictions** - Only granted capabilities
- **File system** - Mods can only write to game mod directories or designated locations
- **Network** - Bridge is localhost only
- **Validation** - Manifest schema validation
- **Signing** (future) - Verify publisher identity

### Process Isolation
- Game runs as separate process (Steam manages)
- Bridge runs in Rev process
- Rev AI runs as managed process
- No code injection into game process by Rev (mod does that in game-specific way)

---

## 7. Implementation Roadmap

### Immediate (Phase 1-2)
1. Extend GameSessionOrchestrator to support AI integration flag
2. Create RevAIRuntime wrapper around Ollama
3. Design and implement basic bridge host
4. Test with simple scenario

### Near-term (Phase 3)
1. Godot SDK
2. HistoricalParadoxDEI integration (read-only first)
3. Mod manifest format
4. Basic mod loading

### Mid-term (Phase 4-5)
1. Full session orchestration
2. Private mod registry
3. UI for mod management
4. Model management UI

### Long-term (Phase 6)
1. Public marketplace
2. More engine SDKs
3. Advanced features

---

## 8. Validation & Testing

### Manual Tests
1. Launch game without AI integration (existing flow still works)
2. Launch game with AI integration enabled
3. Rev AI starts automatically
4. Bridge connects
5. Mod loads
6. AI interaction works
7. Session cleanup works
8. Multiple launches work correctly

### Automated Tests
- Extend existing launcher tests
- Add bridge protocol tests
- Add mod validation tests

---

**Next Steps:** See [SECURITY-THREAT-MODEL.md](./SECURITY-THREAT-MODEL.md)
