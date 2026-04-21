# Keycloak Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Keycloak authentication with JWT tokens, two roles (admin/operator), custom login theme, and route protection to the PGU platform.

**Architecture:** Browser authenticates via Keycloak (PKCE flow with custom login theme), receives JWT token. Spring Boot validates JWT as OAuth2 resource server. Frontend wraps app in AuthProvider context, protects routes, and sends Bearer token on every API call.

**Tech Stack:** Keycloak 26.2.4, keycloak-js 26.2.3, Spring Security OAuth2 Resource Server, React Context API, FreeMarker (Keycloak theme)

---

## File Structure

### New files
- `keycloak/pgu-realm.json` — Realm export with roles, client, default users
- `keycloak/themes/pgu/login/theme.properties` — Theme metadata
- `keycloak/themes/pgu/login/resources/css/login.css` — Custom login styles
- `keycloak/themes/pgu/login/template.ftl` — FreeMarker login template
- `pgu-web/src/context/AuthProvider.jsx` — Keycloak init + React context
- `pgu-web/src/components/ProtectedRoute.jsx` — Route guard component
- `pgu/src/main/java/dai/tub/pgu/config/JwtRoleConverter.java` — Extract roles from JWT

### Modified files
- `docker-compose.yml` — Add realm import + theme volume to keycloak service
- `pgu/src/main/resources/application.properties` — Uncomment JWT config
- `pgu/src/main/java/dai/tub/pgu/config/SecurityConfig.java` — JWT validation + role-based rules
- `pgu-web/src/keycloak.js` — Fix URL + realm name
- `pgu-web/src/services/api.js` — Activate Bearer interceptor
- `pgu-web/src/main.jsx` — Wrap in AuthProvider
- `pgu-web/src/App.jsx` — Add ProtectedRoute to routes
- `pgu-web/src/pages/Landing.jsx` — Auth-aware (login button vs access links)
- `pgu-web/src/pages/Landing.css` — Styles for login button
- `pgu-web/src/components/Layout.jsx` — Real username, role badge, logout

---

## Task 1: Keycloak Realm Export JSON

**Files:**
- Create: `keycloak/pgu-realm.json`

This is the largest file — it configures the entire realm automatically on Keycloak startup.

- [ ] **Step 1: Create keycloak directory**

```bash
mkdir -p keycloak
```

- [ ] **Step 2: Create the realm export file**

Create `keycloak/pgu-realm.json` with this content:

```json
{
  "realm": "pgu-realm",
  "enabled": true,
  "loginTheme": "pgu",
  "sslRequired": "none",
  "registrationAllowed": false,
  "roles": {
    "realm": [
      { "name": "admin", "description": "Full access to backoffice" },
      { "name": "operator", "description": "Read-only access + exports" }
    ]
  },
  "clients": [
    {
      "clientId": "pgu-backoffice",
      "enabled": true,
      "publicClient": true,
      "directAccessGrantsEnabled": false,
      "standardFlowEnabled": true,
      "implicitFlowEnabled": false,
      "redirectUris": ["http://localhost:5173/*"],
      "webOrigins": ["http://localhost:5173"],
      "attributes": {
        "pkce.code.challenge.method": "S256",
        "post.logout.redirect.uris": "http://localhost:5173/*"
      },
      "defaultClientScopes": ["openid", "profile", "email", "roles"],
      "protocol": "openid-connect"
    }
  ],
  "users": [
    {
      "username": "admin",
      "enabled": true,
      "email": "admin@pgu.local",
      "firstName": "Admin",
      "lastName": "PGU",
      "credentials": [
        {
          "type": "password",
          "value": "admin123",
          "temporary": false
        }
      ],
      "realmRoles": ["admin"]
    },
    {
      "username": "operador",
      "enabled": true,
      "email": "operador@pgu.local",
      "firstName": "Operador",
      "lastName": "PGU",
      "credentials": [
        {
          "type": "password",
          "value": "operador123",
          "temporary": false
        }
      ],
      "realmRoles": ["operator"]
    }
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add keycloak/pgu-realm.json
git commit -m "feat: add Keycloak realm export with roles and default users"
```

---

## Task 2: Custom Keycloak Login Theme

**Files:**
- Create: `keycloak/themes/pgu/login/theme.properties`
- Create: `keycloak/themes/pgu/login/resources/css/login.css`
- Create: `keycloak/themes/pgu/login/template.ftl`

- [ ] **Step 1: Create theme directory structure**

```bash
mkdir -p keycloak/themes/pgu/login/resources/css
```

