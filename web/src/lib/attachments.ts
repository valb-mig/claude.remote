/** Anexo pronto para envio; `data` em base64. */
export type Attachment = {
  id: string
  name: string
  mediaType: string
  data: string
  /** Miniatura (data URL) para a bandeja e para o chat. */
  thumb?: string
  size: number
}

// Lado maior recomendado para imagens na API; acima disso só gasta banda e tokens.
const MAX_SIDE = 1568
const KEEP_ORIGINAL_BYTES = 1.5 * 1024 * 1024
const MAX_FILE_BYTES = 25 * 1024 * 1024
const MAX_TOTAL_BASE64 = 38 * 1024 * 1024
const RASTER = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result)
      resolve(url.slice(url.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

async function resized(bitmap: ImageBitmap, maxSide: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale))
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return canvas.convertToBlob({ type: 'image/jpeg', quality })
}

/**
 * Imagens são reduzidas no próprio celular (foto de 12 MP vira ~300 KB) e ganham miniatura;
 * capturas pequenas seguem como estão para o texto continuar nítido. O resto vai sem mexer.
 */
export async function toAttachment(file: File): Promise<Attachment> {
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} passa de 25 MB`)
  const id = crypto.randomUUID()

  if (RASTER.has(file.type)) {
    try {
      const bitmap = await createImageBitmap(file)
      const tooBig = Math.max(bitmap.width, bitmap.height) > MAX_SIDE || file.size > KEEP_ORIGINAL_BYTES
      const blob = tooBig ? await resized(bitmap, MAX_SIDE, 0.85) : file
      const thumb = `data:image/jpeg;base64,${await blobToBase64(await resized(bitmap, 320, 0.7))}`
      bitmap.close()
      return { id, name: file.name || 'imagem.jpg', mediaType: blob.type || file.type, data: await blobToBase64(blob), thumb, size: blob.size }
    } catch {
      // Formato que o navegador não decodifica: segue como arquivo comum.
    }
  }

  return {
    id,
    name: file.name || 'arquivo',
    mediaType: file.type || 'application/octet-stream',
    data: await blobToBase64(file),
    size: file.size,
  }
}

/** Formato enviado à API (sem os campos só de interface) e checagem do limite total. */
export function toPayload(list: Attachment[]) {
  const total = list.reduce((n, a) => n + a.data.length, 0)
  if (total > MAX_TOTAL_BASE64) throw new Error('Os anexos passam do limite de ~28 MB por mensagem.')
  return list.map(({ name, mediaType, data, thumb }) => ({ name, mediaType, data, thumb }))
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
