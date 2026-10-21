import { FileText, Loader2, Paperclip, Pencil, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { formatSize, toAttachment, type Attachment } from '@/lib/attachments'
import { ImageEditor } from './image-editor'

/** Estado dos anexos de um campo de mensagem; leitura e redução das imagens acontecem aqui. */
export function useAttachments(initial: Attachment[] = []) {
  const [items, setItems] = useState<Attachment[]>(initial)
  const [reading, setReading] = useState(false)

  async function add(files: File[] | FileList) {
    const list = [...files]
    if (!list.length) return
    setReading(true)
    try {
      const results = await Promise.allSettled(list.map(toAttachment))
      const ok = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
      for (const r of results) if (r.status === 'rejected') toast.error(String((r.reason as Error).message ?? r.reason))
      setItems((current) => [...current, ...ok])
    } finally {
      setReading(false)
    }
  }

  return {
    items,
    reading,
    add,
    remove: (id: string) => setItems((current) => current.filter((a) => a.id !== id)),
    clear: () => setItems([]),
    /** Troca um anexo pela versão editada (marcações, recorte). */
    update: (next: Attachment) => setItems((current) => current.map((a) => (a.id === next.id ? next : a))),
    /** Lista inteira de uma vez (ex.: o rascunho que veio do banco); estável entre renderizações. */
    replace: setItems,
  }
}

/** Botão de anexar: no Android o seletor já oferece câmera, galeria e arquivos. */
export function AttachButton({ onFiles, busy }: { onFiles: (files: FileList) => void; busy: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="size-11 shrink-0"
        disabled={busy}
        onClick={() => input.current?.click()}
        aria-label="Anexar arquivo ou imagem"
      >
        {busy ? <Loader2 className="animate-spin" /> : <Paperclip />}
      </Button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) onFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </>
  )
}

// Imagens que dá para marcar no editor (GIF perderia a animação).
const EDITABLE = new Set(['image/png', 'image/jpeg', 'image/webp'])

/** Anexos antes de enviar; tocar numa imagem abre o editor para marcar ou recortar. */
export function AttachmentTray({
  items,
  onRemove,
  onEdit,
}: {
  items: Attachment[]
  onRemove: (id: string) => void
  onEdit?: (next: Attachment) => void
}) {
  const [editing, setEditing] = useState<Attachment | null>(null)
  if (items.length === 0) return null
  return (
    <div className="flex gap-2 overflow-x-auto px-1 pt-1.5 pb-2">
      {items.map((a) => (
        <div key={a.id} className="relative shrink-0">
          {a.thumb && onEdit && EDITABLE.has(a.mediaType) ? (
            <button type="button" onClick={() => setEditing(a)} className="relative block" aria-label={`Marcar ${a.name}`}>
              <img src={a.thumb} alt={a.name} className="size-16 rounded-md border object-cover" />
              <span className="absolute bottom-1 left-1 rounded-full bg-black/60 p-1 text-white">
                <Pencil className="size-3" />
              </span>
            </button>
          ) : a.thumb ? (
            <img src={a.thumb} alt={a.name} className="size-16 rounded-md border object-cover" />
          ) : (
            <div className="flex h-16 w-32 flex-col justify-center gap-0.5 rounded-md border bg-muted/40 px-2 text-xs">
              <FileText className="size-4 text-muted-foreground" />
              <span className="truncate font-medium">{a.name}</span>
              <span className="text-muted-foreground">{formatSize(a.size)}</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => onRemove(a.id)}
            className="absolute -top-1.5 -right-1.5 rounded-full bg-foreground p-1 text-background shadow"
            aria-label={`Remover ${a.name}`}
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
      {onEdit && <ImageEditor attachment={editing} onOpenChange={(open) => !open && setEditing(null)} onSave={onEdit} />}
    </div>
  )
}
