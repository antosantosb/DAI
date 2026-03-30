import Keycloak from 'keycloak-js';

const keycloak = new Keycloak({
    url: 'http://keycloak:8080', //Porta do keycloak do Docker
    realm: 'pgu_realm', //realm que defini no backend
    clientId: 'pgu-backoffice'
}) ;

export default keycloak;