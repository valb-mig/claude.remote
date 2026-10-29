import { LANE_FAR, LANE_NEAR, WALK_H } from './scene'
import type { Sky } from './sky'
import { PAL, rect, type Ctx } from './sprites'

/**
 * A rua em frente ao prédio: carros nas duas mãos, ônibus de vez em quando, gente na calçada e,
 * quando a conversa dá push, o caminhão de entregas. Tudo na escala dos claudinhos: quem anda na
 * calçada tem a altura de um deles, e um carro, umas duas vezes e meia isso de comprimento.
 * As medidas saem de `ground`, o topo da calçada (ver GROUND_H em scene.ts).
 */

type Kind = 'car' | 'van' | 'bus' | 'truck'
type Car = { kind: Kind; x: number; dir: 1 | -1; speed: number; color: string; stopAt?: number; stopped?: number }
type Walker = { x: number; dir: 1 | -1; speed: number; shirt: string; pants: string; skin: string; hair: string; stride: number; bag: boolean }

// Cores de carro que se separam do asfalto: cinza-escuro sumiria nele.
const CARS = ['#e34948', '#3f8ae0', '#f6c945', '#25c08a', '#e8e1d0', '#9b86f0', '#eb6834', '#49b6c9']
const SHIRTS = ['#d9534f', '#5bc0de', '#f0ad4e', '#5cb85c', '#9b59b6', '#e87ba4', '#3a3f4a', '#e8e1d0']
const PANTS = ['#3a4a6b', '#2f3b63', '#4a4f58', '#6e4229', '#55607a']
const SKINS = ['#f1c7a5', '#d9a27c', '#a86f4c', '#6e4a33']
const HAIRS = ['#2b2118', '#4a2f1c', '#6b4a2f', '#9a8468', '#c9a227', '#20242c']
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]

/** Comprimento de cada veículo; a altura sai do desenho (ver `vehicle`). */
const LEN: Record<Kind, number> = { car: 40, van: 46, bus: 74, truck: 54 }

export class Street {
  private cars: Car[] = []
  private walkers: Walker[] = []
  private nextCar = 2
  private nextWalker = 1
  /** Caminhões pedidos (um por push), saindo um de cada vez. */
  private deliveries = 0

  /** Alguém deu push: o caminhão passa e para na frente do prédio. */
  deliver(): void {
    this.deliveries = Math.min(this.deliveries + 1, 3)
  }

  step(dt: number, width: number, sky: Sky, stopX: number): void {
    const busy = sky.dark > 0.7 ? 0.45 : 1
    this.nextCar -= dt
    if (this.deliveries > 0 && !this.cars.some((c) => c.kind === 'truck')) {
      this.deliveries--
      this.cars.push({ kind: 'truck', x: -LEN.truck, dir: 1, speed: 52, color: PAL.white, stopAt: stopX })
    } else if (this.nextCar <= 0) {
      const dir = Math.random() < 0.5 ? 1 : -1
      const r = Math.random()
      const kind: Kind = r < 0.08 ? 'bus' : r < 0.26 ? 'van' : 'car'
      const len = LEN[kind]
      const x = dir > 0 ? -len : width + len
      // Só entra com a mão livre na entrada: dois carros sobrepostos ficariam um borrão.
      const blocked = this.cars.some((o) => o.dir === dir && Math.abs(o.x - x) < len + LEN[o.kind])
      if (!blocked) {
        this.cars.push({ kind, x, dir, speed: kind === 'bus' ? 42 : kind === 'van' ? 52 : 58 + Math.random() * 26, color: kind === 'bus' ? '#f6c945' : pick(CARS) })
      }
      this.nextCar = (blocked ? 1 : 1.8 + Math.random() * 5) / busy
    }
    this.nextWalker -= dt
    if (this.nextWalker <= 0) {
      const dir = Math.random() < 0.5 ? 1 : -1
      this.walkers.push({
        x: dir > 0 ? -8 : width + 8,
        dir,
        speed: 11 + Math.random() * 7,
        shirt: pick(SHIRTS),
        pants: pick(PANTS),
        skin: pick(SKINS),
        hair: pick(HAIRS),
        stride: Math.random(),
        bag: Math.random() < 0.35,
      })
      this.nextWalker = (3 + Math.random() * 7) / busy
    }
    for (const c of this.cars) {
      if (c.stopAt !== undefined && c.stopped === undefined && c.x >= c.stopAt) c.stopped = 2.5
      if (c.stopped !== undefined && c.stopped > 0) {
        c.stopped -= dt
        continue
      }
      // Quem alcança o da frente na mesma mão vai no ritmo dele, em vez de passar por cima.
      const gap = (o: Car) => (o.x - c.x) * c.dir
      const ahead = this.cars.filter((o) => o !== c && o.dir === c.dir && gap(o) > 0).sort((a, b) => gap(a) - gap(b))[0]
      const close = ahead && gap(ahead) < (LEN[c.kind] + LEN[ahead.kind]) / 2 + 12
      c.x += c.dir * (close ? Math.min(c.speed, ahead.stopped ? 0 : ahead.speed) : c.speed) * dt
    }
    for (const w of this.walkers) {
      w.x += w.dir * w.speed * dt
      w.stride += dt
    }
    const out = (x: number, margin: number) => x > -margin && x < width + margin
    this.cars = this.cars.filter((c) => out(c.x, LEN[c.kind] + 10))
    this.walkers = this.walkers.filter((w) => out(w.x, 12))
  }

