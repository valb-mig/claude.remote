import type { MindKind, MindNode } from './model'

/**
 * Onde cada nó do mapa fica. Quatro arranjos com o mesmo desenho:
 * - `path`: o caminho, uma linha por turno — cada nó sai do anterior, e numa decisão o caminho segue
 *   pela opção escolhida, com as descartadas penduradas embaixo;
 * - `map`: o mapa mental clássico, galhos alternando à direita e à esquerda do centro;
 * - `right`: todos os galhos para a direita (cabe em meia tela);
 * - `tree`: de cima para baixo, recuado por nível (celular em pé).
 */
export type Mode = 'path' | 'map' | 'right' | 'tree'

export type Box = { node: MindNode; x: number; y: number; w: number; h: number; depth: number; side: 1 | -1 }
export type Edge = { from: Box; to: Box }
export type Layout = { mode: Mode; boxes: Box[]; edges: Edge[]; width: number; height: number }

type Size = { w: number; h: number }

const LEAVES = new Set<MindKind>(['file', 'command', 'search', 'web', 'tool', 'notice', 'more', 'option'])
const ROOT: Size = { w: 200, h: 64 }
const TURN: Size = { w: 210, h: 58 }
const STEP: Size = { w: 200, h: 54 }
const LEAF: Size = { w: 196, h: 34 }
// As pontas do losango comem largura dos dois lados; ele é mais largo para o texto caber igual.
const DECISION: Size = { w: 224, h: 58 }

export const isLeaf = (n: MindNode) => LEAVES.has(n.kind)
const sizeOf = (n: MindNode): Size =>
  n.kind === 'root' ? ROOT : n.kind === 'turn' ? TURN : n.kind === 'decision' ? DECISION : isLeaf(n) ? LEAF : STEP

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

/** Espaço entre dois nós seguidos do caminho, com lugar para a seta. */
const CHAIN_GAP = 34
/** Entre as opções penduradas embaixo de uma decisão. */
const FORK_GAP = 8
/** Entre um turno e o próximo. */
const LANE_GAP = 28
/** Quanto as opções descartadas recuam em relação ao losango. */
const FORK_INDENT = 28
/** Onde corre a linha que liga os turnos, a partir da borda esquerda deles. */
const SPINE = 18

/**
 * O que entra na corrente de um turno, em ordem: os passos, as decisões e a resposta. No histórico a
 * decisão mora dentro do passo que fez a pergunta; aqui ela sai logo depois dele, para o caminho
 * passar por ela. As ações de cada passo (arquivos, comandos) não entram: ficam no resumo do passo,
 * que é o que fazia o mapa crescer tanto para baixo.
 */
function chainOf(turn: MindNode): MindNode[] {
  return turn.children.flatMap((c) => (c.kind === 'decision' ? [c] : [c, ...c.children.filter((k) => k.kind === 'decision')]))
}

function path(root: MindNode): Layout {
  const boxes: Box[] = []
  const edges: Edge[] = []
  const put = (node: MindNode, x: number, y: number, depth: number): Box => {
    const s = sizeOf(node)
    const b: Box = { node, x, y, w: s.w, h: s.h, depth, side: 1 }
    boxes.push(b)
    return b
  }
  const rootBox = put(root, PAD, PAD, 0)
  let spine: Box = rootBox
  let top = rootBox.y + rootBox.h + LANE_GAP

  for (const turn of root.children) {
    const chain = chainOf(turn)
    // Todos os nós da faixa ficam centrados na mesma linha, a do mais alto deles.
    const lane = Math.max(sizeOf(turn).h, ...chain.map((n) => sizeOf(n).h))
    const cy = top + lane / 2
    const at = (n: MindNode, x: number, depth: number) => put(n, x, cy - sizeOf(n).h / 2, depth)
    let bottom = top + lane

    const t = at(turn, PAD, 1)
    edges.push({ from: spine, to: t })
    spine = t
    let last = t
    let x = t.x + t.w + CHAIN_GAP

    for (const n of chain) {
      const b = at(n, x, 2)
      edges.push({ from: last, to: b })
      x += b.w + CHAIN_GAP
      if (n.kind !== 'decision') {
        last = b
        continue
      }
      // O que ficou para trás pendura embaixo do losango; o que você escolheu segue na faixa.
      let fy = b.y + b.h + FORK_GAP
      for (const o of n.children.filter((k) => !k.chosen)) {
        const s = put(o, b.x + FORK_INDENT, fy, 3)
        edges.push({ from: b, to: s })
        fy += s.h + FORK_GAP
      }
      bottom = Math.max(bottom, fy - FORK_GAP)
      const chosen = n.children.filter((k) => k.chosen)
      if (!chosen.length) {
        // Sem resposta ainda: o caminho segue do próprio losango.
        last = b
        continue
      }
      // Múltipla escolha: todas as marcadas acesas, uma embaixo da outra; o caminho segue da primeira.
      const first = at(chosen[0]!, x, 3)
      edges.push({ from: b, to: first })
      let sy = first.y + first.h + FORK_GAP
      for (const o of chosen.slice(1)) {
        const s = put(o, x, sy, 3)
        edges.push({ from: b, to: s })
        sy += s.h + FORK_GAP
      }
      bottom = Math.max(bottom, sy - FORK_GAP)
      last = first
      x += first.w + CHAIN_GAP
    }
    top = bottom + LANE_GAP
  }

  return {
    mode: 'path',
    boxes,
    edges,
    width: Math.max(...boxes.map((b) => b.x + b.w)) + PAD,
    height: Math.max(...boxes.map((b) => b.y + b.h)) + PAD,
  }
}

