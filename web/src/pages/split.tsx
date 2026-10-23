import { useState } from 'react'
import { useMediaQuery } from '@/lib/hooks'
import { MachineContext, machineOf } from '@/lib/machines'
import { focusChat, PaneContext, useSplit } from '@/lib/split'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { ChatPage } from './chat'

// Celular em pé: as conversas ficam uma em cima da outra.
const STACKED = '(orientation: portrait) and (max-width: 63.99rem)'

const isTextField = (target: EventTarget) =>
  target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable)

/** A conversa com a máquina dela no contexto: tudo dentro dela (arquivos, git, `@`) vai para lá. */
function ChatInMachine({ id }: { id: string }) {
  const machine = useStore((s) => s.catalog.find((c) => c.sessionId === id)?.machine) ?? machineOf(id)
  return (
    <MachineContext value={machine}>
      <ChatPage id={id} />
    </MachineContext>
  )
}

/**
 * Conversas lado a lado (ver lib/split.ts): no celular em pé, uma em cima da outra; deitado e no PC,
 * lado a lado. Cada uma é um chat completo; a em foco recebe o que é escolhido na lista ao lado.
 */
export function ChatSplit() {
  const { ids, max, focused } = useSplit()
  // Janela que encolheu depois de abrir: as que não cabem ficam fora até ela crescer de novo.
  const shown = ids.slice(0, max)
  const split = shown.length > 1
  const stacked = useMediaQuery(STACKED)
  // Em pé, digitando numa conversa: a outra encolhe até o cabeçalho, para o teclado não espremer as duas.
  const [typing, setTyping] = useState<string | null>(null)
  return (
    <div className="flex min-h-0 flex-1 flex-col divide-y landscape:flex-row landscape:divide-x landscape:divide-y-0">
      {shown.map((id) => {
        const collapsed = split && stacked && typing !== null && typing !== id
        return (
          <PaneContext key={id} value={{ split, focused: id === focused, collapsed }}>
            <div
              className={cn('flex min-h-0 min-w-0 flex-col', collapsed ? 'flex-none' : 'flex-1')}
              onPointerDownCapture={() => focusChat(id)}
              onFocus={(e) => {
                if (!isTextField(e.target)) return
                focusChat(id)
                setTyping(id)
              }}
              onBlur={(e) => {
                if (isTextField(e.target)) setTyping((t) => (t === id ? null : t))
              }}
            >
              <ChatInMachine id={id} />
            </div>
          </PaneContext>
        )
      })}
    </div>
  )
}
