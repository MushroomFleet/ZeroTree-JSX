# ZB-ZeroTree-Grounding

> ZeroFamily-aligned player skill progression tree system for Vite/TypeScript/React + Three.js games.

---

## 1. System Purpose

ZeroTree is a drop-in player progression tree component for Three.js games built with Vite, TypeScript, and React. It provides a visually immersive, mathematically deterministic skill graph that surfaces stat upgrades and ability unlocks, wires into the host game's stat and ability systems at runtime, and stores zero state beyond a flat integer bitmask and a world seed.

**The progression graph springs complete from two integers: `treeSeed` and `playerSeed`.** No JSON files define the tree. No databases store it. The entire node layout, edge connectivity, unlock costs, and stat magnitudes are derived O(1) from coordinate hashes — following the Five Laws of Zerobytes and the relational symmetry rules of Zero-Quadratic.

---

## 2. ZeroFamily Alignment

### 2.1 Zerobytes Layer (O(1) Node Properties)

Each skill node is identified by a discrete coordinate `(col, row)` in a fixed grid. All node properties are computed from `position_hash(col, row, 0, treeSeed)`:

| Property | Derivation |
|---|---|
| `nodeType` | `hash % 4` → `PASSIVE \| ACTIVE \| STAT \| KEYSTONE` |
| `statAffinity` | `hash % NUM_STATS` → which stat this node modifies |
| `magnitude` | `(hash >> 8) % 100 / 100` mapped to per-stat range |
| `tier` | `row` directly — tier increases with distance from root |
| `unlockCost` | `5 + tier * 3 + (hash % 5)` skill points |
| `visualVariant` | `(hash >> 16) % 8` → glyph/color variant |

Because `position_hash` is pure and deterministic, any node can be reconstructed from `(col, row, treeSeed)` alone. **Zero node data is stored.**

```typescript
// Core hash primitive (xxhash32 port, pure TS, no WASM dependency)
function positionHash(col: number, row: number, z: number, salt: number): number {
  // FNV-1a variant safe for JS integer range
  let h = salt ^ 0x811c9dc5;
  h ^= (col & 0xFF);          h = Math.imul(h, 0x01000193);
  h ^= ((col >> 8) & 0xFF);   h = Math.imul(h, 0x01000193);
  h ^= (row & 0xFF);          h = Math.imul(h, 0x01000193);
  h ^= ((row >> 8) & 0xFF);   h = Math.imul(h, 0x01000193);
  h ^= (z & 0xFF);            h = Math.imul(h, 0x01000193);
  return h >>> 0; // unsigned 32-bit
}

function hashToFloat(h: number): number {
  return (h & 0xFFFFFFFF) / 0x100000000;
}
```

### 2.2 Zero-Quadratic Layer (O(N²) Edge Relationships)

Edges between nodes are not stored. Any two nodes `A(ca, ra)` and `B(cb, rb)` have a deterministic connection strength:

```typescript
function pairHash(ca: number, ra: number, cb: number, rb: number, salt: number): number {
  // Symmetric: sort pair before hashing
  const [p1, p2] = [[ca, ra], [cb, rb]].sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  let h = salt ^ 0x811c9dc5;
  for (const v of [...p1, ...p2]) {
    h ^= (v & 0xFF); h = Math.imul(h, 0x01000193);
    h ^= ((v >> 8) & 0xFF); h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function edgeExists(ca: number, ra: number, cb: number, rb: number, treeSeed: number): boolean {
  // Only connect adjacent tiers (|ra - rb| == 1) within proximity (|ca - cb| <= 2)
  if (Math.abs(ra - rb) !== 1) return false;
  if (Math.abs(ca - cb) > 2) return false;
  const strength = hashToFloat(pairHash(ca, ra, cb, rb, treeSeed));
  // Threshold creates sparse tree; 0.55 yields ~2.2 children per node on average
  return strength > 0.55;
}
```

**N is hard-coded at design time.** Default grid: 9 columns × 7 rows = 63 nodes maximum. N² = 3969 pairs. All computed on demand, none stored.

### 2.3 Hierarchy Pattern

```
treeSeed (world constant)
  └─ tier[row] seed  = positionHash(0, row, 0, treeSeed)
       └─ node seed  = positionHash(col, row, 0, treeSeed)
            └─ stat magnitude = hashToFloat(positionHash(col, row, 1, treeSeed))
```

Child properties are bounded by tier. Tier 0 = root (always unlocked). Tier 6 = Keystone tier (high cost, rare type). Stat magnitudes scale with tier depth, encoded in the hash result, not hardcoded per-node.

---

## 3. Data Models

### 3.1 TreeConfig (host provides)

