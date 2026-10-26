import { noon } from '@/lib/activity'

/**
 * Escala dos gráficos da home: uma cor só (o azul sequencial), do quase vazio ao mais intenso.
 * No tema escuro os degraus são outros, escolhidos para o fundo escuro: mais uso fica mais claro.
 */
export const LEVELS = [
  'bg-muted dark:bg-white/[0.07]',
  'bg-[#b7d3f6] dark:bg-[#104281]',
  'bg-[#6da7ec] dark:bg-[#1c5cab]',
  'bg-[#2a78d6] dark:bg-[#3987e5]',
  'bg-[#184f95] dark:bg-[#86b6ef]',
]

/** Nível 0 a 4 de um valor diante do maior do período. */
export const levelOf = (value: number, max: number) => (value <= 0 || max <= 0 ? 0 : Math.min(4, Math.ceil((value / max) * 4)))

/** Cor das barras (uma série só): o mesmo azul, um degrau para cada tema. */
export const BAR = 'bg-[#2a78d6] dark:bg-[#3987e5]'

export const usd = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'USD', maximumFractionDigits: n >= 100 ? 0 : 2 })
export const compact = (n: number) => n.toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })
export const plural = (n: number, one: string, many: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? one : many}`

/** "ter., 26 de out." a partir de AAAA-MM-DD (meio-dia: sem tropeço no horário de verão). */
export const dayLabel = (date: string) =>
  noon(date).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })
