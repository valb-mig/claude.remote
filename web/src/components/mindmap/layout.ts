import type { MindKind, MindNode } from './model'

/**
 * Onde cada nó do mapa fica. Três arranjos com o mesmo desenho:
 * - `map`: o mapa mental clássico, galhos alternando à direita e à esquerda do centro;
 * - `right`: todos os galhos para a direita (cabe em meia tela);
 * - `tree`: de cima para baixo, recuado por nível (celular em pé).
 */
export type Mode = 'map' | 'right' | 'tree'

export type Box = { node: MindNode; x: number; y: number; w: number; h: number; depth: number; side: 1 | -1 }
export type Edge = { from: Box; to: Box }
export type Layout = { mode: Mode; boxes: Box[]; edges: Edge[]; width: number; height: number }

type Size = { w: number; h: number }

const LEAVES = new Set<MindKind>(['file', 'command', 'search', 'web', 'tool', 'notice', 'more'])
const ROOT: Size = { w: 200, h: 64 }
const TURN: Size = { w: 210, h: 58 }
const STEP: Size = { w: 200, h: 54 }
const LEAF: Size = { w: 196, h: 34 }

export const isLeaf = (n: MindNode) => LEAVES.has(n.kind)
const sizeOf = (n: MindNode): Size => (n.kind === 'root' ? ROOT : n.kind === 'turn' ? TURN : isLeaf(n) ? LEAF : STEP)

const PAD = 24
const COL_GAP = 40
/** Entre irmãos: mais espaço entre turnos, menos entre as pontas. */
const gapUnder = (n: MindNode) => (n.kind === 'root' ? 20 : n.kind === 'turn' ? 10 : 6)

function branches(root: MindNode, mode: Mode): Layout {
  const heights = new Map<MindNode, number>()
  const stack = (kids: MindNode[], gap: number) => kids.reduce((sum, k) => sum + heights.get(k)!, 0) + gap * Math.max(0, kids.length - 1)
  const measure = (n: MindNode): void => {
    n.children.forEach(measure)
    heights.set(n, Math.max(sizeOf(n).h, stack(n.children, gapUnder(n))))
  }
  measure(root)

  // Alternar o lado pela ordem: um turno nunca muda de lado quando chegam outros.
  const right = mode === 'map' ? root.children.filter((_, i) => i % 2 === 0) : root.children
  const left = mode === 'map' ? root.children.filter((_, i) => i % 2 === 1) : []
  const gap = gapUnder(root)
  const middle = Math.max(stack(right, gap), stack(left, gap), ROOT.h) / 2

  const boxes: Box[] = []
  const edges: Edge[] = []
  const rootBox: Box = { node: root, x: 0, y: middle - ROOT.h / 2, ...ROOT, depth: 0, side: 1 }
  boxes.push(rootBox)

  const place = (n: MindNode, parent: Box, top: number, side: 1 | -1, depth: number) => {
    const size = sizeOf(n)
    const span = heights.get(n)!
    const x = side === 1 ? parent.x + parent.w + COL_GAP : parent.x - COL_GAP - size.w
    const box: Box = { node: n, x, y: top + (span - size.h) / 2, ...size, depth, side }
    boxes.push(box)
    edges.push({ from: parent, to: box })
    let cursor = top + (span - stack(n.children, gapUnder(n))) / 2
    for (const kid of n.children) {
      place(kid, box, cursor, side, depth + 1)
      cursor += heights.get(kid)! + gapUnder(n)
    }
  }
  for (const [list, side] of [
    [right, 1],
    [left, -1],
  ] as const) {
    let cursor = middle - stack(list, gap) / 2
    for (const kid of list) {
      place(kid, rootBox, cursor, side, 1)
      cursor += heights.get(kid)! + gap
    }
  }

  const minX = Math.min(...boxes.map((b) => b.x))
  const minY = Math.min(...boxes.map((b) => b.y))
  for (const b of boxes) {
    b.x += PAD - minX
    b.y += PAD - minY
  }
  return {
    mode,
    boxes,
    edges,
    width: Math.max(...boxes.map((b) => b.x + b.w)) + PAD,
    height: Math.max(...boxes.map((b) => b.y + b.h)) + PAD,
  }
}

const INDENT = 22
const ROW_GAP = 6
/** Nós largos demais ficam difíceis de ler numa tela grande. */
const TREE_MAX_W = 560

function tree(root: MindNode, width: number): Layout {
  const boxes: Box[] = []
  const edges: Edge[] = []
  let y = PAD
  const visit = (n: MindNode, depth: number, parent?: Box) => {
    if (n.kind === 'turn' && boxes.length > 1) y += 8
    const x = PAD + depth * INDENT
    const box: Box = { node: n, x, y, w: Math.max(150, Math.min(width - x - PAD, TREE_MAX_W - depth * INDENT)), h: sizeOf(n).h, depth, side: 1 }
    boxes.push(box)
    if (parent) edges.push({ from: parent, to: box })
    y += box.h + ROW_GAP
    for (const kid of n.children) visit(kid, depth + 1, box)
  }
  visit(root, 0)
  return { mode: 'tree', boxes, edges, width: Math.max(...boxes.map((b) => b.x + b.w)) + PAD, height: y - ROW_GAP + PAD }
}

export function layout(root: MindNode, mode: Mode, width: number): Layout {
  return mode === 'tree' ? tree(root, width) : branches(root, mode)
}

/** Curva do pai ao filho, como os galhos de um mapa mental; na árvore, um cotovelo arredondado. */
export function edgePath({ from: a, to: b }: Edge, mode: Mode): string {
  if (mode === 'tree') {
    const x = a.x + 12
    const cy = b.y + b.h / 2
    return `M ${x} ${a.y + a.h} V ${cy - 8} Q ${x} ${cy}, ${x + 8} ${cy} H ${b.x}`
  }
  const right = b.side === 1
  const x1 = right ? a.x + a.w : a.x
  const x2 = right ? b.x : b.x + b.w
  const y1 = a.y + a.h / 2
  const y2 = b.y + b.h / 2
  const m = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${m} ${y1}, ${m} ${y2}, ${x2} ${y2}`
}

/** Galhos afinam do centro para as pontas. */
export const edgeWidth = (b: Box) => (b.depth <= 1 ? 3 : isLeaf(b.node) ? 1.25 : 2)

/** Cores dos galhos (uma por turno), legíveis no tema claro e no escuro. */
export const BRANCH_COLORS = ['#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#f43f5e', '#14b8a6', '#6366f1', '#f97316']
export const branchColor = (branch: number) => (branch < 0 ? 'var(--primary)' : BRANCH_COLORS[branch % BRANCH_COLORS.length])
