import { BRANCH_COLORS, decisionPoints, edgeLook, edgePath, isLeaf, type Box, type Layout } from './layout'
import type { MindStatus } from './model'

/**
 * O mapa como imagem: um SVG desenhado a partir do layout (os nós na tela são HTML), com as cores
 * do tema em rgb para abrir fora do navegador também; o PNG sai dele, em resolução dobrada.
 */

export type ImageFormat = 'png' | 'svg'

type Theme = Record<'background' | 'card' | 'foreground' | 'muted' | 'border' | 'primary' | 'primaryFg', string>

/** Variável do tema (oklch no shadcn) convertida para rgb pelo próprio navegador. */
function themeColor(ctx: CanvasRenderingContext2D, name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = fallback
  if (value) ctx.fillStyle = value
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
  return a === 255 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`
}

const STATUS_DOT: Partial<Record<MindStatus, string>> = { running: '#0ea5e9', waiting: '#f59e0b', failed: '#ef4444', stopped: '#9ca3af' }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const branchHex = (branch: number, theme: Theme) => (branch < 0 ? theme.primary : BRANCH_COLORS[branch % BRANCH_COLORS.length])

/** Quebra o texto em até `max` linhas que caibam em `width`; o que sobra vira reticências. */
function fitLines(ctx: CanvasRenderingContext2D, text: string, width: number, max: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let i = 0
  while (i < words.length && lines.length < max) {
    let line = words[i++]
    while (i < words.length && ctx.measureText(`${line} ${words[i]}`).width <= width) line += ` ${words[i++]}`
    lines.push(line)
  }
  const cut = (s: string) => {
    while (s && ctx.measureText(`${s}…`).width > width) s = s.slice(0, -1)
    return `${s.trimEnd()}…`
  }
  return lines.map((l, n) => (ctx.measureText(l).width > width || (n === lines.length - 1 && i < words.length) ? cut(l) : l))
}

function textBlock(
  ctx: CanvasRenderingContext2D,
  font: string,
  box: Box,
  x: number,
  width: number,
  label: { text: string; size: number; weight: number; lines: number; color: string },
  meta?: { text: string; color: string },
): string {
  ctx.font = `${label.weight} ${label.size}px ${font}`
  const lines = fitLines(ctx, label.text, width, label.lines)
  ctx.font = `400 10.5px ${font}`
  const metaLine = meta?.text ? fitLines(ctx, meta.text, width, 1)[0] : undefined
  const lh = label.size * 1.25
  const total = lines.length * lh + (metaLine ? 14 : 0)
  let y = box.y + (box.h - total) / 2 + label.size * 0.95
  const out = lines.map((l) => {
    const t = `<text x="${x}" y="${y.toFixed(1)}" font-size="${label.size}" font-weight="${label.weight}" fill="${label.color}">${esc(l)}</text>`
    y += lh
    return t
  })
  if (metaLine) out.push(`<text x="${x}" y="${(y - lh + 14).toFixed(1)}" font-size="10.5" fill="${meta!.color}">${esc(metaLine)}</text>`)
  return out.join('')
}

function nodeSvg(ctx: CanvasRenderingContext2D, font: string, box: Box, theme: Theme): string {
  const n = box.node
  const color = branchHex(n.branch, theme)
  const { x, y, w, h } = box
  const dot = STATUS_DOT[n.status]
  const status = dot && n.kind !== 'root' ? `<circle cx="${x + w - 9}" cy="${y + 9}" r="4" fill="${dot}"/>` : ''

  if (n.kind === 'root') {
    return (
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${theme.primary}"/>` +
      textBlock(ctx, font, box, x + 16, w - 32, { text: n.label, size: 13, weight: 600, lines: 2, color: theme.primaryFg }, n.meta ? { text: n.meta, color: theme.primaryFg } : undefined)
    )
  }
  if (n.kind === 'turn') {
    const cy = y + h / 2
    return (
      `<rect x="${x + 1}" y="${y + 1}" width="${w - 2}" height="${h - 2}" rx="12" fill="${theme.card}" stroke="${color}" stroke-width="2"/>` +
      `<circle cx="${x + 22}" cy="${cy}" r="12" fill="${color}"/>` +
      `<text x="${x + 22}" y="${cy + 4}" font-size="11" font-weight="600" fill="#fff" text-anchor="middle">${n.branch + 1}</text>` +
      textBlock(ctx, font, box, x + 42, w - 56, { text: n.label, size: 12.5, weight: 500, lines: 2, color: theme.foreground }, n.meta ? { text: n.meta, color: theme.muted } : undefined) +
      status
    )
  }
  if (n.kind === 'decision') {
    const waiting = n.status === 'waiting'
    const edge = waiting ? '#f59e0b' : color
    const d = 5
    const cx = x + 25
    const cy = y + h / 2
    return (
      `<polygon points="${decisionPoints(x, y, w, h, 0.75)}" fill="${theme.card}" stroke="${edge}" stroke-width="1.5" stroke-linejoin="round"/>` +
      `<polygon points="${cx},${cy - d} ${cx + d},${cy} ${cx},${cy + d} ${cx - d},${cy}" fill="${edge}"/>` +
      textBlock(ctx, font, box, x + 36, w - 56, { text: n.label, size: 12, weight: 500, lines: 2, color: theme.foreground }, n.meta ? { text: n.meta, color: theme.muted } : undefined)
    )
  }
  if (n.kind === 'option') {
    const took = n.chosen === true
    const dropped = n.chosen === false
    const cy = y + h / 2
    const mark = took
      ? `<path d="M${x + 9} ${cy} l3 3 l6 -6" fill="none" stroke="${color}" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/>`
      : dropped
        ? `<path d="M${x + 10} ${cy - 3.5} l7 7 M${x + 17} ${cy - 3.5} l-7 7" stroke="${theme.muted}" stroke-width="1.5" stroke-linecap="round"/>`
        : `<polygon points="${x + 13},${cy - 4} ${x + 17},${cy} ${x + 13},${cy + 4} ${x + 9},${cy}" fill="none" stroke="${color}"/>`
    ctx.font = `400 10.5px ${font}`
    const metaW = n.meta ? Math.min(ctx.measureText(n.meta).width, w / 2) : 0
    const label =
      textBlock(ctx, font, box, x + 23, w - 34 - (metaW ? metaW + 6 : 0), { text: n.label, size: 11.5, weight: took ? 600 : 400, lines: 1, color: dropped ? theme.muted : theme.foreground }) +
      (n.meta ? `<text x="${x + w - 11}" y="${cy + 3.5}" font-size="10.5" fill="${theme.muted}" text-anchor="end">${esc(n.meta)}</text>` : '')
    return (
      `<g opacity="${dropped ? 0.6 : 1}">` +
      `<rect x="${x + 1}" y="${y + 1}" width="${w - 2}" height="${h - 2}" rx="${h / 2}" fill="${took ? theme.card : theme.background}" stroke="${took ? color : theme.border}" stroke-width="${took ? 2 : 1}" ${dropped ? 'stroke-dasharray="4 3"' : ''}/>` +
      mark +
      label +
      `</g>`
    )
  }
  if (isLeaf(n)) {
    ctx.font = `400 10.5px ${font}`
    const metaW = n.meta ? Math.min(ctx.measureText(n.meta).width, w / 2) : 0
    const failed = n.status === 'failed'
    return (
      `<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${h - 1}" rx="${h / 2}" fill="${theme.background}" stroke="${failed ? '#ef4444' : theme.border}" ${n.kind === 'more' ? 'stroke-dasharray="4 3"' : ''}/>` +
      `<circle cx="${x + 13}" cy="${y + h / 2}" r="3.5" fill="${failed ? '#ef4444' : color}"/>` +
      textBlock(ctx, font, box, x + 23, w - 34 - (metaW ? metaW + 6 : 0), { text: n.label, size: 11.5, weight: 400, lines: 1, color: failed ? '#ef4444' : theme.foreground }) +
      (n.meta ? `<text x="${x + w - 11}" y="${y + h / 2 + 3.5}" font-size="10.5" fill="${theme.muted}" text-anchor="end">${esc(n.meta)}</text>` : '')
    )
  }
  const waiting = n.status === 'waiting'
  return (
    `<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${h - 1}" rx="12" fill="${theme.card}" stroke="${waiting ? '#f59e0b' : theme.border}" stroke-width="${waiting ? 2 : 1}"/>` +
    `<rect x="${x + 3}" y="${y + 8}" width="3" height="${h - 16}" rx="1.5" fill="${color}"/>` +
    textBlock(ctx, font, box, x + 14, w - 32, { text: n.label, size: 12, weight: 400, lines: 2, color: theme.foreground }, n.meta ? { text: n.meta, color: theme.muted } : undefined) +
    status
  )
}

