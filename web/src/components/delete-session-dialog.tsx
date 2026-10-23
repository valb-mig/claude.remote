import { useState } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { api, errorMessage } from '@/lib/api'
import { closeChat } from '@/lib/split'

/**
 * Confirma e apaga uma conversa: o histórico do Claude Code, os anexos e o "fixada". Se ela estiver
 * na tela, sai dela. O PC recusa a que está aberta no terminal ou no VSCode.
 */
export function DeleteSessionDialog({
  sessionId,
  title,
  open,
  onOpenChange,
}: {
  sessionId: string
  /** Título na pergunta, quando a conversa não está na tela (apagar pela lista). */
  title?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [busy, setBusy] = useState(false)

  async function remove() {
    setBusy(true)
    try {
      await api.remove(sessionId)
      closeChat(sessionId, true)
      toast.success('Conversa apagada')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="line-clamp-3 break-words">{title ? `Apagar “${title}”?` : 'Apagar esta conversa?'}</AlertDialogTitle>
          <AlertDialogDescription>
            O histórico é removido do Claude Code: some também do /resume no terminal e do VSCode. Não dá para desfazer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={busy} onClick={remove}>
            Apagar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
