import { toast } from 'sonner'

/**
 * Versão nova do app. O service worker novo assume sozinho (skipWaiting + clientsClaim), mas a tela
 * aberta segue com o código antigo até recarregar: avisa, com um botão para atualizar. E, ao voltar
 * para o app, procura versão nova, porque o Android mantém o app vivo nos recentes sem recarregar.
 */
export function watchUpdates() {
  const sw = navigator.serviceWorker
  if (!sw) return
  // A primeira instalação também troca o controlador; só avisa se a tela já era de uma versão anterior.
  const hadController = Boolean(sw.controller)
  sw.addEventListener('controllerchange', () => {
    if (!hadController) return
    toast('Versão nova do app', {
      id: 'app-update',
      duration: Infinity,
      action: { label: 'Atualizar', onClick: () => location.reload() },
    })
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void sw.getRegistration().then((reg) => reg?.update())
  })
}
