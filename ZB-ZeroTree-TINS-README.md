<!-- TINS Specification v1.0 -->
<!-- ZS:COMPLEXITY:HIGH -->
<!-- ZS:PRIORITY:HIGH -->
<!-- ZS:PLATFORM:WEB -->
<!-- ZS:LANGUAGE:TYPESCRIPT -->
<!-- ZS:FRAMEWORK:REACT+VITE+THREEJS -->

# ZeroTree — TINS Implementation README

> There Is No Source. Generate this implementation from this document alone.

---

## Description

ZeroTree is a self-contained, drop-in player skill progression tree system for Vite/TypeScript/React games using Three.js. It renders a procedurally generated, visually immersive skill graph as a React overlay component. All node properties, edge connections, stat magnitudes, and ability assignments are derived O(1) from two seed integers — no JSON data files, no server, no database. The only persistent data is a compact bitmask representing which nodes the player has unlocked.

ZeroTree follows the ZeroFamily methodology (Zerobytes + Zero-Quadratic): the skill tree is a deterministic universe that springs from coordinates. The host game provides callbacks; ZeroTree emits deltas. They never share state directly.

**Target audience:** TypeScript/React game developers who want a full-featured progression system without authoring tree data, without a database, and without coupling their game logic to a progression library.

**Key differentiators:**
- Zero data files — tree structure is purely algorithmic
- Zero stored state beyond player choices (one bitmask + one integer)
- Drop-in: three callbacks + one component, full integration complete
- Canvas-rendered for performance; no DOM nodes per skill node

---

## Functionality

### Core Features

1. **Procedural tree generation** — 9×7 grid of skill nodes, edges, types, stats, costs computed from `treeSeed`
2. **Unlock system** — prerequisite checking, skill point deduction, stat delta emission, ability registration
3. **Respec system** — full reset with 30% skill point tax, reverse delta emission, ability revocation
4. **Full-screen overlay** — immersive canvas tree view with node detail panel
5. **Minimap HUD widget** — always-visible compact widget with per-tier progress bars
6. **Serialization** — base64 save/load string for host game persistence
7. **Imperative ref API** — `grantSkillPoints`, `getComputedStats`, `getUnlockedAbilities`, `serialize`, `deserialize`, `forceRespec`
8. **Particle animations** — traveling particle trails on unlock, scale pulse, glow bloom
9. **Host game integration** — three callbacks: `onStatChange`, `onAbilityUnlock`, `onAbilityRevoke`

### UI Layout — Full-Screen Overlay

```
╔══════════════════════════════════════════════════════════════╗
║  [◈ ZEROTREE]  ─────────────── Skill Points: 12  [RESPEC]  ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║   ○ ─── ○ ─── ◉ ─── ○ ─── ○   ← TIER 6 (Keystone)         ║
║        ╲   ╱   ╲   ╱                                        ║
║   ○ ─── ◉ ─── ○ ─── ◈ ─── ○   ← TIER 5                    ║
║         ...                                                  ║
║               [★] ROOT        ← TIER 0 (always unlocked)    ║
║                                                              ║
╠══════════════════════════════════════════════════════════════╣
║  [Selected: Iron Skin] PASSIVE — +8 Vitality  Cost: 7pts   ║
║  [UNLOCK]  Requires: Root (unlocked) ✓                      ║
╚══════════════════════════════════════════════════════════════╝
```

Node states: ★ Root | ◉ Unlocked | ◈ Available | ○ Locked
Keystone nodes (tier 6) render 1.5× larger with animated gold ring.

### UI Layout — Minimap HUD

```
╔══════════╗
║ ◈ TREE  ║
║ ░░█░░░  ║  per-tier progress bars
║ ░░░░░░  ║
║ 12 pts  ║
╚══════════╝
```

Click/tap opens full overlay. Position is configurable: `bottom-right | bottom-left | top-right | top-left`.

### Node Detail Panel (hover/click on any node)

