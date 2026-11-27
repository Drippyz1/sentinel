import React from 'react'
import ReactDOM from 'react-dom/client'
import './assets/main.css'
import './assets/workstation.css'
import { useUiSettingsStore } from './store/uiSettingsStore'
import { applyAppearance } from './utils/appearance'

const isTrayWindow = window.location.hash === '#tray'
const isMiniMonitorWindow = window.location.hash === '#mini-monitor'

async function init() {
  const system = window.matchMedia('(prefers-color-scheme: light)')
  const update = () => applyAppearance(useUiSettingsStore.getState().appearance, system.matches)
  useUiSettingsStore.subscribe((state, previous) => {
    if (state.appearance !== previous.appearance) update()
  })
  system.addEventListener('change', update)
  await useUiSettingsStore.getState().initialize()
  update()
  document.body.dataset.window = isTrayWindow ? 'tray' : isMiniMonitorWindow ? 'mini' : 'desktop'
  if (isTrayWindow) {
    const { TrayApp } = await import('./TrayApp')
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <TrayApp />
      </React.StrictMode>
    )
  } else if (isMiniMonitorWindow) {
    const { MiniMonitorApp } = await import('./MiniMonitorApp')
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <MiniMonitorApp />
      </React.StrictMode>
    )
  } else {
    const { default: App } = await import('./App')
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    )
  }
}

init()
