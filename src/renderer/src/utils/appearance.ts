import type { Appearance } from '../../../shared/contracts/personalization'
import { isAccent } from '../../../shared/contracts/personalization'

type Rgb = [number, number, number]
const rgb = (hex: string): Rgb => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16)
]
function luminance(value: Rgb): number {
  return value
    .map((raw) => raw / 255)
    .reduce(
      (acc, v, i) =>
        acc +
        (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][i],
      0
    )
}
export function contrast(first: string, second: string): number {
  const a = luminance(rgb(first))
  const b = luminance(rgb(second))
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

const surfaces = {
  graphite: ['#141c25', '#1a232d', '#293746'],
  glacier: ['#f6f7f8', '#fdfefe', '#e6ecf1'],
  obsidian: ['#0a0b0c', '#191c1f', '#23282b'],
  nordic: ['#182025', '#232f36', '#2a3b43']
}

export function appearanceColors(accent: string, theme: keyof typeof surfaces) {
  const input = isAccent(accent) ? accent : '#4c8ae0'
  const source = rgb(input)
  const end = theme === 'glacier' ? 0 : 255
  let ink = input
  for (let step = 0; step <= 20; step++) {
    ink =
      '#' +
      source
        .map((v) =>
          Math.round(v + ((end - v) * step) / 20)
            .toString(16)
            .padStart(2, '0')
        )
        .join('')
    if (surfaces[theme].every((surface) => contrast(ink, surface) >= 5.2)) break
  }
  return { ink, fill: ink, foreground: contrast('#000000', ink) >= 4.5 ? '#000000' : '#ffffff' }
}

export function applyAppearance(settings: Appearance, light: boolean): void {
  const theme = settings.theme === 'system' ? (light ? 'glacier' : 'graphite') : settings.theme
  const { ink, fill, foreground } = appearanceColors(settings.accent, theme)
  const root = document.documentElement
  root.dataset.theme = theme
  root.dataset.density = settings.density
  root.dataset.chart = settings.chart
  root.style.fontSize = `${settings.textSize}px`
  root.style.setProperty('--accent', ink)
  root.style.setProperty('--accent-solid', fill)
  root.style.setProperty('--on-accent', foreground)
}
