"""
Simulador Realista — TUB Braga
Busca autocarros e rotas reais do backend.
Cada autocarro percorre as paragens da sua rota pelas estradas reais (OSRM),
para, recebe/perde passageiros.
"""

import json
import time
import math
import random
import os
import urllib.request
import urllib.parse
from datetime import datetime, timezone, timedelta
from paho.mqtt import client as mqtt_client

# ==========================================
# CONFIGURAÇÃO
# ==========================================
BROKER      = os.getenv("MQTT_BROKER", "mosquitto")
PORT        = int(os.getenv("MQTT_PORT", 1883))
TOPIC       = os.getenv("MQTT_TOPIC", "tub/telemetry")
# Sprint 5 (3.3): topico de validacoes de bilhetica. Cada bus em EM_SERVICO
# gera N validacoes em paragens (proporcional a' ocupacao a bordo).
TOPIC_TICKET = os.getenv("MQTT_TOPIC_TICKET", "tub/ticket")
# Sprint 3 (3.5): topico dos paineis DMS. O simulador faz poll periodico
# a GET /api/v1/panels e publica heartbeats para cada painel existente.
TOPIC_PANEL  = os.getenv("MQTT_TOPIC_PANEL", "tub/panels/heartbeat")
# Sprint 4 (3.2): topico de diagnostic OBD/CAN. Frequencia mais baixa que
# a telemetria GPS — diagnostic e' "saude do veiculo", nao posicao.
TOPIC_DIAG   = os.getenv("MQTT_TOPIC_DIAG", "tub/diagnostics")
DIAG_INTERVAL_SEC = float(os.getenv("E_DIAG_INTERVAL_SEC", 15))
PANEL_HEARTBEAT_SEC = float(os.getenv("E_PANEL_HEARTBEAT_SEC", 30))
PANEL_POLL_SEC      = float(os.getenv("E_PANEL_POLL_SEC", 60))
# Probabilidade de uma paragem gerar 1+ validacoes neste tick (heuristica
# simples para a defesa academica; em real, viria do APC).
TICKET_AT_STOP_PROB = float(os.getenv("E_TICKET_AT_STOP_PROB", 0.85))
INTERVAL    = float(os.getenv("INTERVAL_SECONDS", 1))
BACKEND_URL = os.getenv("BACKEND_URL", "http://spring-boot-backend:8081")
API_KEY     = os.getenv("PGU_INTERNAL_API_KEY", "changeme-internal-key")
# Sprint -1 (SEC-1): credenciais MQTT obrigatorias (Mosquitto rejeita anonimos).
MQTT_USERNAME = os.getenv("MQTT_USERNAME", "simulator")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD")
if not MQTT_PASSWORD:
    raise RuntimeError("MQTT_PASSWORD obrigatoria (Mosquitto exige autenticacao)")

AVG_SPEED_KMH_RUSH  = 30
AVG_SPEED_KMH_NORMAL = 45

# ==========================================
# FASE E (E-sim) — CONSTANTES
# ==========================================
# Cache curto do estado do bus / escala (em segundos). Para nao bater no backend
# a cada tick. Ajustavel via env, default 5s para reagir a transicoes rapidas.
BUS_STATE_REFRESH_SEC = float(os.getenv("E_BUS_STATE_REFRESH_SEC", 5))
# Cache mais longo para a central TUB (raramente muda). Default 60s.
TUB_CENTRAL_REFRESH_SEC = float(os.getenv("E_TUB_CENTRAL_REFRESH_SEC", 60))
# Distancia (m) a partir da qual se considera "chegou a central" em STOPPING.
ARRIVAL_RADIUS_M = float(os.getenv("E_ARRIVAL_RADIUS_M", 50))
# Velocidade de deadhead (km/h) quando STOPPING (vai vazio para a central).
DEADHEAD_SPEED_KMH = float(os.getenv("E_DEADHEAD_SPEED_KMH", 40))
# Fuso horario para resolver o "hoje" a usar no GET /duties?date=...
# Europe/Lisbon (UTC ou UTC+1). Usar timezone fixo simples evita dependencia
# de pytz/zoneinfo (container slim). Aproximacao razoavel (TUB opera em Lisboa).
LISBON_OFFSET_HOURS = int(os.getenv("E_LISBON_OFFSET_HOURS", 0))


def _today_lisbon():
    """Data de hoje em Europe/Lisbon (YYYY-MM-DD). Aproximacao por offset fixo."""
    now = datetime.now(timezone.utc) + timedelta(hours=LISBON_OFFSET_HOURS)
    return now.strftime("%Y-%m-%d")


def get_time_period():
    """Retorna o período do dia para ajustar o comportamento."""
    h = datetime.now().hour
    if (13 <= h < 15) or (17 <= h < 19):
        return "rush"
    if h >= 23 or h < 6:
        return "night"
    return "normal"


def passenger_multiplier():
    """Multiplicador de passageiros baseado na hora do dia."""
    period = get_time_period()
    if period == "rush":
        return 1.8
    if period == "night":
        return 0.3
    return 1.0


def speed_curve(progress):
    """Curva de aceleração/desaceleração baseada no progresso (0→1) entre paragens."""
    if progress < 0.15:
        return 0.3 + 0.7 * (progress / 0.15)
    if progress > 0.85:
        return 0.3 + 0.7 * ((1.0 - progress) / 0.15)
    return 1.0


# ==========================================
# HELPERS
# ==========================================
def api_get(endpoint):
    """GET JSON do backend. Retorna lista/dict ou None."""
    url = f"{BACKEND_URL}{endpoint}"
    try:
        req = urllib.request.Request(url)
        req.add_header("X-API-Key", API_KEY)
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status == 204:
                return []
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"[SIM] Erro ao chamar {url}: {e}")
        return None


def wait_for_backend():
    """Espera que o backend esteja disponível."""
    for attempt in range(60):
        result = api_get("/api/v1/buses")
        if result is not None:
            return True
        print(f"[SIM] Backend não disponível (tentativa {attempt+1}/60)...")
        time.sleep(10)
    return False


OSRM_URL = os.getenv("OSRM_URL", "http://osrm:5000")

def osrm_route_points(lat1, lon1, lat2, lon2):
    """Sprint 5 (follow-up): pede ao OSRM uma polyline que segue as estradas
    entre (lat1,lon1) e (lat2,lon2). Devolve lista de (lat,lon).
    Fallback: [] se OSRM indisponivel — o caller deve cair em linha recta."""
    try:
        url = (f"{OSRM_URL}/route/v1/driving/"
               f"{lon1:.6f},{lat1:.6f};{lon2:.6f},{lat2:.6f}"
               f"?overview=full&geometries=geojson")
        with urllib.request.urlopen(url, timeout=5) as r:
            data = json.loads(r.read().decode("utf-8"))
        if data.get("code") != "Ok":
            return []
        routes = data.get("routes") or []
        if not routes:
            return []
        coords = routes[0].get("geometry", {}).get("coordinates") or []
        # OSRM devolve [lon,lat]; o resto do simulador usa (lat,lon).
        return [(p[1], p[0]) for p in coords if len(p) >= 2]
    except Exception as e:
        print(f"[SIM] OSRM route falhou: {e}")
        return []


def haversine_km(lat1, lon1, lat2, lon2):
    """Distância aproximada em km."""
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return 6371 * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ==========================================
# FASE E (E-sim) — CACHE DA CENTRAL TUB
# ==========================================
_tub_central_cache = {"lat": None, "lon": None, "ts": 0.0}


# Cache global de coordenadas das paragens. Preenchido uma vez no arranque
# do simulator e usado por _ensure_pattern_loaded para anexar lat/lon a cada
# pattern_stop (necessario para detectar paragem por proximidade no tick).
_stop_coords_cache = {}

def load_stop_coords():
    """Carrega TODAS as paragens (BusStop) com lat/lon e cacheia por stopId.
    Chama-se uma vez no arranque; idempotente. GET /api/v1/stops devolve
    {id, name, code, latitude, longitude, ...}."""
    global _stop_coords_cache
    data = api_get("/api/v1/stops") or []
    if isinstance(data, list):
        for s in data:
            sid = s.get("id")
            lat = s.get("latitude")
            lon = s.get("longitude")
            if sid is not None and lat is not None and lon is not None:
                _stop_coords_cache[sid] = (float(lat), float(lon))
    print(f"[SIM] Carregadas {len(_stop_coords_cache)} paragens (lat/lon).")


def get_tub_central():
    """Devolve (lat, lon) da Central TUB, com cache em memoria.

    Le GET /api/v1/config (singleton GlobalConfig). Campos: tubCentralLat /
    tubCentralLon (camelCase Jackson). Refresca a cada TUB_CENTRAL_REFRESH_SEC.
    Em caso de erro/vazio devolve fallback TUB (41.539908, -8.435542),
    coordenadas exactas da garagem TUB em Braga.
    """
    now = time.time()
    if (_tub_central_cache["lat"] is not None
            and now - _tub_central_cache["ts"] < TUB_CENTRAL_REFRESH_SEC):
        return _tub_central_cache["lat"], _tub_central_cache["lon"]
    cfg = api_get("/api/v1/config")
    lat = None
    lon = None
    if isinstance(cfg, dict):
        lat = cfg.get("tubCentralLat")
        lon = cfg.get("tubCentralLon")
    if lat is None or lon is None:
        # Fallback: garagem TUB Braga (mesmo valor da migracao V59).
        lat = 41.539908
        lon = -8.435542
    _tub_central_cache["lat"] = float(lat)
    _tub_central_cache["lon"] = float(lon)
    _tub_central_cache["ts"] = now
    return _tub_central_cache["lat"], _tub_central_cache["lon"]