- [ ] **Step 2: Create theme.properties**

Create `keycloak/themes/pgu/login/theme.properties`:

```properties
parent=keycloak
import=common/keycloak
styles=css/login.css
```

- [ ] **Step 3: Create login.css**

Create `keycloak/themes/pgu/login/resources/css/login.css`:

```css
/* PGU TUB — Custom Keycloak Login Theme */

body.kc-login {
  background: #0f172a;
  background-image:
    radial-gradient(ellipse 80% 60% at 50% 0%, rgba(99, 102, 241, 0.25) 0%, transparent 60%),
    radial-gradient(ellipse 60% 50% at 80% 100%, rgba(139, 92, 246, 0.15) 0%, transparent 50%),
    radial-gradient(ellipse 50% 40% at 20% 80%, rgba(16, 185, 129, 0.1) 0%, transparent 50%);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

#kc-header-wrapper {
  font-size: 32px;
  font-weight: 900;
  color: #ffffff;
  letter-spacing: -1px;
  padding-bottom: 8px;
}

#kc-header-wrapper::after {
  content: 'Plataforma de Gestão Urbana';
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.5);
  letter-spacing: 2px;
  text-transform: uppercase;
  margin-top: 8px;
}

#kc-content-wrapper {
  margin-top: 0;
}

#kc-form-login {
  padding: 0;
}

.login-pf-page .card-pf {
  background: rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  padding: 36px 32px;
  max-width: 420px;
  margin: 0 auto;
}

.login-pf-page .card-pf label {
  color: rgba(255, 255, 255, 0.7);
  font-weight: 600;
  font-size: 13px;
  letter-spacing: 0.3px;
}

.login-pf-page .card-pf input[type="text"],
.login-pf-page .card-pf input[type="password"] {
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  color: #ffffff;
  padding: 10px 14px;
  font-size: 14px;
  transition: border-color 0.2s ease;
}

.login-pf-page .card-pf input[type="text"]:focus,
.login-pf-page .card-pf input[type="password"]:focus {
  border-color: rgba(99, 102, 241, 0.6);
  outline: none;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
}

#kc-login {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  border: none;
  border-radius: 10px;
  color: #ffffff;
  font-weight: 700;
  font-size: 14px;
  padding: 12px 24px;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.2s ease;
  width: 100%;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

#kc-login:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.35);
}

/* Hide unnecessary elements */
#kc-registration, #kc-info, .login-pf-page .login-pf-header,
#kc-form-options {
  display: none;
}

/* Alert styling */
.alert-error {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 10px;
  color: #fca5a5;
  padding: 12px 16px;
  font-size: 13px;
}
```

- [ ] **Step 4: Create template.ftl**

Create `keycloak/themes/pgu/login/template.ftl`:

```html
<#macro registrationLayout bodyClass="" displayInfo=false displayMessage=true displayRequiredFields=false>
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${msg("loginTitle",(realm.displayName!''))}</title>
    <link rel="stylesheet" href="${url.resourcesPath}/css/login.css">
</head>
<body class="kc-login">
    <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;">
        <div id="kc-header">
            <div id="kc-header-wrapper">TUB</div>
        </div>
        <div style="width:100%;max-width:420px;margin-top:32px;">
            <div class="login-pf-page">
                <div class="card-pf">
                    <#if displayMessage && message?has_content && (message.type != 'warning' || !isAppInitiatedAction??)>
                        <div class="alert alert-${message.type}">
                            ${kcSanitize(message.summary)?no_esc}
                        </div>
                    </#if>
                    <div id="kc-content">
                        <div id="kc-content-wrapper">
                            <#nested "form">
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <p style="margin-top:40px;font-size:12px;color:rgba(255,255,255,0.25);font-weight:500;letter-spacing:0.5px;">
            Transportes Urbanos de Braga &middot; DAI 2025
        </p>
    </div>
</body>
</html>
</#macro>
```

- [ ] **Step 5: Commit**

```bash
git add keycloak/themes/
git commit -m "feat: add custom PGU login theme for Keycloak"
```

---

## Task 3: Docker Compose — Realm Import + Theme Volume

**Files:**
- Modify: `docker-compose.yml:182-201` (keycloak service)

- [ ] **Step 1: Update keycloak service command and volumes**

In `docker-compose.yml`, change the keycloak service:

Replace:
```yaml
    command: start-dev
```
With:
```yaml
    command: start-dev --import-realm
```

