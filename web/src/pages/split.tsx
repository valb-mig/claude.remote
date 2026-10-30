import { Fragment, useState } from 'react'
import { Wallpaper } from '@/components/wallpaper/wallpaper'
import { useMediaQuery } from '@/lib/hooks'
import { MachineContext, machineOf } from '@/lib/machines'
import {
  CHAT_DRAG,
  focusChat,
  moveChat,
  PaneContext,
  saveSplitSizes,
  setSplitWeights,
  useDraggingChat,
  useSplit,
  useSplitSizes,
} from '@/lib/split'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { useZen } from '@/lib/zen'
import { ChatPage } from './chat'

// Celular em pé: as conversas ficam uma em cima da outra.
const STACKED = '(orientation: portrait) and (max-width: 63.99rem)'

/** Menor espaço de uma conversa ao arrastar a divisória: lado a lado, um celular pequeno; empilhadas, o topo e a caixa. */
const MIN_WIDE = 300
const MIN_TALL = 200
/** Quanto cada toque nas setas do teclado move a divisória, em fração do espaço das duas conversas. */
const KEY_STEP = 0.05

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
 * A borda entre duas conversas vizinhas. Arrastar passa espaço de uma para a outra (as demais não
 * mudam), dois cliques voltam ao meio a meio, e com foco as setas do teclado também mexem. O tamanho
 * fica salvo por conversa.
 */
function Divider({ a, b, stacked }: { a: string; b: string; stacked: boolean }) {
  const wa = useSplitSizes((s) => s.weights[a] ?? 1)
  const wb = useSplitSizes((s) => s.weights[b] ?? 1)
  /** Reparte o peso das duas: a primeira fica com a fração `f`. */
  const share = (f: number) => setSplitWeights({ [a]: (wa + wb) * f, [b]: (wa + wb) * (1 - f) })

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    const bar = e.currentTarget
    const before = bar.previousElementSibling?.getBoundingClientRect()
    const after = bar.nextElementSibling?.getBoundingClientRect()
    if (!before || !after) return
    const pos = (ev: { clientX: number; clientY: number }) => (stacked ? ev.clientY : ev.clientX)
    const start = pos(e)
    const first = stacked ? before.height : before.width
    const total = first + (stacked ? after.height : after.width)
    // Janela pequena demais para o mínimo das duas: cada uma pode ir até a metade.
    const lo = Math.min(stacked ? MIN_TALL : MIN_WIDE, total / 2)
    bar.setPointerCapture(e.pointerId)
    // Sem isso o arrasto vai selecionando o texto das conversas pelo caminho.
    document.body.style.userSelect = 'none'
    const move = (ev: PointerEvent) => share(Math.min(total - lo, Math.max(lo, first + pos(ev) - start)) / total)
    const up = () => {
      bar.removeEventListener('pointermove', move)
      bar.removeEventListener('pointerup', up)
      bar.removeEventListener('pointercancel', up)
      document.body.style.userSelect = ''
      saveSplitSizes()
    }
    bar.addEventListener('pointermove', move)
    bar.addEventListener('pointerup', up)
    bar.addEventListener('pointercancel', up)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = { [stacked ? 'ArrowUp' : 'ArrowLeft']: -KEY_STEP, [stacked ? 'ArrowDown' : 'ArrowRight']: KEY_STEP }[e.key]
    if (step === undefined) return
    e.preventDefault()
    share(Math.min(0.85, Math.max(0.15, wa / (wa + wb) + step)))
    saveSplitSizes()
  }

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation={stacked ? 'horizontal' : 'vertical'}
      aria-label="Tamanho das conversas"
      aria-valuenow={Math.round((wa / (wa + wb)) * 100)}
      aria-valuemin={15}
      aria-valuemax={85}
      title="Arrastar para mudar o tamanho · dois cliques: meio a meio"
      onPointerDown={onPointerDown}
      onDoubleClick={() => {
        share(0.5)
        saveSplitSizes()
      }}
      onKeyDown={onKeyDown}
      className={cn('group relative z-10 shrink-0 touch-none bg-border outline-none', stacked ? 'h-px cursor-row-resize' : 'w-px cursor-col-resize')}
    >
      {/* Área de pegar mais larga que a linha: acertar 1px com o mouse é impossível. */}
      <span className={cn('absolute', stacked ? 'inset-x-0 -inset-y-1.5' : 'inset-y-0 -inset-x-1.5')} />
      {/* A linha acende ao passar o mouse, ao arrastar e com foco do teclado. */}
      <span
        className={cn(
          'pointer-events-none absolute bg-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 group-active:opacity-100',
          stacked ? 'inset-x-0 -top-px h-[3px]' : 'inset-y-0 -left-px w-[3px]',
        )}
      />
    </div>
  )
}