def api_post(endpoint, data):
    """POST JSON ao backend. Retorna resposta ou None."""
    url = f"{BACKEND_URL}{endpoint}"
    try:
        body = json.dumps(data).encode("utf-8")
        req = urllib.request.Request(url, data=body, method="POST")
        req.add_header("Content-Type", "application/json")
        req.add_header("X-API-Key", API_KEY)
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"[SIM] Erro POST {url}: {e}")
        return None


def publish_telemetry(client, payload):
    """Publica telemetria no MQTT TOPIC. O NiFi consome e encaminha para
    o backend (POST /api/v1/telemetry/ingest/sensor). Este e' o unico
    caminho de ingestao — sem POST directo."""
    client.publish(TOPIC, json.dumps(payload))


# Distribuicao realista de canais (espelha a TUB: maioria CARTAO/PASSE,
# alguns BORDO/APP). Probabilidades acumulativas em [0,1].
TICKET_CHANNELS = [
    ("CARTAO", 0.55),
    ("PASSE",  0.25),
    ("APP",    0.12),
    ("BORDO",  0.08),
]
TICKET_CATEGORIES = [
    ("NORMAL",    0.65),
    ("SUB23",     0.15),
    ("REFORMADO", 0.18),
    ("SOCIAL",    0.02),
]


def _weighted_pick(pairs):
    r = random.random()
    acc = 0.0
    for label, p in pairs:
        acc += p
        if r <= acc:
            return label
    return pairs[-1][0]


def publish_ticket_validations(client, bus, stop_id, route_id):
    """Sprint 5 (3.3): publica N validacoes MQTT quando o bus chega a uma
    paragem. N = boarded simulado (sub-sensor passageiros). O NiFi encaminha
    para POST /api/v1/validations. Cada validacao traz canal, categoria, e
    um cardId fictivo (sera pseudonimizado no backend)."""
    if bus.last_boarded <= 0:
        return
    if random.random() > TICKET_AT_STOP_PROB:
        return
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    for i in range(bus.last_boarded):
        channel = _weighted_pick(TICKET_CHANNELS)
        category = _weighted_pick(TICKET_CATEGORIES)
        # BORDO nao tem cartao identificado (numerario, anonimo).
        card_id = None if channel == "BORDO" else f"CARD-{random.randint(10000, 99999)}"
        payload = {
            "eventType":    "TAP",
            "source":       channel,
            "channel":      channel,
            "fareCategory": category,
            "busId":        bus.bus_id,
            "routeId":      route_id,
            "stopId":       stop_id,
            "lat":          round(bus.lat, 6) if bus.lat is not None else None,
            "lon":          round(bus.lon, 6) if bus.lon is not None else None,
            "validatedAt":  ts,
            "cardId":       card_id,
        }
        client.publish(f"{TOPIC_TICKET}/{bus.bus_id}", json.dumps(payload))


def api_patch(endpoint, data):
    """PATCH JSON ao backend. Retorna resposta ou None."""
    url = f"{BACKEND_URL}{endpoint}"
    try:
        body = json.dumps(data).encode("utf-8")
        req = urllib.request.Request(url, data=body, method="PATCH")
        req.add_header("Content-Type", "application/json")
        req.add_header("X-API-Key", API_KEY)
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"[SIM] Erro PATCH {url}: {e}")
        return None


# ==========================================
# MAIN SENSORS / DESCOBERTA DO GATEWAY
# ==========================================
# Regra do modelo: um autocarro tem NO MAXIMO 1 main sensor. O simulador NAO
# cria nem atribui sensores (isso e' gestao de inventario, feita no backoffice).
# Apenas DESCOBRE o gateway do sensor JA atribuido a cada autocarro e usa-o como
# sensorId no frame que publica. Autocarro sem sensor atribuido nao opera e,
# por isso, nao e' simulado.


def discover_gateway(bus_db_id):
    """Descobre o gateway do main sensor JA atribuido a este autocarro.

    Le o inventario via GET /api/v1/sensors (o simulador ja' usa X-API-Key) e
    procura o sensor cujo busId == id do autocarro. Devolve o gateway desse
    sensor (a usar como sensorId no frame) ou None se o autocarro nao tiver
    nenhum main sensor atribuido. O simulador NAO cria nem atribui sensores.
    """
    sensors = api_get("/api/v1/sensors")
    if not sensors:
        return None  # 204/erro -> inventario vazio ou indisponivel
    match = next((s for s in sensors if s.get("busId") == bus_db_id), None)
    return match.get("gateway") if match else None


def split_shape_into_segments(shape_points, stops):
    """
    Divide um shape GTFS completo em sub-segmentos paragem-a-paragem.
    Para cada paragem, encontra o ponto mais próximo no shape e extrai
    o sub-percurso entre paragens consecutivas.
    """
    if len(shape_points) < 2 or len(stops) < 2:
        return {}

    # Para cada paragem, encontrar o índice do ponto mais próximo no shape
    stop_indices = []
    search_start = 0  # Só procurar para a frente para manter a ordem

    for stop in stops:
        slat, slon = stop["latitude"], stop["longitude"]
        best_idx = search_start
        best_dist = float('inf')

        for j in range(search_start, len(shape_points)):
            d = haversine_km(slat, slon, shape_points[j][0], shape_points[j][1])
            if d < best_dist:
                best_dist = d
                best_idx = j

        stop_indices.append(best_idx)
        search_start = best_idx  # Próxima paragem tem de estar mais à frente

    # Construir segmentos entre paragens consecutivas
    segments = {}
    for i in range(len(stops) - 1):
        start_idx = stop_indices[i]
        end_idx = stop_indices[i + 1]

        if end_idx <= start_idx:
            end_idx = start_idx + 1

        sub_points = shape_points[start_idx:end_idx + 1]
        if len(sub_points) < 2:
            sub_points = [
                (stops[i]["latitude"], stops[i]["longitude"]),
                (stops[i + 1]["latitude"], stops[i + 1]["longitude"])
            ]

        segments[(i, i + 1)] = sub_points

    return segments


def load_segments(route_id, stops):
    """
    Carrega segmentos da base de dados (calculados pelo Spring Boot via OSRM ou GTFS).
    Retorna dict: (from_order, to_order) -> [(lat, lon), ...]
    Se o segmento for um shape GTFS (segmento único cobrindo toda a rota),
    divide-o em sub-segmentos paragem-a-paragem para o simulador interpolar.
    """
    db_segments = api_get(f"/api/v1/route-segments/route/{route_id}")
    if db_segments and len(db_segments) > 0:
        # Detectar shape GTFS: um único segmento que cobre toda a rota
        if len(db_segments) == 1:
            seg = db_segments[0]
            span = seg["toStopOrder"] - seg["fromStopOrder"]
            if span >= len(stops) - 1 and len(seg["points"]) > len(stops) * 2:
                # É um shape GTFS — dividir em sub-segmentos paragem-a-paragem
                shape_points = [(p[0], p[1]) for p in seg["points"]]
                result = split_shape_into_segments(shape_points, stops)
                total_points = sum(len(pts) for pts in result.values())
                print(f"[SIM] Shape GTFS dividido em {len(result)} sub-segmentos ({total_points} pontos)")
                return result

        # Segmentos OSRM normais (um por par de paragens)
        print(f"[SIM] Segmentos carregados da DB ({len(db_segments)} segmentos)")
        segments = {}
        for seg in db_segments:
            key = (seg["fromStopOrder"] - 1, seg["toStopOrder"] - 1)
            segments[key] = [(p[0], p[1]) for p in seg["points"]]
        return segments

    # Fallback: linhas retas (segmentos ainda não calculados pelo backend)
    print(f"[SIM] Sem segmentos na DB, a usar linhas retas como fallback")
    segments = {}
    for i in range(len(stops) - 1):
        a = stops[i]
        b = stops[i + 1]
        segments[(i, i + 1)] = [
            (a["latitude"], a["longitude"]),
            (b["latitude"], b["longitude"])
        ]
    return segments


