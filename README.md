# ZeroTree ◈

> **Deterministic skill progression for Three.js games — zero data files, zero stored state, infinite trees.**

ZeroTree is a drop-in React component that brings immersive skill tree progression to any **Vite / TypeScript / React / Three.js** game project. The entire tree — every node, every edge, every stat magnitude — is computed on demand from two integers using the **ZeroFamily methodology** (Zerobytes + Zero-Quadratic). There are no JSON files to author. No databases to configure. The only thing that persists is a compact bitmask of the player's choices.

```
treeSeed + playerSeed = complete, deterministic, reproducible skill universe
```

---

## ✨ Features

### 🌳 Procedural Tree Generation
The 9×7 skill grid (63 nodes) springs complete from a single `treeSeed`. Every node's type, stat affinity, magnitude, unlock cost, and visual variant is derived O(1) from a coordinate hash — no lookup tables, no authored data. Change one integer to get an entirely different tree.

### ⚡ Four Node Types
- **STAT** — direct stat bonuses (most common)
- **PASSIVE** — persistent ability effects drawn from your game's ability pool
- **ACTIVE** — executable abilities registered to your input handler on unlock
- **KEYSTONE** — rare, high-cost nodes that appear only in tier 5–6 with amplified effects

### 🔗 Zero-Quadratic Edge Resolution
Edges between nodes are never stored. Connectivity between any two adjacent-tier nodes is computed on demand from a symmetric pair hash. Threshold-based sparsity (~2.2 children per node on average) produces naturally branching trees with guaranteed root-to-tip reachability. Every tree is internally consistent. None of it is stored.

### 🎨 Immersive Canvas Renderer
- Full-screen overlay with animated glows, node state colour coding, and edge lighting
- Object-pooled particle system (200 particles pre-allocated) — traveling trails fire from parent to child on every unlock
- Scale-pulse and glow-bloom animations on unlock; shake animation on invalid action
- Keystone nodes render 1.5× larger with an animated gold shimmer ring
- Minimap HUD widget with per-tier progress bars, always visible during gameplay

### 🎮 Three Callbacks — Full Integration
ZeroTree never reaches into your game's state. You provide three callbacks:

```typescript
onStatChange(deltas)       // fires on unlock and respec
onAbilityUnlock(ability)   // fires when an ACTIVE or PASSIVE node is unlocked
onAbilityRevoke(ability)   // fires on full respec
```

That's it. Compatible with any state management approach — Zustand, Redux, Jotai, plain `useState`.

### 💾 Zero-Byte Persistence
The entire progression state serializes to a single base64 string — a bitmask plus a spend counter. ZeroTree never touches `localStorage` or `sessionStorage`. The host game owns persistence.

```typescript
const saved = treeRef.current.serialize();   // "MTAwMTEwMDE6Mjc="
treeRef.current.deserialize(saved);          // full state restored
```

### 🔄 Respec System
Full tree reset with a configurable 30% skill point tax. All reverse stat deltas fire, all registered abilities revoke, the mask resets to root-only. The root node is always unlocked and cannot be removed.

---

## 🚀 Quick Start

### Installation

Clone or copy the `src/zerotree/` directory into your project:

```bash
git clone https://github.com/MushroomFleet/ZeroTree-JSX.git
# Copy src/zerotree/ into your game's src/ directory
```

ZeroTree has no runtime dependencies beyond React (already in your project). No npm packages to install.

### Minimal Integration