export function layout(root: MindNode, mode: Mode, width: number): Layout {
  return mode === 'tree' ? tree(root, width) : mode === 'path' ? path(root) : branches(root, mode)
}

/**
 * As ligações do caminho: na mesma faixa, uma reta com seta; de um turno ao seguinte, a linha que
 * desce pela esquerda; para o que pendura embaixo, um cotovelo saindo de baixo do nó; e para as
 * outras marcadas de uma múltipla escolha, um desvio saindo da reta antes da primeira.
 */
function pathEdge(a: Box, b: Box): string {
  const ay = a.y + a.h / 2
  const by = b.y + b.h / 2
  if (b.node.kind === 'turn') return `M ${a.x + SPINE} ${a.y + a.h} V ${b.y}`
  if (Math.abs(ay - by) < 1) {
    const x1 = a.x + a.w
    const x2 = b.x - 2
    return `M ${x1} ${ay} H ${x2} M ${x2 - 6} ${ay - 4.5} L ${x2} ${ay} L ${x2 - 6} ${ay + 4.5}`
  }
  if (b.x >= a.x + a.w) {
    const mx = (a.x + a.w + b.x) / 2
    return `M ${a.x + a.w} ${ay} H ${mx - 8} Q ${mx} ${ay}, ${mx} ${ay + 8} V ${by - 8} Q ${mx} ${by}, ${mx + 8} ${by} H ${b.x}`
  }
  // Sai depois da ponta do losango, onde a borda de baixo já é reta.
  const x = a.x + DECISION_TIP + 4
  return `M ${x} ${a.y + a.h} V ${by - 8} Q ${x} ${by}, ${x + 8} ${by} H ${b.x}`
}

/** Curva do pai ao filho, como os galhos de um mapa mental; na árvore, um cotovelo arredondado. */
export function edgePath({ from: a, to: b }: Edge, mode: Mode): string {
  if (mode === 'path') return pathEdge(a, b)
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

/** Quanto a ponta do losango avança para dentro da caixa, de cada lado. */
export const DECISION_TIP = 16

/**
 * O contorno de um ponto de decisão: um losango esticado, com as pontas nos lados. Um losango de
 * verdade deixaria o texto num quadradinho no meio; esticado, a pergunta cabe e a forma continua a
 * que se lê como decisão. A tela e a imagem exportada desenham o mesmo polígono.
 */
export function decisionPoints(x: number, y: number, w: number, h: number, inset = 0): string {
  const t = DECISION_TIP
  const [l, r, top, bottom, mid] = [x + inset, x + w - inset, y + inset, y + h - inset, y + h / 2]
  return [
    [l + t, top],
    [r - t, top],
    [r, mid],
    [r - t, bottom],
    [l + t, bottom],
    [l, mid],
  ]
    .map(([px, py]) => `${px},${py}`)
    .join(' ')
}

/**
 * Como a ligação até um nó aparece. Numa decisão, o galho que você tomou acende e os descartados
 * ficam tracejados e apagados — é o que deixa ver por onde a conversa foi.
 */
export function edgeLook(b: Box): { width: number; opacity: number; dash?: string } {
  const n = b.node
  if (n.kind === 'option' && n.chosen === true) return { width: 2.5, opacity: 1 }
  if (n.kind === 'option' && n.chosen === false) return { width: 1.25, opacity: 0.3, dash: '3 4' }
  return { width: edgeWidth(b), opacity: isLeaf(n) ? 0.55 : 0.85 }
}

/** Cores dos galhos (uma por turno), legíveis no tema claro e no escuro. */
export const BRANCH_COLORS = ['#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#f43f5e', '#14b8a6', '#6366f1', '#f97316']
export const branchColor = (branch: number) => (branch < 0 ? 'var(--primary)' : BRANCH_COLORS[branch % BRANCH_COLORS.length])