# ==========================================
# CLASSE AUTOCARRO SIMULADO
# ==========================================
class SimBus:
    def __init__(self, bus_data, route_data, road_segments, gateway):
        self.db_id    = bus_data["id"]
        self.bus_id   = bus_data["busCode"]
        self.capacity = bus_data.get("capacity") or 60
        # No modelo Transmodel novo o autocarro NAO tem rota fixa; as linhas
        # vivem em duties. Por isso route_data pode chegar None — nesse caso
        # o tick "active" e' inoperativo (nao publica) ate ao /in-service
        # do tick_starting carregar o pattern dinamico via /duties.
        self.route    = route_data
        if route_data and route_data.get("stops"):
            self.stops = sorted(route_data["stops"], key=lambda s: s["stopOrder"])
        else:
            self.stops = []
        self.segments = road_segments or {}
        # Fase E: o backend ja' nao usa "ACTIVE"; estados validos sao
        # EM_SERVICO / STOPPING / STOPPED / DECOMMISSIONED. Default STOPPED
        # para nao publicar telemetria ate o backend confirmar via fetch.
        self.db_status = bus_data.get("status", "STOPPED")

        # Este autocarro reporta como MAIN SENSOR. O gateway e' o do sensor JA
        # atribuido a este autocarro (descoberto via discover_gateway e passado
        # pelo chamador). O simulador nao cria nem atribui sensores.
        self.gateway = gateway
        # Odometro (km) com base realista por autocarro; cresce com a distancia.
        self.odometer_km = round(random.uniform(80000, 320000), 1)

        # Estado inicial — posição aleatória na rota (apenas se houver stops).
        self.stop_idx      = random.randint(0, max(0, len(self.stops) - 2)) if self.stops else 0
        self.direction     = 1       # 1=ida, -1=volta
        self.progress      = 0.0     # 0.0→1.0 entre duas paragens
        self.point_idx     = 0       # índice no segmento OSRM actual
        self.passengers    = random.randint(3, 20) if self.stops else 0
        # Sprint 2 (Vertical 3.4, R.ICP.01): contagem APC por paragem.
        # entradas/saidas referem-se SEMPRE ao ultimo evento de paragem; sao
        # postas a 0 enquanto o autocarro circula entre paragens.
        self.last_boarded  = 0
        self.last_alighted = 0
        self.status        = "active"
        self.stopped_ticks = 0
        self.removed = False
        self.current_speed = 0.0
        # Sem stops, a posicao inicial fica em (None, None); o tick_starting
        # posiciona o autocarro na central TUB na primeira iteracao.
        if self.stops:
            self.lat = self.stops[self.stop_idx]["latitude"]
            self.lon = self.stops[self.stop_idx]["longitude"]
        else:
            self.lat = None
            self.lon = None

        # ----- Fase E (E-sim): cache do estado/escala -----
        # Ultima vez que sincronizamos com o backend (status + escala).
        self.last_state_refresh = 0.0
        # STARTING: alvo (lat, lon) da 1a paragem da 1a duty PLANNED.
        # Resolvido na entrada em STARTING, limpo ao sair.
        self.starting_target = None
        # Sprint 5 (follow-up): polyline OSRM para STARTING/STOPPING (segue
        # a estrada real em vez de linha recta). None = carregar na 1a passagem.
        self.deadhead_polyline = None
        self.deadhead_idx = 0
        # Duty actualmente RUNNING (BusDutyDTO) ou None se nao ha escala viva.
        self.running_duty = None
        # Conta de viagens completadas nesta sessao (uma volta ida+volta = 1).
        # Usado so' para deteccao de "ja completei uma viagem desta trip".
        self.trip_completion_pending = False

        # Modelo Transmodel sem rota fixa: a geometria da trip vem da polyline
        # do pattern da duty RUNNING. Cache local por (patternId) — recarrega
        # apenas quando a pattern muda (mid-day pode haver multi-pattern).
        self.pattern_waypoints = []       # [(lat, lon), ...] da polyline OSRM
        self.pattern_waypoint_idx = 0     # indice do PROXIMO waypoint alvo
        self.pattern_id_cached = None     # patternId associado a self.pattern_waypoints
        # Sprint 4 (3.2): cache do powertrain e timestamp da ultima diagnostica
        self.powertrain = (bus_data.get("powertrain") or "DIESEL").upper()
        self.last_diag_at = 0.0           # epoch seconds do ultimo publish_diagnostic
        # Paragens nominais com COORDENADAS reais (anexadas em _ensure_pattern_loaded
        # via cache global _stop_coords_cache). A deteccao de paragem usa
        # distancia em metros, nao indice de waypoint.
        self.pattern_stops = []           # [{stopId, stopName, stopCode, sequence, lat, lon}, ...]
        self.pattern_current_stop_idx = 0 # ultima paragem por que passou
        self.pattern_dwell_ticks = 0      # ticks restantes parado em paragem

    def _current_stop(self):
        return self.stops[self.stop_idx]

    def _get_segment(self):
        """Obtém os pontos do segmento actual (ida ou volta)."""
        dest_idx = self.stop_idx + self.direction
        if self.direction == 1:
            key = (self.stop_idx, dest_idx)
        else:
            key = (dest_idx, self.stop_idx)

        points = self.segments.get(key, [])
        # Na volta, inverter a ordem dos pontos
        if self.direction == -1 and points:
            points = list(reversed(points))
        return points

    def _segment_total_dist(self, points):
        """Distância total de um segmento (soma dos sub-segmentos)."""
        total = 0.0
        for i in range(len(points) - 1):
            total += haversine_km(points[i][0], points[i][1], points[i+1][0], points[i+1][1])
        return max(total, 0.01)

    def _ensure_direction(self):
        """Inverte direção se chegou ao limite da rota."""
        nxt = self.stop_idx + self.direction
        if nxt >= len(self.stops) or nxt < 0:
            self.direction *= -1

    def tick(self):
        """Avança 1 tick (INTERVAL segundos)."""

        # — Parado numa paragem —
        if self.status == "stopped":
            self.stopped_ticks -= 1
            if self.stopped_ticks <= 0:
                self.status = "active"
                self._ensure_direction()
                self.progress = 0.0
                self.point_idx = 0
                # Ao arrancar, as entradas/saidas da paragem ja' foram reportadas:
                # zera-as para os ticks em movimento (boarded=alighted=0).
                self.last_boarded = 0
                self.last_alighted = 0
            return

        # — Em movimento —
        self._ensure_direction()
        points = self._get_segment()

        if not points or len(points) < 2:
            # Sem dados de rota, saltar para próxima paragem
            dest_idx = self.stop_idx + self.direction
            self.lat = self.stops[dest_idx]["latitude"]
            self.lon = self.stops[dest_idx]["longitude"]
            self._arrive(dest_idx)
            return

        total_dist = self._segment_total_dist(points)
        avg = AVG_SPEED_KMH_RUSH if get_time_period() == "rush" else AVG_SPEED_KMH_NORMAL
        base_speed = max(5, avg + random.uniform(-5, 5))
        speed = base_speed * speed_curve(self.progress)
        self.current_speed = speed
        km_per_tick = speed * (INTERVAL / 3600)
        self.progress += km_per_tick / total_dist
        # Fase C (Passo 2): odometro acumula a distancia percorrida (sub-sensor km).
        self.odometer_km = round(self.odometer_km + km_per_tick, 3)

        if self.progress >= 1.0:
            # Chegou à paragem
            dest_idx = self.stop_idx + self.direction
            self.lat = self.stops[dest_idx]["latitude"]
            self.lon = self.stops[dest_idx]["longitude"]
            self._arrive(dest_idx)
        else:
            # Interpolar posição ao longo dos pontos da estrada
            target_dist = self.progress * total_dist
            accumulated = 0.0
            for i in range(len(points) - 1):
                seg_dist = haversine_km(points[i][0], points[i][1], points[i+1][0], points[i+1][1])
                if accumulated + seg_dist >= target_dist and seg_dist > 0:
                    # Interpolar dentro deste sub-segmento
                    frac = (target_dist - accumulated) / seg_dist
                    self.lat = points[i][0] + (points[i+1][0] - points[i][0]) * frac
                    self.lon = points[i][1] + (points[i+1][1] - points[i][1]) * frac
                    break
                accumulated += seg_dist
            else:
                # Fallback: último ponto
                self.lat = points[-1][0]
                self.lon = points[-1][1]

            # Pequeno ruído GPS
            self.lat += random.uniform(-0.00002, 0.00002)
            self.lon += random.uniform(-0.00002, 0.00002)

    def _arrive(self, dest_idx):
        """Autocarro chegou a uma paragem."""
        self.stop_idx = dest_idx
        self.progress = 0.0
        self.point_idx = 0
        is_terminal = (dest_idx == 0 or dest_idx == len(self.stops) - 1)

        # Fase E (E-sim): se chegamos ao extremo da rota (terminal), terminamos
        # UMA viagem da trip activa. Marca para chamar /complete no proximo tick
        # (fora deste arrive, para nao bloquear o handler). NAO chama de imediato
        # para evitar reentrancia na contabilidade APC.
        if is_terminal and self.db_status == "EM_SERVICO" and self.running_duty is not None:
            self.trip_completion_pending = True

        self.status = "stopped"
        self.current_speed = 0.0
        stop_seconds = random.randint(30, 60) if is_terminal else random.randint(8, 20)
        self.stopped_ticks = max(1, int(stop_seconds / INTERVAL))

        # Passageiros — baseado na ocupação e hora do dia
        mult = passenger_multiplier()
        occupancy = self.passengers / self.capacity  # 0.0 → 1.0

        if is_terminal:
            # Nos terminais, a maioria sai
            saem = random.randint(int(self.passengers * 0.6), self.passengers)
            entram = random.randint(0, max(0, int(8 * mult)))
        elif occupancy > 0.7:
            # Autocarro cheio — saem mais do que entram
            saem = random.randint(3, min(self.passengers, int(15 * mult)))
            entram = random.randint(0, max(0, int(5 * mult)))
        elif occupancy < 0.3:
            # Autocarro vazio — entram mais do que saem
            saem = random.randint(0, min(self.passengers, 3))
            entram = random.randint(2, max(2, int(18 * mult)))
        else:
            # Ocupação média — flutuação equilibrada
            saem = random.randint(0, min(self.passengers, int(10 * mult)))
            entram = random.randint(0, max(0, int(12 * mult)))

        # Sprint 2 (Vertical 3.4, R.ICP.01): aplicar saidas e depois entradas,
        # respeitando a capacidade, e registar os valores REAIS (pos-clamp) para
        # manter onboard = anterior - alighted + boarded coerente.
        before = self.passengers
        after_alight = max(0, before - saem)
        real_alighted = before - after_alight
        after_board = min(self.capacity, after_alight + entram)
        real_boarded = after_board - after_alight

        self.last_alighted = real_alighted
        self.last_boarded = real_boarded
        self.passengers = after_board

    def stops_remaining(self):
        """Paragens que faltam até ao fim da trip (modelo Transmodel) ou
        até ao extremo da rota (modelo legado)."""
        if self.pattern_stops:
            return max(0, len(self.pattern_stops) - 1 - self.pattern_current_stop_idx)
        if not self.stops:
            return 0
        if self.direction == 1:
            return len(self.stops) - 1 - self.stop_idx
        else:
            return self.stop_idx

    def destination_name(self):
        """Nome da paragem destino (primeira ou última)."""
        if not self.stops:
            return "?"
        if self.direction == 1:
            return self.stops[-1].get("stopName", "?")
        else:
            return self.stops[0].get("stopName", "?")

    def next_stop_name(self):
        """Nome da próxima paragem (para onde se dirige)."""
        # Modelo Transmodel (pattern dinamico): proxima e' pattern_current_stop_idx + 1.
        if self.pattern_stops:
            nxt = self.pattern_current_stop_idx + 1
            if 0 <= nxt < len(self.pattern_stops):
                return self.pattern_stops[nxt].get("stopName") or "?"
            # Ja' estamos na ultima paragem.
            return self.pattern_stops[-1].get("stopName") or "?"
        # Fallback modelo legado.
        if not self.stops:
            return "?"
        nxt = self.stop_idx + self.direction
        if 0 <= nxt < len(self.stops):
            return self.stops[nxt].get("stopName", "?")
        return self.stops[self.stop_idx].get("stopName", "?")

    # ==========================================
    # FASE E (E-sim) — INTEGRACAO COM ESCALA
    # ==========================================
    def refresh_state(self, force=False):
        """Sincroniza db_status e running_duty com o backend.

        Faz throttle por BUS_STATE_REFRESH_SEC. Lê GET /api/v1/buses/{id} (campo
        status: STOPPED/EM_SERVICO/STOPPING/DECOMMISSIONED) e, se EM_SERVICO,
        GET /api/v1/buses/{id}/duties?date=hoje para encontrar a duty RUNNING.

        Resiliente: 4xx/5xx ou inventario indisponivel = mantem estado anterior.
        """
        now = time.time()
        if not force and (now - self.last_state_refresh) < BUS_STATE_REFRESH_SEC:
            return
        self.last_state_refresh = now

        bus = api_get(f"/api/v1/buses/{self.db_id}")
        if not isinstance(bus, dict):
            return  # transiente, manter estado anterior
        new_status = bus.get("status", self.db_status)
        if new_status != self.db_status:
            print(f"[SIM] {self.bus_id} estado: {self.db_status} -> {new_status}")
            self.db_status = new_status

        # Escala so' interessa quando EM_SERVICO. Em STOPPING / STOPPED /
        # DECOMMISSIONED, descartamos a duty cacheada para evitar acoes velhas.
        if self.db_status != "EM_SERVICO":
            self.running_duty = None
            return

        duties = api_get(f"/api/v1/buses/{self.db_id}/duties?date={_today_lisbon()}")
        if not isinstance(duties, list):
            return
        running = next((d for d in duties if d.get("status") == "RUNNING"), None)
        # Se a trip RUNNING mudou (proxima foi promovida), reinicia o flag
        # de "ja terminei uma viagem" porque comecamos uma trip nova.
        if running and (self.running_duty is None
                        or running.get("tripId") != self.running_duty.get("tripId")):
            self.trip_completion_pending = False
        self.running_duty = running

    def complete_current_trip(self):
        """Marca a trip RUNNING actual como DONE no backend.

        Devolve True se houve avanco (resposta 200). Trata os 2 desfechos:
          - nextTripId != null -> escala continua; refresh_state apanha a nova
            RUNNING no proximo tick.
          - nextTripId == null -> escala terminou; chama duties-complete para
            transitar para STOPPING.
        Idempotente: se o backend responder com nextTripId=null sem ter feito
        nada (sem RUNNING), continuamos para duties-complete; se em STOPPING
        ja', o nosso refresh_state apanha-o no proximo ciclo.
        """
        if self.running_duty is None:
            self.trip_completion_pending = False
            return False
        trip_id = self.running_duty.get("tripId")
        if trip_id is None:
            self.trip_completion_pending = False
            return False
        resp = api_post(
            f"/api/v1/buses/{self.db_id}/duties/{trip_id}/complete", {}
        )
        self.trip_completion_pending = False
        # A trip terminou: descarta a polyline cached para forcar reload do
        # pattern da PROXIMA duty (que pode ser de outra pattern/linha).
        self.pattern_waypoints = []
        self.pattern_waypoint_idx = 0
        self.pattern_id_cached = None
        self.pattern_stops = []
        self.pattern_current_stop_idx = 0
        self.pattern_dwell_ticks = 0
        if resp is None:
            # Erro transiente; nao avanca. Vamos tentar outra vez no proximo
            # arrival ao terminal.
            return False
        next_trip = resp.get("nextTripId")
        if next_trip is not None:
            print(f"[SIM] {self.bus_id} acabou trip {trip_id}, proxima: {next_trip}")
            # Forca refresh imediato para apanhar a nova duty RUNNING.
            self.refresh_state(force=True)
            return True
        # Escala acabou.
        print(f"[SIM] {self.bus_id} acabou escala, a regressar a central")
        api_post(f"/api/v1/buses/{self.db_id}/duties-complete", {})
        # Forca refresh para apanhar STOPPING no proximo tick.
        self.refresh_state(force=True)
        # Despeja passageiros: vai vazio no deadhead.
        self.last_alighted = self.passengers
        self.last_boarded = 0
        self.passengers = 0
        return True

    def resolve_starting_target(self):
        """Procura a 1a paragem da 1a duty PLANNED da escala de hoje.
        Devolve (lat, lon) ou None. Aproximacao: primeira coordenada da
        polyline do padrao (suficiente para o deadhead de saida)."""
        today = _today_lisbon()
        duties_resp = api_get(f"/api/v1/buses/{self.db_id}/duties?date={today}")
        if not duties_resp or not isinstance(duties_resp, list):
            return None
        planned = [d for d in duties_resp if d.get("status") == "PLANNED"]
        if not planned:
            return None
        pattern_id = planned[0].get("patternId")
        if not pattern_id:
            return None
        geo = api_get(f"/api/v1/patterns/{pattern_id}/geometry")
        pts = (geo or {}).get("points") if geo else None
        if not pts or len(pts) == 0:
            return None
        first = pts[0]
        if isinstance(first, list) and len(first) >= 2:
            return (float(first[0]), float(first[1]))
        if isinstance(first, dict) and "lat" in first and "lon" in first:
            return (float(first["lat"]), float(first["lon"]))
        return None

    def _ensure_pattern_loaded(self):
        """Carrega polyline + paragens nominais do pattern da duty RUNNING.
        Reaproveita cache enquanto o patternId nao muda. Devolve True quando
        ha' waypoints utilizaveis."""
        if self.running_duty is None:
            return False
        pattern_id = self.running_duty.get("patternId")
        if not pattern_id:
            return False
        if pattern_id == self.pattern_id_cached and self.pattern_waypoints:
            return True
        # 1) Geometria (polyline OSRM).
        geo = api_get(f"/api/v1/patterns/{pattern_id}/geometry")
        pts = (geo or {}).get("points") if geo else None
        if not pts or len(pts) < 2:
            return False
        wps = []
        for p in pts:
            if isinstance(p, list) and len(p) >= 2:
                wps.append((float(p[0]), float(p[1])))
            elif isinstance(p, dict) and "lat" in p and "lon" in p:
                wps.append((float(p["lat"]), float(p["lon"])))
        if len(wps) < 2:
            return False
        # 2) Lista nominal de paragens + anexa lat/lon via cache global.
        stops_resp = api_get(f"/api/v1/patterns/{pattern_id}/stops") or []
        pattern_stops = []
        for s in stops_resp:
            if not isinstance(s, dict) or not s.get("stopName"):
                continue
            sid = s.get("stopId")
            coords = _stop_coords_cache.get(sid)
            if coords is None:
                # Sem coordenadas: a paragem nao serve para deteccao por
                # proximidade. Ignora — pior caso, perdemos visualizacao
                # dessa paragem mas o bus continua a circular pela polyline.
                continue
            pattern_stops.append({
                "stopId":   sid,
                "stopName": s.get("stopName"),
                "stopCode": s.get("stopCode"),
                "sequence": s.get("sequence") or 0,
                "lat":      coords[0],
                "lon":      coords[1],
            })
        pattern_stops.sort(key=lambda s: s["sequence"])

        self.pattern_waypoints = wps
        self.pattern_waypoint_idx = 0
        self.pattern_id_cached = pattern_id
        self.pattern_stops = pattern_stops
        self.pattern_current_stop_idx = 0  # ja' passou por esta paragem
        self.pattern_dwell_ticks = 0       # ticks restantes parado
        self.lat, self.lon = wps[0]
        return True

    def _stop_name_by_idx(self, idx):
        if 0 <= idx < len(self.pattern_stops):
            return self.pattern_stops[idx].get("stopName") or "?"
        return "?"

    def tick_pattern_route(self):
        """Avanca pela polyline da trip. Quando o waypoint actual coincide
        com a posicao mapeada de uma paragem, simula paragem (dwell 1-2
        ticks) e gera APC realista (boarded/alighted/onboard). Ao chegar
        ao fim, marca trip_completion_pending."""
        wps = self.pattern_waypoints
        if not wps or self.pattern_waypoint_idx >= len(wps) - 1:
            self.trip_completion_pending = True
            self.current_speed = 0.0
            self.status = "stopped"
            return

        # — Em paragem (dwell): continua parado por X ticks —
        if self.pattern_dwell_ticks > 0:
            self.pattern_dwell_ticks -= 1
            self.current_speed = 0.0
            self.status = "stopped"
            # APC e' so' no tick de chegada (definido em baixo); aqui zera.
            self.last_boarded = 0
            self.last_alighted = 0
            return

        # — Movimento: avanca waypoint a waypoint —
        target_lat, target_lon = wps[self.pattern_waypoint_idx + 1]
        dist_km = haversine_km(self.lat, self.lon, target_lat, target_lon)

        # Velocidade urbana realista com variacao ampla por tick (10..40 km/h);
        # inercia leve para nao oscilar excessivo. Travagem proxima do fim.
        remaining_to_end = 0.0
        for i in range(self.pattern_waypoint_idx, len(wps) - 1):
            remaining_to_end += haversine_km(wps[i][0], wps[i][1], wps[i+1][0], wps[i+1][1])
        remaining_m = remaining_to_end * 1000.0
        if remaining_m < 120:
            target_speed = max(5.0, remaining_m / 120.0 * 22.0)
        else:
            target_speed = random.uniform(12.0, 38.0)
        prev = self.current_speed if self.current_speed > 0 else 0.0
        # Mais peso na velocidade nova (50/50) para variacao percetivel.
        self.current_speed = round(prev * 0.5 + target_speed * 0.5, 1)

        km_per_tick = self.current_speed * (INTERVAL / 3600.0)
        if km_per_tick <= 0:
            return
        if dist_km <= km_per_tick:
            self.lat, self.lon = target_lat, target_lon
            self.pattern_waypoint_idx += 1
        else:
            frac = km_per_tick / dist_km
            self.lat += (target_lat - self.lat) * frac
            self.lon += (target_lon - self.lon) * frac
        self.lat += random.uniform(-0.00002, 0.00002)
        self.lon += random.uniform(-0.00002, 0.00002)
        self.status = "active"
        self.odometer_km = round(self.odometer_km + km_per_tick, 3)
        # APC zerada enquanto entre paragens.
        self.last_boarded = 0
        self.last_alighted = 0

        # — Chegou perto da proxima paragem REAL? Simula paragem —
        # Usa as coordenadas reais da paragem (carregadas em _ensure_pattern_loaded
        # via _stop_coords_cache). Threshold 25m: dispara quando o bus passa
        # mesmo pela paragem, nao por aproximacao no indice de waypoints.
        ARRIVAL_M = 25.0
        if self.pattern_current_stop_idx + 1 < len(self.pattern_stops):
            next_stop_idx = self.pattern_current_stop_idx + 1
            ns = self.pattern_stops[next_stop_idx]
            dist_to_stop_m = haversine_km(self.lat, self.lon, ns["lat"], ns["lon"]) * 1000.0
            if dist_to_stop_m <= ARRIVAL_M:
                # Chegamos a' paragem. Snap a posicao exacta + APC + dwell.
                self.lat, self.lon = ns["lat"], ns["lon"]
                self.pattern_current_stop_idx = next_stop_idx
                boarded = random.randint(0, max(1, int(self.capacity * 0.15)))
                alighted = random.randint(0, min(self.passengers, max(1, int(self.capacity * 0.18))))
                new_onboard = max(0, self.passengers - alighted + boarded)
                new_onboard = min(new_onboard, self.capacity)
                actual_boarded = new_onboard - (self.passengers - alighted)
                self.last_alighted = alighted
                self.last_boarded = max(0, actual_boarded)
                self.passengers = new_onboard
                self.current_speed = 0.0
                self.status = "stopped"
                # Dwell realista (4-8s com INTERVAL=1s) para o motorista
                # ser visivelmente perceptivel no livemap.
                self.pattern_dwell_ticks = random.randint(4, 8)

    def tick_starting(self, tub_central_lat, tub_central_lon):
        """Avanca 1 tick em modo STARTING: deadhead da central -> 1a paragem.
        Ao chegar (<ARRIVAL_RADIUS_M) chama /in-service para o backend
        transitar STARTING -> EM_SERVICO + marcar a 1a duty como RUNNING.

        Sprint 5 (follow-up): segue polyline OSRM (estrada real) em vez de
        linha recta. Fallback haversine se OSRM nao responder."""
        # Defensive: autocarro sem rota inicial (modelo Transmodel) entra
        # com self.lat/self.lon = None. Inicializa na central da TUB antes
        # de qualquer calculo de distancia.
        if self.lat is None or self.lon is None:
            self.lat = tub_central_lat
            self.lon = tub_central_lon
        # Resolve o alvo da 1a paragem se ainda nao temos.
        if self.starting_target is None:
            self.starting_target = self.resolve_starting_target()
            # Fallback se nao deu para resolver: assume que ja' "chegou" para
            # nao ficar preso (backend vai dar OK em /in-service).
            if self.starting_target is None:
                api_post(f"/api/v1/buses/{self.db_id}/in-service", {})
                return
            # Posicao inicial = central (parte de onde estava parado).
            self.lat = tub_central_lat
            self.lon = tub_central_lon
            # Carrega a polyline OSRM uma vez ao iniciar o deadhead.
            self.deadhead_polyline = osrm_route_points(
                self.lat, self.lon, self.starting_target[0], self.starting_target[1])
            self.deadhead_idx = 0

        target_lat, target_lon = self.starting_target

        # APC zerada durante o deadhead inicial (fora de servico).
        self.last_boarded = 0
        self.last_alighted = 0
        if self.passengers > 0:
            self.passengers = 0

        dist_km_target = haversine_km(self.lat, self.lon, target_lat, target_lon)
        dist_m = dist_km_target * 1000.0

        if dist_m <= ARRIVAL_RADIUS_M:
            # Chegamos a 1a paragem. Snap + /in-service.
            self.lat = target_lat
            self.lon = target_lon
            self.current_speed = 0.0
            self.status = "active"
            self.deadhead_polyline = None
            self.deadhead_idx = 0
            resp = api_post(f"/api/v1/buses/{self.db_id}/in-service", {})
            if resp is not None:
                new_status = resp.get("status", self.db_status)
                if new_status != self.db_status:
                    print(f"[SIM] {self.bus_id} chegou a 1a paragem ({new_status})")
                    self.db_status = new_status
                    self.starting_target = None
            return

        # Velocidade realista no deadhead.
        target_speed = self._deadhead_target_speed(dist_m)
        prev = self.current_speed if self.current_speed > 0 else 0.0
        self.current_speed = round(prev * 0.6 + target_speed * 0.4, 1)
        km_per_tick = self.current_speed * (INTERVAL / 3600.0)
        if km_per_tick <= 0:
            return
        self._advance_along(km_per_tick, target_lat, target_lon)
        self.status = "active"
        self.odometer_km = round(self.odometer_km + km_per_tick, 3)

    def _deadhead_target_speed(self, dist_m):
        """Curva de velocidade-alvo para deadhead (STARTING / STOPPING):
        - 0..200m do alvo: desacelera linearmente ate' 8 km/h.
        - 200..400m: ramp suave 8 -> velocidade de cruzeiro.
        - >400m: cruzeiro = DEADHEAD_SPEED_KMH +/- 15% (variacao de transito).
        """
        cruise = DEADHEAD_SPEED_KMH
        if dist_m < 200:
            return max(8.0, dist_m / 200.0 * cruise)
        if dist_m < 400:
            ratio = (dist_m - 200) / 200.0  # 0..1
            return 8.0 + ratio * (cruise - 8.0)
        # Trafico: variacao realista de +/- 15%.
        return cruise * random.uniform(0.85, 1.15)

    def tick_deadhead(self, tub_central_lat, tub_central_lon):
        """Avanca 1 tick em modo deadhead (STOPPING): segue OSRM (estrada
        real) ate' a central. Quando chega a < ARRIVAL_RADIUS_M, chama
        /arrived. Idempotente: chamar mais do que uma vez em STOPPED nao
        parte nada (o backend trata).

        Sprint 5 (follow-up): polyline OSRM em vez de linha recta. Fallback
        haversine se OSRM nao responder."""
        # Reseta APC: nao recolhe passageiros, vai vazio para a central.
        self.last_boarded = 0
        self.last_alighted = 0
        if self.passengers > 0:
            self.passengers = 0

        # Carrega polyline na 1a passagem do ciclo de STOPPING (one-shot).
        if not getattr(self, 'deadhead_polyline', None):
            self.deadhead_polyline = osrm_route_points(
                self.lat, self.lon, tub_central_lat, tub_central_lon)
            self.deadhead_idx = 0

        dist_km_target = haversine_km(self.lat, self.lon, tub_central_lat, tub_central_lon)
        dist_m = dist_km_target * 1000.0

        if dist_m <= ARRIVAL_RADIUS_M:
            # Chegamos. Lock + /arrived.
            self.lat = tub_central_lat
            self.lon = tub_central_lon
            self.current_speed = 0.0
            self.status = "stopped"
            self.deadhead_polyline = None
            self.deadhead_idx = 0
            resp = api_post(f"/api/v1/buses/{self.db_id}/arrived", {})
            if resp is not None:
                new_status = resp.get("status", self.db_status)
                if new_status != self.db_status:
                    print(f"[SIM] {self.bus_id} chegou a central ({new_status})")
                    self.db_status = new_status
            return

        # Velocidade realista: rampa + cruzeiro com variacao + travagem.
        target_speed = self._deadhead_target_speed(dist_m)
        prev = self.current_speed if self.current_speed > 0 else 0.0
        self.current_speed = round(prev * 0.6 + target_speed * 0.4, 1)
        km_per_tick = self.current_speed * (INTERVAL / 3600.0)
        if km_per_tick <= 0:
            return
        self._advance_along(km_per_tick, tub_central_lat, tub_central_lon)
        self.status = "active"
        self.odometer_km = round(self.odometer_km + km_per_tick, 3)

    def _advance_along(self, km_per_tick, final_lat, final_lon):
        """Sprint 5 (follow-up): avanca self.lat/self.lon ao longo da
        polyline OSRM (self.deadhead_polyline). Se nao houver polyline ou
        ja ultrapassou o ultimo waypoint, cai em linha recta para o final."""
        poly = getattr(self, 'deadhead_polyline', None) or []
        idx = getattr(self, 'deadhead_idx', 0) or 0
        remaining_km = km_per_tick

        while remaining_km > 0 and idx < len(poly) - 1:
            nlat, nlon = poly[idx + 1]
            seg_km = haversine_km(self.lat, self.lon, nlat, nlon)
            if seg_km <= remaining_km:
                # Consome o segmento inteiro e avanca para o proximo.
                self.lat, self.lon = nlat, nlon
                remaining_km -= seg_km
                idx += 1
            else:
                frac = remaining_km / seg_km
                self.lat += (nlat - self.lat) * frac
                self.lon += (nlon - self.lon) * frac
                remaining_km = 0
                break
        self.deadhead_idx = idx

        # Se ja' nao ha polyline (fallback) ou ja' esgotamos os waypoints
        # mas ainda nao chegamos, faz a aproximacao final em linha recta.
        if remaining_km > 0:
            dist_km = haversine_km(self.lat, self.lon, final_lat, final_lon)
            if dist_km > 0:
                frac = min(1.0, remaining_km / dist_km)
                self.lat += (final_lat - self.lat) * frac
                self.lon += (final_lon - self.lon) * frac

        # Ruido GPS pequeno para coerencia.
        self.lat += random.uniform(-0.00002, 0.00002)
        self.lon += random.uniform(-0.00002, 0.00002)

    def _subsensors(self, speed):
        """Fase C (Passo 2): bloco de sub-sensores do MAIN SENSOR, todos saudaveis
        por defeito (health >= 0.9). SEM gating por estado do autocarro (o gating
        STOPPED/EM_SERVICO e' Fase E). Os valores derivam do que ja' se simula:
          - rpm:        proporcional a velocidade (ralenti quando parado);
          - bateria:    percentagem com ligeira flutuacao;
          - km:         odometro acumulado;
          - passageiros: APC ja' calculada (boarded/alighted/onboard);
          - gps:        so' saude (a posicao vai nos campos lat/lon do frame).
        """
        moving = self.status == "active"
        # RPM: ralenti ~750 parado, sobe com a velocidade (cap suave).
        rpm = 750.0 + (speed * 28.0) if moving else 750.0
        rpm = round(min(rpm, 2600.0) + random.uniform(-40, 40), 0)
        # Bateria 24V em percentagem (apresentada 0..100), flutuacao pequena.
        bateria = round(max(70.0, min(100.0, 88.0 + random.uniform(-6, 6))), 1)

        def health():
            # Saude perto de 1.0, sempre >= 0.9 (sub-sensores saudaveis).
            return round(random.uniform(0.92, 1.0), 3)

        return {
            "rpm":         {"value": rpm,                 "health": health()},
            "bateria":     {"value": bateria,             "health": health()},
            "km":          {"value": round(self.odometer_km, 1), "health": health()},
            "passageiros": {
                "boarded":  self.last_boarded,
                "alighted": self.last_alighted,
                "onboard":  self.passengers,
                "health":   health(),
            },
            "gps":         {"health": health()},
        }

    def to_telemetry(self):
        """Frame puro do MAIN SENSOR: posicao + cinematica + saude dos
        sub-sensores. O backend deriva o RESTO (proxima paragem, paragens
        restantes, linha actual, ocupacao acumulada) a partir da posicao
        GPS recebida cruzada com a duty RUNNING do bus.

        Nao incluimos campos "flat" legados (id_veiculo, velocidade_atual,
        proxima_paragem, paragens_restantes, etc.) porque eram duplicacao
        ou informacao derivada que o sensor fisico nao tem como saber. Se
        algum consumidor antigo precisar (e.g. Orion), o Jolt no NiFi monta
        a partir destes campos crus."""
        # Defensive: nunca emitir telemetria com lat/lon None — round(None) crasha.
        if self.lat is None: self.lat = 0.0
        if self.lon is None: self.lon = 0.0
        speed = round(self.current_speed, 1) if self.status == "active" else 0.0
        ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        return {
            "sensorId":   self.gateway,
            "lat":        round(self.lat, 6),
            "lon":        round(self.lon, 6),
            "speed":      speed,
            "timestamp":  ts,
            "subsensors": self._subsensors(speed),
        }


