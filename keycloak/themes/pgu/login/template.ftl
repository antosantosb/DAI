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
