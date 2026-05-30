# Impacto da revisão da Bilhética nos Use Cases

Documento de **sinalização**. Identifica quais dos 24 use cases de `Use_Cases_PGU_TUB_mayo.docx` são afetados pela revisão da bilhética, em que a PGU passa a **adaptar-se ao sistema real da TUB** ("coroas + tempo") em vez de impor um modelo trimodal genérico com deteção de fraude forense.

O novo modelo está em `PLANO_ITERACAO.md` §5.1. Resumo do sistema real da TUB:

- **2 coroas** (zonas). Preço por número de coroas do percurso.
- **Validade de 1 hora** com **transbordo livre** dentro da janela.
- **Tap-in apenas** no cartão recarregável e no bilhete de bordo (não capturam destino). A **app TUBmobile** (lançada dez 2025) faz **check-in (QR junto ao motorista) e check-out na app**, calculando o trajeto real e os transbordos (carteira digital Apple Pay / Google Pay / MB WAY / cartão).
- A PGU **não cria** a bilhética nem guarda números de cartão reais: **ingere e monitoriza** os eventos da TUB.

> Convenção: 🔴 alterar muito · 🟠 alterar · 🟡 alterar pouco · ⚪ aditivo.

## Resumo

| UC | Título | Impacto | Ação proposta |
|---|---|---|---|
| **UC17** | Reconciliar Bilhetes Físicos Fim-de-Turno | 🔴 Crítico | **Remover** ou reduzir a um fecho de numerário mínimo (sem ETM, Z-report nem as 6 regras de serial) |
| **UC10** | Gerir Anomalias e Fraude de Bilhética | 🔴 Alto | **Reorientar**: manter evasão tarifária (APC vs validações) e fiscalização; remover a reconciliação forense de ETM e as 6 regras |
| **UC16** | Validar Bilhete a Bordo | 🟠 Alto | **Substituir** os canais pelo modelo real (cartão recarregável, bilhete de bordo, app TUBmobile CiCo); juntar coroa, validade 1h e transbordo |
| **UC09** | Analisar Adequação da Oferta à Procura | 🟡 Baixo | A origem-destino passa a **real** (check-in/check-out da app), não estimada |
| **UC14** | Autenticar e Iniciar Turno (Motorista) | 🟡 Baixo | Remover a ligação do motorista à operação de ETM / reconciliação |
| **UC15** | Receber Despacho e Reportar Anomalia | 🟡 Baixo | Idem: o papel de bilhética do motorista simplifica |
| **UC22** | Consultar Dashboards de Analytics | ⚪ Aditivo | Incluir dashboards de bilhética por coroa, procura real e evasão |
| **UC11** | Interagir com Agente de IA | 🟡 Baixo | As tools de IA passam a consultar o novo modelo de validações/procura |
| Glossário | (secção 3) | 🟠 Médio | Atualizar `Validação`; depreciar `ETM`/`Z-report`/`Reconciliação`; juntar `Coroa`, `Transbordo`, `Check-in/Check-out`, `Título` |
| Catálogo de atores | (secção 2) | 🟡 Baixo | Atualizar `Sistema de Bilhética TUB` (cartão, bordo, app), sem ênfase em ETM |

Os restantes 14 UCs (UC01-08, UC12, UC13, UC18-21, UC23, UC24) **não são afetados**.

---

## Detalhe por use case

### 🔴 UC17 - Reconciliar Bilhetes Físicos Fim-de-Turno

**Diagnóstico.** O UC inteiro assenta no **ETM**, no **Z-report** e no `PaperTicketFraudDetector` com regras de número de série (salto de sequência, série duplicada entre turnos, etc.). A TUB **não opera assim**: o bilhete de bordo é uma venda simples em dinheiro pelo motorista (1,50€), sem máquina de serial nem relatório de fim-de-turno por sequência.

**Ação.** Remover como UC nuclear. Se for preciso fechar o numerário, reduzir a um **"Fecho de turno de numerário" mínimo**: o motorista entrega o dinheiro, o supervisor confere o **total do turno vs esperado** (soma das vendas de bordo registadas), sem serial, sem Z-report e sem as 6 regras. Marcar como **opcional / roadmap**.

**Remover do documento:** a tabela `paper_ticket_reconciliation`, o ator ETM como peça central, os fluxos "Salto de Sequência" e "Número de Série Duplicado", e o `PaperTicketFraudDetector`.

### 🔴 UC10 - Gerir Anomalias e Fraude de Bilhética

**Manter (continua válido para a TUB):**
- **Evasão tarifária** via discrepância **APC vs validações** (passageiros contados pelos sensores sem validação correspondente). Este é o núcleo legítimo e útil.
- Modo histórico e modo tempo real, heatmap, score por confiança, RGPD by design (só agregados e pseudónimos).
- Apoio à **fiscalização** no terreno (ator Fiscal, mantém-se).

