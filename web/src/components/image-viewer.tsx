import { ExternalLink, X } from 'lucide-react'
import { useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

/** Imagem em tela cheia; "abrir original" leva ao arquivo inteiro, onde dá para dar zoom. */
export function ImageViewer({ src, open, onOpenChange }: { src: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-dvh w-screen max-w-none items-center justify-center rounded-none border-0 bg-black/95 p-0 ring-0 sm:max-w-none"
      >
        <DialogTitle className="sr-only">Imagem</DialogTitle>
        <img src={src} alt="" className="max-h-full max-w-full object-contain" onClick={() => onOpenChange(false)} />
        <div className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 flex gap-2">
          <a href={src} target="_blank" rel="noreferrer" className="rounded-full bg-white/15 p-2.5 text-white" aria-label="Abrir original">
            <ExternalLink className="size-5" />
          </a>
          <button type="button" onClick={() => onOpenChange(false)} className="rounded-full bg-white/15 p-2.5 text-white" aria-label="Fechar">
            <X className="size-5" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Miniatura que abre a imagem em tela cheia ao tocar. */
export function ImageThumb({ src, alt, className }: { src: string; alt?: string; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="shrink-0 overflow-hidden rounded-xl border bg-muted" aria-label="Ampliar imagem">
        <img src={src} alt={alt ?? ''} loading="lazy" className={cn('block object-cover', className)} />
      </button>
      <ImageViewer src={src} open={open} onOpenChange={setOpen} />
    </>
  )
}
