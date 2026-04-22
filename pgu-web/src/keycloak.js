import Keycloak from 'keycloak-js';

const keycloakUrl = import.meta.env.VITE_KEYCLOAK_URL
  || `${window.location.origin}/auth`;

const keycloak = new Keycloak({
  url: keycloakUrl,
  realm: 'pgu-realm',
  clientId: 'pgu-backoffice',
});

export default keycloak;