```tsx
import { useRef, useState } from 'react';
import { ZeroTree, ZeroTreeMinimap, ZeroTreeRef, TreeConfig, PlayerState } from './zerotree';

const TREE_CONFIG: TreeConfig = {
  treeSeed:       0xDEADBEEF,   // change this number = entirely different tree
  playerSeed:     0xCAFEBABE,   // cosmetic variation per player
  cols:           9,
  rows:           7,
  maxSkillPoints: 150,
  statNames:      ['strength', 'agility', 'intellect', 'vitality', 'luck'],
  statRanges: {
    strength:  [2, 15],
    agility:   [2, 12],
    intellect: [2, 18],
    vitality:  [3, 20],
    luck:      [1, 10],
  },
  abilityPool: [
    {
      id: 'storm-surge',
      name: 'Storm Surge',
      type: 'ACTIVE',
      description: 'Radial burst dealing 140% agility damage.',
      execute: () => gameActions.activateStormSurge(),
    },
    {
      id: 'iron-skin',
      name: 'Iron Skin',
      type: 'PASSIVE',
      description: 'Permanently reduces incoming damage by 12%.',
    },
  ],
  onStatChange(deltas) {
    for (const d of deltas) {
      gameState.stats[d.stat] = (gameState.stats[d.stat] ?? 0) + d.delta;
    }
  },
  onAbilityUnlock(ability) {
    gameState.abilities.push(ability);
    if (ability.type === 'ACTIVE' && ability.execute) {
      inputHandler.registerAbility(ability.id, ability.execute);
    }
  },
  onAbilityRevoke(ability) {
    gameState.abilities = gameState.abilities.filter(a => a.id !== ability.id);
    inputHandler.unregisterAbility(ability.id);
  },
};

export function GameUI() {
  const treeRef = useRef<ZeroTreeRef>(null);
  const [treeOpen, setTreeOpen] = useState(false);
  const [playerState, setPlayerState] = useState<PlayerState>({
    unlockedMask: 1n << BigInt(4 * 7 + 0), // root node at col=4, row=0
    skillPoints:  5,
    spentPoints:  0,
  });

  return (
    <>
      <YourThreeJSCanvas />

      <ZeroTreeMinimap
        config={TREE_CONFIG}
        playerState={playerState}
        onClick={() => setTreeOpen(true)}
        position="bottom-right"
      />

      <ZeroTree
        ref={treeRef}
        config={TREE_CONFIG}
        playerState={playerState}
        onPlayerStateChange={setPlayerState}
        visible={treeOpen}
        onClose={() => setTreeOpen(false)}
      />
    </>
  );
}

// Grant skill points from anywhere in your game:
// treeRef.current?.grantSkillPoints(3);
```

---

## 📐 Architecture

### File Structure

```
src/zerotree/
  types.ts                    — all shared interfaces
  index.ts                    — public exports
  core/
    hash.ts                   — positionHash, pairHash, hashToFloat
    generate.ts               — generateTree() — the ZeroFamily engine
    unlock.ts                 — canUnlock, unlock, respec logic
    serialize.ts              — base64 save / load
  canvas/
    renderer.ts               — canvas draw functions (nodes, edges)
    particles.ts              — object-pooled particle system
    animations.ts             — animation state machine
  components/
    ZeroTree.tsx              — full overlay + ref forwarding
    ZeroTreeMinimap.tsx       — HUD minimap widget
    NodeDetailPanel.tsx       — hover / click detail panel
    RespecModal.tsx           — respec confirmation modal
```

### ZeroFamily Methodology

ZeroTree is built on two principles from the **ZeroFamily** procedural determinism system:

**Zerobytes (O(1) node properties)**
> The coordinate IS the seed. Any node can be reconstructed from its `(col, row)` position and the `treeSeed` alone — no iteration, no stored state, no look-up tables.

```
positionHash(col, row, z, treeSeed) → all node properties
```

**Zero-Quadratic (O(N²) edge relationships)**
> Edges exist between positions, not at positions. Any edge's existence is computable directly from its endpoint pair — no graph storage, no adjacency matrix, symmetric by construction.

```
pairHash(nodeA, nodeB, treeSeed) > 0.55 → edge exists
```

**N is hard-capped at design time** (default: 63 nodes → 3,969 pairs). The budget is declared, not discovered at runtime.

### Data Flow

```
┌─────────────────────────────────────────────────────┐
│                    HOST GAME                        │
│  gameState.stats ←── onStatChange(deltas)           │
│  gameState.abilities ←── onAbilityUnlock/Revoke     │
│  treeRef.grantSkillPoints(n) ──→                    │
└──────────────────────┬──────────────────────────────┘
                       │ callbacks only
┌──────────────────────▼──────────────────────────────┐
│                   ZEROTREE                          │
│  generateTree(treeSeed) → nodes[], edges[]          │
│  unlock(node, state) → newState + deltas            │
│  respec(state) → newState + reverseDeltaList        │
│  serialize() / deserialize()                        │
└─────────────────────────────────────────────────────┘
                       │ renders over
┌──────────────────────▼──────────────────────────────┐
│              THREE.JS CANVAS (z-index:0)            │
└─────────────────────────────────────────────────────┘
```

ZeroTree never reads from your game state. It only emits deltas outward.

---

## 🎛️ API Reference

### `<ZeroTree />` Props