```typescript
interface TreeConfig {
  treeSeed: number;          // Deterministic tree structure seed (per game/run)
  playerSeed: number;        // Per-player cosmetic variation seed
  cols: number;              // Default: 9
  rows: number;              // Default: 7
  maxSkillPoints: number;    // Total points player can ever earn
  statNames: string[];       // e.g. ["strength","agility","intellect","vitality","luck"]
  statRanges: Record<string, [number, number]>; // e.g. { strength: [2, 15] }
  abilityPool: AbilityDef[]; // Active/passive ability definitions the tree can unlock
  onStatChange: (deltas: StatDelta[]) => void;    // Host game callback
  onAbilityUnlock: (ability: AbilityDef) => void; // Host game callback
  onAbilityRevoke: (ability: AbilityDef) => void; // Host game callback (on respec)
}
```

### 3.2 SkillNode (computed, never stored)

```typescript
interface SkillNode {
  id: string;              // `${col}:${row}`
  col: number;
  row: number;
  tier: number;            // Equals row
  type: 'PASSIVE' | 'ACTIVE' | 'STAT' | 'KEYSTONE';
  statAffinity: string;    // Name from statNames
  magnitude: number;       // Mapped to statRanges for this stat
  unlockCost: number;      // Skill points required
  abilityRef?: AbilityDef; // Set only when type is ACTIVE or PASSIVE
  visualVariant: number;   // 0–7, drives glyph + color selection
  isRoot: boolean;         // col === Math.floor(cols/2) && row === 0
}
```

### 3.3 PlayerState (the ONLY persistent data)

```typescript
interface PlayerState {
  unlockedMask: bigint;    // 63-bit bitmask — one bit per node (col*rows+row)
  skillPoints: number;     // Points available to spend
  spentPoints: number;     // Total spent (for respec cost calculation)
}
```

`unlockedMask` is the **only data that persists**. The entire visible tree is reconstructed from `(treeSeed, unlockedMask)` on every render. This is the ZeroFamily contract: zero stored state beyond player choices.

### 3.4 AbilityDef (host provides, referenced by hash index)

```typescript
interface AbilityDef {
  id: string;
  name: string;
  description: string;
  type: 'ACTIVE' | 'PASSIVE';
  icon?: string;           // URL or sprite reference
  execute?: () => void;    // For ACTIVE abilities — called by host input handler
}
```

### 3.5 StatDelta

```typescript
interface StatDelta {
  stat: string;
  delta: number;           // Positive on unlock, negative on respec
}
```

---

## 4. Functional Specification

### 4.1 Tree Generation

On mount, ZeroTree calls `generateTree(config)` which:

1. Iterates `col` 0–(cols-1), `row` 0–(rows-1)
2. Computes each `SkillNode` from `positionHash(col, row, 0, treeSeed)`
3. Assigns `abilityRef` by mapping `positionHash(col, row, 2, treeSeed) % abilityPool.length` for ACTIVE/PASSIVE nodes
4. Computes all edges via `edgeExists` for adjacent-tier pairs within column proximity
5. Guarantees root node at `(Math.floor(cols/2), 0)` always has `STAT` type, cost 0, and is marked `isRoot`
6. Guarantees at least one edge between each tier and the next (fallback: connect center columns if hash threshold produces zero edges for a tier)

This runs in O(cols × rows) = O(63) for the default grid. **Called once per mount.** Result is held in React state as a memoized constant (never mutated).

### 4.2 Unlock Logic

```
canUnlock(node):
  - node is not already unlocked
  - player has skillPoints >= node.unlockCost
  - at least one node in node's tier-1 is unlocked (or node.isRoot)
  - node is reachable via unlocked edge chain from root

unlock(node):
  - set bit in unlockedMask
  - deduct unlockCost from skillPoints, add to spentPoints
  - compute StatDelta for node.statAffinity and node.magnitude
  - call config.onStatChange([delta])
  - if ACTIVE or PASSIVE: call config.onAbilityUnlock(node.abilityRef)
```

### 4.3 Respec

Full respec (no partial):
```
respec():
  - cost = Math.floor(spentPoints * 0.3)  // 30% tax in skill points
  - if skillPoints + spentPoints - cost < 0: reject
  - build reverse StatDelta list for all unlocked nodes
  - call config.onStatChange(reverseDeltaList)
  - call config.onAbilityRevoke for each ACTIVE/PASSIVE node in mask
  - reset unlockedMask to root bit only
  - skillPoints = spentPoints - cost
  - spentPoints = 0
  - unlock root node for free (it is always unlocked)
```

### 4.4 Skill Point Granting

Host game calls the exported `grantSkillPoints(n: number)` function on the ZeroTree ref. ZeroTree updates internal state and re-renders. No other external API required for normal gameplay.

