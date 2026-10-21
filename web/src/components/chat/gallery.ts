import { createContext, useContext } from 'react'
import { imageUrl } from '@/lib/api'
import type { Item } from './items'

/**
 * Imagens da conversa por quem mandou, na ordem do chat: tocar numa abre a tela cheia passando
 * pelas outras do mesmo lado (ex.: uma sequência de prints do Claude).
 */
export type Gallery = { mine: string[]; claude: string[] }

export const GalleryContext = createContext<Gallery>({ mine: [], claude: [] })

export const useGallery = () => useContext(GalleryContext)

export function galleryOf(items: Item[], sessionId: string): Gallery {
  const gallery: Gallery = { mine: [], claude: [] }
  for (const item of items) {
    if (item.type === 'user') for (const key of item.images ?? []) gallery.mine.push(imageUrl(sessionId, key))
    if (item.type !== 'activity') continue
    for (const entry of item.entries) {
      if (entry.kind === 'tool') for (const key of entry.result?.images ?? []) gallery.claude.push(imageUrl(sessionId, key))
    }
  }
  return gallery
}
