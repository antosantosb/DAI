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
