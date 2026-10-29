import type { Paint } from './grid'
import type { ThemeId } from '@/lib/wallpaper'

/** Como o tema se parece; é o que define o atlas e o degradê, antes de a grade existir. */
export type Look = {
  /** Todos os caracteres que a cena desenha; cada um vira um glifo no atlas. */
  chars: string
  /** A cor de cada índice que a cena usa. */
  palette: string[]
  /** Fundo em CSS atrás dos caracteres: degradê, raios de luz, o que for de graça fora do canvas. */
  backdrop: string
  /** Lado do caractere em pixels de CSS. */
  size: number
}

/** Um passo de animação: `dt` em segundos desde o anterior, `t` o tempo desde que a cena nasceu. */
export type Step = (p: Paint, dt: number, t: number) => void

export type Theme = {
  id: Exclude<ThemeId, 'none'>
  name: string
  hint: string
  /** Cada modo tem o seu: no claro o fundo precisa ser claro, senão o texto da conversa some. */
  look(dark: boolean): Look
  create(cols: number, rows: number, dark: boolean): Step
}

/**
 * Ruído estável: as mesmas entradas dão sempre o mesmo número entre 0 e 1. É o que prende a textura
 * de um peixe a ele, em vez de deixá-la fervendo enquanto ele atravessa a tela.
 */
export function noise(a: number, b: number, c = 0): number {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 1442695041)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** Sorteio simples para montar a cena (posições iniciais, velocidades); não precisa ser estável. */
export const between = (min: number, max: number) => min + Math.random() * (max - min)

/** Quantos bichos cabem numa grade deste tamanho, entre um mínimo e um máximo. */
export const fitCount = (cols: number, rows: number, per: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.round((cols * rows) / per)))

/**
 * Um bicho desenhado como máscara: espaço é vazio, e cada outro caractere é uma parte com a sua cor
 * (`#` corpo, `*` barriga, `.` nadadeira, `o` olho). O caractere que aparece na tela não vem da
 * máscara: vem da textura do tema, sorteada por célula, que é o que dá a liga de ASCII das
 * referências em vez de um bloco chapado.
 */
export type Sprite = { w: number; h: number; rows: string[] }

export const sprite = (rows: string[]): Sprite => ({ w: Math.max(...rows.map((r) => r.length)), h: rows.length, rows })

/** Cor de cada parte da máscara. */
export type Tint = Record<string, number>

export function stamp(p: Paint, s: Sprite, x: number, y: number, seed: number, tint: Tint, texture: string, flip = false): void {
  const left = Math.round(x)
  const top = Math.round(y)
  for (let row = 0; row < s.h; row++) {
    const line = s.rows[row]!
    for (let col = 0; col < line.length; col++) {
      const mask = line[col]!
      if (mask === ' ') continue
      const color = tint[mask]
      if (color === undefined) continue
      // O olho é sempre o olho; o resto ganha a textura, sorteada pela posição dentro do bicho.
      const ch = mask === 'o' ? 'o' : texture[(noise(seed, col, row) * texture.length) | 0]!
      p.put(flip ? left + s.w - 1 - col : left + col, top + row, ch, color)
    }
  }
}
