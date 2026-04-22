import axios from 'axios';
import keycloak from '../keycloak';

const api = axios.create({
  baseURL: '/api/v1',
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
    if (error.response?.status === 401) {
      keycloak.login({ redirectUri: window.location.origin });
    }
    return Promise.reject(error);
  }
);

export default api;
