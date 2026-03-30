import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Keycloak desativado até o realm pgu_realm ser criado.
// import keycloak from './keycloak'
// keycloak.init({ onLoad: 'login-required'}).then((authenticated) => {
//   if (authenticated) { ... }
// })

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