  draw(ctx: Ctx, ground: number, sky: Sky, t: number): void {
    // Quem anda na calçada fica atrás dos carros; a mão de lá, atrás da mão de cá.
    for (const w of this.walkers) walker(ctx, w, ground + WALK_H - 1, sky)
    for (const c of this.cars) if (c.dir < 0) vehicle(ctx, c, ground + LANE_FAR, sky, t)
    for (const c of this.cars) if (c.dir > 0) vehicle(ctx, c, ground + LANE_NEAR, sky, t)
  }
}

/** Um veículo com as rodas em `y`. O desenho é de perfil, virado para onde ele anda. */
function vehicle(ctx: Ctx, c: Car, y: number, sky: Sky, t: number): void {
  const lit = sky.dark > 0.5
  const len = LEN[c.kind]
  const x = Math.round(c.x - len / 2)
  const glass = sky.dark > 0.5 ? '#44618a' : '#a9d7f2'
  const dark = 'rgba(0,0,0,0.22)'
  const moving = c.stopped === undefined || c.stopped <= 0
  // Sombra no asfalto e rodas (com o cubo clareando, para dar a volta andando).
  rect(ctx, x + 2, y, len - 4, 2, dark)
  const wheel = (wx: number) => {
    rect(ctx, x + wx, y - 5, 8, 5, PAL.ink)
    const spin = moving ? Math.floor(t * 9) % 2 : 0
    rect(ctx, x + wx + 2 + spin, y - 3, 3, 2, '#6a727d')
  }

  if (c.kind === 'bus') {
    wheel(7)
    wheel(len - 16)
    rect(ctx, x, y - 27, len, 22, c.color)
    rect(ctx, x, y - 27, len, 2, '#fff2c4')
    rect(ctx, x + 1, y - 13, len - 2, 2, '#d9ae2d')
    rect(ctx, x, y - 6, len, 1, dark)
    for (let wx = x + 4; wx < x + len - 8; wx += 11) rect(ctx, wx, y - 24, 8, 9, glass)
    rect(ctx, x + len - 7, y - 24, 6, 12, glass)
    rect(ctx, x + 2, y - 12, 7, 7, '#c8a128')
  } else if (c.kind === 'truck') {
    // Caminhão de entregas: baú com a caixinha do commit pintada e a cabine na frente.
    wheel(6)
    wheel(len - 15)
    rect(ctx, x, y - 24, len - 17, 19, c.color)
    rect(ctx, x, y - 24, len - 17, 2, '#e3e7ec')
    rect(ctx, x, y - 6, len - 17, 1, dark)
    rect(ctx, x + 9, y - 19, 12, 10, PAL.cardboard)
    rect(ctx, x + 9, y - 19, 12, 2, PAL.cardboardLight)
    rect(ctx, x + 14, y - 19, 2, 10, PAL.cardboardDark)
    rect(ctx, x + len - 17, y - 19, 17, 14, PAL.amber)
    rect(ctx, x + len - 13, y - 17, 10, 7, glass)
  } else {
    const van = c.kind === 'van'
    wheel(6)
    wheel(len - 14)
    // Carroceria: o corpo, o brilho em cima, o para-choque embaixo e um vinco no meio.
    rect(ctx, x, y - 14, len, 10, c.color)
    rect(ctx, x + 1, y - 15, len - 2, 1, c.color)
    rect(ctx, x + 2, y - 15, len - 4, 1, 'rgba(255,255,255,0.35)')
    rect(ctx, x, y - 8, len, 1, 'rgba(255,255,255,0.12)')
    rect(ctx, x, y - 5, len, 1, dark)
    // Cabine: na van ela é alta e reta; no carro, menor e recuada.
    const cx = x + (van ? 6 : 9)
    const cw = len - (van ? 10 : 19)
    const ch = van ? 12 : 9
    rect(ctx, cx, y - 14 - ch, cw, ch, c.color)
    rect(ctx, cx + 1, y - 13 - ch, cw - 2, 1, c.color)
    rect(ctx, cx + 2, y - 12 - ch, cw - 4, ch - 3, glass)
    rect(ctx, cx + Math.round(cw / 2), y - 12 - ch, 1, ch - 3, c.color)
    // Maçaneta e o friso que liga a cabine ao corpo.
    rect(ctx, cx + 3, y - 12, 4, 1, 'rgba(0,0,0,0.3)')
  }

  if (lit) {
    // Faróis na frente, lanterna atrás e o facho batendo no asfalto.
    const front = c.dir > 0 ? x + len - 1 : x
    const back = c.dir > 0 ? x : x + len - 1
    rect(ctx, front - (c.dir > 0 ? 1 : 0), y - 11, 2, 3, '#fff2b0')
    rect(ctx, back - (c.dir > 0 ? 0 : 1), y - 11, 2, 3, PAL.ledRed)
    // O facho abre do farol para a frente, até morrer no asfalto.
    ctx.globalAlpha = 0.14
    for (let i = 0; i < 20; i++) {
      const h = 3 + i * 0.5
      rect(ctx, front + (c.dir > 0 ? 2 + i : -3 - i), y - 10 - h / 2 + i * 0.45, 1, h, '#fff2b0')
    }
    ctx.globalAlpha = 1
  }
}