# ==========================================
# MAIN
# ==========================================
def main():
    print("=" * 50)
    print("Simulador Realista — TUB Braga (OSRM)")
    print("=" * 50)

    # 1. Esperar pelo backend
    if not wait_for_backend():
        print("[SIM] ERRO: Backend não respondeu. A terminar.")
        return

    # 2. Esperar até existirem autocarros em operacao (STARTING/EM_SERVICO/STOPPING).
    # STOPPED nao interessa (parado na central, sem motorista a operar);
    # DECOMMISSIONED tambem nao. Quando um STOPPED arranca, o motorista carrega
    # em "Iniciar Servico" no painel de bordo, o backend muda para STARTING e o
    # loop periodico (linhas abaixo) apanha-o como "novo autocarro" sem requerer
    # restart do simulador. Esta abordagem alinha o pool do simulador com o
    # ciclo de vida do servico: simular = ha algo a acontecer.
    ACTIVE_STATES = ("STARTING", "EM_SERVICO", "STOPPING")
    candidate_buses = []
    while not candidate_buses:
        buses_data = api_get("/api/v1/buses") or []
        candidate_buses = [b for b in buses_data
                           if b.get("status") in ACTIVE_STATES]
        if candidate_buses:
            break
        print(f"[SIM] Nenhum autocarro em operacao (STARTING/EM_SERVICO/STOPPING). A aguardar 30s...")
        time.sleep(30)

    # Pre-carrega a central TUB (cache de sessao) o quanto antes.
    tub_lat, tub_lon = get_tub_central()
    print(f"[SIM] Central TUB: lat={tub_lat}, lon={tub_lon}")
    load_stop_coords()

    print(f"[SIM] {len(candidate_buses)} autocarro(s) em operacao encontrado(s)")

    # 3. Para cada autocarro, buscar a rota com paragens e calcular segmentos OSRM.
    # No modelo Transmodel a rota nao vive no Bus; se o autocarro tem `routeId`
    # ainda (legado) carregamos segmentos como antes; caso contrario o SimBus
    # arranca "vazio" e a logica STARTING (tick_starting) resolve dinamicamente
    # a 1a paragem via /duties + /patterns/{id}/geometry.
    sim_buses = []
    route_cache = {}  # cache de segmentos por route_id

    for bus in candidate_buses:
        # Descobrir o main sensor JA atribuido a este autocarro. Sem sensor
        # atribuido o autocarro nao opera, por isso nao e' simulado.
        gateway = discover_gateway(bus["id"])
        if gateway is None:
            print(f"[SIM] {bus['busCode']} sem main sensor atribuido, nao simulado")
            continue

        route_id = bus.get('routeId')
        route = None
        segments = {}
        if route_id:
            route = api_get(f"/api/v1/routes/{route_id}")
            if route and route.get("stops") and len(route["stops"]) >= 2:
                stops = sorted(route["stops"], key=lambda s: s["stopOrder"])
                if route_id not in route_cache:
                    print(f"[SIM] A carregar segmentos para {route['name']} ({route['code']})...")
                    route_cache[route_id] = load_segments(route_id, stops)
                segments = route_cache[route_id]
            else:
                route = None  # rota insuficiente: tratar como sem rota

        sim = SimBus(bus, route, segments, gateway)
        sim_buses.append(sim)
        if route:
            print(f"[SIM] {bus['busCode']} -> {route['name']} ({route['code']}) — {len(sim.stops)} paragens, capacidade {sim.capacity}, gateway {sim.gateway}")
        else:
            print(f"[SIM] {bus['busCode']} -> sem rota fixa (escala Transmodel), status={bus.get('status')}, capacidade {sim.capacity}, gateway {sim.gateway}")

    if not sim_buses:
        print("[SIM] ERRO: Nenhum autocarro válido para simular.")
        return

    # 4. Ligar ao MQTT
    client = mqtt_client.Client(mqtt_client.CallbackAPIVersion.VERSION2, client_id="pgu-simulator")
    # Sprint -1 (SEC-1): autenticacao obrigatoria.
    client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)

    def on_connect(c, userdata, flags, rc, properties=None):
        if rc == 0:
            print(f"[SIM] Ligado ao broker MQTT ({BROKER}:{PORT})")
            c.subscribe("tub/dispatch/+")
            print("[SIM] Subscrito ao tópico de despacho: tub/dispatch/+")
            # Sprint 5 (follow-up): conteudo dos paineis DMS empurrado pelo backend.
            c.subscribe("tub/panels/+/content")
            print("[SIM] Subscrito ao tópico de conteúdo dos paineis: tub/panels/+/content")
        else:
            print(f"[SIM] Falha na ligação MQTT. Código: {rc}")

    def on_message(c, userdata, msg):
        try:
            topic = msg.topic
            payload = json.loads(msg.payload.decode("utf-8"))
            parts = topic.split("/")
            # Sprint 5 (follow-up): conteudo do painel DMS empurrado pelo backend
            # via tub/panels/{panelCode}/content. O simulador apenas regista
            # (na vida real, o painel renderiza as proximas chegadas no e-paper).
            if len(parts) == 4 and parts[0] == "tub" and parts[1] == "panels" and parts[3] == "content":
                panel_code = parts[2]
                arrivals = payload.get("arrivals") or []
                stop_name = payload.get("stopName") or "?"
                if not arrivals:
                    print(f"[PANEL {panel_code} @ {stop_name}] Sem aproximações neste momento.")
                else:
                    summary = ", ".join([
                        f"{a.get('routeCode','?')}:{a.get('busCode','?')} em {a.get('etaMinutes','?')}min"
                        + (f" (sched {a['scheduledArrival']}, {('+' if (a.get('delayMinutes') or 0) >= 0 else '')}{a.get('delayMinutes')}m)"
                           if a.get('scheduledArrival') else "")
                        for a in arrivals
                    ])
                    print(f"[PANEL {panel_code} @ {stop_name}] {summary}")
                return
            if len(parts) >= 3 and parts[0] == "tub" and parts[1] == "dispatch":
                bus_id = parts[2]
                message_id = payload.get("messageId")
                content = payload.get("content")
                operador = payload.get("operador")
                
                print(f"\n[CM - {bus_id}] Mensagem recebida de {operador}: \"{content}\"")
                
                # 1. Enviar ACK DELIVERED imediatamente
                ack_delivered = {
                    "messageId": message_id,
                    "type": "DELIVERED"
                }
                c.publish(f"tub/dispatch/{bus_id}/ack", json.dumps(ack_delivered), qos=1)
                print(f"[CM - {bus_id}] ACK DELIVERED enviado para mensagem {message_id}")
                
                # 2. Agendar ACK READ após 2 segundos
                import threading
                def send_read_ack():
                    time.sleep(2)
                    ack_read = {
                        "messageId": message_id,
                        "type": "READ"
                    }
                    c.publish(f"tub/dispatch/{bus_id}/ack", json.dumps(ack_read), qos=1)
                    print(f"[CM - {bus_id}] ACK READ enviado para mensagem {message_id}")
                
                threading.Thread(target=send_read_ack, daemon=True).start()
        except Exception as e:
            print(f"[SIM] Erro ao processar mensagem recebida no simulador: {e}")

    client.on_connect = on_connect
    client.on_message = on_message
    client.connect(BROKER, PORT)
    client.loop_start()

    # Sprint 3 (3.5): thread paralela para heartbeats dos paineis DMS.
    # Iniciada AQUI (depois do client MQTT existir, antes do loop principal).
    import threading
    threading.Thread(target=_panels_heartbeat_loop, args=(client,), daemon=True).start()

    print(f"[SIM] A simular {len(sim_buses)} autocarros a cada {INTERVAL}s no tópico '{TOPIC}'")
    print("=" * 50)

    # 5. Loop principal — verifica novos autocarros a cada CHECK_NEW_EVERY s.
    # Nota Fase E: o estado/escala de cada bus e' actualizado individualmente
    # via bus.refresh_state() (cache curto BUS_STATE_REFRESH_SEC). Este loop
    # de inventario serve apenas para detetar NOVOS autocarros ou remover os
    # DECOMMISSIONED. STOPPED nao remove (pode voltar a EM_SERVICO depois).
    active_bus_codes = {b.bus_id for b in sim_buses}
    CHECK_NEW_EVERY = 10  # segundos
    last_check = time.time()

    while True:
        # Refresh periodico do inventario (so' para adicionar/descomissionar).
        if time.time() - last_check >= CHECK_NEW_EVERY:
            last_check = time.time()
            buses_data = api_get("/api/v1/buses") or []

            # Marcar para remover do pool: DECOMMISSIONED (nao voltam) e os
            # que terminaram servico e estao agora STOPPED (a STOPPING ja
            # tinha publicado o deadhead, agora estao parados na central
            # sem fazer nada). Se voltarem a STARTING entram via new_buses.
            bus_status_map = {b["busCode"]: b.get("status", "STOPPED") for b in buses_data}
            for sim in sim_buses:
                cur = bus_status_map.get(sim.bus_id)
                if cur == "DECOMMISSIONED":
                    sim.removed = True
                    print(f"[SIM] {sim.bus_id} DECOMMISSIONED via backoffice")
                elif cur == "STOPPED":
                    sim.removed = True
                    print(f"[SIM] {sim.bus_id} voltou a STOPPED, removido do pool")

            # Detetar novos autocarros: apanha os que estao agora em
            # operacao (STARTING/EM_SERVICO/STOPPING) e ainda nao estao no pool.
            # E' assim que um STOPPED que arranca servico no painel de bordo
            # entra automaticamente no simulador, sem restart.
            new_buses = [b for b in buses_data
                         if b["busCode"] not in active_bus_codes
                         and b.get("status") in ACTIVE_STATES]

            for bus in new_buses:
                # Descobrir o main sensor JA atribuido. Sem sensor, nao simula.
                gateway = discover_gateway(bus["id"])
                if gateway is None:
                    print(f"[SIM] {bus['busCode']} sem main sensor atribuido, nao simulado")
                    continue

                route_id = bus.get('routeId')
                route = None
                segments = {}
                if route_id:
                    route = api_get(f"/api/v1/routes/{route_id}")
                    if route and route.get("stops") and len(route["stops"]) >= 2:
                        stops = sorted(route["stops"], key=lambda s: s["stopOrder"])
                        if route_id not in route_cache:
                            print(f"[SIM] A carregar segmentos para {route['name']} ({route['code']})...")
                            route_cache[route_id] = load_segments(route_id, stops)
                        segments = route_cache[route_id]
                    else:
                        route = None

                sim = SimBus(bus, route, segments, gateway)
                sim_buses.append(sim)
                active_bus_codes.add(bus["busCode"])
                if route:
                    print(f"[SIM] + NOVO: {bus['busCode']} -> {route['name']} ({route['code']}) — {len(sim.stops)} paragens, gateway {sim.gateway}")
                else:
                    print(f"[SIM] + NOVO: {bus['busCode']} -> sem rota fixa (escala Transmodel), status={bus.get('status')}, gateway {sim.gateway}")

        # Cache da central TUB (refresca-se sozinho a cada TUB_CENTRAL_REFRESH_SEC).
        tub_lat, tub_lon = get_tub_central()

        for bus in sim_buses:
            if bus.removed:
                continue

            # Fase E: sincroniza estado/escala com o backend (throttled).
            bus.refresh_state()

            # --- GATING POR ESTADO DO BUS (Fase E) ---
            status = bus.db_status

            if status in ("STOPPED", "DECOMMISSIONED"):
                # Nao publica telemetria. Mantem o estado interno (posicao na
                # central) para arranque limpo se voltar a EM_SERVICO.
                bus.starting_target = None  # cleanup ao sair de STARTING
                continue

            if status == "STARTING":
                # Deadhead de saida (transitioning entre central e 1a paragem).
                bus.tick_starting(tub_lat, tub_lon)
                if bus.db_status != "STARTING":
                    continue
                payload = bus.to_telemetry()
                publish_telemetry(client, payload)
                dist_m = 0
                if bus.starting_target is not None:
                    tgt_lat, tgt_lon = bus.starting_target
                    dist_m = haversine_km(bus.lat, bus.lon, tgt_lat, tgt_lon) * 1000.0
                print(f"[SIM] ~> {bus.bus_id} | TRANSITIONING (saida da central) | "
                      f"{payload['speed']:5.1f} km/h |"
                      f"a {dist_m:.0f}m da 1a paragem")
                continue

            if status == "STOPPING":
                # Deadhead final (transitioning da ultima paragem para a central).
                bus.tick_deadhead(tub_lat, tub_lon)
                if bus.db_status in ("STOPPED", "DECOMMISSIONED"):
                    continue
                payload = bus.to_telemetry()
                publish_telemetry(client, payload)
                dist_m = haversine_km(bus.lat, bus.lon, tub_lat, tub_lon) * 1000.0
                print(f"[SIM] ~> {bus.bus_id} | TRANSITIONING (regresso a' central) | "
                      f"{payload['speed']:5.1f} km/h |"
                      f"a {dist_m:.0f}m da central")
                continue

            if status == "EM_SERVICO":
                # Precisamos de uma duty RUNNING. Sem ela e' uma janela curta
                # de transicao entre trips dentro da escala (deadhead implicito).
                if bus.running_duty is None:
                    print(f"[SIM] ~> {bus.bus_id} | TRANSITIONING entre trips da escala")
                    continue

                # Se chegamos ao fim da trip no tick anterior, fecha-a agora.
                # complete_current_trip pode disparar nextTripId (continua) ou
                # duties-complete (passa a STOPPING).
                if bus.trip_completion_pending:
                    bus.complete_current_trip()
                    continue

                # Carrega geometria + paragens da pattern da duty RUNNING.
                if not bus._ensure_pattern_loaded():
                    # Sem geometria, nao ha como simular movimento. Publica
                    # parado para o livemap saber que esta' vivo.
                    if bus.lat is None or bus.lon is None:
                        bus.lat, bus.lon = tub_lat, tub_lon
                    bus.current_speed = 0.0
                    bus.status = "stopped"
                    payload = bus.to_telemetry()
                    publish_telemetry(client, payload)
                    print(f"[SIM] [] {bus.bus_id} | EM_SERVICO sem geometria de pattern | parado")
                    continue

                bus.tick_pattern_route()
                payload = bus.to_telemetry()
                publish_telemetry(client, payload)

                # Sprint 4 (3.2): publica diagnostic OBD/CAN periodicamente.
                now_ts = time.time()
                if now_ts - bus.last_diag_at >= DIAG_INTERVAL_SEC:
                    publish_diagnostic(client, bus, bus.powertrain)
                    bus.last_diag_at = now_ts

                # Sprint 5 (3.3): se o bus PAROU agora numa paragem real
                # (status=stopped + boarded>0), publica as validacoes em
                # tub/ticket/{busCode}. O NiFi encaminha para /validations.
                if bus.status == "stopped" and bus.last_boarded > 0 and bus.pattern_stops:
                    cur_stop = bus.pattern_stops[bus.pattern_current_stop_idx]
                    publish_ticket_validations(
                        client, bus,
                        stop_id=cur_stop.get("stopId"),
                        route_id=(bus.running_duty or {}).get("routeId")
                    )

                # Log com formato pedido: (linha) | (pattern) | (trip) |
                # (paragem/total) | (prox paragem) | (vel) | (onboard/+b/-a).
                rd = bus.running_duty or {}
                line = rd.get("routeShortName") or "?"
                pattern_id = bus.pattern_id_cached
                trip_id = rd.get("tripId")
                total_stops = len(bus.pattern_stops) if bus.pattern_stops else 0
                cur_stop = bus.pattern_current_stop_idx + 1 if total_stops > 0 else 0
                next_stop = bus.next_stop_name()
                marker = "[]" if bus.status == "stopped" else "->"
                end_tag = " | FIM da trip" if bus.trip_completion_pending else ""
                print(f"[SIM] {marker} {bus.bus_id} | EM_SERVICO | linha {line} | "
                      f"pattern#{pattern_id} | trip#{trip_id} | "
                      f"par {cur_stop}/{total_stops} | prox: {next_stop} | "
                      f"{payload['speed']:5.1f} km/h |"
                      f"{bus.passengers}/{bus.capacity} pax (+{bus.last_boarded}/-{bus.last_alighted})"
                      f"{end_tag}")
                continue

            # Estado desconhecido: log e nao publica (defesa em profundidade).
            print(f"[SIM] {bus.bus_id} estado desconhecido: {status}, ignorado")

        # Remover do pool autocarros marcados removed=True (DECOMMISSIONED
        # ou STOPPED — saidos de operacao). Os STOPPED ficam fora do pool
        # ate voltarem a STARTING (sao re-adicionados via new_buses).
        removed_buses = [bus for bus in sim_buses if bus.removed]
        for bus in removed_buses:
            active_bus_codes.discard(bus.bus_id)
        sim_buses = [bus for bus in sim_buses if not bus.removed]

        if len(sim_buses) == 0:
            print(f"[SIM] Nenhum autocarro ativo. A aguardar novos autocarros...")

        time.sleep(INTERVAL)


