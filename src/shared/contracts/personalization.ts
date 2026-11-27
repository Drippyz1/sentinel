import type { UiSettings } from './settings'

export const DASHBOARD_WIDGET_KEYS = [
  'cpu',
  'memory',
  'gpu',
  'disk',
  'network',
  'battery',
  'anomalies'
] as const
export type DashboardWidget = (typeof DASHBOARD_WIDGET_KEYS)[number]

export const THEMES = ['graphite', 'glacier', 'obsidian', 'nordic', 'system'] as const
export const STARTUP_PAGES = [
  '/',
  '/processes',
  '/network',
  '/system',
  '/history',
  '/alerts',
  '/settings'
] as const
export const ACCENTS = ['#349e88', '#4c8ae0', '#b383db', '#cf8253', '#ca6478'] as const
export const PRESETS = ['essential', 'performance', 'diagnostics', 'custom'] as const
export const AUX_METRICS = ['cpu', 'memory', 'gpu', 'battery', 'network', 'disk'] as const
export const MAX_PROFILES = 12

export interface Appearance {
  theme: (typeof THEMES)[number]
  accent: string
  density: 'compact' | 'comfortable'
  textSize: 14 | 15 | 16
  sidebar: 'expanded' | 'collapsed'
  startupPage: (typeof STARTUP_PAGES)[number]
  chart: 'area' | 'line'
}

export interface DashboardLayout {
  preset: (typeof PRESETS)[number]
  wide: DashboardWidget[]
  noChart: DashboardWidget[]
  presentation?: Partial<Record<DashboardWidget, WidgetPresentation>>
}

export const WIDGET_WIDTHS = ['standard', 'wide', 'full'] as const
export const WIDGET_HEIGHTS = ['summary', 'expanded'] as const
export const WIDGET_STYLES = {
  cpu: ['gauge', 'bar', 'number', 'timeline'],
  memory: ['ring', 'bar', 'number', 'timeline'],
  gpu: ['gauge', 'number', 'timeline'],
  disk: ['segments', 'bar', 'number'],
  network: ['activity', 'line', 'area', 'number'],
  battery: ['ring', 'bar', 'number'],
  anomalies: ['list']
} as const

export type WidgetWidth = (typeof WIDGET_WIDTHS)[number]
export type WidgetHeight = (typeof WIDGET_HEIGHTS)[number]
export type WidgetStyle = (typeof WIDGET_STYLES)[DashboardWidget][number]

export interface WidgetPresentation {
  width: WidgetWidth
  height: WidgetHeight
  style: WidgetStyle
}

export interface MiniPresentation {
  metrics: Exclude<(typeof AUX_METRICS)[number], 'disk'>[]
  size: 'small' | 'standard' | 'large'
  opacity: 85 | 90 | 95 | 100
  layout: 'grid' | 'list'
}

export interface TrayPresentation {
  metrics: (typeof AUX_METRICS)[number][]
  compact: boolean
}

export interface AppearanceProfile {
  name: string
  version: 1
  appearance: Appearance
  dashboard: Pick<
    UiSettings,
    'dashboardDensity' | 'dashboardWidgets' | 'dashboardWidgetOrder' | 'dashboardLayout'
  >
}

export const DEFAULT_APPEARANCE: Appearance = {
  theme: 'graphite',
  accent: ACCENTS[1],
  density: 'comfortable',
  textSize: 15,
  sidebar: 'expanded',
  startupPage: '/',
  chart: 'area'
}
export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayout = {
  preset: 'essential',
  wide: [],
  noChart: [],
  presentation: {
    cpu: { width: 'standard', height: 'summary', style: 'timeline' },
    memory: { width: 'standard', height: 'summary', style: 'timeline' },
    gpu: { width: 'standard', height: 'summary', style: 'timeline' }
  }
}
export const DEFAULT_MINI_PRESENTATION: MiniPresentation = {
  metrics: ['cpu', 'memory', 'gpu', 'battery', 'network'],
  size: 'standard',
  opacity: 100,
  layout: 'grid'
}
export const DEFAULT_TRAY_PRESENTATION: TrayPresentation = {
  metrics: ['cpu', 'memory', 'gpu', 'disk', 'network', 'battery'],
  compact: false
}

export const PROFILE_BYTES = 16_384

function record(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  )
}

