import { Trash2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { CatalogEntry } from '@/lib/types'

/** Conversa e ponto da tela (o do clique ou do dedo) onde o menu abre. */
export type MenuAt = { session: CatalogEntry; x: number; y: number }

/** Menu de uma conversa da lista, no ponto onde foi pedido. */
export function SessionMenu({
  at,
  open,
  onOpenChange,
  onDelete,
}: {
  /** Fica com a última conversa enquanto o menu fecha, para ele não esvaziar na animação. */
  at: MenuAt | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDelete: (session: CatalogEntry) => void
}) {
  const onPc = at?.session.owner === 'pc'
  return (
    <DropdownMenu open={open && Boolean(at)} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <span aria-hidden className="pointer-events-none fixed size-0" style={{ left: at?.x ?? 0, top: at?.y ?? 0 }} />
      </DropdownMenuTrigger>
      {/* Um pouco abaixo do dedo: ao soltar, ele não cai em cima de uma opção. */}
      <DropdownMenuContent
        align="start"
        sideOffset={8}
        collisionPadding={8}
        className="w-auto max-w-72 min-w-52"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {at && (
          <>
            <DropdownMenuLabel className="truncate">{at.session.title}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" disabled={onPc} onSelect={() => onDelete(at.session)}>
              <Trash2 /> {onPc ? 'Apagar (feche no PC antes)' : 'Apagar conversa'}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
