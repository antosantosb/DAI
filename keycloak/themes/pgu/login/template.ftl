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

    <#-- Sprint 2 (redesign): camada de fundo da marca (glows radiais TUB + grao
         subtil), identica a .landing-bg-gradient + .landing-bg::after do React.
         E puramente decorativa (aria-hidden) e fica atras de todo o conteudo. -->
    <div class="pgu-bg" aria-hidden="true"></div>

    <#-- Sprint 1 (F1): banner topo a indicar projeto academico -->
    <div class="pgu-academic-banner" role="note">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
        <span>${msg("projectDisclaimer")}</span>
    </div>

    <#-- Sprint 2 (redesign): contentor central. Estilos movidos para .pgu-shell
         no login.css para manter coerencia com a landing. -->
    <div class="pgu-shell">

        <#-- Sprint 0 (F6): language switcher no canto inferior esquerdo.
             Ordem fixa PT -> EN para coincidir com o switcher do backoffice. -->
        <#if realm.internationalizationEnabled?? && realm.internationalizationEnabled
             && locale?? && locale.supported?? && locale.supported?size gt 1>
            <div class="pgu-lang-switcher" role="group" aria-label="Language">
                <#list ["pt", "en"] as code>
                    <#list locale.supported as l>
                        <#if l.languageTag == code>
                            <a class="pgu-lang-btn ${(locale.currentLanguageTag == l.languageTag)?then('is-active','')}"
                               href="${l.url}">${l.languageTag?upper_case}</a>
                        </#if>
                    </#list>
                </#list>
            </div>
        </#if>

        <div id="kc-header">
            <div id="kc-header-wrapper">
                <img src="${url.resourcesPath}/img/tub-logo.svg" alt="TUB - Transportes Urbanos de Braga" class="kc-brand-logo" />
            </div>
            <#-- Tagline em maiusculas espacadas, igual a .landing-subtitle do React -->
            <div id="kc-header-subtitle">${msg("loginSubtitle")}</div>
        </div>
        <div class="pgu-card-wrap">
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
        <p class="pgu-footer">
            ${msg("footerText")}
        </p>
    </div>
</body>
</html>
</#macro>
