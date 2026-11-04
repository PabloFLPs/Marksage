import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { documentViewReady } from './lib/documentView'
import { I18nProvider } from './components/I18nProvider'

// A stored document: its view is downloading alongside (index.html asked for it) — render once it's here.
void documentViewReady.then(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <I18nProvider>
        <App />
      </I18nProvider>
    </StrictMode>,
  ),
)