---

## 5. UI Layout

### 5.1 Full-Screen Overlay Mode

```
╔══════════════════════════════════════════════════════════════╗
║  [◈ ZEROTREE]  ─────────────── Skill Points: 12  [RESPEC]  ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║   ○ ─── ○ ─── ◉ ─── ○ ─── ○   ← TIER 6 (Keystone)         ║
║        ╲   ╱   ╲   ╱                                        ║
║   ○ ─── ◉ ─── ○ ─── ◈ ─── ○   ← TIER 5                    ║
║        ╲   ╱       ╲   ╱                                    ║
║   ○ ─── ○ ─── ◈ ─── ○ ─── ○   ← TIER 4                    ║
║              ╲   ╱                                          ║
║   ○ ─── ○ ─── ◉ ─── ○ ─── ○   ← TIER 3                    ║
║              ╲   ╱                                          ║
║   ○ ─── ◈ ─── ◉ ─── ◈ ─── ○   ← TIER 2                    ║
║         ╲       ╱                                           ║
║   ○ ─── ○ ─── ◉ ─── ○ ─── ○   ← TIER 1                    ║
║                │                                            ║
║               [★] ROOT                    ← TIER 0          ║
║                                                              ║
╠══════════════════════════════════════════════════════════════╣
║  [Selected: Iron Skin] PASSIVE — +8 Vitality  Cost: 7pts   ║
║  [UNLOCK]  This node requires: Root (unlocked) ✓            ║
╚══════════════════════════════════════════════════════════════╝

Symbols: ★=Root  ◉=Unlocked  ◈=Available  ○=Locked
         KEYSTONE nodes render 1.5× larger with gold ring
```

### 5.2 Minimap Mode (HUD widget, always visible in-game)

```
╔══════════╗
║ ◈ TREE  ║  Small fixed-position HUD
║ ░░█░░░  ║  Rows shown as progress bars (unlocked/total per tier)
║ ░░░░░░  ║  Click/tap opens Full-Screen Overlay Mode
║ 12 pts  ║
╚══════════╝
```

### 5.3 Node Detail Panel (appears on hover/click)

```
╔═══════════════════════════════╗
║ ⚡ STORM SURGE                ║
║ ACTIVE ABILITY · TIER 4       ║
╠═══════════════════════════════╣
║ Releases a radial burst,      ║
║ dealing 140% agility damage.  ║
╠═══════════════════════════════╣
║ +11 Agility (passive bonus)   ║
║ Cost: 14 skill points         ║
╠═══════════════════════════════╣
║ Requires: Node (3:3) ✓        ║
║ [UNLOCK]                      ║
╚═══════════════════════════════╝
```

---

## 6. Visual Design

### 6.1 Canvas Rendering

ZeroTree renders the tree graph on an HTML5 Canvas element overlaid on the Three.js canvas. React manages the overlay lifecycle. Canvas is redrawn on every state change. No SVG (performance). No DOM nodes per-node (scale).

### 6.2 Node Visual Language

| State | Fill | Border | Glyph |
|---|---|---|---|
| Root | Gold gradient | Gold pulse ring | ★ |
| Unlocked | Cyan inner glow | Cyan 2px | Type symbol |
| Available | Dark with type color | Dashed type color | Type symbol |
| Locked | Dark grey | Grey 1px | — |
| Keystone | Type color + shimmer | Gold 3px thick | Type symbol × 1.5 |
| Hover | +20% brightness | White 2px | + tooltip |

### 6.3 Type Symbol Map

```
STAT    → Σ
PASSIVE → ⟳
ACTIVE  → ⚡
KEYSTONE → ◆
```

### 6.4 Color Palette (CSS variables, host can override)

```css
--zt-bg: #0a0a12;
--zt-edge-locked: #2a2a3a;
--zt-edge-unlocked: #00d4ff;
--zt-node-stat: #4af7a0;
--zt-node-passive: #a78bfa;
--zt-node-active: #f59e0b;
--zt-node-keystone: #f97316;
--zt-root: #ffd700;
--zt-text: #e2e8f0;
--zt-panel-bg: rgba(10,10,18,0.92);
```

### 6.5 Animations

- **Edge draw**: On unlock, edges animate as traveling particles from root toward newly unlocked node (canvas particle system, 60fps, 800ms duration)
- **Node unlock**: Scale pulse 1.0 → 1.3 → 1.0, glow bloom, 400ms ease-out
- **Minimap pulse**: Unlocked tier rows pulse on new unlock, 200ms
- **Keystone shimmer**: Continuous shimmer shader via canvas `createLinearGradient` with animated offset

---

## 7. React Component API

### 7.1 ZeroTree Component

