/**
 * ZeroTree.jsx — Demonstration Component
 * ZeroFamily-aligned procedural skill progression tree
 * https://github.com/MushroomFleet/ZeroTree-JSX
 *
 * Mock data version for demonstration purposes.
 * Drop this into any React project to preview ZeroTree features.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";

// ─── ZeroFamily Hash Engine ──────────────────────────────────────────────────

function positionHash(col, row, z, salt) {
  let h = ((salt ^ 0x811c9dc5) >>> 0);
  const vals = [col & 0xFF, (col >> 8) & 0xFF, row & 0xFF, (row >> 8) & 0xFF, z & 0xFF];
  for (const v of vals) {
    h ^= v;
    h = (Math.imul(h, 0x01000193) >>> 0);
  }
  return h >>> 0;
}

function pairHash(ca, ra, cb, rb, salt) {
  const pairs = [[ca, ra], [cb, rb]].sort((x, y) => x[0] !== y[0] ? x[0] - y[0] : x[1] - y[1]);
  let h = ((salt ^ 0x811c9dc5) >>> 0);
  for (const [c, r] of pairs) {
    for (const v of [c & 0xFF, (c >> 8) & 0xFF, r & 0xFF, (r >> 8) & 0xFF]) {
      h ^= v;
      h = (Math.imul(h, 0x01000193) >>> 0);
    }
  }
  return h >>> 0;
}

function hashToFloat(h) { return (h >>> 0) / 0x100000000; }

function edgeExists(ca, ra, cb, rb, treeSeed) {
  if (Math.abs(ra - rb) !== 1) return false;
  if (Math.abs(ca - cb) > 2) return false;
  return hashToFloat(pairHash(ca, ra, cb, rb, treeSeed)) > 0.52;
}

// ─── Mock Data ───────────────────────────────────────────────────────────────

const MOCK_CONFIG = {
  treeSeed:   0xDEADBEEF,
  playerSeed: 0xCAFEBABE,
  cols: 9,
  rows: 7,
  statNames: ["Strength", "Agility", "Intellect", "Vitality", "Luck"],
  statRanges: {
    Strength:  [2, 15],
    Agility:   [2, 12],
    Intellect: [2, 18],
    Vitality:  [3, 20],
    Luck:      [1, 10],
  },
  abilityPool: [
    { id: "storm-surge",  name: "Storm Surge",   type: "ACTIVE",  description: "Radial burst dealing 140% Agility damage to all nearby enemies." },
    { id: "iron-skin",    name: "Iron Skin",      type: "PASSIVE", description: "Permanently reduces all incoming damage by 12%." },
    { id: "void-step",   name: "Void Step",      type: "ACTIVE",  description: "Teleport 8 units in any direction, leaving a shadow decoy." },
    { id: "blood-pact",  name: "Blood Pact",     type: "PASSIVE", description: "Each kill restores 3% maximum Vitality instantly." },
    { id: "mind-spike",  name: "Mind Spike",     type: "ACTIVE",  description: "Intellect-scaled psychic lance with 25% chance to stun." },
    { id: "fortune",     name: "Fortune's Eye",  type: "PASSIVE", description: "Luck now contributes 50% of its value to all crit calculations." },
  ],
};

// ─── Tree Generator ───────────────────────────────────────────────────────────

const NODE_TYPES = ["STAT","PASSIVE","ACTIVE","STAT","KEYSTONE","STAT","PASSIVE","STAT"];
const TYPE_GLYPHS = { STAT: "Σ", PASSIVE: "⟳", ACTIVE: "⚡", KEYSTONE: "◆" };
const TYPE_COLORS = {
  STAT:     "#4af7a0",
  PASSIVE:  "#a78bfa",
  ACTIVE:   "#f59e0b",
  KEYSTONE: "#f97316",
};

function generateTree(config) {
  const { treeSeed, cols, rows, statNames, statRanges, abilityPool } = config;
  const nodes = [];
  const centerCol = Math.floor(cols / 2);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const h = positionHash(col, row, 0, treeSeed);
      let type = NODE_TYPES[h % 8];
      if (row < 5 && type === "KEYSTONE") type = "STAT";
      const statIdx = positionHash(col, row, 3, treeSeed) % statNames.length;
      const stat = statNames[statIdx];
      const range = statRanges[stat];
      const rawMag = hashToFloat(positionHash(col, row, 1, treeSeed));
      const magnitude = Math.round(range[0] + rawMag * (range[1] - range[0]));
      const unlockCost = row === 0 ? 0 : 5 + row * 3 + (positionHash(col, row, 4, treeSeed) % 5);
      const isRoot = col === centerCol && row === 0;
      let abilityRef;
      if ((type === "ACTIVE" || type === "PASSIVE") && abilityPool.length > 0) {
        abilityRef = abilityPool[positionHash(col, row, 2, treeSeed) % abilityPool.length];
      }
      nodes.push({
        id: `${col}:${row}`,
        col, row,
        tier: row,
        type: isRoot ? "STAT" : type,
        stat,
        magnitude,
        unlockCost: isRoot ? 0 : unlockCost,
        abilityRef,
        visualVariant: positionHash(col, row, 5, treeSeed) % 8,
        isRoot,
      });
    }
  }

  // Build edges
  const edges = [];
  const edgeSet = new Set();
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      for (let nc = 0; nc < cols; nc++) {
        if (Math.abs(c - nc) > 2) continue;
        if (edgeExists(c, r, nc, r + 1, treeSeed)) {
          const key = [c, r, nc, r+1].join(",");
          if (!edgeSet.has(key)) { edgeSet.add(key); edges.push({ from: `${c}:${r}`, to: `${nc}:${r+1}` }); }
        }
      }
    }
    // Fallback: guarantee at least one edge per tier
    const tierEdges = edges.filter(e => {
      const [,fr] = e.from.split(":").map(Number);
      const [,tr] = e.to.split(":").map(Number);
      return fr === r && tr === r + 1;
    });
    if (tierEdges.length === 0) {
      edges.push({ from: `${centerCol}:${r}`, to: `${centerCol}:${r+1}` });
    }
  }

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  return { nodes, edges, nodeMap };
}

// ─── Unlock Logic ─────────────────────────────────────────────────────────────

function nodeIndex(node, rows) { return node.col * rows + node.row; }

function isUnlocked(node, mask, rows) {
  return (mask >> BigInt(nodeIndex(node, rows)) & 1n) === 1n;
}

function hasPrerequisite(node, mask, tree, rows) {
  if (node.isRoot) return true;
  const prereqs = tree.edges
    .filter(e => e.to === node.id)
    .map(e => tree.nodeMap.get(e.from))
    .filter(n => n && n.row === node.row - 1);
  return prereqs.some(n => isUnlocked(n, mask, rows));
}

function canUnlock(node, state, tree, rows) {
  if (isUnlocked(node, state.mask, rows)) return { ok: false, reason: "Already unlocked" };
  if (state.points < node.unlockCost) return { ok: false, reason: `Need ${node.unlockCost} pts (have ${state.points})` };
  if (!hasPrerequisite(node, state.mask, tree, rows)) return { ok: false, reason: "Prerequisite not met" };
  return { ok: true };
}

// ─── Canvas Layout ────────────────────────────────────────────────────────────

function computeLayout(tree, w, h, config) {
  const { cols, rows } = config;
  const padX = 60, padTop = 70, padBot = 120;
  const usableW = w - padX * 2;
  const usableH = h - padTop - padBot;
  const map = new Map();
  for (const node of tree.nodes) {
    const x = padX + (node.col / (cols - 1)) * usableW;
    const y = h - padBot - (node.row / (rows - 1)) * usableH;
    const radius = node.type === "KEYSTONE" ? 18 : node.isRoot ? 16 : 12;
    map.set(node.id, { x, y, radius });
  }
  return map;
}

// ─── Canvas Renderer ──────────────────────────────────────────────────────────

function drawTree(ctx, tree, layout, state, config, selectedId, hoveredId, animTime) {
  const { rows } = config;
  const w = ctx.canvas.width, h = ctx.canvas.height;

  // Background
  ctx.fillStyle = "#080810";
  ctx.fillRect(0, 0, w, h);

  // Subtle grid lines
  ctx.strokeStyle = "rgba(255,255,255,0.03)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 20; i++) {
    ctx.beginPath(); ctx.moveTo(i * w / 20, 0); ctx.lineTo(i * w / 20, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * h / 20); ctx.lineTo(w, i * h / 20); ctx.stroke();
  }

  // Edges
  for (const edge of tree.edges) {
    const a = layout.get(edge.from), b = layout.get(edge.to);
    if (!a || !b) continue;
    const nodeA = tree.nodeMap.get(edge.from), nodeB = tree.nodeMap.get(edge.to);
    const bothUnlocked = isUnlocked(nodeA, state.mask, rows) && isUnlocked(nodeB, state.mask, rows);
    const oneUnlocked = isUnlocked(nodeA, state.mask, rows) || isUnlocked(nodeB, state.mask, rows);

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);

    if (bothUnlocked) {
      ctx.strokeStyle = "rgba(0,212,255,0.7)";
      ctx.lineWidth = 2;
      ctx.shadowBlur = 8;
      ctx.shadowColor = "#00d4ff";
      ctx.setLineDash([]);
    } else if (oneUnlocked) {
      ctx.strokeStyle = "rgba(0,212,255,0.25)";
      ctx.lineWidth = 1.5;
      ctx.shadowBlur = 0;
      ctx.setLineDash([4, 4]);
    } else {
      ctx.strokeStyle = "rgba(42,42,60,0.8)";
      ctx.lineWidth = 1;
      ctx.shadowBlur = 0;
      ctx.setLineDash([3, 5]);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
  }

  // Nodes
  for (const node of tree.nodes) {
    const pos = layout.get(node.id);
    if (!pos) continue;
    const unlocked = isUnlocked(node, state.mask, rows);
    const isSelected = node.id === selectedId;
    const isHovered = node.id === hoveredId;
    const color = node.isRoot ? "#ffd700" : TYPE_COLORS[node.type];
    const prereqCheck = canUnlock(node, state, tree, rows);
    const available = !unlocked && prereqCheck.ok;

    let r = pos.radius;
    // Pulse animation on unlocked nodes
    if (unlocked && !node.isRoot) {
      const pulse = Math.sin(animTime * 0.002 + node.col * 0.7) * 0.08 + 1;
      r = pos.radius * pulse;
    }
    if (isHovered) r *= 1.15;

    // Keystone shimmer ring
    if (node.type === "KEYSTONE") {
      const shimmerAngle = (animTime * 0.001) % (Math.PI * 2);
      const grad = ctx.createConicalGradient
        ? null
        : (() => {
          const g = ctx.createLinearGradient(
            pos.x + Math.cos(shimmerAngle) * r * 1.5,
            pos.y + Math.sin(shimmerAngle) * r * 1.5,
            pos.x - Math.cos(shimmerAngle) * r * 1.5,
            pos.y - Math.sin(shimmerAngle) * r * 1.5
          );
          g.addColorStop(0, "rgba(249,115,22,0.8)");
          g.addColorStop(0.5, "rgba(255,215,0,0.9)");
          g.addColorStop(1, "rgba(249,115,22,0.8)");
          return g;
        })();
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r + 5, 0, Math.PI * 2);
      ctx.strokeStyle = grad || "#f97316";
      ctx.lineWidth = 3;
      ctx.shadowBlur = 15;
      ctx.shadowColor = "#f97316";
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Selection ring
    if (isSelected) {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r + 7, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 2;
      ctx.shadowBlur = 20;
      ctx.shadowColor = "#ffffff";
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Node fill
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
    if (node.isRoot) {
      const g = ctx.createRadialGradient(pos.x - r * 0.3, pos.y - r * 0.3, 0, pos.x, pos.y, r);
      g.addColorStop(0, "#fff5a0"); g.addColorStop(1, "#b8860b");
      ctx.fillStyle = g;
    } else if (unlocked) {
      const g = ctx.createRadialGradient(pos.x - r * 0.3, pos.y - r * 0.3, 0, pos.x, pos.y, r);
      g.addColorStop(0, color + "ff"); g.addColorStop(1, color + "66");
      ctx.fillStyle = g;
      ctx.shadowBlur = 18;
      ctx.shadowColor = color;
    } else if (available) {
      ctx.fillStyle = "#0d0d1a";
      ctx.shadowBlur = 6;
      ctx.shadowColor = color;
    } else {
      ctx.fillStyle = "#111120";
    }
    ctx.fill();
    ctx.shadowBlur = 0;

    // Node border
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
    if (node.isRoot) {
      ctx.strokeStyle = "#ffd700"; ctx.lineWidth = 2.5;
    } else if (unlocked) {
      ctx.strokeStyle = color; ctx.lineWidth = 2;
    } else if (available) {
      ctx.strokeStyle = color + "aa"; ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
    } else {
      ctx.strokeStyle = "#2a2a4a"; ctx.lineWidth = 1;
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Glyph
    const glyph = node.isRoot ? "★" : TYPE_GLYPHS[node.type];
    ctx.font = `bold ${node.type === "KEYSTONE" ? 14 : 11}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = node.isRoot ? "#fff8e0"
      : unlocked ? "#ffffff"
      : available ? color + "dd"
      : "#404060";
    ctx.fillText(glyph, pos.x, pos.y);
  }
}

// ─── Hit Test ─────────────────────────────────────────────────────────────────

function hitTest(clientX, clientY, canvasEl, layout, tree) {
  const rect = canvasEl.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  for (const node of tree.nodes) {
    const pos = layout.get(node.id);
    if (!pos) continue;
    const dx = x - pos.x, dy = y - pos.y;
    if (Math.sqrt(dx * dx + dy * dy) <= pos.radius + 6) return node;
  }
  return null;
}

// ─── Minimap ──────────────────────────────────────────────────────────────────

function ZeroTreeMinimap({ tree, state, config, onClick }) {
  const { rows } = config;
  const tierData = [];
  for (let r = 0; r < rows; r++) {
    const nodesInTier = tree.nodes.filter(n => n.row === r);
    const unlocked = nodesInTier.filter(n => isUnlocked(n, state.mask, rows)).length;
    tierData.push({ total: nodesInTier.length, unlocked });
  }

  return (
    <div onClick={onClick} style={{
      position: "fixed", bottom: 20, right: 20,
      width: 130, padding: "10px 12px",
      background: "rgba(8,8,20,0.92)",
      border: "1px solid rgba(0,212,255,0.3)",
      borderRadius: 6,
      cursor: "pointer",
      fontFamily: "'Courier New', monospace",
      zIndex: 999,
      boxShadow: "0 0 20px rgba(0,212,255,0.1), inset 0 0 20px rgba(0,0,0,0.5)",
      transition: "border-color 0.2s",
    }}
    onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(0,212,255,0.7)"}
    onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(0,212,255,0.3)"}
    >
      <div style={{ color: "#f59e0b", fontSize: 11, letterSpacing: 2, marginBottom: 8 }}>◈ ZEROTREE</div>
      {[...tierData].reverse().map((t, i) => {
        const fill = t.total > 0 ? t.unlocked / t.total : 0;
        return (
          <div key={i} style={{ marginBottom: 3, display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 90, height: 4, background: "rgba(255,255,255,0.1)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                width: `${fill * 100}%`, height: "100%",
                background: fill === 1 ? "#4af7a0" : fill > 0 ? "#00d4ff" : "transparent",
                borderRadius: 2, transition: "width 0.3s",
              }} />
            </div>
            <span style={{ color: "#404060", fontSize: 9 }}>{t.unlocked}/{t.total}</span>
          </div>
        );
      })}
      <div style={{ color: "#4af7a0", fontSize: 11, marginTop: 8, textAlign: "right" }}>
        {state.points} <span style={{ color: "#404060" }}>pts</span>
      </div>
    </div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function NodeDetailPanel({ node, state, tree, config, onUnlock }) {
  if (!node) return null;
  const { rows } = config;
  const unlocked = isUnlocked(node, state.mask, rows);
  const { ok, reason } = canUnlock(node, state, tree, rows);
  const color = node.isRoot ? "#ffd700" : TYPE_COLORS[node.type];

  return (
    <div style={{
      position: "absolute", bottom: 0, left: 0, right: 0,
      height: 110,
      background: "rgba(8,8,20,0.97)",
      borderTop: `1px solid ${color}44`,
      display: "flex", alignItems: "center",
      padding: "0 28px", gap: 24,
      fontFamily: "'Courier New', monospace",
    }}>
      {/* Icon */}
      <div style={{
        width: 48, height: 48, borderRadius: 6,
        border: `2px solid ${color}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 22, color,
        background: `${color}11`,
        boxShadow: `0 0 16px ${color}44`,
        flexShrink: 0,
      }}>
        {node.isRoot ? "★" : TYPE_GLYPHS[node.type]}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 3 }}>
          <span style={{ color: "#ffffff", fontSize: 14, fontWeight: "bold", letterSpacing: 1 }}>
            {node.abilityRef ? node.abilityRef.name.toUpperCase() : `${node.stat.toUpperCase()} NODE`}
          </span>
          <span style={{
            fontSize: 9, padding: "1px 6px",
            border: `1px solid ${color}88`,
            color, borderRadius: 3, letterSpacing: 1,
          }}>{node.type}</span>
          <span style={{ color: "#404060", fontSize: 9 }}>TIER {node.tier}</span>
        </div>
        <div style={{ color: "#8888aa", fontSize: 11, marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {node.abilityRef ? node.abilityRef.description : `+${node.magnitude} ${node.stat}`}
        </div>
        {node.abilityRef && (
          <div style={{ color: "#4af7a0", fontSize: 10 }}>+{node.magnitude} {node.stat} <span style={{ color: "#404060" }}>(passive bonus)</span></div>
        )}
      </div>

      {/* Cost + Unlock */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
        {!node.isRoot && (
          <div style={{ color: node.unlockCost > state.points ? "#f87171" : "#4af7a0", fontSize: 13, fontWeight: "bold" }}>
            {node.unlockCost} <span style={{ color: "#404060", fontSize: 10, fontWeight: "normal" }}>pts</span>
          </div>
        )}
        {unlocked ? (
          <div style={{ color: "#4af7a0", fontSize: 11, letterSpacing: 1 }}>✓ UNLOCKED</div>
        ) : node.isRoot ? (
          <div style={{ color: "#ffd700", fontSize: 11 }}>★ ROOT NODE</div>
        ) : (
          <button onClick={() => ok && onUnlock(node)} style={{
            padding: "6px 16px",
            background: ok ? `${color}22` : "transparent",
            border: `1px solid ${ok ? color : "#333"}`,
            color: ok ? color : "#444",
            borderRadius: 4,
            cursor: ok ? "pointer" : "not-allowed",
            fontFamily: "'Courier New', monospace",
            fontSize: 11, letterSpacing: 1,
            transition: "all 0.15s",
          }}
          title={!ok ? reason : ""}
          onMouseEnter={e => ok && (e.target.style.background = `${color}44`)}
          onMouseLeave={e => ok && (e.target.style.background = `${color}22`)}
          >
            {ok ? "UNLOCK" : "LOCKED"}
          </button>
        )}
        {!unlocked && !node.isRoot && !ok && (
          <div style={{ color: "#664444", fontSize: 9, textAlign: "right", maxWidth: 120 }}>{reason}</div>
        )}
      </div>
    </div>
  );
}

// ─── Respec Modal ─────────────────────────────────────────────────────────────

function RespecModal({ spentPoints, onConfirm, onCancel }) {
  const tax = Math.max(1, Math.floor(spentPoints * 0.3));
  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 10,
      background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: "#0a0a18",
        border: "1px solid rgba(249,115,22,0.5)",
        borderRadius: 8,
        padding: "28px 32px",
        fontFamily: "'Courier New', monospace",
        textAlign: "center",
        boxShadow: "0 0 40px rgba(249,115,22,0.15)",
        maxWidth: 340,
      }}>
        <div style={{ color: "#f97316", fontSize: 18, letterSpacing: 2, marginBottom: 12 }}>⚠ RESPEC</div>
        <div style={{ color: "#8888aa", fontSize: 12, marginBottom: 8 }}>Reset all unlocked skills.</div>
        <div style={{ color: "#f87171", fontSize: 12, marginBottom: 24 }}>
          Tax: <strong style={{ color: "#fff" }}>{tax} skill points</strong> (30% of {spentPoints} spent)
        </div>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button onClick={onConfirm} style={{
            padding: "8px 20px", background: "rgba(249,115,22,0.15)",
            border: "1px solid #f97316", color: "#f97316",
            borderRadius: 4, cursor: "pointer",
            fontFamily: "'Courier New', monospace", fontSize: 12, letterSpacing: 1,
          }}>CONFIRM</button>
          <button onClick={onCancel} style={{
            padding: "8px 20px", background: "transparent",
            border: "1px solid #334", color: "#8888aa",
            borderRadius: 4, cursor: "pointer",
            fontFamily: "'Courier New', monospace", fontSize: 12, letterSpacing: 1,
          }}>CANCEL</button>
        </div>
      </div>
    </div>
  );
}

// ─── Stat Summary Bar ─────────────────────────────────────────────────────────

function StatSummary({ tree, state, config }) {
  const { rows, statNames } = config;
  const totals = {};
  for (const n of statNames) totals[n] = 0;
  for (const node of tree.nodes) {
    if (isUnlocked(node, state.mask, rows)) totals[node.stat] = (totals[node.stat] || 0) + node.magnitude;
  }
  const statColors = { Strength:"#f87171", Agility:"#4af7a0", Intellect:"#60a5fa", Vitality:"#a78bfa", Luck:"#f59e0b" };

  return (
    <div style={{
      display: "flex", gap: 16, alignItems: "center",
      padding: "0 8px",
    }}>
      {statNames.map(s => (
        <div key={s} style={{ textAlign: "center" }}>
          <div style={{ color: statColors[s] || "#fff", fontSize: 13, fontWeight: "bold" }}>+{totals[s]}</div>
          <div style={{ color: "#404060", fontSize: 9, letterSpacing: 1 }}>{s.slice(0,3).toUpperCase()}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Main ZeroTree Component ──────────────────────────────────────────────────

export default function ZeroTree({ visible = true, onClose, config = MOCK_CONFIG, initialPoints = 20 }) {
  const tree = useMemo(() => generateTree(config), [config.treeSeed]);
  const rootNode = useMemo(() => tree.nodes.find(n => n.isRoot), [tree]);
  const rootIdx = BigInt(rootNode.col * config.rows + rootNode.row);

  const [state, setState] = useState({
    mask: 1n << rootIdx,
    points: initialPoints,
    spent: 0,
  });
  const [selectedId, setSelectedId] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [showRespec, setShowRespec] = useState(false);
  const [showMinimap, setShowMinimap] = useState(true);
  const [notifications, setNotifications] = useState([]);

  const canvasRef = useRef(null);
  const layoutRef = useRef(new Map());
  const animTimeRef = useRef(0);
  const rafRef = useRef(null);

  const addNotification = useCallback((msg, color = "#4af7a0") => {
    const id = Date.now();
    setNotifications(n => [...n, { id, msg, color }]);
    setTimeout(() => setNotifications(n => n.filter(x => x.id !== id)), 2500);
  }, []);

  // Resize canvas to fill parent
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      layoutRef.current = computeLayout(tree, canvas.width, canvas.height, config);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement);
    return () => ro.disconnect();
  }, [tree, config]);

  // RAF loop
  useEffect(() => {
    if (!visible) return;
    const canvas = canvasRef.current;
    let last = performance.now();
    const loop = (now) => {
      const dt = now - last; last = now;
      animTimeRef.current += dt;
      const ctx = canvas?.getContext("2d");
      if (ctx && layoutRef.current.size > 0) {
        drawTree(ctx, tree, layoutRef.current, state, config, selectedId, hoveredId, animTimeRef.current);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [visible, tree, state, selectedId, hoveredId, config]);

  const handleCanvasClick = useCallback((e) => {
    const node = hitTest(e.clientX, e.clientY, canvasRef.current, layoutRef.current, tree);
    if (!node) { setSelectedId(null); return; }
    if (selectedId === node.id) {
      // Second click = attempt unlock
      const { ok, reason } = canUnlock(node, state, tree, config.rows);
      if (!ok) { addNotification(reason, "#f87171"); return; }
      const newMask = state.mask | (1n << BigInt(nodeIndex(node, config.rows)));
      setState(s => ({ mask: newMask, points: s.points - node.unlockCost, spent: s.spent + node.unlockCost }));
      addNotification(
        node.abilityRef ? `⚡ ${node.abilityRef.name} unlocked!` : `+${node.magnitude} ${node.stat}`,
        TYPE_COLORS[node.type]
      );
    } else {
      setSelectedId(node.id);
    }
  }, [selectedId, state, tree, config, addNotification]);

  const handleCanvasMove = useCallback((e) => {
    const node = hitTest(e.clientX, e.clientY, canvasRef.current, layoutRef.current, tree);
    setHoveredId(node ? node.id : null);
  }, [tree]);

  const handleUnlock = useCallback((node) => {
    const { ok, reason } = canUnlock(node, state, tree, config.rows);
    if (!ok) { addNotification(reason, "#f87171"); return; }
    const newMask = state.mask | (1n << BigInt(nodeIndex(node, config.rows)));
    setState(s => ({ mask: newMask, points: s.points - node.unlockCost, spent: s.spent + node.unlockCost }));
    addNotification(
      node.abilityRef ? `⚡ ${node.abilityRef.name} unlocked!` : `+${node.magnitude} ${node.stat}`,
      TYPE_COLORS[node.type]
    );
  }, [state, tree, config, addNotification]);

  const handleRespec = useCallback(() => {
    const tax = Math.max(1, Math.floor(state.spent * 0.3));
    const newPoints = state.spent - tax;
    setState({ mask: 1n << rootIdx, points: newPoints, spent: 0 });
    setSelectedId(null);
    setShowRespec(false);
    addNotification("Tree reset. −" + tax + " pts tax", "#f97316");
  }, [state, rootIdx, addNotification]);

  const handleGrantPoints = useCallback(() => {
    setState(s => ({ ...s, points: s.points + 10 }));
    addNotification("+10 Skill Points granted", "#ffd700");
  }, [addNotification]);

  if (!visible) return null;

  const selectedNode = selectedId ? tree.nodeMap.get(selectedId) : null;

  return (
    <>
      {/* Main overlay */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 1000,
        display: "flex", flexDirection: "column",
        background: "#080810",
        fontFamily: "'Courier New', monospace",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center",
          padding: "10px 20px",
          borderBottom: "1px solid rgba(0,212,255,0.15)",
          gap: 20,
          background: "rgba(8,8,20,0.98)",
          flexShrink: 0,
        }}>
          <span style={{ color: "#f59e0b", fontSize: 16, letterSpacing: 3, fontWeight: "bold" }}>◈ ZEROTREE</span>
          <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.1)" }} />
          <StatSummary tree={tree} state={state} config={config} />
          <div style={{ flex: 1 }} />
          <span style={{ color: "#4af7a0", fontSize: 13 }}>
            {state.points} <span style={{ color: "#404060", fontSize: 10 }}>SKILL PTS</span>
          </span>
          <button onClick={handleGrantPoints} style={{
            padding: "5px 12px", background: "rgba(255,215,0,0.1)",
            border: "1px solid rgba(255,215,0,0.4)", color: "#ffd700",
            borderRadius: 4, cursor: "pointer",
            fontFamily: "'Courier New', monospace", fontSize: 10, letterSpacing: 1,
          }}>+10 PTS</button>
          <button onClick={() => setShowRespec(true)} disabled={state.spent === 0} style={{
            padding: "5px 12px",
            background: state.spent > 0 ? "rgba(249,115,22,0.1)" : "transparent",
            border: `1px solid ${state.spent > 0 ? "rgba(249,115,22,0.5)" : "#222"}`,
            color: state.spent > 0 ? "#f97316" : "#333",
            borderRadius: 4, cursor: state.spent > 0 ? "pointer" : "default",
            fontFamily: "'Courier New', monospace", fontSize: 10, letterSpacing: 1,
          }}>RESPEC</button>
          {onClose && (
            <button onClick={onClose} style={{
              padding: "5px 10px", background: "transparent",
              border: "1px solid #222", color: "#666",
              borderRadius: 4, cursor: "pointer",
              fontFamily: "'Courier New', monospace", fontSize: 12,
            }}>✕</button>
          )}
        </div>

        {/* Canvas area */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          <canvas
            ref={canvasRef}
            style={{ width: "100%", height: "100%", display: "block", cursor: hoveredId ? "pointer" : "default" }}
            onClick={handleCanvasClick}
            onMouseMove={handleCanvasMove}
            onMouseLeave={() => setHoveredId(null)}
          />

          {/* Instruction hint */}
          <div style={{
            position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
            color: "#2a2a4a", fontSize: 10, letterSpacing: 2, pointerEvents: "none",
          }}>
            CLICK TO SELECT · CLICK AGAIN TO UNLOCK
          </div>

          {/* Respec modal */}
          {showRespec && (
            <RespecModal
              spentPoints={state.spent}
              onConfirm={handleRespec}
              onCancel={() => setShowRespec(false)}
            />
          )}

          {/* Notifications */}
          <div style={{ position: "absolute", top: 40, right: 20, display: "flex", flexDirection: "column", gap: 6, pointerEvents: "none" }}>
            {notifications.map(n => (
              <div key={n.id} style={{
                background: "rgba(8,8,20,0.95)",
                border: `1px solid ${n.color}66`,
                borderLeft: `3px solid ${n.color}`,
                color: n.color, fontSize: 11,
                padding: "6px 14px", borderRadius: 4,
                letterSpacing: 0.5,
                animation: "fadeIn 0.2s ease",
              }}>{n.msg}</div>
            ))}
          </div>
        </div>

        {/* Detail panel */}
        <div style={{ position: "relative", flexShrink: 0, height: selectedNode ? 110 : 0, transition: "height 0.2s", overflow: "hidden" }}>
          <NodeDetailPanel
            node={selectedNode}
            state={state}
            tree={tree}
            config={config}
            onUnlock={handleUnlock}
          />
        </div>
      </div>

      {/* Minimap (outside overlay so it shows during gameplay) */}
      {showMinimap && !visible && (
        <ZeroTreeMinimap tree={tree} state={state} config={config} onClick={() => {}} />
      )}

      <style>{`@keyframes fadeIn { from { opacity:0; transform:translateX(8px); } to { opacity:1; transform:translateX(0); } }`}</style>
    </>
  );
}

// Also export sub-components and utilities for direct use
export { ZeroTreeMinimap, NodeDetailPanel, generateTree, MOCK_CONFIG, TYPE_COLORS, TYPE_GLYPHS };
