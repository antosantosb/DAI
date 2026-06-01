"""
Gerador do Manual de Utilizador / Plano de Formação PGU-TUB.

Conteúdo baseado no estado real do repositório:
  - 5 roles (admin, funcionario, motorista, fiscal, developer)
  - 33 páginas frontend, 6 secções de navegação
  - 4 AiTools (getFleetOccupancyByHour, getRouteDelayStats,
    getActiveAlerts, getGtfsSchedule)
  - Cargas horárias por perfil — proporcionais à complexidade do software

Saída: docs/Manual-Utilizador-PGU-TUB.pdf

Requisitos:
    pip install reportlab
"""
from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    ListFlowable, ListItem
)

# ============================================================
# Tokens
# ============================================================
TUB_BLUE   = HexColor('#009BDB')
TUB_DARK   = HexColor('#0B1F33')
TUB_GREY   = HexColor('#526783')
TUB_LIGHT  = HexColor('#F6F9FC')
TUB_GREEN  = HexColor('#10B981')
BORDER     = HexColor('#E1E8F0')

styles = getSampleStyleSheet()

H1 = ParagraphStyle('H1', parent=styles['Heading1'], fontName='Helvetica-Bold',
                    fontSize=22, leading=28, textColor=TUB_DARK,
                    spaceAfter=12, spaceBefore=18, keepWithNext=True)
H2 = ParagraphStyle('H2', parent=styles['Heading2'], fontName='Helvetica-Bold',
                    fontSize=15, leading=20, textColor=TUB_BLUE,
                    spaceAfter=8, spaceBefore=14, keepWithNext=True)
H3 = ParagraphStyle('H3', parent=styles['Heading3'], fontName='Helvetica-Bold',
                    fontSize=11.5, leading=15, textColor=TUB_DARK,
                    spaceAfter=4, spaceBefore=10, keepWithNext=True)
BODY = ParagraphStyle('Body', parent=styles['BodyText'], fontName='Helvetica',
                      fontSize=10.5, leading=15, textColor=TUB_DARK,
                      alignment=TA_JUSTIFY, spaceAfter=6)
BULLET = ParagraphStyle('Bullet', parent=BODY, leftIndent=18,
                        bulletIndent=4, spaceAfter=3)
NOTE = ParagraphStyle('Note', parent=BODY, fontSize=9.5, leading=13,
                      textColor=TUB_DARK, leftIndent=14, rightIndent=14,
                      backColor=TUB_LIGHT, borderPadding=8,
                      borderWidth=0)
SMALL = ParagraphStyle('Small', parent=BODY, fontSize=9, leading=12,
                       textColor=TUB_GREY)


def p(text, style=BODY):
    return Paragraph(text, style)


def bullets(items, style=BULLET):
    return ListFlowable(
        [ListItem(Paragraph(it, style)) for it in items],
        bulletType='bullet', bulletColor=TUB_BLUE,
        leftIndent=18, start='circle',
    )


