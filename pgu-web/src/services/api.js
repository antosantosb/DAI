import axios from 'axios';
import { toast } from 'react-toastify';
import keycloak from '../keycloak';

const api = axios.create({
  baseURL: '/api/v1',
  // Sprint -1 (FE-3): timeout 15s. Sem isto, requests "pendurados"
  // (backend slow, network drop) ficavam indefinidamente, segurando UI.
  timeout: 15000,
});

api.interceptors.request.use(async (config) => {
  if (keycloak.authenticated) {
    try {
      await keycloak.updateToken(30);
    } catch {
      keycloak.login({ redirectUri: window.location.origin });
      return Promise.reject(new Error('Token refresh failed'));
    }
    config.headers.Authorization = `Bearer ${keycloak.token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    // 401: token invalido/expirado -> re-login
    if (status === 401) {
      keycloak.login({ redirectUri: window.location.origin });
    }
    // Sprint -1 (FE-19): 403 = autenticado mas sem permissao
    // Toast em vez de redirect para o utilizador perceber o que falhou.
    else if (status === 403) {
      toast.error('Sem permissao para esta operacao.', {
        toastId: 'http-403',
        autoClose: 4000,
      });
    }
    // Timeout (FE-3): error.code === 'ECONNABORTED'
    else if (error.code === 'ECONNABORTED') {
      toast.error('Pedido demorou demasiado a responder. Tenta de novo.', {
        toastId: 'http-timeout',
        autoClose: 5000,
      });
    }
    return Promise.reject(error);
  }
);

export default api;
