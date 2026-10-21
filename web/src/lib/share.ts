/** O que chegou pelo "Compartilhar" do Android, guardado pelo service worker até escolher a conversa. */
export type Shared = { title?: string; text?: string; url?: string; files: File[]; at: number }

export const SHARE_KEY = 'share'

/** Rota do share_target no manifesto: o Android manda um POST com os arquivos para cá. */
export const SHARE_PATH = '/compartilhar'