```
╔═══════════════════════════════╗
║ ⚡ STORM SURGE                ║
║ ACTIVE ABILITY · TIER 4       ║
╠═══════════════════════════════╣
║ +11 Agility (passive bonus)   ║
║ Cost: 14 skill points         ║
╠═══════════════════════════════╣
║ Requires: Node (3:3) ✓ / ✗   ║
║ [UNLOCK] (greyed if locked)   ║
╚═══════════════════════════════╝
```

### User Flows

**Unlock a node:**
1. Player opens ZeroTree overlay (host sets `visible={true}`)
2. Player hovers node → detail panel appears
3. Player clicks node → `canUnlock` check runs
4. If valid: bitmask updates, `onStatChange` fires, `onAbilityUnlock` fires if applicable, particle animation plays
5. If invalid: node shakes (CSS animation), tooltip shows reason

**Respec:**
1. Player clicks `[RESPEC]` in header
2. Confirmation modal appears: shows cost (30% of spentPoints)
3. On confirm: all reverse deltas fire, all abilities revoke, mask resets to root only

**Grant points (from host game):**
```typescript
treeRef.current?.grantSkillPoints(3); // e.g. on level up
```

**Save/Load:**
```typescript
const saved = treeRef.current?.serialize();    // → "MTAwMTEwMDE6Mjc="
treeRef.current?.deserialize(saved);           // restore session
```

**Edge Cases:**
- Root node is always unlocked at cost 0; it cannot be locked even after respec
- If `abilityPool` is empty, ACTIVE/PASSIVE nodes become STAT nodes gracefully
- If `spentPoints * 0.3 < 1`, respec costs 1 point minimum
- If player has 0 skill points and tries to unlock: shake animation, "Not enough skill points" tooltip
- Nodes with zero edges to tier below (hash produced no connections): fallback connects to center column node of previous tier
- `deserialize` with invalid/corrupt data: silently resets to root-only state

---

## Technical Implementation

### Architecture

```
Host Game (Three.js + React)
  ├─ <ZeroTree ref={treeRef} config={...} playerState={...} ... />  ← overlay
  ├─ <ZeroTreeMinimap ... />                                         ← HUD
  └─ treeRef.current.grantSkillPoints(n)                            ← imperative
```

ZeroTree renders a full-viewport `position: fixed` div containing one HTML5 Canvas element. The Three.js canvas sits beneath at `z-index: 0`; ZeroTree overlay is at `z-index: 1000`. No pointer events pass through when overlay is closed (`pointer-events: none`).

### File Structure to Generate

```
src/zerotree/
  types.ts
  core/
    hash.ts
    generate.ts
    unlock.ts
    serialize.ts
  canvas/
    renderer.ts
    particles.ts
    animations.ts
  components/
    ZeroTree.tsx
    ZeroTreeMinimap.tsx
    NodeDetailPanel.tsx
    RespecModal.tsx
  index.ts
```

### Step 1 — `src/zerotree/types.ts`

Generate this file first. It defines all shared interfaces. No imports from other zerotree files.

```typescript
export type NodeType = 'PASSIVE' | 'ACTIVE' | 'STAT' | 'KEYSTONE';
export type MinimapPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

export interface AbilityDef {
  id: string;
  name: string;
  description: string;
  type: 'ACTIVE' | 'PASSIVE';
  icon?: string;
  execute?: () => void;
}

export interface StatDelta {
  stat: string;
  delta: number;
}

export interface TreeConfig {
  treeSeed: number;
  playerSeed: number;
  cols: number;            // Default 9
  rows: number;            // Default 7
  maxSkillPoints: number;
  statNames: string[];
  statRanges: Record<string, [number, number]>;
  abilityPool: AbilityDef[];
  onStatChange: (deltas: StatDelta[]) => void;
  onAbilityUnlock: (ability: AbilityDef) => void;
  onAbilityRevoke: (ability: AbilityDef) => void;
}

export interface SkillNode {
  id: string;              // `${col}:${row}`
  col: number;
  row: number;
  tier: number;
  type: NodeType;
  statAffinity: string;
  magnitude: number;       // Actual stat value (mapped to statRanges)
  unlockCost: number;
  abilityRef?: AbilityDef;
  visualVariant: number;   // 0–7
  isRoot: boolean;
}

export interface EdgeDef {
  fromId: string;
  toId: string;
}

export interface PlayerState {
  unlockedMask: bigint;    // 63-bit bitmask, bit index = col * rows + row
  skillPoints: number;
  spentPoints: number;
}

export interface GeneratedTree {
  nodes: SkillNode[];
  edges: EdgeDef[];
  nodeMap: Map<string, SkillNode>;
}

export interface ZeroTreeRef {
  grantSkillPoints: (n: number) => void;
  getComputedStats: () => Record<string, number>;
  getUnlockedAbilities: () => AbilityDef[];
  forceRespec: () => void;
  serialize: () => string;
  deserialize: (data: string) => void;
}
```

