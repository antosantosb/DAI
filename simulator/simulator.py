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
from datetime import datetime, timezone
from paho.mqtt import client as mqtt_client

# ==========================================
# CONFIGURAÇÃO
# ==========================================
BROKER      = os.getenv("MQTT_BROKER", "mosquitto")
PORT        = int(os.getenv("MQTT_PORT", 1883))
TOPIC       = os.getenv("MQTT_TOPIC", "tub/telemetry")
INTERVAL    = float(os.getenv("INTERVAL_SECONDS", 5))
BACKEND_URL = os.getenv("BACKEND_URL", "http://spring-boot-backend:8081")

AVG_SPEED_KMH = 30

# ==========================================
# HELPERS
# ==========================================
def api_get(endpoint):
    """GET JSON do backend. Retorna lista/dict ou None."""
    url = f"{BACKEND_URL}{endpoint}"
    try:
        req = urllib.request.Request(url)
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


def haversine_km(lat1, lon1, lat2, lon2):
    """Distância aproximada em km."""
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return 6371 * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def api_post(endpoint, data):
    """POST JSON ao backend. Retorna resposta ou None."""
    url = f"{BACKEND_URL}{endpoint}"
    try:
        body = json.dumps(data).encode("utf-8")
        req = urllib.request.Request(url, data=body, method="POST")
        req.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"[SIM] Erro POST {url}: {e}")
        return None


def api_patch(endpoint, data):
    """PATCH JSON ao backend. Retorna resposta ou None."""
    url = f"{BACKEND_URL}{endpoint}"
    try:
        body = json.dumps(data).encode("utf-8")
        req = urllib.request.Request(url, data=body, method="PATCH")
        req.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"[SIM] Erro PATCH {url}: {e}")
        return None