| Prop | Type | Description |
|---|---|---|
| `ref` | `ZeroTreeRef` | Imperative handle for granting points, serializing, etc. |
| `config` | `TreeConfig` | Tree seed, stat definitions, ability pool, callbacks |
| `playerState` | `PlayerState` | Current bitmask + skill points (controlled) |
| `onPlayerStateChange` | `(s: PlayerState) => void` | State sync back to host |
| `visible` | `boolean` | Show / hide the full overlay |
| `onClose` | `() => void` | Called when player closes the tree |

### `ZeroTreeRef` (imperative API)

```typescript
treeRef.current.grantSkillPoints(n)       // add n skill points
treeRef.current.getComputedStats()        // → Record<string, number> of all bonuses
treeRef.current.getUnlockedAbilities()    // → AbilityDef[]
treeRef.current.forceRespec()             // programmatic reset (e.g. difficulty scaling)
treeRef.current.serialize()              // → base64 string for your save system
treeRef.current.deserialize(str)         // restore from saved string
```

### `TreeConfig` key fields

| Field | Type | Description |
|---|---|---|
| `treeSeed` | `number` | Determines entire tree structure. Different seed = different tree |
| `playerSeed` | `number` | Cosmetic variation (backgrounds, particle colours) |
| `statNames` | `string[]` | Names of stats your game uses |
| `statRanges` | `Record<string, [min, max]>` | Node magnitude bounds per stat |
| `abilityPool` | `AbilityDef[]` | Pool of abilities the tree can assign to ACTIVE/PASSIVE nodes |
| `onStatChange` | callback | Called with stat deltas on every unlock and respec |
| `onAbilityUnlock` | callback | Called when an ACTIVE or PASSIVE node is unlocked |
| `onAbilityRevoke` | callback | Called for each ability on full respec |

### CSS Custom Properties

Override the visual theme by setting these on `:root` or on any ancestor element:

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

---

## ⚙️ Performance

| Metric | Target |
|---|---|
| `generateTree()` (63 nodes) | < 1ms |
| Canvas full redraw at 1080p | < 4ms |
| Overlay open time | < 16ms (single frame) |
| Particle system | 200 particles, pool pre-allocated at init, zero mid-flight allocations |
| Tree regeneration | `useMemo` — never regenerates during normal interaction |

---

## 🔌 Prestige & Advanced Patterns

**Prestige / New Game+**
```typescript
// Increment treeSeed for a structurally different tree on prestige
const newConfig = { ...config, treeSeed: config.treeSeed + 1 };
treeRef.current.forceRespec();
```

**Per-Run Randomisation (roguelike)**
```typescript
// Derive treeSeed from run seed for repeatable per-run trees
const treeSeed = positionHash(runId, 0, 0, GAME_MASTER_SEED);
```

**Difficulty Scaling**
```typescript
// Different seed per difficulty tier
const treeSeed = SEEDS[difficulty]; // easy / normal / hard each get distinct trees
```

**Save/Load Integration**
```typescript
// On save:
saveData.skillTree = treeRef.current.serialize();

// On load:
treeRef.current.deserialize(saveData.skillTree);
```

---

## 🗺️ Node Visual Reference

```
Symbol   State        Description
──────   ─────        ───────────
  ★      Root         Always unlocked. Cannot be revoked.
  ◉      Unlocked     Cyan glow, solid border.
  ◈      Available    Dashed border, type colour. Can be unlocked.
  ○      Locked       Grey. Prerequisite not met.
  ◆      Keystone     1.5× size, gold shimmer ring. Tier 5–6 only.

Type     Glyph   Colour
────     ─────   ──────
STAT       Σ     Green  (#4af7a0)
PASSIVE    ⟳     Purple (#a78bfa)
ACTIVE     ⚡    Amber  (#f59e0b)
KEYSTONE   ◆     Orange (#f97316)
```

---

## 📋 Requirements

- **React** ≥ 18
- **TypeScript** ≥ 5
- **Vite** (any recent version)
- **Three.js** — ZeroTree renders in a separate overlay; no Three.js API dependency inside ZeroTree itself
- No additional npm packages required

---

## 📚 Citation

### Academic Citation

If you use this codebase in your research or project, please cite:

```bibtex
@software{zerotree,
  title  = {ZeroTree: Deterministic Skill Progression for Three.js Games},
  author = {Drift Johnson},
  year   = {2025},
  url    = {https://github.com/MushroomFleet/ZeroTree-JSX},
  version = {1.0.0}
}
```

### Donate

[![Ko-Fi](https://cdn.ko-fi.com/cdn/kofi3.png?v=3)](https://ko-fi.com/driftjohnson)

---

*Built on the ZeroFamily methodology — zero bytes store infinity.*