### Step 2 — `src/zerotree/core/hash.ts`

Pure functions. No imports. No side effects. This is the ZeroFamily engine.

```typescript
// FNV-1a 32-bit hash — deterministic, platform-independent, JS-safe
export function positionHash(col: number, row: number, z: number, salt: number): number {
  let h = (salt ^ 0x811c9dc5) >>> 0;
  const values = [col & 0xFF, (col >> 8) & 0xFF, row & 0xFF, (row >> 8) & 0xFF, z & 0xFF, (z >> 8) & 0xFF];
  for (const v of values) {
    h ^= v;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export function pairHash(ca: number, ra: number, cb: number, rb: number, salt: number): number {
  // Symmetric: always sort pair before hashing
  const pairs = [[ca, ra], [cb, rb]].sort((x, y) => x[0] !== y[0] ? x[0] - y[0] : x[1] - y[1]);
  let h = (salt ^ 0x811c9dc5) >>> 0;
  for (const [c, r] of pairs) {
    for (const v of [c & 0xFF, (c >> 8) & 0xFF, r & 0xFF, (r >> 8) & 0xFF]) {
      h ^= v;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h;
}

export function hashToFloat(h: number): number {
  return (h >>> 0) / 0x100000000;
}

export function edgeExists(ca: number, ra: number, cb: number, rb: number, treeSeed: number): boolean {
  if (Math.abs(ra - rb) !== 1) return false;
  if (Math.abs(ca - cb) > 2) return false;
  const h = pairHash(ca, ra, cb, rb, treeSeed);
  return hashToFloat(h) > 0.55;
}
```

### Step 3 — `src/zerotree/core/generate.ts`

Imports only from `hash.ts` and `types.ts`. Implements `generateTree(config: TreeConfig): GeneratedTree`.

Algorithm (implement exactly):
1. Loop `row` 0 to `rows-1`, `col` 0 to `cols-1`
2. For each `(col, row)`:
   - `h = positionHash(col, row, 0, treeSeed)`
   - `type`: `['STAT','PASSIVE','ACTIVE','STAT','KEYSTONE','STAT','PASSIVE','STAT'][h % 8]` — STAT appears 3× to make it most common; KEYSTONE only appears in tier ≥ 5 (`if row < 5 && type === 'KEYSTONE': type = 'STAT'`)
   - `statAffinity`: `statNames[positionHash(col, row, 3, treeSeed) % statNames.length]`
   - Raw magnitude float: `hashToFloat(positionHash(col, row, 1, treeSeed))`
   - `magnitude`: `Math.round(range[0] + rawMag * (range[1] - range[0]))` where range = `statRanges[statAffinity]`
   - `unlockCost`: `row === 0 ? 0 : 5 + row * 3 + (positionHash(col, row, 4, treeSeed) % 5)`
   - `abilityRef`: if `(type === 'ACTIVE' || type === 'PASSIVE') && abilityPool.length > 0`: `abilityPool[positionHash(col, row, 2, treeSeed) % abilityPool.length]`
   - `visualVariant`: `positionHash(col, row, 5, treeSeed) % 8`
   - `isRoot`: `col === Math.floor(cols / 2) && row === 0`