export function mapSvg(g: Layout): string {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const theme: Theme = {
    background: themeColor(ctx, '--background', '#ffffff'),
    card: themeColor(ctx, '--card', '#ffffff'),
    foreground: themeColor(ctx, '--foreground', '#111111'),
    muted: themeColor(ctx, '--muted-foreground', '#6b7280'),
    border: themeColor(ctx, '--border', '#e5e7eb'),
    primary: themeColor(ctx, '--primary', '#111111'),
    primaryFg: themeColor(ctx, '--primary-foreground', '#ffffff'),
  }
  const font = getComputedStyle(document.body).fontFamily || 'sans-serif'
  const edges = g.edges
    .map(
      (e) =>
        `<path d="${edgePath(e, g.mode)}" fill="none" stroke="${branchHex(e.to.node.branch, theme)}" stroke-width="${edgeLook(e.to).width}" stroke-linecap="round" stroke-opacity="${edgeLook(e.to).opacity}"${edgeLook(e.to).dash ? ` stroke-dasharray="${edgeLook(e.to).dash}"` : ''}/>`,
    )
    .join('')
  const nodes = g.boxes.map((b) => nodeSvg(ctx, font, b, theme)).join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${g.width}" height="${g.height}" viewBox="0 0 ${g.width} ${g.height}" font-family="${esc(font)}">` +
    `<rect width="100%" height="100%" fill="${theme.background}"/>${edges}${nodes}</svg>`
  )
}

async function toPng(svg: string, width: number, height: number): Promise<Blob> {
  // Dobro da resolução, sem passar do limite de tamanho de canvas dos celulares.
  const scale = Math.min(2, 8000 / Math.max(width, height))
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    const ctx = canvas.getContext('2d')!
    ctx.scale(scale, scale)
    ctx.drawImage(img, 0, 0, width, height)
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('png_failed'))), 'image/png'))
  } finally {
    URL.revokeObjectURL(url)
  }
}

function slug(title: string): string {
  const s = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return s.slice(0, 48) || 'conversa'
}

export async function mapImage(g: Layout, title: string, format: ImageFormat): Promise<File> {
  const svg = mapSvg(g)
  const name = `mapa-${slug(title)}.${format}`
  if (format === 'svg') return new File([svg], name, { type: 'image/svg+xml' })
  return new File([await toPng(svg, g.width, g.height)], name, { type: 'image/png' })
}

/** O celular sabe compartilhar arquivos (WhatsApp, Drive, Fotos…)? */
export function canShareImage(): boolean {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([''], 'mapa.png', { type: 'image/png' })] })
  } catch {
    return false
  }
}

export function download(file: File): void {
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}