```tsx
import { ZeroTree, ZeroTreeRef } from '@zerotree/core';

// In host game component:
const treeRef = useRef<ZeroTreeRef>(null);

<ZeroTree
  ref={treeRef}
  config={treeConfig}
  playerState={playerState}
  onPlayerStateChange={setPlayerState}
  visible={treeOpen}
  onClose={() => setTreeOpen(false)}
/>

// Grant points from host game logic:
treeRef.current?.grantSkillPoints(3);
```

### 7.2 ZeroTreeRef (imperative API)

```typescript
interface ZeroTreeRef {
  grantSkillPoints: (n: number) => void;
  getComputedStats: () => Record<string, number>;   // Full stat bonus map
  getUnlockedAbilities: () => AbilityDef[];
  forceRespec: () => void;                          // For game events / difficulty scaling
  serialize: () => string;                          // Returns base64 of unlockedMask + spentPoints
  deserialize: (data: string) => void;              // Restore from saved string
}
```

### 7.3 ZeroTreeMinimap Component (HUD widget)

```tsx
<ZeroTreeMinimap
  config={treeConfig}
  playerState={playerState}
  onClick={() => setTreeOpen(true)}
  position="bottom-right"  // | "bottom-left" | "top-right" | "top-left"
/>
```

---

## 8. Host Game Integration Contract

ZeroTree is a **pure side-effect emitter**. It never reaches into the host game's state. The host game must implement three callbacks:

```typescript
// 1. Stat changes (called on unlock and respec)
onStatChange(deltas: StatDelta[]) {
  for (const d of deltas) {
    gameState.stats[d.stat] += d.delta;
  }
}

// 2. Ability unlock
onAbilityUnlock(ability: AbilityDef) {
  gameState.abilities.push(ability);
  if (ability.type === 'ACTIVE') {
    inputHandler.registerAbility(ability.id, ability.execute);
  }
}

// 3. Ability revoke (respec)
onAbilityRevoke(ability: AbilityDef) {
  gameState.abilities = gameState.abilities.filter(a => a.id !== ability.id);
  if (ability.type === 'ACTIVE') {
    inputHandler.unregisterAbility(ability.id);
  }
}
```

No other host-side changes are required. ZeroTree does not assume a specific state management system (Redux, Zustand, Jotai, plain useState — all work).

---

## 9. File Structure

```
src/
  zerotree/
    core/
      hash.ts           — positionHash, pairHash, hashToFloat
      generate.ts       — generateTree(config): SkillNode[], EdgeDef[]
      unlock.ts         — canUnlock, unlock, respec logic
      serialize.ts      — serialize/deserialize PlayerState
    components/
      ZeroTree.tsx      — Full overlay component + ref forwarding
      ZeroTreeMinimap.tsx
      NodeDetailPanel.tsx
    canvas/
      renderer.ts       — Canvas draw functions (nodes, edges, particles)
      particles.ts      — Unlock particle system
      animations.ts     — Timeline-based animation state machine
    types.ts            — All interfaces (TreeConfig, SkillNode, PlayerState, etc.)
    index.ts            — Public exports
```

---

## 10. Performance Constraints

- Full tree (63 nodes) generates in < 1ms on any modern device
- Canvas redraw budget: < 4ms per frame at 1080p
- Overlay opens in < 16ms (single frame)
- Particle system: max 200 active particles, pooled, never allocated mid-flight
- Zero allocations during minimap re-render (all canvas paths reused)
- `generateTree` is called once per mount and memoized with `useMemo`; never called during normal interaction

---

## 11. Persistence Model

```
Save format: base64(unlockedMask_bigint_hex + ":" + spentPoints_int)
Example: "MTAwMTEwMDE6Mjc="  →  unlockedMask=0b100110001, spentPoints=27
```

Host game saves and loads this string via `ref.serialize()` / `ref.deserialize()`. ZeroTree does not touch `localStorage`, `sessionStorage`, or any browser storage. **Zero bytes stored by ZeroTree.** The host owns persistence.

---

## 12. ZeroFamily Compliance Checklist

- [x] O(1) node property access — no iteration over other nodes
- [x] O(N²) edge resolution — bounded N, no stored graph
- [x] Determinism — same `treeSeed` always produces same tree on all machines
- [x] Parallelism — no node depends on another node during generation
- [x] Coherence — adjacent nodes share stat affinities via coherent hash banding
- [x] Hierarchy — tier seed → node seed → magnitude seed
- [x] Zero stored state — only `unlockedMask` (player choices) + `spentPoints` persists
- [x] No `Math.random()` — all randomness is seeded and deterministic
- [x] Symmetric edges — `edgeExists(A,B) === edgeExists(B,A)` always
- [x] Bounded N — 63-node hard cap, declared at design time