3. Force root node: override its type to `'STAT'`, cost to `0`, isRoot to `true`
4. Build edges: for all pairs `(A, B)` where `|A.row - B.row| === 1 && |A.col - B.col| <= 2`, call `edgeExists`. Collect valid `EdgeDef[]`.
5. Tier connectivity guarantee: for each consecutive tier pair `(r, r+1)`, check if at least one edge exists. If not, add fallback edge between `(centerCol, r)` and `(centerCol, r+1)`.
6. Return `{ nodes, edges, nodeMap: new Map(nodes.map(n => [n.id, n])) }`.

### Step 4 — `src/zerotree/core/unlock.ts`

Imports from `types.ts` and `generate.ts`. Implements unlock logic.

```typescript
// Returns true if node can be unlocked given current state
export function canUnlock(node: SkillNode, state: PlayerState, tree: GeneratedTree): boolean
// Returns { reason: string } | null (null = can unlock)
export function unlockReason(node: SkillNode, state: PlayerState, tree: GeneratedTree): string | null

// Returns updated PlayerState and side-effect lists
export function unlock(
  node: SkillNode,
  state: PlayerState,
  tree: GeneratedTree,
  config: TreeConfig
): { newState: PlayerState; deltas: StatDelta[]; ability?: AbilityDef }

// Returns updated PlayerState, reverse delta list, and abilities to revoke
export function respec(
  state: PlayerState,
  tree: GeneratedTree,
  config: TreeConfig
): { newState: PlayerState; deltas: StatDelta[]; revokedAbilities: AbilityDef[] }
```

**`canUnlock` logic:**
- `!isNodeUnlocked(node, state)` — not already unlocked
- `state.skillPoints >= node.unlockCost` — has points
- `node.isRoot || hasUnlockedPrerequisite(node, state, tree)` — reachable

**`hasUnlockedPrerequisite`:** Find all edges where `toId === node.id || fromId === node.id`. Among those, find any node with `row === node.row - 1` that is unlocked in `state.unlockedMask`.

**Bitmask encoding:** bit index = `node.col * rows + node.row`. Use `BigInt` throughout.
```typescript
function nodeIndex(node: SkillNode, rows: number): number {
  return node.col * rows + node.row;
}
function isNodeUnlocked(node: SkillNode, state: PlayerState, rows: number): boolean {
  return (state.unlockedMask >> BigInt(nodeIndex(node, rows)) & 1n) === 1n;
}
```

**`respec` logic:**
- `cost = Math.max(1, Math.floor(state.spentPoints * 0.3))`
- If `state.spentPoints - cost < 0`: cannot respec (return unchanged state)
- Collect all unlocked non-root nodes from mask
- Build reverse deltas (negate all magnitudes)
- Build revoked abilities list
- New mask = only root bit set
- `skillPoints = state.spentPoints - cost`
- `spentPoints = 0`

### Step 5 — `src/zerotree/core/serialize.ts`

```typescript
export function serialize(state: PlayerState): string {
  const maskHex = state.unlockedMask.toString(16);
  const raw = `${maskHex}:${state.spentPoints}`;
  return btoa(raw);
}

export function deserialize(data: string, rootNode: SkillNode, rows: number): PlayerState {
  try {
    const raw = atob(data);
    const [maskHex, spentStr] = raw.split(':');
    const unlockedMask = BigInt('0x' + maskHex);
    const spentPoints = parseInt(spentStr, 10);
    if (isNaN(spentPoints)) throw new Error('invalid');
    return { unlockedMask, skillPoints: 0, spentPoints };
  } catch {
    // Corrupt data: reset to root only
    const rootIdx = BigInt(rootNode.col * rows + rootNode.row);
    return { unlockedMask: 1n << rootIdx, skillPoints: 0, spentPoints: 0 };
  }
}
```