def load_segments(route_id, stops):
    """
    Carrega segmentos da base de dados (calculados pelo Spring Boot via OSRM).
    Retorna dict: (from_order, to_order) -> [(lat, lon), ...]
    Se não existirem, usa fallback de linhas retas entre paragens.
    """
    db_segments = api_get(f"/api/v1/route-segments/route/{route_id}")
    if db_segments and len(db_segments) > 0:
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
    def __init__(self, bus_data, route_data, road_segments):
        self.db_id    = bus_data["id"]
        self.bus_id   = bus_data["busCode"]
        self.capacity = bus_data.get("capacity") or 60
        self.route    = route_data
        self.stops    = sorted(route_data["stops"], key=lambda s: s["stopOrder"])
        self.segments = road_segments
        self.db_status = bus_data.get("status", "ACTIVE")  # ACTIVE/STOPPING/STOPPED

        # Estado inicial — posição aleatória na rota
        self.stop_idx      = random.randint(0, max(0, len(self.stops) - 2))
        self.direction     = 1       # 1=ida, -1=volta
        self.progress      = 0.0     # 0.0→1.0 entre duas paragens
        self.point_idx     = 0       # índice no segmento OSRM actual
        self.passengers    = random.randint(3, 20)
        self.status        = "active"
        self.stopped_ticks = 0
        self.removed = False
        self.lat = self.stops[self.stop_idx]["latitude"]
        self.lon = self.stops[self.stop_idx]["longitude"]

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
                self.stop_idx += self.direction
                self._ensure_direction()
                self.progress = 0.0
                self.point_idx = 0
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
        speed = max(5, AVG_SPEED_KMH + random.uniform(-10, 10))
        km_per_tick = speed * (INTERVAL / 3600)
        self.progress += km_per_tick / total_dist

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

        # Se STOPPING e chegou ao extremo da rota, parar
        if self.db_status == "STOPPING" and is_terminal:
            self.status = "stopped"
            self.stopped_ticks = 999999
            self.removed = True
            self.passengers = 0
            api_patch(f"/api/v1/buses/{self.db_id}", {"status": "STOPPED"})
            print(f"[SIM] {self.bus_id} PARADO no extremo da rota")
            return

        self.status = "stopped"
        self.stopped_ticks = random.randint(1, 3)

        # Passageiros saem e entram
        saem   = random.randint(0, min(self.passengers, 12))
        entram = random.randint(0, min(10, self.capacity - self.passengers + saem))
        self.passengers = max(0, min(self.capacity, self.passengers - saem + entram))

    def stops_remaining(self):
        """Paragens que faltam até ao extremo da rota (ida ou volta)."""
        if self.direction == 1:
            return len(self.stops) - 1 - self.stop_idx
        else:
            return self.stop_idx

    def destination_name(self):
        """Nome da paragem destino (primeira ou última)."""
        if self.direction == 1:
            return self.stops[-1].get("stopName", "?")
        else:
            return self.stops[0].get("stopName", "?")

    def next_stop_name(self):
        """Nome da próxima paragem (para onde se dirige)."""
        nxt = self.stop_idx + self.direction
        if 0 <= nxt < len(self.stops):
            return self.stops[nxt].get("stopName", "?")
        return self.stops[self.stop_idx].get("stopName", "?")

    def to_telemetry(self):
        speed = round(max(0, AVG_SPEED_KMH + random.uniform(-10, 10)), 1) if self.status == "active" else 0.0

        return {
            "id_veiculo":          self.bus_id,
            "velocidade_atual":    speed,
            "lat":                 round(self.lat, 6),
            "lon":                 round(self.lon, 6),
            "passageiros":         self.passengers,
            "estado":              self.status,
            "proxima_paragem":     self.next_stop_name(),
            "paragens_restantes":  self.stops_remaining(),
            "timestamp_leitura":   datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
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

    # 2. Esperar até existirem autocarros com rota atribuída
    buses_with_route = []
    while not buses_with_route:
        buses_data = api_get("/api/v1/buses") or []
        buses_with_route = [b for b in buses_data if b.get("routeId") and b.get("status") != "STOPPED"]
        if buses_with_route:
            break
        print(f"[SIM] Nenhum autocarro com rota encontrado. A aguardar 30s...")
        time.sleep(30)

    print(f"[SIM] {len(buses_with_route)} autocarros com rota atribuída encontrados")

    # 3. Para cada autocarro, buscar a rota com paragens e calcular segmentos OSRM
    sim_buses = []
    route_cache = {}  # cache de segmentos por route_id

    for bus in buses_with_route:
        route_id = bus['routeId']
        route = api_get(f"/api/v1/routes/{route_id}")
        if not route or not route.get("stops") or len(route["stops"]) < 2:
            print(f"[SIM] {bus['busCode']}: rota {route_id} sem paragens suficientes, ignorado")
            continue

        stops = sorted(route["stops"], key=lambda s: s["stopOrder"])

        # Usar cache local, ou carregar da DB, ou calcular via OSRM
        if route_id not in route_cache:
            print(f"[SIM] A carregar segmentos para {route['name']} ({route['code']})...")
            route_cache[route_id] = load_segments(route_id, stops)

        sim = SimBus(bus, route, route_cache[route_id])
        sim_buses.append(sim)
        print(f"[SIM] {bus['busCode']} -> {route['name']} ({route['code']}) — {len(stops)} paragens, capacidade {sim.capacity}")

    if not sim_buses:
        print("[SIM] ERRO: Nenhum autocarro válido para simular.")
        return

    # 4. Ligar ao MQTT
    client = mqtt_client.Client(mqtt_client.CallbackAPIVersion.VERSION2, client_id="pgu-simulator")

    def on_connect(c, userdata, flags, rc, properties=None):
        if rc == 0:
            print(f"[SIM] Ligado ao broker MQTT ({BROKER}:{PORT})")
        else:
            print(f"[SIM] Falha na ligação MQTT. Código: {rc}")

    client.on_connect = on_connect
    client.connect(BROKER, PORT)
    client.loop_start()

    print(f"[SIM] A simular {len(sim_buses)} autocarros a cada {INTERVAL}s no tópico '{TOPIC}'")
    print("=" * 50)

    # 5. Loop principal — verifica novos autocarros a cada 60s
    active_bus_codes = {b.bus_id for b in sim_buses}
    CHECK_NEW_EVERY = 10  # segundos
    last_check = time.time()

    while True:
        # Verificar novos autocarros e atualizar status periodicamente
        if time.time() - last_check >= CHECK_NEW_EVERY:
            last_check = time.time()
            buses_data = api_get("/api/v1/buses") or []

            # Atualizar db_status dos autocarros existentes
            bus_status_map = {b["busCode"]: b.get("status", "ACTIVE") for b in buses_data}
            for sim in sim_buses:
                if sim.bus_id in bus_status_map:
                    sim.db_status = bus_status_map[sim.bus_id]
                    # Se foi descomissionado/parado no backoffice, marcar para remover
                    if sim.db_status == "STOPPED":
                        sim.removed = True
                        print(f"[SIM] {sim.bus_id} PARADO via backoffice")

            # Detetar novos autocarros (inclui reativados, pois são removidos de active_bus_codes ao parar)
            new_buses = [b for b in buses_data if b.get("routeId") and b["busCode"] not in active_bus_codes and b.get("status") == "ACTIVE"]

            for bus in new_buses:
                route_id = bus['routeId']
                route = api_get(f"/api/v1/routes/{route_id}")
                if not route or not route.get("stops") or len(route["stops"]) < 2:
                    continue

                stops = sorted(route["stops"], key=lambda s: s["stopOrder"])
                if route_id not in route_cache:
                    print(f"[SIM] A carregar segmentos para {route['name']} ({route['code']})...")
                    route_cache[route_id] = load_segments(route_id, stops)

                sim = SimBus(bus, route, route_cache[route_id])
                sim_buses.append(sim)
                active_bus_codes.add(bus["busCode"])
                print(f"[SIM] + NOVO: {bus['busCode']} -> {route['name']} ({route['code']}) — {len(stops)} paragens")

        for bus in sim_buses:
            if bus.removed:
                continue

            bus.tick()

            # Não enviar telemetria se foi removido neste tick
            if bus.removed:
                continue

            payload = bus.to_telemetry()
            client.publish(TOPIC, json.dumps(payload))

            stop_name = bus._current_stop().get("stopName", "?")
            symbol = "[]" if bus.status == "stopped" else "->"
            flag = " [STOPPING]" if bus.db_status == "STOPPING" else ""
            print(f"[SIM] {symbol} {bus.bus_id} | {bus.route['code']} | {bus.status:7s} | {payload['velocidade_atual']:5.1f}km/h | {bus.passengers:2d} pax | {stop_name}{flag}")

        # Remover autocarros parados/descomissionados da lista
        removed_buses = [bus for bus in sim_buses if bus.removed]
        for bus in removed_buses:
            active_bus_codes.discard(bus.bus_id)
        sim_buses = [bus for bus in sim_buses if not bus.removed]

        if len(sim_buses) == 0:
            print(f"[SIM] Nenhum autocarro ativo. A aguardar novos autocarros...")

        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