def publish_diagnostic(client, bus, powertrain):
    """Sprint 4 (3.2): publica diagnostic OBD/CAN em tub/diagnostics.
    Sinais condicionais ao powertrain. DTCs aleatorios (rarissimo)."""
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    moving = bus.status == "active" and bus.current_speed > 1.0
    payload = {
        "busId":        bus.bus_id,
        "powertrain":   powertrain,
        "recordedAt":   ts,
        "odometerKm":   round(bus.odometer_km, 1),
        "speedKmh":     round(bus.current_speed, 1),
        "ambientTempC": round(random.uniform(15.0, 28.0), 1),
        "doorOpenCount": random.randint(0, 3) if bus.status == "stopped" else 0,
    }
    if powertrain == "DIESEL":
        payload["engineRpm"]       = int(750 + bus.current_speed * 28) if moving else 750
        payload["coolantTempC"]    = round(random.uniform(82.0, 95.0), 1)
        payload["oilPressureBar"]  = round(random.uniform(3.5, 5.0), 1)
        payload["fuelLevelPct"]    = max(5, 95 - int(bus.odometer_km / 200) % 90)
        payload["adblueLevelPct"]  = max(5, 90 - int(bus.odometer_km / 400) % 85)
        payload["dpfSootPct"]      = min(95, 30 + int(bus.odometer_km / 1000) % 70)
    elif powertrain == "ELECTRIC":
        payload["socPct"]          = max(8, 90 - int(bus.odometer_km / 50) % 82)
        payload["sohPct"]          = random.randint(82, 100)
        payload["motorKw"]         = round(bus.current_speed * 2.5, 1) if moving else 0
        payload["regenKw"]         = round(random.uniform(0, 35.0), 1) if bus.status == "stopped" else 0
    elif powertrain == "CNG":
        payload["engineRpm"]       = int(750 + bus.current_speed * 26) if moving else 700
        payload["coolantTempC"]    = round(random.uniform(80.0, 92.0), 1)
        payload["cngLevelPct"]     = max(8, 92 - int(bus.odometer_km / 300) % 88)
        payload["cngPressureBar"]  = round(180 + random.uniform(-20, 20), 1)
    # DTC aleatorio raro (1% chance)
    if random.random() < 0.01:
        payload["dtcCodes"] = random.choice(["SPN1127/FMI3", "SPN3251/FMI18", "SPN91/FMI4"])
    try:
        client.publish(TOPIC_DIAG, json.dumps(payload))
    except Exception as e:
        print(f"[SIM] diag falhou {bus.bus_id}: {e}")