### Step 6 — `src/zerotree/canvas/renderer.ts`

Implements all canvas draw operations. No React. Pure functions taking `(ctx: CanvasRenderingContext2D, ...)`.

```typescript
// Draw all edges, then all nodes, then the selected node highlight
export function renderTree(
  ctx: CanvasRenderingContext2D,
  tree: GeneratedTree,
  state: PlayerState,
  config: TreeConfig,
  layout: NodeLayoutMap,         // precomputed pixel positions
  selectedNodeId: string | null,
  animationState: AnimationState
): void

// Precompute pixel positions for all nodes given canvas dimensions
export function computeLayout(
  tree: GeneratedTree,
  canvasWidth: number,
  canvasHeight: number,
  config: TreeConfig
): NodeLayoutMap  // Map<string, {x: number, y: number, radius: number}>
```

**Node layout algorithm:**
- Reserve top 60px for header, bottom 100px for detail panel
- Usable height = canvas height - 160px
- Row y positions: evenly spaced bottom-to-top (row 0 at bottom, row max at top)
- Column x positions: evenly spaced left-to-right, horizontally centered

**Node rendering (per node):**
1. Determine state: root / unlocked / available / locked / keystone
2. `ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2)`
3. Apply gradient fill from color table
4. Apply glow via `ctx.shadowBlur` + `ctx.shadowColor` for unlocked/available states
5. Draw border with appropriate width and color
6. Draw type glyph text centered

**Edge rendering:**
- Locked edges: `#2a2a3a`, 1px, dashed `[4, 4]`
- Unlocked edges (both endpoints unlocked): `#00d4ff`, 2px, solid, with glow
- Available edges (one endpoint unlocked, other available): `#00d4ff` at 40% opacity

### Step 7 — `src/zerotree/canvas/particles.ts`

Particle system for unlock animations. Object-pool pattern — pre-allocate 200 particle objects at init.

```typescript
interface Particle {
  active: boolean;
  x: number; y: number;
  vx: number; vy: number;
  life: number;    // 0–1 (1=fresh, 0=dead)
  decay: number;   // per-frame life reduction
  color: string;
  size: number;
}

export class ParticleSystem {
  private pool: Particle[] = [];

  constructor(maxParticles = 200) {
    // Pre-allocate all particles
    for (let i = 0; i < maxParticles; i++) {
      this.pool.push({ active: false, x:0, y:0, vx:0, vy:0, life:0, decay:0, color:'#fff', size:2 });
    }
  }

  emit(x: number, y: number, targetX: number, targetY: number, color: string, count: number): void
  // Emits `count` particles traveling from (x,y) toward (targetX,targetY) with spread

  update(): void  // Advance all active particles one frame

  draw(ctx: CanvasRenderingContext2D): void  // Draw all active particles

  get activeCount(): number
}
```

### Step 8 — `src/zerotree/canvas/animations.ts`

State machine for node animations.

```typescript
export interface AnimationState {
  pulsingNodes: Map<string, { progress: number; color: string }>;  // 0–1 scale pulse
  shakeNodes: Set<string>;       // Nodes currently in shake animation
  glowNodes: Map<string, number>; // nodeId → glow intensity 0–1
}

export function updateAnimations(state: AnimationState, deltaMs: number): AnimationState
// Returns new AnimationState with all values advanced by deltaMs

export function triggerUnlockAnimation(state: AnimationState, nodeId: string, color: string): AnimationState
export function triggerShakeAnimation(state: AnimationState, nodeId: string): AnimationState

// Node scale factor given current animation state (1.0 base, up to 1.3 at pulse peak)
export function getNodeScale(nodeId: string, state: AnimationState): number
```

### Step 9 — `src/zerotree/components/ZeroTree.tsx`

Main component. Uses `forwardRef` to expose `ZeroTreeRef`.