Add volumes to the keycloak service (after `ports`):
```yaml
    volumes:
      - ./keycloak/pgu-realm.json:/opt/keycloak/data/import/pgu-realm.json:ro
      - ./keycloak/themes/pgu:/opt/keycloak/themes/pgu:ro
```

The full keycloak service should look like:
```yaml
  keycloak:
    image: quay.io/keycloak/keycloak:26.2.4
    container_name: keycloak
    restart: unless-stopped
    command: start-dev --import-realm
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://toolsbd:5432/${KEYCLOAK_DB_NAME}
      KC_DB_USERNAME: ${TOOLS_DB_USER}
      KC_DB_PASSWORD: ${TOOLS_DB_PASSWORD}
      KEYCLOAK_ADMIN: ${IAM_ADMIN_USER}
      KEYCLOAK_ADMIN_PASSWORD: ${IAM_ADMIN_PASSWORD}
    ports:
      - "8080:8080"
    volumes:
      - ./keycloak/pgu-realm.json:/opt/keycloak/data/import/pgu-realm.json:ro
      - ./keycloak/themes/pgu:/opt/keycloak/themes/pgu:ro
    depends_on:
      toolsbd:
        condition: service_healthy
    networks:
      - tools_db_net
      - auth_net
```

- [ ] **Step 2: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: keycloak auto-import realm + mount custom theme"
```

---

## Task 4: Backend — JWT Role Converter

**Files:**
- Create: `pgu/src/main/java/dai/tub/pgu/config/JwtRoleConverter.java`

- [ ] **Step 1: Create JwtRoleConverter**

Create `pgu/src/main/java/dai/tub/pgu/config/JwtRoleConverter.java`:

```java
package dai.tub.pgu.config;

import org.springframework.core.convert.converter.Converter;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;

import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Extrai roles do claim "realm_access.roles" do JWT Keycloak
 * e converte-os para Spring Security GrantedAuthority com prefixo ROLE_.
 */
public class JwtRoleConverter implements Converter<Jwt, Collection<GrantedAuthority>>
{
    @Override
    @SuppressWarnings("unchecked")
    public Collection<GrantedAuthority> convert(Jwt jwt)
    {
        Map<String, Object> realmAccess = jwt.getClaimAsMap("realm_access");
        if (realmAccess == null) return Collections.emptyList();

        List<String> roles = (List<String>) realmAccess.get("roles");
        if (roles == null) return Collections.emptyList();

        return roles.stream()
            .map(role -> new SimpleGrantedAuthority("ROLE_" + role))
            .collect(Collectors.toList());
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add pgu/src/main/java/dai/tub/pgu/config/JwtRoleConverter.java
git commit -m "feat: add JWT role converter for Keycloak realm_access claim"
```

---

## Task 5: Backend — SecurityConfig + application.properties

**Files:**
- Modify: `pgu/src/main/java/dai/tub/pgu/config/SecurityConfig.java`
- Modify: `pgu/src/main/resources/application.properties:25-29`

- [ ] **Step 1: Rewrite SecurityConfig.java**

Replace the entire content of `pgu/src/main/java/dai/tub/pgu/config/SecurityConfig.java`:

```java
package dai.tub.pgu.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
@EnableWebSecurity
public class SecurityConfig
{
    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception
    {
        http
            .cors(cors -> cors.configurationSource(corsSource()))
            .csrf(csrf -> csrf.disable())
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                // WebSocket endpoint — público (STOMP auth é concern separado)
                .requestMatchers("/ws-telemetry/**").permitAll()
                // Actuator
                .requestMatchers("/actuator/**").permitAll()
                // Leituras — qualquer utilizador autenticado
                .requestMatchers(HttpMethod.GET, "/api/v1/**").authenticated()
                // Exportações — qualquer utilizador autenticado pode submeter
                .requestMatchers(HttpMethod.POST, "/api/v1/exports/**").authenticated()
                // Escrita em recursos de gestão — apenas admin
                .requestMatchers(HttpMethod.POST, "/api/v1/buses/**").hasRole("admin")
                .requestMatchers(HttpMethod.PUT, "/api/v1/buses/**").hasRole("admin")
                .requestMatchers(HttpMethod.DELETE, "/api/v1/buses/**").hasRole("admin")
                .requestMatchers(HttpMethod.POST, "/api/v1/stops/**").hasRole("admin")
                .requestMatchers(HttpMethod.PUT, "/api/v1/stops/**").hasRole("admin")
                .requestMatchers(HttpMethod.DELETE, "/api/v1/stops/**").hasRole("admin")
                .requestMatchers(HttpMethod.POST, "/api/v1/routes/**").hasRole("admin")
                .requestMatchers(HttpMethod.PUT, "/api/v1/routes/**").hasRole("admin")
                .requestMatchers(HttpMethod.DELETE, "/api/v1/routes/**").hasRole("admin")
                // Apagar exportações — apenas admin
                .requestMatchers(HttpMethod.DELETE, "/api/v1/exports/**").hasRole("admin")
                // Tudo o resto — autenticado
                .anyRequest().authenticated()
            )
            .oauth2ResourceServer(oauth2 -> oauth2
                .jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter()))
            );

