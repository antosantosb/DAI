import ReactDOM from 'react-dom/client'
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