**Alterar:**
- Fontes de validação: trocar "validações digitais (cartão, mobile QR) e bilhetes físicos (papel)" por **cartão recarregável, bilhete de bordo e app TUBmobile (check-in/check-out)**. O cálculo de discrepância passa a somar também os check-in da app.
- **Remover** o subflow "Reconciliação Fim-de-Turno" e as **6 regras forenses** (dependem de ETM/Z-report). Substituir, se necessário, pela reconciliação **leve** de numerário do UC17 reduzido.
- "Número estimado de infratores" e a evasão continuam; a parte de série/cash forense sai.

### 🟠 UC16 - Validar Bilhete a Bordo

**Alterar o modelo de canais.** Trocar os três canais atuais (cartão físico tap-in; QR mobile "compra prévia → QR ao validador"; ETM) pelos **quatro canais reais**:
1. **Cartão recarregável TUB** (tap-in no validador, pré-pago).
2. **Bilhete de bordo** (motorista, dinheiro, 1,50€, com transbordo). Simples, sem ETM/serial.
3. **Passe mensal** (por coroa, categorias Normal/Estudante/Reformado/Social).
4. **App TUBmobile**: o **QR junto ao motorista** é **CHECK-IN** (identifica autocarro, linha, hora, local), e o **CHECK-OUT** é feito na app, que calcula o trajeto real e os transbordos.

**Corrigir:** a mecânica "QR mobile = mostrar QR ao validador" está errada (na TUB o QR é check-in no motorista). Os atores "Validador Embarcado" + "ETM" passam a "validador de cartão" + "venda de bordo" + "app TUBmobile".

**Juntar:** o conceito de **coroa**, **validade de 1h** e **transbordo**; o evento de validação ganha `event_type` (TAP para cartão/bordo; CHECK_IN / CHECK_OUT para a app). Os fluxos "Validação Duplicada <30s" e "QR token consumido" mantêm-se, reenquadrados. A inferência de paragem por GPS mantém-se para o tap-in (sem destino); a app dá origem-destino real.

### 🟡 UC09 - Analisar Adequação da Oferta à Procura

A origem-destino deixa de ser apenas **estimada** (tap-in + telemetria) e passa a ser **real** para as viagens feitas na app (check-in/check-out). Atualizar as precondições e os dados: a app é a fonte de O-D real; os canais tap-in continuam a alimentar agregados (procura por linha/paragem/hora).

### 🟡 UC14 e UC15 - Motorista

Remover qualquer ligação do motorista à operação de **ETM** e à **reconciliação de bilhetes** (essa complexidade desaparece com o UC17 reduzido). O `driver_bus_assignment` e o despacho mantêm-se. O motorista continua a poder **vender bilhete de bordo** (venda simples em dinheiro), mas sem o aparato de serial/Z-report.

### ⚪ UC22 - Dashboards de Analytics

Aditivo: incluir vistas de bilhética alinhadas ao modelo (validações por **coroa**, **procura real** via O-D da app, **taxa de evasão** via APC vs validações). Sem rutura no UC.

### 🟡 UC11 - Agente de IA

As tools read-only de IA (procura, validações, ocupação) passam a refletir o novo modelo (coroas, canais reais, O-D real da app). Atualizar a descrição dos dados disponíveis; a filosofia de privacidade (só agregados) mantém-se.

---

## Glossário (secção 3) a atualizar

| Termo | Mudança |
|---|---|
| **Validação** | De "tap-in cartão, scan QR, ou venda papel" para "tap-in de cartão, venda de bordo, ou **check-in/check-out** na app TUBmobile" |
| **ETM** | **Depreciar** (não faz parte do modelo adaptado; o bilhete de bordo é venda simples em dinheiro) |
| **Z-report** | **Depreciar** (sem reconciliação por serial) |
| **Reconciliação** | Reduzir a "conferência simples do numerário de bordo do turno", opcional |
| **Coroa** | (novo) Zona tarifária da TUB. Existem 2 |
| **Transbordo** | (novo) Mudança de linha dentro da validade de 1h, sem novo pagamento |
| **Check-in / Check-out** | (novo) Início e fim de viagem na app TUBmobile, que calcula o trajeto real |
| **Título** | (novo) Direito de transporte: cartão recarregável, passe mensal, bilhete de bordo ou bilhete na app |

## Catálogo de atores (secção 2) a atualizar

- **Sistema de Bilhética TUB (externo):** de "Validadores BRT, ETM dos motoristas, app mobile" para **"Validadores de cartão, venda de bordo pelo motorista, app TUBmobile (check-in/check-out, carteira digital)"**. UCs associados: UC10, UC16 (UC17 só se mantido em versão mínima).
- **Fiscal:** mantém-se (a fiscalização de evasão continua válida).
- **APC (externo):** mantém-se (essencial para a deteção de evasão em UC09/UC10).

---

## Recomendação

Aprovar estas alterações e depois **atualizar o `Use_Cases_PGU_TUB_mayo.docx`** em conformidade: reescrever UC16 e UC10, remover/reduzir UC17, ajustar o glossário e o catálogo de atores, e rever as menções menores em UC09/UC11/UC14/UC15/UC22. O `PLANO_ITERACAO.md` §5.1 já fica alinhado nesta entrega.