/** Alguém na calçada, com os pés em `y`: cabeça, cabelo, tronco, braço e perninhas alternando. */
function walker(ctx: Ctx, w: Walker, y: number, sky: Sky): void {
  const x = Math.round(w.x)
  const step = Math.floor(w.stride * 5) % 2
  const bob = step ? -1 : 0
  rect(ctx, x - 3, y, 7, 1, 'rgba(0,0,0,0.2)')
  // Pernas (uma à frente da outra, trocando) e sapatos.
  rect(ctx, x - 3, y - 5, 2, 5, w.pants)
  rect(ctx, x + 1, y - 5, 2, 5, w.pants)
  rect(ctx, x - 4 + (step ? 1 : 0), y - 1, 3, 1, PAL.ink)
  rect(ctx, x + 1 + (step ? 0 : 1), y - 1, 3, 1, PAL.ink)
  // Tronco, braço balançando e cabeça com cabelo.
  rect(ctx, x - 3, y - 11 + bob, 6, 6, w.shirt)
  rect(ctx, x + (w.dir > 0 ? 3 : -4), y - 10 + bob + (step ? 1 : 0), 1, 4, w.shirt)
  rect(ctx, x - 2, y - 16 + bob, 5, 5, w.skin)
  rect(ctx, x - 2, y - 17 + bob, 5, 2, w.hair)
  rect(ctx, x + (w.dir > 0 ? 2 : -2), y - 15 + bob, 1, 1, PAL.ink)
  if (w.bag) rect(ctx, x + (w.dir > 0 ? -5 : 3), y - 8 + bob, 3, 4, '#6e4229')
  if (sky.rain) {
    // Guarda-chuva aberto, com o cabo descendo até a mão.
    rect(ctx, x - 7, y - 23 + bob, 15, 2, w.shirt)
    rect(ctx, x - 5, y - 24 + bob, 11, 1, w.shirt)
    rect(ctx, x - 1, y - 21 + bob, 1, 9, PAL.ink)
  }
}
