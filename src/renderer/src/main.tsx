import React from 'react'
import ReactDOM from 'react-dom/client'
import './assets/main.css'

// Check if this window was opened as the tray popover
// We pass #tray in the URL when creating the tray window
const isTrayWindow = window.location.hash === '#tray'
const isMiniMonitorWindow = window.location.hash === '#mini-monitor'

async function init() {
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