        return http.build();
    }

    @Bean
    public JwtAuthenticationConverter jwtAuthenticationConverter()
    {
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(new JwtRoleConverter());
        return converter;
    }

    @Bean
    public CorsConfigurationSource corsSource()
    {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(List.of("http://localhost:5173"));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(true);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
```

- [ ] **Step 2: Activate JWT in application.properties**

In `pgu/src/main/resources/application.properties`, replace lines 25-29:

Replace:
```properties
# JWT desativado até o realm pgu-realm ser criado no Keycloak.
# Reativar quando configurado:
# spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://keycloak:8080/realms/pgu-realm/protocol/openid-connect/certs
# spring.security.oauth2.resourceserver.jwt.issuer-uri=http://keycloak:8080/realms/pgu-realm
```

With:
```properties
spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://keycloak:8080/realms/pgu-realm/protocol/openid-connect/certs
spring.security.oauth2.resourceserver.jwt.issuer-uri=http://keycloak:8080/realms/pgu-realm
```

- [ ] **Step 3: Commit**

```bash
git add pgu/src/main/java/dai/tub/pgu/config/SecurityConfig.java pgu/src/main/resources/application.properties
git commit -m "feat: activate JWT validation with role-based authorization"
```

---

## Task 6: Frontend — Fix keycloak.js

**Files:**
- Modify: `pgu-web/src/keycloak.js`

- [ ] **Step 1: Update keycloak.js**

Replace the entire content of `pgu-web/src/keycloak.js`:

```javascript
import Keycloak from 'keycloak-js';

const keycloak = new Keycloak({
  url: 'http://localhost:8080',
  realm: 'pgu-realm',
  clientId: 'pgu-backoffice',
});

export default keycloak;
```

- [ ] **Step 2: Commit**

```bash
git add pgu-web/src/keycloak.js
git commit -m "fix: correct keycloak URL and realm name"
```

---

## Task 7: Frontend — AuthProvider Context

**Files:**
- Create: `pgu-web/src/context/AuthProvider.jsx`

- [ ] **Step 1: Create context directory and AuthProvider**

```bash
mkdir -p pgu-web/src/context
```

Create `pgu-web/src/context/AuthProvider.jsx`:

```jsx
import { createContext, useContext, useEffect, useState } from 'react';
import keycloak from '../keycloak';

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export default function AuthProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    keycloak
      .init({ onLoad: 'check-sso', pkceMethod: 'S256' })
      .then((auth) => {
        setAuthenticated(auth);
        setReady(true);
      })
      .catch((err) => {
        console.error('Keycloak init failed', err);
        setReady(true);
      });

    // Auto-refresh token
    keycloak.onTokenExpired = () => {
      keycloak.updateToken(30).catch(() => {
        console.warn('Token refresh failed, logging out');
        keycloak.logout({ redirectUri: window.location.origin });
      });
    };
  }, []);

  // Show loading while Keycloak initializes
  if (!ready) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: '#0f172a', color: '#fff',
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      }}>
        A carregar...
      </div>
    );
  }

  const login = () => keycloak.login({ redirectUri: window.location.origin });

  const logout = () =>
    keycloak.logout({ redirectUri: window.location.origin });

  const hasRole = (role) =>
    keycloak.hasRealmRole?.(role) ?? false;

  const username =
    keycloak.tokenParsed?.preferred_username ?? null;

  const roles =
    keycloak.tokenParsed?.realm_access?.roles?.filter(
      (r) => r === 'admin' || r === 'operator'
    ) ?? [];

  const value = {
    keycloak,
    authenticated,
    login,
    logout,
    hasRole,
    username,
    roles,
    token: keycloak.token,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
```

- [ ] **Step 2: Commit**

```bash
git add pgu-web/src/context/AuthProvider.jsx
git commit -m "feat: add AuthProvider with Keycloak context"
```

---

## Task 8: Frontend — ProtectedRoute Component

**Files:**
- Create: `pgu-web/src/components/ProtectedRoute.jsx`

- [ ] **Step 1: Create ProtectedRoute**

Create `pgu-web/src/components/ProtectedRoute.jsx`:

```jsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';

/**
 * Wrapper de rota que exige autenticação.
 * Se não autenticado, redireciona para a Landing page.
 */
export default function ProtectedRoute({ children }) {
  const { authenticated } = useAuth();

  if (!authenticated) {
    return <Navigate to="/" replace />;
  }

  return children;
}
```

- [ ] **Step 2: Commit**

```bash
git add pgu-web/src/components/ProtectedRoute.jsx
git commit -m "feat: add ProtectedRoute component"
```

---

## Task 9: Frontend — Wire Up main.jsx + App.jsx

**Files:**
- Modify: `pgu-web/src/main.jsx`
- Modify: `pgu-web/src/App.jsx`

- [ ] **Step 1: Update main.jsx to wrap in AuthProvider**

Replace the entire content of `pgu-web/src/main.jsx`:

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import AuthProvider from './context/AuthProvider'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
)
```

- [ ] **Step 2: Update App.jsx to protect routes**

Replace the entire content of `pgu-web/src/App.jsx`:

```jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Buses from './pages/Buses';
import Stops from './pages/Stops';
import RoutesPage from './pages/Routes';
import BusHealthDashboard from './pages/BusHealthDashboard';
import AnalyticsDashboard from './pages/AnalyticsDashboard';
import Exports from './pages/Exports';
import Livemap from './pages/livemap';
import { ToastContainer, Slide } from 'react-toastify';
import GlobalToastListener from './components/GlobalToastListener';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';
import './toast-overrides.css';

export default function App() {
  return (
    <BrowserRouter>
      <ToastContainer
        position="top-right"
        autoClose={5000}
        transition={Slide}
        theme="light"
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        pauseOnFocusLoss={false}
        pauseOnHover
        draggable
        toastClassName="pgu-toast"
        bodyClassName="pgu-toast-body"
        progressClassName="pgu-toast-progress"
      />
      <GlobalToastListener />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route
          path="/backoffice"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="buses" element={<Buses />} />
          <Route path="stops" element={<Stops />} />
          <Route path="routes" element={<RoutesPage />} />
          <Route path="health" element={<BusHealthDashboard />} />
          <Route path="analytics" element={<AnalyticsDashboard />} />
          <Route path="exports" element={<Exports />} />
        </Route>
        <Route
          path="/livemap"
          element={
            <ProtectedRoute>
              <Livemap />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add pgu-web/src/main.jsx pgu-web/src/App.jsx
git commit -m "feat: wire AuthProvider and protect backoffice/livemap routes"
```

---

## Task 10: Frontend — Activate Bearer Token Interceptor

**Files:**
- Modify: `pgu-web/src/services/api.js`

- [ ] **Step 1: Update api.js**

Replace the entire content of `pgu-web/src/services/api.js`:

```javascript
import axios from 'axios';
import keycloak from '../keycloak';

const api = axios.create({
  baseURL: '/api/v1',
});

api.interceptors.request.use((config) => {
  if (keycloak.token) {
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
```

- [ ] **Step 2: Commit**

```bash
git add pgu-web/src/services/api.js
git commit -m "feat: activate Bearer token interceptor and 401 redirect"
```

---

## Task 11: Frontend — Auth-Aware Landing Page

**Files:**
- Modify: `pgu-web/src/pages/Landing.jsx`
- Modify: `pgu-web/src/pages/Landing.css`

- [ ] **Step 1: Update Landing.jsx**

Replace the entire content of `pgu-web/src/pages/Landing.jsx`:

```jsx
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';
import './Landing.css';

export default function Landing() {
  const navigate = useNavigate();
  const { authenticated, login, logout, username, roles } = useAuth();

  return (
    <div className="landing">
      <div className="landing-bg">
        <div className="landing-bg-gradient"></div>
      </div>

      <div className="landing-content">
        <div className="landing-header">
          <div className="landing-logo">
            <svg viewBox="0 0 80 44" fill="none" className="landing-logo-svg">
              <path d="M10 12 C10 9 12 7 15 7 L60 7 C64 7 67 8 68 11 L70 16 L70 33 C70 34.5 69 35.5 67.5 35.5 L12.5 35.5 C11 35.5 10 34.5 10 33 Z" fill="white" opacity="0.9" />
              <rect x="12" y="7" width="53" height="2.5" rx="1.2" fill="white" opacity="0.3" />
              <rect x="15" y="13" width="9" height="9" rx="2" fill="rgba(99,102,241,0.6)" />
              <rect x="27" y="13" width="9" height="9" rx="2" fill="rgba(99,102,241,0.6)" />
              <rect x="39" y="13" width="9" height="9" rx="2" fill="rgba(99,102,241,0.6)" />
              <path d="M52 13 L56 13 C58 13 60 14 60.5 15.5 L62 22 L52 22 Z" fill="rgba(99,102,241,0.4)" />
              <rect x="10" y="24" width="60" height="1.5" rx="0.5" fill="white" opacity="0.2" />
              <circle cx="22" cy="34" r="5" fill="#1e293b" />
              <circle cx="22" cy="34" r="2" fill="#64748b" />
              <circle cx="58" cy="34" r="5" fill="#1e293b" />
              <circle cx="58" cy="34" r="2" fill="#64748b" />
            </svg>
          </div>
          <h1 className="landing-title">TUB</h1>
          <p className="landing-subtitle">Plataforma de Gestão Urbana</p>
        </div>

        {authenticated ? (
          <>
            <div className="landing-user-info">
              <span className="landing-user-greeting">
                Bem-vindo, <strong>{username}</strong>
              </span>
              <span className="landing-user-role">
                {roles.includes('admin') ? 'Administrador' : 'Operador'}
              </span>
            </div>

            <div className="landing-cards">
              <div className="landing-card landing-card--backoffice" onClick={() => navigate('/backoffice')}>
                <div className="landing-card-icon">
                  <svg viewBox="0 0 32 32" fill="none">
                    <rect x="4" y="4" width="24" height="18" rx="3" stroke="currentColor" strokeWidth="2" fill="none" />
                    <rect x="7" y="7" width="8" height="5" rx="1" fill="currentColor" opacity="0.2" />
                    <rect x="17" y="7" width="8" height="5" rx="1" fill="currentColor" opacity="0.2" />
                    <rect x="7" y="14" width="18" height="2" rx="1" fill="currentColor" opacity="0.15" />
                    <line x1="12" y1="22" x2="20" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <line x1="16" y1="22" x2="16" y2="26" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <line x1="10" y1="26" x2="22" y2="26" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>
                <h2>Backoffice</h2>
                <p>Gestão de autocarros, rotas, paragens e monitoramento da frota em tempo real.</p>
                <span className="landing-card-action">
                  Aceder
                  <svg viewBox="0 0 16 16" fill="none" width="14" height="14">
                    <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </div>

              <div className="landing-card landing-card--livemap" onClick={() => navigate('/livemap')}>
                <div className="landing-card-icon">
                  <svg viewBox="0 0 32 32" fill="none">
                    <path d="M6 8L13 5V24L6 27V8Z" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                    <path d="M13 5L20 8V27L13 24V5Z" fill="currentColor" opacity="0.1" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                    <path d="M20 8L27 5V24L20 27V8Z" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                    <circle cx="22" cy="14" r="3" fill="currentColor" opacity="0.3" />
                    <circle cx="22" cy="14" r="1.2" fill="currentColor" />
                  </svg>
                </div>
                <h2>LiveMap</h2>
                <p>Mapa interativo com localização dos autocarros em tempo real pela cidade de Braga.</p>
                <span className="landing-card-action">
                  Aceder
                  <svg viewBox="0 0 16 16" fill="none" width="14" height="14">
                    <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </div>
            </div>

            <button className="landing-logout" onClick={logout}>
              Terminar Sessão
            </button>
          </>
        ) : (
          <>
            <div className="landing-login-section">
              <p className="landing-login-text">
                Acede à plataforma para gerir a frota e monitorizar autocarros em tempo real.
              </p>
              <button className="landing-login-btn" onClick={login}>
                Entrar
              </button>
            </div>
          </>
        )}

        <p className="landing-footer-text">Transportes Urbanos de Braga &middot; DAI 2025</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add new styles to Landing.css**

Append the following to the end of `pgu-web/src/pages/Landing.css` (before the `@media` block):

```css
/* ─── Auth: User Info ─── */
.landing-user-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  margin-bottom: 32px;
  animation: fadeIn 0.6s ease 0.1s both;
}

