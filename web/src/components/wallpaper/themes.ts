import { aquarium } from './aquarium'
import { fireflies } from './fireflies'
import { jellyfish } from './jellyfish'
import type { Theme } from './scene'

/** Os temas na ordem em que aparecem nos ajustes. */
export const THEMES: Theme[] = [aquarium, jellyfish, fireflies]

export const themeOf = (id: string): Theme | undefined => THEMES.find((t) => t.id === id)