/**
 * Conversas lado a lado (ver lib/split.ts): no celular em pé, uma em cima da outra; deitado e no PC,
 * lado a lado. Cada uma é um chat completo; a em foco recebe o que é escolhido na lista ao lado. A
 * divisória entre elas muda o tamanho, e arrastar uma pelo topo a leva para outro lugar. Em modo zen,
 * só a conversa dele fica na tela; as outras saem de vista sem fechar.
 */
export function ChatSplit() {
  const { ids, max, focused } = useSplit()
  // Janela que encolheu depois de abrir: as que não cabem ficam fora até ela crescer de novo.
  const shown = ids.slice(0, max)
  const split = shown.length > 1
  const stacked = useMediaQuery(STACKED)
  // Em pé, digitando numa conversa: a outra encolhe até o cabeçalho, para o teclado não espremer as duas.
  // Só no toque, onde o teclado aparece na tela: numa janela estreita do PC não há o que espremer, e
  // quem quiser mais espaço para uma usa a divisória.
  const touch = useMediaQuery('(pointer: coarse)')
  const [typing, setTyping] = useState<string | null>(null)
  const weights = useSplitSizes((s) => s.weights)
  // O peso salvo é relativo; aqui ele é reescalado para os das conversas na tela somarem quantas elas
  // são. Com flex-grow somando menos que 1 o navegador deixa espaço sobrando: uma conversa encolhida
  // que ficava sozinha depois de fechar a outra não ocupava a tela toda.
  const raw = shown.map((id) => weights[id] ?? 1)
  const total = raw.reduce((sum, w) => sum + w, 0)
  const grow = (i: number) => (raw[i]! / total) * shown.length
  const zenId = useZen((s) => s.id)
  const zen = zenId && shown.includes(zenId) ? zenId : null

  // Arrastando uma conversa pelo topo: onde ela cairia, se soltar agora.
  const dragging = useDraggingChat((s) => s.id)
  // Sobra de um arrasto que acabou não aparece: o marcador só se mostra enquanto há um em curso.
  const [drop, setDrop] = useState<{ id: string; after: boolean } | null>(null)
  const sideOf = (e: React.DragEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return stacked ? e.clientY > r.top + r.height / 2 : e.clientX > r.left + r.width / 2
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col landscape:flex-row">
      {/* Uma cena só atrás de todas as conversas: lado a lado, o fundo atravessa a divisória em vez de recomeçar. */}
      <Wallpaper />
      {shown.map((id, i) => {
        const collapsed = split && stacked && touch && typing !== null && typing !== id
        const offstage = zen !== null && zen !== id
        return (
          <Fragment key={id}>
            {i > 0 && !zen && <Divider a={shown[i - 1]!} b={id} stacked={stacked} />}
            <PaneContext value={{ split, focused: id === focused, collapsed }}>
              <div
                // O peso decide o tamanho; base zero para a divisão ser só pelo peso, não pelo conteúdo.
                style={collapsed || zen ? undefined : { flex: `${grow(i)} 1 0%` }}
                className={cn('relative flex min-h-0 min-w-0 flex-col', collapsed ? 'flex-none' : zen && 'flex-1', offstage && 'hidden')}
                onPointerDownCapture={() => focusChat(id)}
                onFocus={(e) => {
                  if (!isTextField(e.target)) return
                  focusChat(id)
                  setTyping(id)
                }}
                onBlur={(e) => {
                  if (isTextField(e.target)) setTyping((t) => (t === id ? null : t))
                }}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes(CHAT_DRAG)) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  const after = sideOf(e)
                  setDrop((d) => (d?.id === id && d.after === after ? d : { id, after }))
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrop((d) => (d?.id === id ? null : d))
                }}
                onDrop={(e) => {
                  const from = e.dataTransfer.getData(CHAT_DRAG)
                  if (!from) return
                  e.preventDefault()
                  setDrop(null)
                  moveChat(from, id, sideOf(e))
                }}
              >
                <ChatInMachine id={id} />
                {dragging && dragging !== id && drop?.id === id && (
                  <div
                    aria-hidden
                    className={cn(
                      // Opaco o bastante para o rótulo não brigar com o texto da conversa por baixo.
                      'pointer-events-none absolute z-40 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-background/75 backdrop-blur-sm',
                      stacked
                        ? cn('inset-x-2 h-[calc(50%-0.75rem)]', drop.after ? 'bottom-2' : 'top-2')
                        : cn('inset-y-2 w-[calc(50%-0.75rem)]', drop.after ? 'right-2' : 'left-2'),
                    )}
                  >
                    <span className="rounded-full bg-primary px-3 py-1 text-sm font-medium text-primary-foreground shadow-md">Soltar aqui</span>
                  </div>
                )}
              </div>
            </PaneContext>
          </Fragment>
        )
      })}
    </div>
  )
}