def _panels_heartbeat_loop(mqtt_client_ref):
    """Sprint 3 (3.5): publica heartbeats MQTT para cada painel DMS existente.
    Faz poll de GET /api/v1/panels (a cada PANEL_POLL_SEC) para descobrir
    novos paineis, e a cada PANEL_HEARTBEAT_SEC publica payload com bateria
    (so' EPAPER), temperatura, firmware. O NiFi encaminha para o backend.
    O simulador NUNCA cria/elimina paineis — esses fluem pelo CRUD admin."""
    print("[SIM] Thread paneis DMS iniciada.")
    panels = []
    last_poll = 0.0
    while True:
        now = time.time()
        if now - last_poll >= PANEL_POLL_SEC or not panels:
            data = api_get("/api/v1/panels") or []
            panels = data if isinstance(data, list) else []
            last_poll = now
        for p in panels:
            if not p.get("enabled", True): continue
            ptype = p.get("type", "EPAPER")
            battery = None
            if ptype == "EPAPER":
                # painel solar: bateria desce devagar, oscilacao -1 a +2%
                base = p.get("batteryPct")
                if base is None or base <= 0: base = 80
                battery = max(5, min(100, base + random.randint(-1, 2)))
            payload = {
                "panelCode":   p["code"],
                "ts":          datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "status":      "ONLINE",  # backend re-deriva consoante bateria
                "batteryPct":  battery,
                "temperatureC": round(random.uniform(18.0, 32.0), 1),
                "firmware":    p.get("firmwareVersion") or "1.0.0",
            }
            try:
                mqtt_client_ref.publish(TOPIC_PANEL, json.dumps(payload))
            except Exception as e:
                print(f"[SIM] panel heartbeat falhou {p.get('code')}: {e}")
        time.sleep(PANEL_HEARTBEAT_SEC)


