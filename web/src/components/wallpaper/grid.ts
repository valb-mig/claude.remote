/**
 * A grade de caracteres do fundo animado.
 *
 * Desenhar texto é a parte cara de um fundo em ASCII: um `fillText` por célula, a cada quadro, não
 * cabe no celular. Aqui cada par (caractere, cor) é rasterizado uma vez só num atlas à parte, e
 * pintar uma célula vira um `drawImage`. Em cima disso, o quadro anterior fica guardado e só as
 * células que mudaram são repintadas, em corridas de vizinhas — como as cenas são esparsas (uns
 * peixes, umas algas), quase tudo é descartado antes de tocar no canvas.
 */

const FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
// Altura da célula em relação ao corpo da letra: o bastante para os traços não se encostarem.
const LINE = 1.15
// Os temas usam ASCII e um punhado de sinais do Latin-1; a tabela de códigos cabe nisso.
const CODES = 1024

/** Cada par (caractere, cor) desenhado uma vez; pintar uma célula vira um blit deste canvas. */
export class Atlas {
  readonly canvas: HTMLCanvasElement
  readonly cellW: number
  readonly cellH: number
  /** Código do caractere → coluna no atlas; -1 no que o tema não declarou. */
  private readonly column = new Int32Array(CODES).fill(-1)

  constructor(chars: string, colors: string[], size: number, dpr: number) {
    const px = Math.max(5, Math.round(size * dpr))
    const probe = document.createElement('canvas').getContext('2d')!
    probe.font = `${px}px ${FONT}`
    this.cellW = Math.max(1, Math.round(probe.measureText('M').width))
    this.cellH = Math.max(1, Math.round(px * LINE))

    const list = [...new Set(chars)]
    this.canvas = document.createElement('canvas')
    this.canvas.width = list.length * this.cellW
    this.canvas.height = colors.length * this.cellH
    const ctx = this.canvas.getContext('2d')!
    ctx.font = `${px}px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    const baseline = Math.round(this.cellH * 0.8)
    list.forEach((ch, i) => {
      const code = ch.charCodeAt(0)
      if (code < CODES) this.column[code] = i
      colors.forEach((color, c) => {
        ctx.fillStyle = color
        ctx.fillText(ch, i * this.cellW + this.cellW / 2, c * this.cellH + baseline)
      })
    })
  }

  /** Coluna do caractere no atlas, ou -1 se o tema não o declarou. */
  at(code: number): number {
    return code < CODES ? this.column[code]! : -1
  }
}

/** O que uma cena recebe para desenhar: o tamanho da grade e um jeito de pôr caracteres nela. */
export type Paint = {
  readonly cols: number
  readonly rows: number
  put(x: number, y: number, ch: string, color: number): void
}

export class Grid implements Paint {
  readonly cols: number
  readonly rows: number
  private readonly atlas: Atlas
  /** O quadro sendo montado e o que já está na tela; a diferença entre os dois é o que se pinta. */
  private readonly cells: Uint32Array
  private readonly shown: Uint32Array

  constructor(atlas: Atlas, cols: number, rows: number) {
    this.atlas = atlas
    this.cols = cols
    this.rows = rows
    this.cells = new Uint32Array(cols * rows)
    this.shown = new Uint32Array(cols * rows)
  }

  clear(): void {
    this.cells.fill(0)
  }

  // Uma célula cabe num inteiro: a coluna do glifo embaixo (0 é vazia) e a cor em cima.
  put(x: number, y: number, ch: string, color: number): void {
    const ix = x | 0
    const iy = y | 0
    if (ix < 0 || iy < 0 || ix >= this.cols || iy >= this.rows) return
    const col = this.atlas.at(ch.charCodeAt(0))
    if (col < 0) return
    this.cells[iy * this.cols + ix] = col + 1 + (color << 12)
  }

  /** Repinta só o que mudou desde o quadro anterior, limpando de uma vez cada corrida de vizinhas. */
  paint(ctx: CanvasRenderingContext2D): void {
    const { cols, rows, cells, shown } = this
    const { cellW, cellH, canvas } = this.atlas
    for (let y = 0; y < rows; y++) {
      const base = y * cols
      let x = 0
      while (x < cols) {
        if (cells[base + x] === shown[base + x]) {
          x++
          continue
        }
        const from = x
        while (x < cols && cells[base + x] !== shown[base + x]) x++
        ctx.clearRect(from * cellW, y * cellH, (x - from) * cellW, cellH)
        for (let i = from; i < x; i++) {
          const v = cells[base + i]!
          shown[base + i] = v
          if (!v) continue
          ctx.drawImage(canvas, ((v & 0xfff) - 1) * cellW, (v >>> 12) * cellH, cellW, cellH, i * cellW, y * cellH, cellW, cellH)
        }
      }
    }
  }
}
