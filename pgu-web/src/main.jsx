import ReactDOM from 'react-dom/client'
// Leaflet global: plugins como `leaflet.heat` e `leaflet.markercluster` esperam
// encontrar `window.L`. Em dev (Vite) os modulos resolvem-se a tempo; em build
// de producao o code-splitting do Rollup pode carregar o plugin antes do core
// e dar "Uncaught ReferenceError: L is not defined". Forcar global aqui resolve
// definitivamente.
import L from 'leaflet'
window.L = L
import App from './App.jsx'
import AuthProvider from './context/AuthProvider'
import ThemeProvider from './context/ThemeProvider'
import './i18n'  // Sprint 0 (F6): inicializa react-i18next antes do App
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  // StrictMode removido de propriedade: em dev ele monta cada componente 2x,
  // o que dispara os useEffect de fetch 2x e, em erro (ex.: backend em rebuild),
  // mostra toasts duplicados em todas as paginas. E' apenas comportamento de dev
  // (em producao nunca duplicava). Sem StrictMode o comportamento fica unico.
  <ThemeProvider>
    <AuthProvider>
      <App />
    </AuthProvider>
  </ThemeProvider>
)
