import { useEffect, useRef, useState } from 'react'

/**
 * Voltar do celular fecha o que está por cima (menu, painel, diálogo, imagem em tela cheia) em vez
 * de sair da tela. Cada camada aberta ganha uma entrada no histórico, na mesma URL, marcada com a
 * profundidade (`{ overlay: n }`); o roteador não vê mudança de rota. Voltar tira a entrada e fecha a
 * camada de cima; fechar pelo X ou tocando fora tira a entrada que sobrou.
 */
type Layer = { close: () => void }

const stack: Layer[] = []
/** Um `history.go` nosso a caminho: o `popstate` dele não é a pessoa voltando. */
let pending = false
let scheduled = false

const level = (): number => (history.state as { overlay?: number } | null)?.overlay ?? 0

/** Deixa o histórico com uma entrada por camada aberta. */
function sync() {
  if (pending) return
  const depth = level()
  if (stack.length > depth) {
    for (let n = depth + 1; n <= stack.length; n++) history.pushState({ overlay: n }, '')
  } else if (stack.length < depth) {
    // Inclui entradas que ficaram para trás quando a camada saiu por uma navegação: mesma URL, só pula.
    pending = true
    history.go(stack.length - depth)
  }
}

// Juntar as mudanças de um mesmo clique (ex.: o menu fecha e o painel que ele abriu entra) numa só.
function schedule() {
  if (scheduled) return
  scheduled = true
  queueMicrotask(() => {
    scheduled = false
    sync()
  })
}

window.addEventListener('popstate', () => {
  if (pending) pending = false
  else for (const layer of stack.splice(level()).reverse()) layer.close()
  sync()
})

/** Registra a camada enquanto `open`; voltar chama `close`. */
/** O voltar do celular fecha esta camada em vez de sair da tela. */
export function useBackToClose(open: boolean, close: () => void) {
  const latest = useRef(close)
  useEffect(() => {
    latest.current = close
  })
  useEffect(() => {
    if (!open) return
    const layer: Layer = { close: () => latest.current() }
    stack.push(layer)
    schedule()
    return () => {
      const i = stack.indexOf(layer)
      if (i >= 0) stack.splice(i, 1)
      schedule()
    }
  }, [open])
}

/**
 * Estado de abertura para as raízes do Radix (Dialog, Sheet, menus), controlado ou não, já fechando
 * com o voltar do celular.
 */
export function useBackClosable({
  open: controlled,
  defaultOpen = false,
  onOpenChange,
}: {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [inner, setInner] = useState(defaultOpen)
  const open = controlled ?? inner
  const change = (next: boolean) => {
    if (controlled === undefined) setInner(next)
    onOpenChange?.(next)
  }
  useBackToClose(open, () => change(false))
  return { open, onOpenChange: change }
}