def _self_pulse_loop():
    """Sprint 0 (F4 follow-up): self-pulse periódico para a DataSource
    'Simulador de Telemetria'. Sem isto, o probe do backend não consegue
    confirmar que o simulator está vivo (ele não expõe nem porta nem HTTP).
    Loop:
      1. Faz GET /data-sources para obter o id da fonte com tipo=SIMULATOR.
      2. A cada 10s, POST /data-sources/{id}/pulse.
    Resiliente: se o backend não responder, espera e tenta de novo.
    """
    import threading  # noqa: F401  (já importado em main, mas garante import top-level)
    ds_id = None
    while ds_id is None:
        try:
            req = urllib.request.Request(
                f"{BACKEND_URL}/api/v1/data-sources",
                headers={"X-API-Key": API_KEY},
            )
            with urllib.request.urlopen(req, timeout=5) as r:
                for ds in json.loads(r.read().decode("utf-8")):
                    if ds.get("tipo") == "SIMULATOR":
                        ds_id = ds.get("id")
                        break
        except Exception as e:
            print(f"[SIM] Self-pulse: backend não responde ({e}); a tentar de novo em 10s", flush=True)
        if ds_id is None:
            time.sleep(10)
    print(f"[SIM] Self-pulse activo: DataSource id={ds_id}", flush=True)
    while True:
        try:
            body = json.dumps({"detalhes": "simulator self-pulse"}).encode("utf-8")
            req = urllib.request.Request(
                f"{BACKEND_URL}/api/v1/data-sources/{ds_id}/pulse",
                data=body,
                method="POST",
                headers={"X-API-Key": API_KEY, "Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=5):
                pass
        except Exception as e:
            print(f"[SIM] Self-pulse falhou: {e}", flush=True)
        time.sleep(10)


if __name__ == "__main__":
    import threading
    threading.Thread(target=_self_pulse_loop, daemon=True).start()
    # A thread dos paineis (Sprint 3) e' iniciada DENTRO de main(), apos o
    # cliente MQTT ser criado — depende dele para publicar heartbeats.
    main()