```tsx
import React, { useRef, useEffect, useCallback, useMemo, useImperativeHandle, forwardRef } from 'react';
import { TreeConfig, PlayerState, ZeroTreeRef, SkillNode } from '../types';
import { generateTree } from '../core/generate';
import { canUnlock, unlock, respec, unlockReason } from '../core/unlock';
import { serialize, deserialize } from '../core/serialize';
import { renderTree, computeLayout } from '../canvas/renderer';
import { ParticleSystem } from '../canvas/particles';
import { AnimationState, updateAnimations, triggerUnlockAnimation, triggerShakeAnimation } from '../canvas/animations';
import NodeDetailPanel from './NodeDetailPanel';
import RespecModal from './RespecModal';
```

**Component state:**
```typescript
const [playerState, setPlayerState] = useState<PlayerState>(props.playerState);
const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
const [showRespecModal, setShowRespecModal] = useState(false);
const [animState, setAnimState] = useState<AnimationState>({ pulsingNodes: new Map(), shakeNodes: new Set(), glowNodes: new Map() });
const canvasRef = useRef<HTMLCanvasElement>(null);
const particlesRef = useRef<ParticleSystem>(new ParticleSystem());
const rafRef = useRef<number>(0);
```

**`useMemo` for tree generation:**
```typescript
const tree = useMemo(() => generateTree(config), [config.treeSeed, config.cols, config.rows]);
const layout = useMemo(() => {
  if (!canvasRef.current) return new Map();
  return computeLayout(tree, canvasRef.current.width, canvasRef.current.height, config);
}, [tree, /* canvas dimensions */]);
```

**Animation loop (useEffect with RAF):**
```typescript
useEffect(() => {
  if (!props.visible) return;
  let last = performance.now();
  const loop = (now: number) => {
    const delta = now - last; last = now;
    setAnimState(s => updateAnimations(s, delta));
    particlesRef.current.update();
    // draw
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      renderTree(ctx, tree, playerState, config, layout, selectedNodeId, animState);
      particlesRef.current.draw(ctx);
    }
    rafRef.current = requestAnimationFrame(loop);
  };
  rafRef.current = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(rafRef.current);
}, [props.visible, tree, playerState, selectedNodeId, animState]);
```

**Canvas click handler:**
```typescript
const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
  const node = hitTestNode(e.clientX, e.clientY, layout, tree);
  if (!node) { setSelectedNodeId(null); return; }
  setSelectedNodeId(node.id);
  if (selectedNodeId === node.id) {
    // Second click = attempt unlock
    const reason = unlockReason(node, playerState, tree);
    if (reason) {
      setAnimState(s => triggerShakeAnimation(s, node.id));
      return;
    }
    const { newState, deltas, ability } = unlock(node, playerState, tree, config);
    setPlayerState(newState);
    props.onPlayerStateChange(newState);
    config.onStatChange(deltas);
    if (ability) config.onAbilityUnlock(ability);
    setAnimState(s => triggerUnlockAnimation(s, node.id, getNodeColor(node)));
    // Emit particles from parent node toward newly unlocked node
    const parentEdge = findParentEdge(node, tree);
    if (parentEdge) {
      const from = layout.get(parentEdge.fromId)!;
      const to = layout.get(node.id)!;
      particlesRef.current.emit(from.x, from.y, to.x, to.y, getNodeColor(node), 30);
    }
  }
}, [selectedNodeId, playerState, tree, layout, config]);
```

**`useImperativeHandle`:**
```typescript
useImperativeHandle(ref, () => ({
  grantSkillPoints(n) {
    setPlayerState(s => ({ ...s, skillPoints: s.skillPoints + n }));
  },
  getComputedStats() {
    const stats: Record<string, number> = {};
    for (const node of tree.nodes) {
      if (isNodeUnlocked(node, playerState, config.rows)) {
        stats[node.statAffinity] = (stats[node.statAffinity] ?? 0) + node.magnitude;
      }
    }
    return stats;
  },
  getUnlockedAbilities() {
    return tree.nodes
      .filter(n => isNodeUnlocked(n, playerState, config.rows) && n.abilityRef)
      .map(n => n.abilityRef!);
  },
  forceRespec() { handleRespec(); },
  serialize() { return serialize(playerState); },
  deserialize(data) {
    const rootNode = tree.nodes.find(n => n.isRoot)!;
    const newState = deserialize(data, rootNode, config.rows);
    setPlayerState(newState);
    props.onPlayerStateChange(newState);
  }
}), [playerState, tree, config]);
```

