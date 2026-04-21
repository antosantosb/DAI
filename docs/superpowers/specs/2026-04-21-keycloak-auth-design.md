# Keycloak Authentication & Authorization — Design Spec

**Date:** 2026-04-21
**Status:** Approved

## Overview

Add Keycloak-based authentication with JWT tokens to the PGU platform. Two roles (Admin, Operator) with automatic realm setup via JSON import. Single login grants access to both Backoffice and LiveMap.

## Architecture

```
Browser (React + keycloak-js)
    ↓ PKCE auth code flow
Keycloak (Docker, port 9090)
    ↓ JWT access token
Spring Boot Resource Server (validates JWT)
```

## Keycloak Realm Configuration

- **Realm:** `pgu-realm`
- **Client:** `pgu-backoffice` (public, PKCE enabled)
  - Valid redirect URIs: `http://localhost:5173/*`
  - Web origins: `http://localhost:5173`
  - Standard flow enabled, direct access grants disabled
- **Realm roles:** `admin`, `operator`
- **Default users (dev only):**
  - `admin` / `admin123` → role `admin`
  - `operador` / `operador123` → role `operator`
- **Automatic setup:** realm-export JSON mounted into Keycloak container, imported on startup via `--import-realm`

## Docker Compose

Add Keycloak service:

```yaml
keycloak:
  image: quay.io/keycloak/keycloak:26.2
  command: start-dev --import-realm
  environment:
    KC_BOOTSTRAP_ADMIN_USERNAME: admin
    KC_BOOTSTRAP_ADMIN_PASSWORD: admin
  ports:
    - "9090:8080"
  volumes:
    - ./keycloak/pgu-realm.json:/opt/keycloak/data/import/pgu-realm.json:ro
```

## Roles & Permission Matrix

| Action | Admin | Operator |
|---|---|---|
| View Dashboard, Analytics, Health | Yes | Yes |
| View Buses, Stops, Routes | Yes | Yes |
| Create/Edit/Delete Buses | Yes | No |
| Create/Edit/Delete Stops | Yes | No |
| Create/Edit/Delete Routes | Yes | No |
| Submit Exports | Yes | Yes |
| Delete Exports | Yes | No |
| View LiveMap | Yes | Yes |

## Backend — Spring Security

- Add `spring-boot-starter-oauth2-resource-server` dependency
- Configure JWT issuer URI: `http://localhost:9090/realms/pgu-realm`
- `SecurityConfig.java`:
  - `GET /api/v1/**` → `authenticated()` (both roles)
  - `POST/PUT/DELETE /api/v1/buses/**`, `/stops/**`, `/routes/**` → `hasRole('admin')`
  - `POST /api/v1/exports/telemetry` → `authenticated()`
  - `DELETE /api/v1/exports/**` → `hasRole('admin')`
  - WebSocket `/ws-telemetry` → `permitAll()` (STOMP auth separate concern)
  - Actuator endpoints → `permitAll()`
- Role extraction from JWT `realm_access.roles` claim via custom `JwtAuthenticationConverter`
- CORS configured for `http://localhost:5173`

## Frontend — keycloak-js

### Initialization (`keycloak.js`)

```javascript
import Keycloak from 'keycloak-js';

const keycloak = new Keycloak({
  url: import.meta.env.VITE_KC_URL || 'http://localhost:9090',
  realm: 'pgu-realm',
  clientId: 'pgu-backoffice',
});

export default keycloak;
```

### Auth Provider (`AuthProvider.jsx`)

- Wraps app in context providing `keycloak`, `authenticated`, `roles`, `username`
- Calls `keycloak.init({ onLoad: 'check-sso', pkceMethod: 'S256' })`
- Auto-refreshes token before expiry via `onTokenExpired`

### Route Protection

- Landing page (`/`) → public
  - If not authenticated: shows "Entrar" button → redirects to Keycloak login
  - If authenticated: shows access links to Backoffice and LiveMap
- `/backoffice/**` and `/livemap` → require authentication
- `ProtectedRoute` component redirects to `/` (Landing) if not authenticated, which then triggers Keycloak login
- After Keycloak login → redirect back to Landing page (`/`) where user is now authenticated
- Components check roles to show/hide action buttons (edit, delete)

### Axios Interceptor (`api.js`)

- Request interceptor adds `Authorization: Bearer ${keycloak.token}`
- 401 response interceptor triggers `keycloak.login()`

### Layout Changes

- Sidebar footer shows real username from token
- Avatar shows first letter of username
- Role badge below name
- Logout button calls `keycloak.logout({ redirectUri: window.location.origin })`

### Keycloak Custom Login Theme

- Custom FreeMarker theme under `keycloak/themes/pgu/login/`
- Matches PGU visual identity (colors, logo TUB, typography)
- Mounted into Keycloak container via Docker volume
- Realm config sets `loginTheme: "pgu"`

## Realm Export File

`keycloak/pgu-realm.json` — contains full realm config:
- Realm settings (name, enabled, login theme `pgu`)
- Client `pgu-backoffice` (public, PKCE, redirect URIs, post-login redirect to `/`)
- Roles `admin` and `operator`
- Two default users with credentials and role mappings

## Migration Notes

- Existing `keycloak.js` in frontend already has correct realm/client names — update URL to use env var
- Existing `SecurityConfig.java` needs rewrite from permitAll to JWT validation
- `.env` needs `VITE_KC_URL=http://localhost:9090`
- `application.properties` needs JWT issuer URI config

## Out of Scope

- Production Keycloak deployment (HTTPS, external DB)
- User self-registration
- Fine-grained resource-level permissions (RBAC is sufficient)
- STOMP/WebSocket authentication (future enhancement)
