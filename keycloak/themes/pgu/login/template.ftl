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

    <#-- Sprint 1 (F1): banner topo a indicar projeto academico -->
    <div class="pgu-academic-banner" role="note">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
        <span>${msg("projectDisclaimer")}</span>
    </div>

    <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;">

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
            <div id="kc-header-subtitle">${msg("loginSubtitle")}</div>
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
            ${msg("footerText")}
        </p>
    </div>
</body>
</html>
</#macro>
