import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import './auth-overrides.css'
import './main-interface.css'
import './friends.css'
import TooltipLayer from './components/TooltipLayer'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /><TooltipLayer/></React.StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
