import { aquarium } from './aquarium'
import { aurora } from './aurora'
import { barquinhos } from './barquinhos'
import { carpas } from './carpas'
import { chuva } from './chuva'
import { codigo } from './codigo'
import { fireflies } from './fireflies'
import { galaxia } from './galaxia'
import { jellyfish } from './jellyfish'
import { lagoa } from './lagoa'
import { luar } from './luar'
import { nuvens } from './nuvens'
import { sakura } from './sakura'
import { som } from './som'
import type { Theme } from './scene'

/**
 * Os temas na ordem em que aparecem nos ajustes: primeiro a água, depois o céu, depois a casa e por
 * fim os de tela.
 */
export const THEMES: Theme[] = [
  aquarium,
  lagoa,
  carpas,
  jellyfish,
  barquinhos,
  nuvens,
  aurora,
  galaxia,
  luar,
  fireflies,
  sakura,
  chuva,
  codigo,
  som,
]

export const themeOf = (id: string): Theme | undefined => THEMES.find((t) => t.id === id)
