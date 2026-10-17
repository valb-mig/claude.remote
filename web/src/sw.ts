import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import type { PushPayload } from './lib/types'

declare const self: ServiceWorkerGlobalScope

// Só o app shell vai para o cache; API e WebSocket sempre direto no PC. Versão nova assume na hora.
self.skipWaiting()
clientsClaim()
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//, /^\/ws/] }))

// ---- notificações (o PC manda pelo Web Push; ver server/src/notifier.ts) ----

// `renotify` e `timestamp` existem no Chrome, mas não nos tipos do TypeScript.
type ShowOptions = NotificationOptions & { renotify?: boolean; timestamp?: number }

self.addEventListener('push', (event) => {
  let payload: PushPayload
  try {
    payload = event.data?.json() as PushPayload
  } catch {
    return
  }
  if (payload?.title) event.waitUntil(show(payload))
})

async function show(p: PushPayload): Promise<void> {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  // A conversa já está na tela: o aviso só atrapalharia.
  if (windows.some((c) => c.visibilityState === 'visible' && new URL(c.url).pathname === p.url)) return
  const options: ShowOptions = {
    body: p.body,
    // Uma por conversa: a nova substitui a anterior e vibra de novo.
    tag: p.tag,
    renotify: true,
    icon: '/pwa-192.png',
    badge: '/badge-96.png',
    timestamp: p.ts,
    data: { url: p.url },
  }
  await self.registration.showNotification(p.title, options)
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string } | null)?.url ?? '/'
  event.waitUntil(openApp(url))
})

/** Traz o app para a frente na conversa do aviso; fechado, abre direto nela. */
async function openApp(url: string): Promise<void> {
  const [client] = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  if (!client) {
    await self.clients.openWindow(url)
    return
  }
  await client.focus()
  client.postMessage({ type: 'navigate', url })
}
