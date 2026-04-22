import Keycloak from 'keycloak-js';

const keycloakUrl = import.meta.env.VITE_KEYCLOAK_URL
  || `${window.location.protocol}//${window.location.hostname}:8080`;

const keycloak = new Keycloak({
  url: keycloakUrl,
  realm: 'pgu-realm',
  clientId: 'pgu-backoffice',
});

export default keycloak;
