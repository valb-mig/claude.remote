import type { OfficeActivity, OfficeWorker } from '@/lib/types'
import { LANE_Y, spotFor, type Occupancy, type Spot } from './scene'
import { tintOf, type Facing, type Tint } from './sprites'

type Point = { x: number; y: number }

export type Actor = {
  key: string
  room: string
  name: string
  lead: boolean
  tint: Tint
  activity: OfficeActivity
  detail?: string
  spot: Spot
  /** Posição dos pés, dentro da sala. */
  x: number
  y: number
  path: Point[]
  facing: Facing
  /** Indo embora pelo elevador (o subagente terminou). */
  leaving: boolean
  /** Onde fica o elevador do andar, em coordenadas da área (no corredor, fora dela). */
  entry: number
  /** Fase do passo, para as perninhas alternarem. */
  stride: number
}

// Pixels do mundo por segundo: atravessar a sala leva uns 4 s.
const SPEED = 58
const ELEVATOR_Y = 96

/** Sai até a faixa da frente do chão, anda por ela e entra na estação: ninguém atravessa os móveis. */
function route(from: Point, to: Point): Point[] {
  const pts = [{ x: from.x, y: LANE_Y }, { x: to.x, y: LANE_Y }, to]
  const out: Point[] = []
  let last = from
  for (const p of pts) {
    if (Math.abs(p.x - last.x) < 0.5 && Math.abs(p.y - last.y) < 0.5) continue
    out.push(p)
    last = p
  }
  return out
}

/** Os claudinhos de todas as áreas: saem do elevador, andam até a estação e voltam a ele quando terminam. */
export class World {
  readonly actors = new Map<string, Actor>()

  sync(rooms: { key: string; workers: OfficeWorker[]; entryX: number; askX: number }[]): void {
    const present = new Set<string>()
    const roomKeys = new Set(rooms.map((r) => r.key))
    for (const room of rooms) {
      const counts = new Map<OfficeActivity, number>()
      room.workers.forEach((w, i) => {
        const n = counts.get(w.activity) ?? 0
        counts.set(w.activity, n + 1)
        const spot = spotFor(w.activity, n, room.askX)
        const key = `${room.key}|${w.id}`
        present.add(key)
        const name = w.role === 'gestor' ? 'Gestor' : w.name
        let a = this.actors.get(key)
        if (!a) {
          const door = { x: room.entryX, y: ELEVATOR_Y }
          a = { key, room: room.key, name, lead: w.role === 'gestor', tint: tintOf(i), activity: w.activity, spot, ...door, entry: room.entryX, path: [], facing: 'front', leaving: false, stride: 0 }
          a.path = route(door, spot)
          this.actors.set(key, a)
        }
        a.entry = room.entryX
        a.name = name
        a.detail = w.detail
        a.tint = tintOf(i)
        if (a.leaving || a.activity !== w.activity || a.spot.x !== spot.x || a.spot.y !== spot.y) {
          a.activity = w.activity
          a.spot = spot
          a.leaving = false
          a.path = route(a, spot)
        }
      })
    }
    for (const a of [...this.actors.values()]) {
      // A conversa fechou: a área some do mapa, e quem estava nela também.
      if (!roomKeys.has(a.room)) this.actors.delete(a.key)
      else if (!present.has(a.key) && !a.leaving) {
        a.leaving = true
        a.path = route(a, { x: a.entry, y: ELEVATOR_Y })
      }
    }
  }

  step(dt: number): void {
    for (const a of [...this.actors.values()]) {
      let budget = SPEED * dt
      while (budget > 0 && a.path.length) {
        const t = a.path[0]
        const dx = t.x - a.x
        const dy = t.y - a.y
        const dist = Math.hypot(dx, dy)
        a.facing = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'front' : 'back'
        if (dist <= budget) {
          a.x = t.x
          a.y = t.y
          a.path.shift()
          budget -= dist
        } else {
          a.x += (dx / dist) * budget
          a.y += (dy / dist) * budget
          budget = 0
        }
      }
      a.stride += dt
      if (a.path.length) continue
      if (a.leaving) this.actors.delete(a.key)
      else a.facing = a.spot.facing
    }
  }

  /** Quem já chegou à estação acende o móvel; sentados escondem as pernas atrás da cadeira ou do sofá. */
  occupancy(room: string): Occupancy {
    const occ: Occupancy = { active: new Set(), chairs: new Set(), sofa: false }
    for (const a of this.actors.values()) {
      if (a.room !== room || a.path.length || a.leaving) continue
      occ.active.add(a.activity)
      if (a.spot.seated === 'chair' && (a.activity === 'web' || a.activity === 'edit')) occ.chairs.add(a.activity)
      if (a.spot.seated === 'sofa') occ.sofa = true
    }
    return occ
  }
}