.landing-user-greeting {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.7);
}

.landing-user-greeting strong {
  color: #ffffff;
}

.landing-user-role {
  font-size: 12px;
  color: rgba(99, 102, 241, 0.9);
  background: rgba(99, 102, 241, 0.12);
  padding: 3px 12px;
  border-radius: 20px;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

/* ─── Auth: Login Section ─── */
.landing-login-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  margin-bottom: 48px;
  animation: fadeIn 0.6s ease 0.15s both;
}

.landing-login-text {
  font-size: 15px;
  color: rgba(255, 255, 255, 0.45);
  max-width: 400px;
  line-height: 1.6;
}

.landing-login-btn {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  border: none;
  border-radius: 12px;
  color: #ffffff;
  font-weight: 700;
  font-size: 15px;
  padding: 14px 48px;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.2s ease;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.landing-login-btn:hover {
  transform: translateY(-3px);
  box-shadow: 0 12px 32px rgba(99, 102, 241, 0.35);
}

/* ─── Auth: Logout Button ─── */
.landing-logout {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  font-weight: 600;
  padding: 10px 24px;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-bottom: 32px;
}

.landing-logout:hover {
  border-color: rgba(239, 68, 68, 0.4);
  color: #fca5a5;
  background: rgba(239, 68, 68, 0.08);
}
```

Move the CSS additions so they appear BEFORE the `/* ─── Responsive ─── */` media query section.

- [ ] **Step 3: Commit**

```bash
git add pgu-web/src/pages/Landing.jsx pgu-web/src/pages/Landing.css
git commit -m "feat: auth-aware landing page with login/logout flow"
```

---

## Task 12: Frontend — Layout with Real User Info

**Files:**
- Modify: `pgu-web/src/components/Layout.jsx`

- [ ] **Step 1: Update Layout.jsx**

Replace the entire content of `pgu-web/src/components/Layout.jsx`:

```jsx
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';
import {
  IconDashboard, IconAnalytics, IconBus, IconHealth,
  IconStop, IconRoute, IconExport,
} from './NavIcon';
import './Layout.css';

export default function Layout() {
  const { logout, username, roles } = useAuth();

  const isAdmin = roles.includes('admin');
  const displayRole = isAdmin ? 'Administrador' : 'Operador';
  const avatarLetter = username ? username.charAt(0).toUpperCase() : '?';

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div className="sidebar-logo">T</div>
            <div>
              <h2>TUB</h2>
              <small>Backoffice</small>
            </div>
          </div>
        </div>
        <nav className="sidebar-nav">
          <span className="sidebar-section-label">Principal</span>
          <NavLink to="/backoffice" end>
            <span className="nav-icon"><IconDashboard /></span>
            Dashboard
          </NavLink>
          <NavLink to="/backoffice/analytics">
            <span className="nav-icon"><IconAnalytics /></span>
            Analytics
          </NavLink>
          <NavLink to="/backoffice/buses">
            <span className="nav-icon"><IconBus /></span>
            Autocarros
          </NavLink>
          <NavLink to="/backoffice/health">
            <span className="nav-icon"><IconHealth /></span>
            Saúde da Rede
          </NavLink>
          <span className="sidebar-section-label">Gestão</span>
          <NavLink to="/backoffice/stops">
            <span className="nav-icon"><IconStop /></span>
            Paragens
          </NavLink>
          <NavLink to="/backoffice/routes">
            <span className="nav-icon"><IconRoute /></span>
            Rotas
          </NavLink>
          <NavLink to="/backoffice/exports">
            <span className="nav-icon"><IconExport /></span>
            Exportações
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-footer-user">
            <div className="sidebar-avatar">{avatarLetter}</div>
            <div className="sidebar-footer-info">
              <span className="sidebar-footer-name">{username}</span>
              <span className="sidebar-footer-role">{displayRole}</span>
            </div>
          </div>
          <button className="sidebar-logout" onClick={logout} title="Sair">
            <svg viewBox="0 0 20 20" fill="none" width="18" height="18">
              <path d="M7 17H4C3.45 17 3 16.55 3 16V4C3 3.45 3.45 3 4 3H7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M13 14L17 10L13 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="17" y1="10" x2="7" y2="10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add pgu-web/src/components/Layout.jsx
git commit -m "feat: layout shows real username, role, and keycloak logout"
```

---

## Task 13: Frontend — Role-Based UI in Pages

**Files:**
- Modify: `pgu-web/src/pages/Buses.jsx` (add/edit/delete buttons hidden for operator)
- Modify: `pgu-web/src/pages/Stops.jsx` (add/edit/delete buttons hidden for operator)
- Modify: `pgu-web/src/pages/Routes.jsx` (add/edit/delete buttons hidden for operator)
- Modify: `pgu-web/src/pages/Exports.jsx` (delete button hidden for operator)

For each of these pages, the pattern is the same: import `useAuth`, extract `hasRole`, and conditionally render action buttons.

- [ ] **Step 1: Update Buses.jsx**

At the top of the file, add the import:
```jsx
import { useAuth } from '../context/AuthProvider';
```

Inside the component function, add:
```jsx
const { hasRole } = useAuth();
const isAdmin = hasRole('admin');
```

Then wrap every "Adicionar" / "Editar" / "Eliminar" button with `{isAdmin && ( ... )}`.

The exact elements to wrap depend on the current JSX — find all create/edit/delete buttons and conditionally render them.

- [ ] **Step 2: Update Stops.jsx**

Same pattern as Buses.jsx:
```jsx
import { useAuth } from '../context/AuthProvider';
// inside component:
const { hasRole } = useAuth();
const isAdmin = hasRole('admin');
```
Wrap create/edit/delete buttons with `{isAdmin && ( ... )}`.

- [ ] **Step 3: Update Routes.jsx (RoutesPage)**

Same pattern:
```jsx
import { useAuth } from '../context/AuthProvider';
// inside component:
const { hasRole } = useAuth();
const isAdmin = hasRole('admin');
```
Wrap create/edit/delete buttons with `{isAdmin && ( ... )}`.

- [ ] **Step 4: Update Exports.jsx**

```jsx
import { useAuth } from '../context/AuthProvider';
// inside component:
const { hasRole } = useAuth();
const isAdmin = hasRole('admin');
```

Wrap the delete button (line 343-358) with `{isAdmin && ( ... )}`:
```jsx
{isAdmin && (j.status === 'COMPLETED' || j.status === 'FAILED') && (
  <button
    type="button"
    className="exports-delete"
    onClick={() => confirmDelete(j)}
    title="Apagar relatório"
    aria-label="Apagar relatório"
  >
    {/* ... svg ... */}
  </button>
)}
```

- [ ] **Step 5: Commit**

```bash
git add pgu-web/src/pages/Buses.jsx pgu-web/src/pages/Stops.jsx pgu-web/src/pages/Routes.jsx pgu-web/src/pages/Exports.jsx
git commit -m "feat: hide admin-only actions for operator role"
```

---

## Task 14: Smoke Test

- [ ] **Step 1: Rebuild and start Docker stack**

```bash
docker-compose down
docker-compose up --build -d
```

Wait for Keycloak to be ready (~30-60s). Check logs:
```bash
docker logs keycloak 2>&1 | tail -20
```

Expected: see "Running the server in development mode" and realm import success message.

- [ ] **Step 2: Verify Keycloak realm was imported**

Open `http://localhost:8080` in browser. Login with `admin`/`admin` (Keycloak admin). Navigate to the `pgu-realm` realm. Verify:
- Realm `pgu-realm` exists
- Client `pgu-backoffice` exists
- Roles `admin` and `operator` exist
- Users `admin` and `operador` exist with correct roles

- [ ] **Step 3: Verify custom theme**

In Keycloak admin, go to Realm Settings > Themes > Login Theme. Select `pgu`. Save. Open an incognito browser and navigate to `http://localhost:5173`. Click "Entrar". Verify the Keycloak login page uses PGU branding (dark background, gradient, TUB header).

- [ ] **Step 4: Test login flow**

1. On the Keycloak login page, enter `admin` / `admin123`
2. Verify redirect back to Landing page (`/`)
3. Verify Landing shows "Bem-vindo, admin" with "Administrador" role badge
4. Click "Backoffice" — verify access
5. Verify sidebar shows "admin" username and "Administrador" role
6. Verify create/edit/delete buttons are visible

- [ ] **Step 5: Test operator role**

1. Logout
2. Login as `operador` / `operador123`
3. Verify Landing shows "Operador" role badge
4. Access Backoffice
5. Verify create/edit/delete buttons are NOT visible on Buses, Stops, Routes
6. Verify exports submit button IS visible but delete button is NOT

- [ ] **Step 6: Test route protection**

1. Logout
2. Navigate directly to `http://localhost:5173/backoffice`
3. Verify redirect to Landing page
4. Navigate to `http://localhost:5173/livemap`
5. Verify redirect to Landing page

- [ ] **Step 7: Final commit**

If any tweaks were needed during testing, commit them:
```bash
git add -A
git commit -m "fix: smoke test adjustments for keycloak auth"
```
