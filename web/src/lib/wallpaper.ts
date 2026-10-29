import { useLocation } from 'wouter'
import { create } from 'zustand'

/**
 * Fundo animado da conversa: qual tema e com que força ele aparece. É escolha deste aparelho (como
 * os sons), então fica no localStorage e não passa pelo servidor — o celular pode ter o aquário e o
 * PC ficar limpo.
 */
export type ThemeId = 'none' | 'aquarium' | 'jellyfish' | 'fireflies'
export type Intensity = 'subtle' | 'medium' | 'strong'

export type WallpaperPrefs = { theme: ThemeId; intensity: Intensity }

const KEY = 'cr:wallpaper'
// Começa desligado: o fundo é escolha de quem usa, não surpresa na primeira vez que abre a conversa.
const DEFAULTS: WallpaperPrefs = { theme: 'none', intensity: 'medium' }

/** Opacidade da camada inteira (degradê e caracteres); é o que separa "enfeite" de "atrapalha ler". */
export const OPACITY: Record<Intensity, number> = { subtle: 0.3, medium: 0.55, strong: 0.85 }

export const INTENSITIES: { key: Intensity; label: string }[] = [
  { key: 'subtle', label: 'Sutil' },
  { key: 'medium', label: 'Médio' },
  { key: 'strong', label: 'Forte' },
]

function load(): WallpaperPrefs {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<WallpaperPrefs>) }
  } catch {
    return DEFAULTS
  }
}

/** O fundo deste aparelho; vale para todas as conversas e fica salvo. */
export const useWallpaper = create<WallpaperPrefs>(load)

/**
 * Se as superfícies do chat (a barra de mensagem, o leitor, o cais dos pedidos) devem virar vidro.
 * Só na tela da conversa, que é a única com fundo animado atrás, e só com um tema escolhido: desfocar
 * uma cor chapada custaria GPU para não mudar nada na tela.
 */
export function useGlass(): boolean {
  const theme = useWallpaper((s) => s.theme)
  const [location] = useLocation()
  return theme !== 'none' && location.startsWith('/s/')
}

export function setWallpaper(next: Partial<WallpaperPrefs>): void {
  useWallpaper.setState(next)
  try {
    localStorage.setItem(KEY, JSON.stringify(useWallpaper.getState()))
  } catch {
    // localStorage indisponível (modo privado): vale só até fechar o app.
  }
}