**JSX structure:**
```tsx
return props.visible ? (
  <div style={{
    position: 'fixed', inset: 0, zIndex: 1000,
    background: 'rgba(10,10,18,0.95)', display: 'flex', flexDirection: 'column'
  }}>
    {/* Header */}
    <div style={{ display:'flex', justifyContent:'space-between', padding:'12px 20px',
                  borderBottom:'1px solid #1e2030', color:'var(--zt-text,#e2e8f0)' }}>
      <span style={{ fontFamily:'monospace', color:'var(--zt-node-active,#f59e0b)', fontSize:'18px' }}>◈ ZEROTREE</span>
      <span>Skill Points: <strong>{playerState.skillPoints}</strong></span>
      <div>
        <button onClick={() => setShowRespecModal(true)}>RESPEC</button>
        <button onClick={props.onClose} style={{ marginLeft: 8 }}>✕</button>
      </div>
    </div>
    {/* Canvas */}
    <canvas
      ref={canvasRef}
      style={{ flex: 1, display: 'block', cursor: 'pointer' }}
      onClick={handleCanvasClick}
      onMouseMove={handleCanvasHover}
    />
    {/* Detail panel */}
    {selectedNodeId && (
      <NodeDetailPanel
        node={tree.nodeMap.get(selectedNodeId)!}
        state={playerState}
        tree={tree}
        config={config}
        onUnlock={handleUnlockFromPanel}
      />
    )}
    {/* Respec modal */}
    {showRespecModal && (
      <RespecModal
        spentPoints={playerState.spentPoints}
        onConfirm={handleRespec}
        onCancel={() => setShowRespecModal(false)}
      />
    )}
  </div>
) : null;
```

### Step 10 — `src/zerotree/components/NodeDetailPanel.tsx`

```tsx
// Props: node, state, tree, config, onUnlock
// Renders the bottom panel with node name, type badge, stat info, ability description,
// unlock cost, prerequisite status, and [UNLOCK] button.
// Button is disabled and greyed if canUnlock returns false.
// Shows unlockReason string as tooltip on disabled button.
```

### Step 11 — `src/zerotree/components/RespecModal.tsx`

```tsx
// Props: spentPoints, onConfirm, onCancel
// Renders centered modal with:
// - "Reset all skills?" heading
// - "Cost: X skill points (30% tax)" explanation
// - [CONFIRM RESPEC] and [CANCEL] buttons
// Darkened backdrop (position:fixed, inset:0, z-index:1001, rgba(0,0,0,0.6))
```

### Step 12 — `src/zerotree/components/ZeroTreeMinimap.tsx`

```tsx
// Props: config, playerState, onClick, position: MinimapPosition
// Small fixed-position widget (120×100px)
// Shows per-tier progress bars (unlocked nodes / total nodes per tier)
// Shows available skill points
// onClick opens full tree
// Uses canvas element internally (no DOM per-node)
// Position CSS: { position:'fixed', [corner]: '16px', zIndex: 999 }
```

### Step 13 — `src/zerotree/index.ts`

Public API surface:
```typescript
export { ZeroTree } from './components/ZeroTree';
export { ZeroTreeMinimap } from './components/ZeroTreeMinimap';
export type {
  TreeConfig, PlayerState, ZeroTreeRef, AbilityDef, StatDelta,
  SkillNode, NodeType, MinimapPosition
} from './types';
```

---

## Host Game Integration — Complete Example

```typescript
// In your game's main component or game state manager:

import { useRef, useState } from 'react';
import { ZeroTree, ZeroTreeMinimap, ZeroTreeRef, TreeConfig, PlayerState } from './zerotree';

const TREE_CONFIG: TreeConfig = {
  treeSeed: 0xDEADBEEF,
  playerSeed: 0xCAFEBABE,
  cols: 9,
  rows: 7,
  maxSkillPoints: 150,
  statNames: ['strength', 'agility', 'intellect', 'vitality', 'luck'],
  statRanges: {
    strength:  [2, 15],
    agility:   [2, 12],
    intellect: [2, 18],
    vitality:  [3, 20],
    luck:      [1, 10],
  },
  abilityPool: [
    {
      id: 'storm-surge', name: 'Storm Surge', type: 'ACTIVE',
      description: 'Releases a radial burst dealing 140% agility damage.',
      execute: () => gameActions.activateStormSurge(),
    },
    {
      id: 'iron-skin', name: 'Iron Skin', type: 'PASSIVE',
      description: 'Permanently reduces incoming damage by 12%.',
    },
    // ... more abilities
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
    if (ability.type === 'ACTIVE') {
      inputHandler.unregisterAbility(ability.id);
    }
  },
};

export function GameUI() {
  const treeRef = useRef<ZeroTreeRef>(null);
  const [treeOpen, setTreeOpen] = useState(false);
  const [playerState, setPlayerState] = useState<PlayerState>({
    unlockedMask: 1n << BigInt(4 * 7 + 0), // root node at col=4, row=0
    skillPoints: 5,
    spentPoints: 0,
  });

  // Call from game logic on level up:
  // treeRef.current?.grantSkillPoints(3);

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
```

---

## Style Guide

All colors defined as CSS custom properties. Override by setting on `:root` or on the `<ZeroTree>` wrapper element:

```css
:root {
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
  --zt-font: 'monospace';
}
```

Typography: monospace throughout. No external font dependency.

Animations: all via Canvas API + requestAnimationFrame. No CSS transitions on canvas elements. CSS transitions only on React UI elements (header, panel, modal): 200ms ease.

---

## Performance Targets

- Tree generation (`generateTree`): < 1ms for 9×7 grid
- Canvas full redraw: < 4ms at 1920×1080
- Overlay open time: < 16ms (single frame)
- Particle system: max 200 particles, pooled at init, zero allocations mid-flight
- `useMemo` on `generateTree` — never regenerates during normal interaction
- `computeLayout` called only when canvas size changes

---

## Testing Scenarios

1. **Determinism test:** Call `generateTree` twice with same config, assert `JSON.stringify(nodes)` identical
2. **Bitmask test:** Unlock 5 nodes, serialize, deserialize, assert same nodes unlocked
3. **Edge symmetry test:** For every edge `(A→B)`, assert `edgeExists(B,A)` also true
4. **Respec tax test:** Spend 20 points, respec, assert `skillPoints === 14` (20 - floor(20*0.3)=6 → 14)
5. **Root persistence test:** After respec, root node always remains unlocked in mask
6. **Callback test:** Unlock a STAT node, assert `onStatChange` called with correct delta
7. **Ability round-trip test:** Unlock ACTIVE node, respec, assert `onAbilityRevoke` called
8. **Corrupt deserialize test:** `deserialize('!!!invalid!!!')` produces valid root-only state

---

## Accessibility

- All interactive canvas nodes respond to keyboard: Tab navigates nodes (spatial order), Enter unlocks
- Screen reader: hidden `<div aria-live="polite">` announces unlock events and errors
- High contrast: `--zt-edge-unlocked` defaults satisfy WCAG AA against `--zt-bg`
- Respec modal traps focus (focus-trap pattern)
- Escape key closes overlay

---

## Extended Features (Optional)

- **Prestige system:** Host calls `forceRespec()` with `treeSeed` incremented; same player, new tree layout
- **Animated background:** Canvas draws slow drifting particle field in background using `playerSeed`
- **Node search:** Text input in header filters nodes by stat name or ability name with dim/highlight
- **Export image:** Canvas `toDataURL()` call exports current tree state as PNG
