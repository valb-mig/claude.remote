import { MAP_WIDTH, saveMapWidth, setMapWidth, useMapWidth } from './view'

/** Menor espaço de cada lado ao arrastar: o do chat é o de um celular pequeno, para o qual ele foi feito. */
const MIN_MAP = 300
const MIN_CHAT = 340
/** Quanto cada toque nas setas do teclado move a divisória, em fração da largura dos dois. */
const KEY_STEP = 0.05

/**
 * A borda entre o chat e o mapa. Arrastar passa espaço de um para o outro, dois cliques voltam ao
 * tamanho de sempre, e com foco as setas do teclado também mexem. Igual à divisória entre conversas
 * lado a lado (pages/split.tsx), para as duas se comportarem do mesmo jeito.
 */
function Divider() {
  const width = useMapWidth((s) => s.width)

  /** Limites da fração do mapa para a largura `total`; janela estreita demais divide ao meio. */
  const bounds = (total: number) => {
    const lo = Math.min(MIN_MAP, total / 2)
    const hi = Math.max(total - MIN_CHAT, total / 2)
    return [lo / total, hi / total] as const
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    const bar = e.currentTarget
    const map = bar.nextElementSibling?.getBoundingClientRect()
    const total = bar.parentElement?.clientWidth
    if (!map || !total) return
    const start = e.clientX
    const [lo, hi] = bounds(total)
    bar.setPointerCapture(e.pointerId)
    // Sem isso o arrasto vai selecionando o texto do chat pelo caminho.
    document.body.style.userSelect = 'none'
    // O mapa fica à direita: levar a divisória para a esquerda o alarga.
    const move = (ev: PointerEvent) => setMapWidth(Math.min(hi, Math.max(lo, (map.width + start - ev.clientX) / total)))
    const up = () => {
      bar.removeEventListener('pointermove', move)
      bar.removeEventListener('pointerup', up)
      bar.removeEventListener('pointercancel', up)
      document.body.style.userSelect = ''
      saveMapWidth()
    }
    bar.addEventListener('pointermove', move)
    bar.addEventListener('pointerup', up)
    bar.addEventListener('pointercancel', up)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowLeft: KEY_STEP, ArrowRight: -KEY_STEP }[e.key]
    const total = e.currentTarget.parentElement?.clientWidth
    if (step === undefined || !total) return
    e.preventDefault()
    const [lo, hi] = bounds(total)
    setMapWidth(Math.min(hi, Math.max(lo, width + step)))
    saveMapWidth()
  }

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label="Tamanho do chat e do mapa"
      aria-valuenow={Math.round((1 - width) * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      title="Arrastar para mudar o tamanho · dois cliques: tamanho padrão"
      onPointerDown={onPointerDown}
      onDoubleClick={() => {
        setMapWidth(MAP_WIDTH)
        saveMapWidth()
      }}
      onKeyDown={onKeyDown}
      className="group relative z-10 w-px shrink-0 cursor-col-resize touch-none bg-border outline-none"
    >
      {/* Área de pegar mais larga que a linha: acertar 1px com o mouse é impossível. */}
      <span className="absolute inset-y-0 -inset-x-1.5" />
      {/* A linha acende ao passar o mouse, ao arrastar e com foco do teclado. */}
      <span className="pointer-events-none absolute inset-y-0 -left-px w-[3px] bg-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 group-active:opacity-100" />
    </div>
  )
}

/**
 * Onde o mapa fica: no lugar do chat ou, com `beside`, à direita dele, com a divisória no meio. É o
 * mesmo elemento nos dois casos, para trocar de um para o outro não desmontar o mapa (zoom, galhos
 * recolhidos). Só isto acompanha a largura, então arrastar não redesenha a conversa inteira.
 */
export function MapPane({ beside, children }: { beside: boolean; children: React.ReactNode }) {
  const width = useMapWidth((s) => s.width)
  return (
    <>
      {beside && <Divider />}
      <div
        // O mínimo e o máximo seguram os dois lados quando a janela encolhe depois do arrasto.
        className={beside ? 'relative shrink-0' : 'absolute inset-0 z-20'}
        style={beside ? { width: `${width * 100}%`, minWidth: MIN_MAP, maxWidth: `calc(100% - ${MIN_CHAT}px)` } : undefined}
      >
        {children}
      </div>
    </>
  )
}