def table_styled(data, col_widths, header=True):
    t = Table(data, colWidths=col_widths, repeatRows=1 if header else 0)
    style = [
        ('FONTNAME',     (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE',     (0, 0), (-1, -1), 9.5),
        ('TEXTCOLOR',    (0, 0), (-1, -1), TUB_DARK),
        ('VALIGN',       (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING',  (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING',   (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING',(0, 0), (-1, -1), 5),
        ('GRID',         (0, 0), (-1, -1), 0.4, BORDER),
    ]
    if header:
        style += [
            ('BACKGROUND', (0, 0), (-1, 0), TUB_BLUE),
            ('TEXTCOLOR',  (0, 0), (-1, 0), white),
            ('FONTNAME',   (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, TUB_LIGHT]),
        ]
    t.setStyle(TableStyle(style))
    return t


# ============================================================
# Header/Footer
# ============================================================
def draw_header_footer(canvas, doc):
    canvas.saveState()
    w, h = A4
    # Footer
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.4)
    canvas.line(2 * cm, 1.6 * cm, w - 2 * cm, 1.6 * cm)
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(TUB_GREY)
    canvas.drawString(2 * cm, 1.1 * cm,
                      'Manual de Utilizador · PGU-TUB · Plano de Formação')
    canvas.drawRightString(w - 2 * cm, 1.1 * cm, f'Página {doc.page}')
    # Header (a partir da pág 2)
    if doc.page > 1:
        canvas.setStrokeColor(TUB_BLUE)
        canvas.setLineWidth(1.6)
        canvas.line(2 * cm, h - 1.4 * cm, w - 2 * cm, h - 1.4 * cm)
        canvas.setFont('Helvetica-Bold', 9)
        canvas.setFillColor(TUB_DARK)
        canvas.drawString(2 * cm, h - 1.1 * cm, 'PGU-TUB')
        canvas.setFont('Helvetica', 9)
        canvas.setFillColor(TUB_GREY)
        canvas.drawRightString(w - 2 * cm, h - 1.1 * cm,
                               'Plano de Formação · v1.0')
    canvas.restoreState()


# ============================================================
# Capa
# ============================================================
def cover_page():
    story = []
    story.append(Spacer(1, 5 * cm))
    story.append(Paragraph('Manual de Utilizador',
                           ParagraphStyle('CapaT', fontName='Helvetica-Bold',
                                          fontSize=34, leading=40,
                                          textColor=TUB_DARK,
                                          alignment=TA_CENTER)))
    story.append(Spacer(1, 8 * mm))
    story.append(Paragraph('Plano de Formação para Administradores '
                           'e Utilizadores Finais',
                           ParagraphStyle('CapaS', fontName='Helvetica',
                                          fontSize=16, leading=22,
                                          textColor=TUB_BLUE,
                                          alignment=TA_CENTER)))
    story.append(Spacer(1, 1.4 * cm))

    info = [
        [p('<b>Plataforma</b>'),
         p('PGU-TUB · Gestão Urbana dos Transportes de Braga')],
        [p('<b>Versão do documento</b>'), p('1.0')],
        [p('<b>Versão da plataforma</b>'),
         p('Build final · Junho 2026')],
        [p('<b>Audiência</b>'),
         p('Administradores TI · Despachantes · Planeadores · '
           'Motoristas · Fiscais · Analistas')],
        [p('<b>Modalidade</b>'),
         p('Presencial (laboratório) + e-learning Moodle')],
        [p('<b>Pré-requisitos</b>'),
         p('Literacia digital básica. Sem conhecimentos técnicos prévios para '
           'perfis operacionais.')],
    ]
    t = Table(info, colWidths=[5 * cm, 10 * cm])
    t.setStyle(TableStyle([
        ('FONTSIZE',     (0, 0), (-1, -1), 10),
        ('TEXTCOLOR',    (0, 0), (-1, -1), TUB_DARK),
        ('VALIGN',       (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING',  (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING',   (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING',(0, 0), (-1, -1), 6),
        ('LINEBELOW',    (0, 0), (-1, -2), 0.3, BORDER),
        ('BOX',          (0, 0), (-1, -1), 0.8, TUB_BLUE),
        ('BACKGROUND',   (0, 0), (0, -1), TUB_LIGHT),
    ]))
    story.append(t)
    story.append(Spacer(1, 4 * cm))
    story.append(Paragraph('Universidade do Minho · Engenharia Informática · '
                           'DAI 2025-2026',
                           ParagraphStyle('CapaR', fontName='Helvetica',
                                          fontSize=10, textColor=TUB_GREY,
                                          alignment=TA_CENTER)))
    return story


# ============================================================
# 1. Sumário executivo
# ============================================================
def section_summary():
    return [
        PageBreak(),
        p('1. Sumário executivo', H1),

        p('Este documento define o plano de capacitação para todos os '
          'utilizadores da plataforma <b>PGU-TUB</b>. A formação é '
          '<b>modular e proporcional ao perfil</b>: cada utilizador percorre '
          'apenas o que precisa para a sua função, evitando carga horária '
          'excessiva.'),

        p('1.1 Perfis e cargas horárias', H2),
        table_styled([
            ['Perfil', 'Carga total', 'Sessões', 'Modalidade'],
            ['Administrador TI',                '12 h', '4 sessões × 3 h',  'Presencial + hands-on'],
            ['Despachante / Operador',          '8 h',  '4 sessões × 2 h',  'Presencial + role-play'],
            ['Planeador de rede',               '6 h',  '2 sessões × 3 h',  'Presencial + projecto guiado'],
            ['Analista de dados',               '4 h',  '2 sessões × 2 h',  'Presencial + análise real'],
            ['Fiscal',                          '3 h',  '1 sessão (2 h teoria + 1 h campo)', 'Presencial'],
            ['Motorista',                       '2 h',  '1 sessão prática', 'Presencial no autocarro'],
        ], [3.8 * cm, 2.4 * cm, 4.5 * cm, 4.8 * cm]),

        Spacer(1, 4 * mm),
        p('1.2 Princípios da formação', H2),
        bullets([
            '<b>Foco no que existe</b>: todos os exemplos usam funcionalidades '
            'reais da plataforma, não cenários hipotéticos.',
            '<b>Hands-on majoritário</b>: ~70 % do tempo é prática no '
            'ambiente sandbox; ~30 % é teoria e contexto.',
            '<b>Avaliação por competência</b>: o formando demonstra que '
            'executa uma tarefa, não apenas que a sabe descrever.',
            '<b>Certificação por perfil</b>: o certificado é específico '
            'ao perfil em que o formando foi avaliado.',
        ]),

        p('1.3 Estrutura deste documento', H2),
        bullets([
            'Secção 2 — Sessões de formação e cronograma detalhado.',
            'Secção 3 — Conteúdos por sessão e materiais de apoio.',
            'Secção 4 — Módulos específicos para administração técnica, '
            'gestão de dados e operação da plataforma.',
            'Secção 5 — Mecanismos de avaliação e certificação.',
            'Secção 6 — Anexos: glossário, FAQ, contactos.',
        ]),

        Spacer(1, 4 * mm),
        p('<b>Nota:</b> a plataforma corre on-premises na infra-estrutura '
          'municipal. Todos os perfis usam o mesmo URL de entrada e o '
          'Keycloak determina automaticamente o que cada utilizador vê. '
          'Não há "instalação" no posto de trabalho — basta um browser '
          'moderno.', NOTE),
    ]


# ============================================================
# 2. Sessões e cronograma
# ============================================================
def section_schedule():
    return [
        PageBreak(),
        p('2. Sessões de formação e cronograma detalhado', H1),

        p('2.1 Catálogo de sessões', H2),
        p('A formação está organizada em <b>10 sessões catalogadas</b>. '
          'Cada perfil percorre apenas as sessões relevantes (ver secção '
          '2.3). Nenhum perfil faz todas as sessões.'),

        Spacer(1, 3 * mm),
        table_styled([
            ['ID', 'Sessão', 'Duração', 'Modalidade'],
            ['S0',  'Tronco comum: primeira utilização',                  '1 h',   'Presencial · grupo'],
            ['S1',  'Operação em tempo real (Livemap + Ocorrências)',     '2 h',   'Presencial · hands-on'],
            ['S2',  'Despacho e comunicação com motoristas',              '2 h',   'Presencial · role-play'],
            ['S3',  'Bilhética e validações',                             '2 h',   'Presencial · hands-on'],
            ['S4',  'Planeamento: Linhas, Padrões, Horários',             '3 h',   'Presencial · projecto'],
            ['S5',  'Análise de dados e KPIs',                            '2 h',   'Presencial · análise'],
            ['S6',  'Administração técnica: Docker, Keycloak, backups',   '3 h',   'Presencial · hands-on'],
            ['S7',  'IA on-premises (Chatbot + AI Monitoring)',           '2 h',   'Presencial · demonstração'],
            ['S8',  'Painel de Bordo (motorista)',                        '2 h',   'No veículo · prática'],
            ['S9',  'Aplicação Fiscal (terreno)',                         '3 h',   'Presencial + terreno'],
        ], [1.2 * cm, 7.0 * cm, 2.0 * cm, 5.4 * cm]),

        Spacer(1, 5 * mm),
        p('2.2 Cronograma de uma edição completa', H2),
        p('Uma <b>edição completa</b> da formação distribui todas as '
          'sessões por <b>2 semanas</b>. Os formandos só comparecem nas '
          'sessões do seu perfil; as restantes ficam disponíveis no Moodle '
          'caso queiram alargar competências.'),

        Spacer(1, 3 * mm),
        table_styled([
            ['Dia', 'Manhã (09:30-12:30)', 'Tarde (14:00-17:00)'],
            ['Semana 1 · Seg', 'S0 · Tronco comum (1 h)',                 'S1 · Tempo real (2 h)'],
            ['Semana 1 · Ter', 'S2 · Despacho (2 h)',                     'S3 · Bilhética (2 h)'],
            ['Semana 1 · Qua', 'S4 · Planeamento (3 h)',                  'S4 · Planeamento (cont.)'],
            ['Semana 1 · Qui', 'S5 · Dados e KPIs (2 h)',                 'S7 · IA (2 h)'],
            ['Semana 1 · Sex', 'S6 · Administração técnica (3 h)',        'S6 · Admin (cont.)'],
            ['Semana 2 · Seg', 'S8 · Painel de Bordo (2 h, no veículo)',  'S9 · Fiscal teoria (2 h)'],
            ['Semana 2 · Ter', 'S9 · Fiscal terreno (1 h) + checkpoint',  'Sessão de dúvidas (2 h)'],
            ['Semana 2 · Qua', 'Avaliação prática · Despachantes',        'Avaliação prática · Planeadores'],
            ['Semana 2 · Qui', 'Avaliação prática · Admin TI',            'Avaliação prática · Analistas'],
            ['Semana 2 · Sex', 'Entrega de certificados',                 '—'],
        ], [3.3 * cm, 6.3 * cm, 6.0 * cm]),

        Spacer(1, 5 * mm),
        p('2.3 Mapa de presença por perfil', H2),
        p('Cada perfil tem um percurso obrigatório. O "X" indica sessões '
          'obrigatórias; "+" indica sessões recomendadas mas opcionais.'),
        Spacer(1, 3 * mm),
        table_styled([
            ['Sessão', 'Admin TI', 'Despach.', 'Planead.', 'Analista', 'Fiscal', 'Motor.'],
            ['S0 · Tronco comum',  'X', 'X', 'X', 'X', 'X', 'X'],
            ['S1 · Tempo real',    'X', 'X', '+', '+', '',  ''],
            ['S2 · Despacho',      '',  'X', '',  '',  '',  ''],
            ['S3 · Bilhética',     '+', 'X', '',  '+', 'X', ''],
            ['S4 · Planeamento',   '+', '',  'X', '',  '',  ''],
            ['S5 · Dados e KPIs',  '+', '',  '+', 'X', '',  ''],
            ['S6 · Admin técnica', 'X', '',  '',  '',  '',  ''],
            ['S7 · IA',            'X', '+', '+', 'X', '',  ''],
            ['S8 · Bordo',         '',  '',  '',  '',  '',  'X'],
            ['S9 · Fiscal',        '',  '',  '',  '',  'X', ''],
        ], [3.6 * cm, 1.7 * cm, 1.7 * cm, 1.7 * cm, 1.7 * cm, 1.7 * cm, 1.7 * cm]),
    ]


# ============================================================
# 3. Conteúdos por sessão e materiais
# ============================================================
def section_contents():
    return [
        PageBreak(),
        p('3. Conteúdos e materiais de apoio', H1),

        p('3.1 Conteúdo detalhado por sessão', H2),

        p('S0 · Tronco comum (1 h)', H3),
        bullets([
            'O que é o PGU-TUB. Os 3 pilares: operação, planeamento, '
            'inteligência.',
            'Primeiro login no Keycloak. Configuração de MFA TOTP '
            '(Google Authenticator, FreeOTP).',
            'Navegação do backoffice: sidebar agrupada em 6 secções '
            '(Operação, Frota, Rede, Dados &amp; IA, Administração, Pessoal).',
            'Light / dark mode, troca de idioma (PT / EN), página '
            '<b>Minha Conta</b>.',
        ]),

        p('S1 · Operação em tempo real (2 h)', H3),
        bullets([
            'Página <b>Livemap</b>: clusters de autocarros, filtros por '
            'linha e motorista, smooth-zoom ao clicar num bus.',
            'Trajeto destacado do padrão em curso; paragens com painel DMS '
            'realçadas a laranja.',
            'Página <b>Ocorrências</b>: leitura da fila, triagem por '
            'prioridade, atribuição e resolução.',
            'Página <b>Dashboard</b>: leitura dos KPIs operacionais '
            '(autocarros activos, rotas em serviço, atrasos abertos).',
        ]),

        p('S2 · Despacho e comunicação (2 h)', H3),
        bullets([
            'Clique num autocarro no Livemap abre o painel de detalhe com '
            'separadores <b>Detalhes</b> e <b>Chat</b>.',
            'Envio de mensagens ao motorista; confirmações de leitura por '
            'mensagem.',
            'Comportamento quando o autocarro está offline: a tentativa de '
            'envio mostra <i>toast vermelho</i> com a razão e a mensagem '
            'fica em fila.',
            'Boas práticas de despacho: linguagem clara, mensagens curtas, '
            'distinção entre informativo / pedido / urgente.',
        ]),

        p('S3 · Bilhética e validações (2 h)', H3),
        bullets([
            'Dashboard <b>Ticketing</b>: KPIs de 24 h, demand-per-hour, '
            'top lines, by channel, by category, by zone, live validations.',
            'Canais de venda: <b>CARTAO</b>, <b>PASSE</b>, <b>BORDO</b> '
            '(pago ao motorista), <b>APP</b>. Diferenças e implicações.',
            'Coroas tarifárias (1 = centro, 2 = peri-urbano) e detecção '
            'automática de transbordo dentro da janela de validade.',
            'Endpoint M2M para ingestão de validações: '
            '<code>POST /api/v1/validations</code> com X-API-Key.',
        ]),

        p('S4 · Planeamento — Linhas, Padrões, Horários (3 h)', H3),
        bullets([
            'Modelo Transmodel: <b>Linha</b> (Route) → <b>Padrão</b> '
            '(JourneyPattern: paragens ordenadas + geometria) → <b>Trip</b> '
            '(com TripStopTime).',
            'Página <b>Routes</b>: CRUD de linhas, atribuição de operador.',
            'Página <b>PatternEditor</b>: criação visual de padrões — '
            'clique no mapa cria waypoint, OSRM encaixa pela estrada, '
            'Ctrl+Z, drag-and-drop.',
            'Página <b>Schedules</b>: criar trips com horários por '
            'paragem; validação live de monotonia; editar e apagar trips.',
            'Página <b>Calendar</b>: leitura do calendário operacional '
            'mensal e dias especiais.',
            'Exportar GTFS / NeTEx via página <b>GtfsManager</b> / '
            '<b>Exports</b>.',
        ]),

        p('S5 · Análise de dados e KPIs (2 h)', H3),
        bullets([
            'Página <b>AnalyticsDashboard</b>: ocupação por hora, atrasos '
            'por rota, heat maps, velocidade média.',
            'Página <b>FleetHealth</b> e <b>BusHealthDashboard</b>: '
            'diagnóstico de veículos (bateria, sensores, consumos).',
            'Página <b>Exports</b>: submeter exportações (GTFS, CSV) e '
            'aguardar notificação via toast quando estiverem prontas.',
            'Página <b>OpenData</b>: portal público acessível em '
            '<code>/open-data</code> sem autenticação, expõe GeoJSON e '
            'DCAT-AP.',
        ]),

        p('S6 · Administração técnica (3 h)', H3),
        bullets([
            'Stack Docker: cada serviço, dependências, perfis. '
            '<code>docker compose up -d</code>, <code>logs -f</code>, '
            '<code>restart</code>.',
            'Volumes persistentes (PostgreSQL, MinIO, Ollama, Keycloak) e '
            'política de backup com <code>pg_dump</code>.',
            'Página <b>Users</b>: CRUD de utilizadores. Criar os '
            'utilizadores não pré-existentes (despachantes, fiscais, '
            'motoristas) — apenas <code>admin</code> e <code>dev</code> '
            'estão pré-criados no realm.',
            'Página <b>GlobalConfig</b>: ajustes em tempo de execução '
            '(thresholds de ocupação, etc.).',
            'Página <b>AuditLogs</b>: pesquisa de acções por utilizador, '
            'período, endpoint.',
            'Migrations Flyway: arrancam automaticamente; última V74.',
        ]),

        p('S7 · IA on-premises (2 h)', H3),
        bullets([
            'Página <b>Chatbot</b>: interface de Q&amp;A em linguagem '
            'natural. Modelo Qwen 2.5 dentro do servidor.',
            'As 4 ferramentas disponíveis: <code>getFleetOccupancyByHour</code>, '
            '<code>getRouteDelayStats</code>, <code>getActiveAlerts</code>, '
            '<code>getGtfsSchedule</code>.',
            'Como reconhecer respostas com dados reais (etiqueta '
            '<i>via &lt;tool&gt; · Xms</i>) versus respostas do '
            'conhecimento geral do modelo.',
            'Página <b>AiMonitoring</b>: estatísticas de uso, top tools, '
            'latência média, audit log de interacções.',
            'Limites e segurança: rate limit, filtro de prompts suspeitos, '
            'audit imutável.',
        ]),

        p('S8 · Painel de Bordo do motorista (2 h, no veículo)', H3),
        bullets([
            'Acesso à rota <code>/bordo</code> com credenciais individuais. '
            'Não há sidebar — interface dedicada full-screen.',
            'Próxima paragem com distância e ETA. Próximas chegadas '
            'anunciadas ao utente no painel da paragem.',
            'Separador <b>Chat</b> para mensagens do despacho. Som distinto '
            'para mensagens urgentes; confirmação de leitura automática.',
            'Estado do veículo: velocidade, ocupação, alertas de '
            'manutenção.',
            'Sessão prática no autocarro com a Wi-Fi/4G real.',
        ]),

        p('S9 · Aplicação Fiscal (3 h)', H3),
        bullets([
            'Acesso à rota <code>/fiscal</code> a partir de '
            'smartphone/tablet. Não há sidebar — UX mobile-first.',
            'Mapa centrado na posição GPS do fiscal + paragem mais próxima.',
            'Sub-tabs de ocorrências: <b>Pending</b>, <b>All</b>, '
            '<b>Fraud</b>, <b>False positive</b>.',
            'Fluxo de uma fiscalização: identificar bus, validar bilhete, '
            'classificar resultado, registar ocorrência.',
            'Sessão prática inclui 1 h no terreno (paragem urbana) '
            'acompanhado por fiscal sénior.',
        ]),

        Spacer(1, 4 * mm),
        p('3.2 Materiais de apoio', H2),
        p('Todos os materiais ficam permanentemente disponíveis no Moodle '
          'institucional e no repositório partilhado.'),
        Spacer(1, 3 * mm),
        table_styled([
            ['Material', 'Quantidade', 'Formato'],
            ['Slides por sessão',                         '10', 'PDF'],
            ['Vídeos curtos (3-8 min por funcionalidade)', '~40', 'MP4 streaming'],
            ['Cheat sheets imprimíveis (1 página)',        '6 (1 por perfil)', 'PDF A4'],
            ['Exercícios práticos com solução',            '20', 'PDF + dataset'],
            ['Quizzes de auto-avaliação',                  '9 (1 por sessão útil)', 'HTML Moodle'],
            ['Sandbox local (este repositório)',           '1', '<code>docker compose up</code>'],
            ['FAQ pesquisável',                            '~50 perguntas', 'Wiki interna'],
            ['Manual de utilizador (este documento)',      '1', 'PDF'],
        ], [6.5 * cm, 4.5 * cm, 4.0 * cm]),

        Spacer(1, 4 * mm),
        p('3.3 Ambiente sandbox', H2),
        p('A formação usa o próprio repositório do projecto como sandbox. '
          'Cada formando clona o repositório e executa:'),
        p('<code>git clone https://github.com/antosantosb/DAI.git &amp;&amp; '
          'cd DAI &amp;&amp; docker compose up -d</code>', NOTE),
        p('Após ~2 min a stack está pronta. Acede em '
          '<code>http://localhost:5173</code>. Credenciais:'),
        bullets([
            '<code>admin</code> / <code>admin123</code> — administração + '
            'acesso a tudo.',
            '<code>dev</code> / <code>dev123</code> — developer, inclui '
            'DevTools para gerar dados de simulação.',
        ]),
        p('<b>Importante:</b> outros perfis (despachante, fiscal, '
          'motorista) não estão pré-criados. O formador cria-os na sessão '
          'S6 e atribui credenciais aos formandos do respectivo perfil.', NOTE),
    ]


# ============================================================
# 4. Módulos específicos
# ============================================================
def section_modules():
    return [
        PageBreak(),
        p('4. Módulos específicos', H1),

        p('Os conteúdos das sessões organizam-se em <b>três grandes módulos '
          'temáticos</b>, alinhados com as três grandes áreas de competência '
          'requeridas pela plataforma.'),

        # ===== Módulo A =====
        Spacer(1, 4 * mm),
        p('Módulo A · Administração técnica', H2),
        p('<b>Sessões incluídas:</b> S6 (obrigatória) + S0 + S1 (suporte) + '
          'S7 (IA infra).', BODY),
        p('<b>Perfil-alvo:</b> Administrador TI da Câmara Municipal de Braga '
          'ou parceiro técnico contratado.', BODY),

        p('Objectivos de aprendizagem', H3),
        bullets([
            'Subir, parar e diagnosticar a stack Docker com 11 serviços '
            '(PostgreSQL+PostGIS, Spring Boot, React Vite, Keycloak, '
            'Mosquitto, NiFi, MinIO, OSRM, Ollama, Mailpit, simulador).',
            'Gerir o realm Keycloak <code>pgu-realm</code>: criar users, '
            'reset password, atribuir os 5 roles (admin, funcionario, '
            'motorista, fiscal, developer) e configurar MFA TOTP.',
            'Consultar e interpretar <b>AuditLogs</b> e '
            '<b>api_access_log</b> para investigar incidentes.',
            'Aplicar / reverter migrations Flyway. Confirmar que a versão '
            'corrente é V74.',
            'Recuperar de falhas comuns: container parado, volume cheio, '
            'cliente MQTT desligado, modelo IA sem memória.',
        ]),

        p('Conteúdos práticos', H3),
        bullets([
            '<i>Lab A1</i> — On-boarding de um novo despachante: criar user '
            'no Keycloak, atribuir role <code>funcionario</code>, validar '
            'login e MFA.',
            '<i>Lab A2</i> — Simular falha do container backend '
            '(<code>docker compose stop spring-boot-backend</code>), '
            'observar o estado da UI, reiniciar e verificar integridade dos '
            'dados.',
            '<i>Lab A3</i> — Configurar backup automatizado de PostgreSQL '
            'com cron diário e armazenamento em MinIO.',
            '<i>Lab A4</i> — Investigar warning '
            '<code>MQTT publish skip: cliente nao ligado</code> nos logs '
            'do backend.',
        ]),

        # ===== Módulo B =====
        Spacer(1, 4 * mm),
        p('Módulo B · Gestão de dados', H2),
        p('<b>Sessões incluídas:</b> S5 (obrigatória) + S0 + S4 (suporte) + '
          'S7 (IA como ferramenta de análise).', BODY),
        p('<b>Perfil-alvo:</b> Analista de dados / Gestor de informação '
          'operacional.', BODY),

        p('Objectivos de aprendizagem', H3),
        bullets([
            'Ler os dashboards <b>AnalyticsDashboard</b>, '
            '<b>TicketingDashboard</b>, <b>FleetHealth</b>, '
            '<b>BusHealthDashboard</b> e produzir interpretação escrita '
            'dos KPIs.',
            'Submeter <b>Exports</b> em formato GTFS e CSV; receber via '
            'toast quando estão prontos no MinIO.',
            'Compreender o modelo Transmodel — distinguir Linha, Padrão '
            'e Trip; explicar quando se cria um novo Padrão e quando se '
            'cria nova Trip.',
            'Usar o <b>Chatbot</b> com as 4 tools disponíveis para '
            'questões analíticas em linguagem natural.',
            'Publicar dados ao público via portal <b>OpenData</b> '
            '(GeoJSON, DCAT-AP).',
        ]),

        p('Conteúdos práticos', H3),
        bullets([
            '<i>Lab B1</i> — Construir relatório mensal: ocupação média por '
            'linha + top 3 paragens com mais atrasos. Exportar para PDF.',
            '<i>Lab B2</i> — Diagnosticar uma anomalia: a linha LT '
            'apresenta queda de 30 % nas validações. Investigar via '
            'TicketingDashboard + Ocorrências e propor causa-raiz.',
            '<i>Lab B3</i> — Pedir ao Chatbot "Quais foram os atrasos '
            'médios da linha 5 esta semana?" e validar que a resposta '
            'tem etiqueta <i>via getRouteDelayStats</i>.',
            '<i>Lab B4</i> — Publicar a base de paragens actualizada no '
            'portal OpenData e validar a indexação DCAT-AP.',
        ]),

        # ===== Módulo C =====
        Spacer(1, 4 * mm),
        p('Módulo C · Operação da plataforma', H2),
        p('<b>Sessões incluídas:</b> S1 + S2 + S3 (obrigatórias) + S0 + '
          'opcionalmente S4 (planeamento) e S8/S9 (perfis específicos).',
          BODY),
        p('<b>Perfil-alvo:</b> Despachante de turno, Planeador de rede, '
          'Motorista, Fiscal.', BODY),

        p('Objectivos de aprendizagem (despachante)', H3),
        bullets([
            'Monitorizar a frota em <b>Livemap</b> e identificar bus em '
            'risco de atraso antes de ser reportado.',
            'Comunicar com motorista via chat embebido no painel de '
            'detalhe do bus.',
            'Triar e resolver <b>Ocorrências</b> dentro do tempo médio '
            'definido (target: &lt; 15 min).',
            'Reagir a alertas push (emergência, escalada, GTFS sync) — '
            'distinguir o que requer acção imediata.',
        ]),

        p('Objectivos de aprendizagem (planeador)', H3),
        bullets([
            'Criar uma nova Linha do zero: <b>Routes</b> &rarr; '
            '<b>PatternEditor</b> &rarr; <b>Schedules</b> &rarr; '
            '<b>Plan bus schedule</b> em <b>Buses</b>.',
            'Editar e apagar Trips sem impacto em escalas activas.',
            'Validar conflitos: a mesma trip não pode estar em duas '
            'escalas activas no mesmo dia (regra V74).',
        ]),

        p('Objectivos de aprendizagem (motorista)', H3),
        bullets([
            'Iniciar e terminar o turno via <b>Painel de Bordo</b>.',
            'Ler indicações de próxima paragem e responder a chat do '
            'despacho dentro do tempo de paragem.',
        ]),

        p('Objectivos de aprendizagem (fiscal)', H3),
        bullets([
            'Identificar o bus no mapa, confirmar a paragem mais próxima.',
            'Classificar o resultado da fiscalização em '
            '<b>Pending</b>/<b>Fraud</b>/<b>False positive</b>.',
            'Documentar ocorrência com nota livre e foto opcional.',
        ]),

        p('Conteúdos práticos partilhados', H3),
        bullets([
            '<i>Lab C1 (despachante)</i> — Resolver 5 ocorrências simuladas '
            'em &lt; 15 min cada.',
            '<i>Lab C2 (planeador)</i> — Criar uma linha-teste com 2 '
            'padrões (ida/volta), 3 trips matinais e 2 vespertinas, e '
            'atribuir a um autocarro.',
            '<i>Lab C3 (motorista)</i> — Iniciar turno, completar 2 trips '
            'no simulador, responder a 1 mensagem urgente do despacho, '
            'terminar turno.',
            '<i>Lab C4 (fiscal)</i> — Fiscalizar 10 buses simulados, '
            'classificar correctamente 8 em 10.',
        ]),
    ]


# ============================================================
# 5. Avaliação e certificação
# ============================================================
def section_evaluation():
    return [
        PageBreak(),
        p('5. Mecanismos de avaliação e certificação', H1),

        p('5.1 Modelo de avaliação', H2),
        p('A avaliação é <b>específica por perfil</b> e combina componentes '
          'contínua e final. Cada perfil tem critérios próprios — não há '
          'uma prova única para todos.'),

        Spacer(1, 3 * mm),
        table_styled([
            ['Componente', 'Peso', 'Quando', 'Formato'],
            ['Quizzes de sessão',          '20 %', 'Fim de cada sessão útil', 'Moodle, 5-10 perguntas, escolha múltipla'],
            ['Checkpoints práticos',       '40 %', 'Fim de cada módulo',     'Tarefa executada no sandbox, observada pelo formador'],
            ['Avaliação prática final',    '40 %', 'Último dia da edição',   'Cenário operacional realista, 60-90 min consoante perfil'],
        ], [3.8 * cm, 1.4 * cm, 4.0 * cm, 6.3 * cm]),

        Spacer(1, 4 * mm),
        p('5.2 Critérios de aprovação por perfil', H2),
        table_styled([
            ['Perfil', 'Critério principal', 'Tempo'],
            ['Administrador TI', 'Recupera 2 falhas simuladas + cria 1 utilizador novo + investiga 1 incidente em audit log', '90 min'],
            ['Despachante',      'Resolve 5 ocorrências simuladas + 2 trocas correctas com motoristas',                       '60 min'],
            ['Planeador',        'Cria linha completa (1 padrão, 3 trips, 1 escala) sem erros bloqueantes',                   '90 min'],
            ['Analista',         'Produz relatório mensal a partir dos dashboards reais + 3 queries ao chatbot',              '60 min'],
            ['Fiscal',           'Classifica correctamente 8 em 10 fiscalizações em terreno simulado',                        '60 min'],
            ['Motorista',        'Completa 1 turno simulado (2 trips) + responde a 1 mensagem urgente',                       '45 min'],
        ], [3.4 * cm, 9.6 * cm, 2.5 * cm]),

        Spacer(1, 4 * mm),
        p('5.3 Níveis de certificação', H2),
        table_styled([
            ['Nível',         'Pontuação total', 'Implicação'],
            ['Distinção',     '≥ 90 %', 'Pode mentorar colegas e participar em formações futuras como assistente.'],
            ['Avançado',      '75-89 %', 'Autónomo no perfil, sem necessidade de supervisão.'],
            ['Proficiente',   '60-74 %', 'Autónomo nas tarefas standard, pode precisar de apoio em casos raros.'],
            ['Em formação',   '< 60 %',  'Necessita reposição. Não pode operar sem supervisão directa.'],
        ], [3.3 * cm, 2.6 * cm, 9.6 * cm]),

        Spacer(1, 4 * mm),
        p('5.4 Certificado emitido', H2),
        bullets([
            'PDF com cabeçalho oficial da Câmara Municipal de Braga.',
            'Identifica nome do formando, NIF (opcional), perfil avaliado, '
            'nível obtido, data de emissão e validade.',
            'Inclui QR Code com URL de verificação pública.',
            '<b>Validade: 12 meses.</b> Re-certificação anual obriga à '
            'sessão de actualização (~3 h) que cobre as novidades da '
            'versão.',
            'Cópia electrónica fica no perfil do colaborador no sistema '
            'de RH municipal; cópia em papel é entregue na sessão de '
            'encerramento.',
        ]),

        Spacer(1, 4 * mm),
        p('5.5 Política de reposição', H2),
        bullets([
            'Falta a 1 sessão obrigatória: reposição assíncrona via '
            'vídeo-aula + quiz Moodle (mínimo 70 %).',
            'Falta a 2 ou mais sessões: o formando refaz toda a edição.',
            'Reprovação na avaliação final: 1 nova tentativa após 2 '
            'semanas. Em caso de nova reprovação, exige-se nova inscrição '
            'completa.',
        ]),

        Spacer(1, 4 * mm),
        p('5.6 Registo institucional', H2),
        p('Todos os resultados ficam registados no Moodle institucional e '
          'replicados no sistema de RH. Os relatórios mensais de formação '
          'são enviados à direcção de RH e à direcção operacional dos TUB '
          'para acompanhamento de cobertura de competências por equipa.'),
    ]


# ============================================================
# 6. Anexos
# ============================================================
def section_appendix():
    return [
        PageBreak(),
        p('6. Anexos', H1),

        p('A · Glossário', H2),
        table_styled([
            ['Termo', 'Significado'],
            ['Linha (Route)',           'Conjunto de viagens com identidade comercial (ex.: Linha 5).'],
            ['Padrão (JourneyPattern)', 'Sequência ordenada de paragens + geometria pela estrada para um sentido.'],
            ['Trip',                    'Instância concreta de um padrão com horários específicos.'],
            ['TripStopTime',            'Hora prevista de chegada e partida em cada paragem de uma Trip.'],
            ['BusDuty (Escala)',        'Atribuição de uma sequência de Trips a um autocarro num dia de serviço.'],
            ['Coroa',                   'Zona tarifária. 1 = centro de Braga; 2 = peri-urbano.'],
            ['Transbordo',              'Validação seguinte do mesmo cartão dentro do período de validade do bilhete em curso.'],
            ['DMS',                     'Display Message Sign — painel electrónico de informação na paragem.'],
            ['Tool calling',            'O modelo de IA invoca uma função Java tipada (@Tool) para consultar dados reais.'],
            ['Heartbeat',               'Mensagem MQTT periódica de um painel/bus para sinalizar que está vivo.'],
            ['Adherence',               'Aderência ao plano: desvio entre horário real e planeado.'],
            ['M2M',                     'Machine-to-Machine. Endpoints autenticados via X-API-Key, sem utilizador humano.'],
        ], [4.5 * cm, 11.0 * cm]),

        Spacer(1, 5 * mm),
        p('B · FAQ', H2),

        p('B.1 Esqueci-me da palavra-passe. O que faço?', H3),
        p('No ecrã de login, clica em "Esqueci-me da palavra-passe". '
          'Recebes um email com um link de reset. Se não funcionar, '
          'contacta o administrador TI.'),

        p('B.2 O Chatbot inventou um valor. Posso confiar?', H3),
        p('Verifica a etiqueta por baixo da resposta. Se diz '
          '<i>via getRouteDelayStats · 1840 ms</i> a resposta vem de uma '
          'consulta real à base de dados. Sem etiqueta, é "conhecimento '
          'geral" do modelo e <b>não deve ser usada para decisões '
          'operacionais</b>.'),

        p('B.3 Não consigo criar uma Trip — diz "trip já está atribuída '
          'a outro autocarro".', H3),
        p('A regra V74 impede que a mesma Trip esteja em duas escalas '
          'activas (PLANNED ou RUNNING) no mesmo dia. Se a outra escala '
          'já está DONE/CANCELLED, podes reutilizar a Trip. Caso '
          'contrário, edita a escala existente ou cria uma nova Trip.'),

        p('B.4 O autocarro aparece com a linha errada após terminar o turno.', H3),
        p('A versão actual sincroniza <code>bus.route_id</code> com a duty '
          'RUNNING. Quando o bus termina serviço (STOPPED), o '
          '<code>route_id</code> é limpo automaticamente. Se vires '
          'inconsistências, abre uma ocorrência para suporte técnico.'),

        p('B.5 A primeira resposta do Chatbot demora muito.', H3),
        p('Normal. O modelo Qwen 2.5 precisa de carregar na RAM na '
          'primeira utilização (até ~60 s em CPU). Há um warm-up '
          'automático no arranque do backend; respostas seguintes são '
          'mais rápidas (≤10 s).'),

        Spacer(1, 5 * mm),
        p('C · Contactos', H2),
        table_styled([
            ['Equipa', 'Email', 'Notas'],
            ['Coordenação de formação', 'formacao.pgu@cm-braga.pt',  'Inscrições e cronograma'],
            ['Suporte técnico',         'suporte.pgu@cm-braga.pt',   'Incidentes operacionais'],
            ['Administração de sistemas','sysadmin.pgu@cm-braga.pt', 'Infra-estrutura'],
            ['Direcção operacional TUB','operacoes@tub.pt',          'Processos de negócio'],
        ], [5.0 * cm, 6.0 * cm, 4.5 * cm]),

        Spacer(1, 5 * mm),
        p('D · Histórico de revisões', H2),
        table_styled([
            ['Versão', 'Data', 'Alteração'],
            ['1.0', '01/06/2026',
             'Versão inicial baseada no estado real do repositório (build final, migrations V72-V74).'],
        ], [2.5 * cm, 3.0 * cm, 10.0 * cm]),

        Spacer(1, 10 * mm),
        p('— Fim do documento —',
          ParagraphStyle('End', parent=BODY, fontSize=10,
                         textColor=TUB_GREY, alignment=TA_CENTER)),
    ]


# ============================================================
# Build
# ============================================================
def build():
    out = Path(__file__).parent / 'Manual-Utilizador-PGU-TUB.pdf'
    doc = SimpleDocTemplate(
        str(out), pagesize=A4,
        leftMargin=2 * cm, rightMargin=2 * cm,
        topMargin=2 * cm, bottomMargin=2 * cm,
        title='Manual de Utilizador · PGU-TUB',
        author='Câmara Municipal de Braga · TUB',
        subject='Plano de Formação para Administradores e Utilizadores Finais',
    )
    story = []
    story += cover_page()
    story += section_summary()
    story += section_schedule()
    story += section_contents()
    story += section_modules()
    story += section_evaluation()
    story += section_appendix()
    doc.build(story, onFirstPage=draw_header_footer,
              onLaterPages=draw_header_footer)
    print(f'OK -> {out}')


if __name__ == '__main__':
    build()
