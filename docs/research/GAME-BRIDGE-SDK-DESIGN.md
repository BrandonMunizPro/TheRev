# GAME BRIDGE SDK DESIGN

**Document ID:** GAME-BRIDGE-SDK-DESIGN-001  
**Status:** Design Specification  
**Date:** 2026-10-27  
**Author:** Principal Software Architect - The Rev Research

---

## Executive Summary

The Rev Game Bridge is a standardized, versioned protocol enabling games and mods to integrate with Rev AI safely and securely. The game remains authoritative; all AI actions must be validated and executed by the game through explicit capabilities.

**Core Principle:** "Capability-scoped, game-authoritative, opt-in integration"

---

## 1. Design Goals

- **Standardized** - One protocol for all engines (Godot priority)
- **Secure** - Capability-scoped permissions, validation, no OS/game arbitrary access
- **Authoritative** - Game validates and executes all actions
- **Versioned** - SDK and protocol versioning for compatibility
- **Transport Agnostic** - Support IPC, WebSocket, Named Pipes
- **Language Agnostic** - SDKs for Godot (GDScript/C#), Unity (C#), Unreal (C++), etc.
- **Minimal Surface Area** - Only expose what's needed
- **Observable** - Logging, debugging tools

---

## 2. Protocol Architecture

### 2.1 Core Interface (Conceptual)

```typescript
interface RevGameBridge {
  getCapabilities(): Promise<GameCapability[]>;
  getContext(filter?: ContextFilter): Promise<GameContext>;
  subscribeToEvents(handler: (event: GameEvent) => void): UnsubscribeFn;
  execute(action: GameAction): Promise<ActionResult>;
  getBridgeInfo(): Promise<BridgeInfo>;
}
```

### 2.2 Message Flow

```
Game/Mod                    Rev Bridge Host              Rev AI Runtime
   │                              │                            │
   │  1. Connect (handshake)      │                            │
   ├─────────────────────────────>│                            │
   │  2. Get capabilities         │                            │
   ├─────────────────────────────>│                            │
   │  3. Subscribe to events     │                            │
   ├─────────────────────────────>│                            │
   │                              │  4. Game event occurs      │
   │  Event notification         │<───────────────────────────│
   │<─────────────────────────────│                            │
   │                              │  5. Request AI action      │
   │                              │───────────────────────────>│
   │                              │  6. Structured action      │
   │  7. Execute action request  │<───────────────────────────│
   │<─────────────────────────────│                            │
   │  8. Validate & execute      │                            │
   │  9. Action result           │                            │
   ├─────────────────────────────>│                            │
   │                              │ 10. Report result          │
   │                              │───────────────────────────>│
```

---

## 3. Protocol Specification

### 3.1 Handshake
```json
{
  "type": "handshake",
  "protocolVersion": "1.0.0",
  "sdkVersion": "1.0.0",
  "gameInfo": {
    "id": "historicalparadoxdei",
    "name": "Historical Paradox DEI",
    "version": "0.1.0",
    "engine": "godot"
  },
  "modInfo": { /* optional */ }
}
```

### 3.2 Game Capability Declaration
```json
{
  "capabilities": [
    {
      "id": "characters.dialogue",
      "description": "Interact with NPCs via dialogue",
      "readOnly": false,
      "requiresPermission": true
    },
    {
      "id": "diplomacy.proposals",
      "description": "Propose diplomatic actions",
      "readOnly": false,
      "requiresPermission": true
    },
    {
      "id": "world.state.read",
      "description": "Read world state",
      "readOnly": true,
      "requiresPermission": false
    }
  ]
}
```

### 3.3 Game Context
```json
{
  "context": {
    "timestamp": "2026-10-27T...",
    "characters": [
      { "id": "char_123", "name": "...", "role": "...", "traits": [...] }
    ],
    "world": { "year": 1453, "region": "...", "events": [...] },
    "player": { "id": "...", "relations": {...} }
  },
  "summary": "Condensed context for AI (token-optimized)"
}
```

### 3.4 Game Events
```json
{
  "event": {
    "id": "evt_456",
    "type": "character.conversation.started",
    "timestamp": "...",
    "data": { "characterId": "...", "topic": "..." }
  }
}
```

### 3.5 Game Action
```json
{
  "action": {
    "id": "act_789",
    "type": "character.dialogue.respond",
    "targetId": "char_123",
    "parameters": {
      "text": "Your response here",
      "tone": "diplomatic",
      "intent": "negotiate"
    },
    "reasoning": "Optional AI reasoning for logging",
    "confidence": 0.85
  }
}
```

### 3.6 Action Result
```json
{
  "result": {
    "actionId": "act_789",
    "success": true,
    "executed": true,
    "gameStateChanges": ["relation.updated"],
    "feedback": "Diplomatic proposal accepted",
    "errors": []
  }
}
```

---

## 4. Transport Options

| Transport | Use Case | Pros | Cons | Priority |
|-----------|----------|------|------|----------|
| **WebSocket (localhost)** | Primary for most games | Easy, cross-platform, works in all engines | Network stack overhead minimal on localhost | P0 |
| **Named Pipes** | Windows games, lower latency | Fast, secure on Windows | Windows-specific, more complex | P1 |
| **Unix Domain Sockets** | Linux/Mac | Fast, secure | Platform-specific | P2 |
| **IPC (Electron)** | Same-process or Electron games | Very fast, integrated | Limited to Electron context | P3 |

**Recommendation:** Start with **localhost WebSocket** (e.g., `ws://127.0.0.1:PORT`) for maximum compatibility.

---

## 5. Security Model

### 5.1 Threat Mitigations
| Threat | Mitigation |
|--------|------------|
| **Malicious mod** | Capability-based permissions, whitelist allowed actions, schema validation |
| **Prompt injection** | Sanitize game content, separate system/game/user prompts, validate outputs |
| **Arbitrary command execution** | No shell/OS access exposed, only game-defined actions |
| **Unauthorized game state modification** | Game-authoritative - all mutations go through game's execute() validation |
| **Local file access** | Never expose filesystem, bridge is game-controlled |
| **Network access abuse** | Localhost only by default, no external network from bridge |
| **Exposed services** | Bind to 127.0.0.1 only, random port or discovery mechanism |
| **Supply chain** | Mod manifest signing (future), checksum verification |

### 5.2 Permission System
- **Default deny** - Nothing allowed until explicitly granted
- **Capability-scoped** - Permissions per capability (read vs write)
- **Session-bound** - Permissions valid for game session only
- **User approval** - Sensitive actions require user confirmation
- **Rev integration toggle** - Can disable per game
- **Audit logging** - All actions logged

### 5.3 Validation
- **Schema validation** - JSON Schema for all messages
- **Action whitelist** - Only pre-declared actions allowed
- **Parameter validation** - Type checking, range limits
- **Rate limiting** - Per game, per AI character
- **Timeouts** - All operations have timeouts
- **Sanitization** - Clean game context before sending to AI

---

## 6. Multi-NPC & Context Management

### Challenge
Running separate heavyweight models for each NPC is expensive and impractical.

### Solution: Shared Model with Character Context
```typescript
interface CharacterContext {
  characterId: string;
  personality: string;
  goals: string[];
  knowledge: string[];
  relationshipToPlayer: object;
  conversationHistory: Message[];
  currentMood: string;
}
```

**Approach:**
1. **Single model instance** serves all NPCs in session
2. **Character-specific system prompts** injected per request
3. **Conversation history per character** maintained
4. **Context summarization** - compress old conversations
5. **Relevant memory retrieval** - only inject relevant history
6. **Request batching** where possible
7. **Priority queuing** - important conversations first

### Event Batching
- Batch related events over short window (e.g., 100-500ms)
- Summarize multiple events into single context update
- Reduce redundant AI calls

### Context Summarization
- Use smaller model or same model with summarization prompt
- Summarize old conversations to save tokens
- Maintain key facts in structured form

---

## 7. SDK Design

### 7.1 Godot SDK (Priority #1)
**Language:** GDScript + C# option  
**Location:** Will be in separate package, referenced by mod

```gdscript
# Example usage in Godot
var bridge = RevGameBridge.new()
bridge.connect_to_rev("ws://127.0.0.1:12345")

bridge.on_capability_requested(func(cap):
  if cap.id == "character.dialogue":
    return true  # grant permission
  return false
)

bridge.subscribe_to_event("conversation.started", func(event):
  var response = await bridge.request_ai_response(event.data)
  bridge.execute_dialogue(response)
)
```

### 7.2 Unity SDK (Priority #2)
**Language:** C#  
**Integration:** Package Manager or custom package

### 7.3 Unreal Engine SDK (Priority #3)
**Language:** C++  
**Integration:** Plugin

---

## 8. Implementation Plan

### Phase 1: Protocol Design (Current)
- Define message schemas
- Design transport layer
- Security model

### Phase 2: Bridge Host in Rev (P1)
- Create `RevGameBridgeHost` service in Electron/main process
- WebSocket server on localhost
- Message routing and validation
- Integration with Rev AI Runtime
- Session management

### Phase 3: Godot SDK (P1)
- Basic WebSocket client
- Handshake/capability exchange
- Event subscription
- Action execution
- Example mod for HistoricalParadoxDEI test

### Phase 4: Integration & Testing (P1)
- Connect to test game
- Validate security model
- Test multi-NPC scenarios
- Performance testing

### Phase 5: Documentation & Examples (P1)
- SDK documentation
- Example implementations
- Security guidelines
- Developer portal content

---

## 9. Integration with GameSessionOrchestrator

Looking at current `GameSessionOrchestrator.cjs`:
```javascript
// Line 60-67 already has check for integrations
if (context.game.integration.adapterId !== null || context.game.profile.ai.enabled) {
  throw new Error('Game AI integrations are not available in this version');
}
```

**Needed changes:**
1. Remove/relax this restriction when bridge is implemented
2. In `launch()` phase: Start Rev AI Runtime if not running
3. Start RevGameBridgeHost, allocate port
4. Activate compatible mods
5. Pass bridge connection info to game (via environment variable or file)
6. Monitor bridge connection
7. On session end: cleanup bridge, optionally stop Rev AI if no other sessions

---

## 10. Success Criteria

- [ ] Protocol defined and documented
- [ ] WebSocket bridge host working in Rev
- [ ] Godot SDK can connect and exchange messages
- [ ] Action validation working
- [ ] Permissions enforced
- [ ] Single model serves multiple NPCs
- [ ] HistoricalParadoxDEI can do read-only POC
- [ ] No way for mod to access OS/filesystem arbitrarily
- [ ] Game remains authoritative over state

---

**Next Steps:** See [STEAM-LAUNCHER-AND-MOD-ECOSYSTEM.md](./STEAM-LAUNCHER-AND-MOD-ECOSYSTEM.md)