function shape(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return (
    record(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  )
}

function oneOf(value: unknown, choices: readonly unknown[]): boolean {
  return choices.includes(value)
}

function subset(value: unknown, choices: readonly string[], min = 0): boolean {
  return (
    Array.isArray(value) &&
    value.length >= min &&
    value.length <= choices.length &&
    Object.keys(value).length === value.length &&
    Array.from(value).every((item) => choices.includes(item)) &&
    new Set(value).size === value.length
  )
}

export function isAccent(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
}

export function isAppearance(value: unknown): value is Appearance {
  return (
    shape(value, Object.keys(DEFAULT_APPEARANCE)) &&
    oneOf(value.theme, THEMES) &&
    isAccent(value.accent) &&
    oneOf(value.density, ['compact', 'comfortable']) &&
    oneOf(value.textSize, [14, 15, 16]) &&
    oneOf(value.sidebar, ['expanded', 'collapsed']) &&
    oneOf(value.startupPage, STARTUP_PAGES) &&
    oneOf(value.chart, ['area', 'line'])
  )
}

export function isDashboardLayout(value: unknown): value is DashboardLayout {
  if (!record(value)) return false
  const enhanced = Object.hasOwn(value, 'presentation')
  return (
    shape(
      value,
      enhanced ? ['preset', 'wide', 'noChart', 'presentation'] : ['preset', 'wide', 'noChart']
    ) &&
    oneOf(value.preset, PRESETS) &&
    subset(value.wide, DASHBOARD_WIDGET_KEYS) &&
    subset(value.noChart, DASHBOARD_WIDGET_KEYS) &&
    (!enhanced || isWidgetPresentationMap(value.presentation))
  )
}

function isWidgetPresentationMap(value: unknown): boolean {
  return (
    record(value) &&
    Object.entries(value).every(([key, entry]) => {
      const widget = DASHBOARD_WIDGET_KEYS.find((id) => id === key)
      return Boolean(
        widget &&
        shape(entry, ['width', 'height', 'style']) &&
        oneOf(entry.width, WIDGET_WIDTHS) &&
        oneOf(entry.height, WIDGET_HEIGHTS) &&
        oneOf(entry.style, WIDGET_STYLES[widget])
      )
    })
  )
}

export function isMiniPresentation(value: unknown): value is MiniPresentation {
  return (
    shape(value, ['metrics', 'size', 'opacity', 'layout']) &&
    subset(
      value.metrics,
      AUX_METRICS.filter((key) => key !== 'disk'),
      1
    ) &&
    oneOf(value.size, ['small', 'standard', 'large']) &&
    oneOf(value.opacity, [85, 90, 95, 100]) &&
    oneOf(value.layout, ['grid', 'list'])
  )
}

export function isTrayPresentation(value: unknown): value is TrayPresentation {
  return (
    shape(value, ['metrics', 'compact']) &&
    subset(value.metrics, AUX_METRICS, 1) &&
    typeof value.compact === 'boolean'
  )
}

export function isProfileName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 48 &&
    value === value.trim() &&
    !/[\p{Cc}\p{Cf}]/u.test(value)
  )
}

export function isAppearanceProfile(value: unknown): value is AppearanceProfile {
  if (
    !shape(value, ['version', 'name', 'appearance', 'dashboard']) ||
    value.version !== 1 ||
    !isProfileName(value.name) ||
    !isAppearance(value.appearance)
  )
    return false
  const layout = value.dashboard
  return (
    shape(layout, [
      'dashboardDensity',
      'dashboardWidgets',
      'dashboardWidgetOrder',
      'dashboardLayout'
    ]) &&
    oneOf(layout.dashboardDensity, ['compact', 'comfortable', 'detailed']) &&
    Array.isArray(layout.dashboardWidgetOrder) &&
    subset(layout.dashboardWidgetOrder, DASHBOARD_WIDGET_KEYS, DASHBOARD_WIDGET_KEYS.length) &&
    shape(layout.dashboardWidgets, DASHBOARD_WIDGET_KEYS) &&
    Object.values(layout.dashboardWidgets).every((v) => typeof v === 'boolean') &&
    isDashboardLayout(layout.dashboardLayout)
  )
}

export function isProfileList(value: unknown): value is AppearanceProfile[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_PROFILES &&
    Object.keys(value).length === value.length &&
    Array.from(value).every(isAppearanceProfile) &&
    new Set(value.map((profile) => profile.name.toLowerCase())).size === value.length
  )
}
