"""
GTFS Loader — Faz download dos dados GTFS dos TUB e alimenta o backend.
Carrega paragens, rotas e a associação rota↔paragens (com ordem).

Executar uma vez para popular a base de dados:
    python gtfs_loader.py
"""

import csv
import io
import os
import sys
import json
import zipfile
import urllib.request

# ==========================================
# CONFIGURAÇÃO
# ==========================================
GTFS_URL    = os.getenv("GTFS_URL", "https://www.tub.pt/developer/gtfs/feed/tub.zip")
BACKEND_URL = os.getenv("BACKEND_URL", "http://spring-boot-backend:8081")

# ==========================================
# HELPERS
# ==========================================
def api_post(endpoint, data):
    """POST JSON para o backend. Retorna (status_code, response_body)."""
    url = f"{BACKEND_URL}{endpoint}"
    body = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8")
    except Exception as e:
        return 0, str(e)


def download_gtfs():
    """Faz download do ZIP GTFS e retorna os ficheiros como dicionário."""
    print(f"[GTFS] A descarregar {GTFS_URL} ...")
    resp = urllib.request.urlopen(GTFS_URL)
    data = resp.read()
    print(f"[GTFS] Download completo ({len(data) / 1024:.0f} KB)")
    return zipfile.ZipFile(io.BytesIO(data))


def parse_csv(zf, filename):
    """Lê um CSV do ZIP e retorna lista de dicionários."""
    with zf.open(filename) as f:
        reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))
        return list(reader)


# ==========================================
# CARREGAR PARAGENS
# ==========================================
def load_stops(zf):
    """Carrega stops.txt → POST /api/v1/stops"""
    stops = parse_csv(zf, "stops.txt")
    print(f"[GTFS] {len(stops)} paragens encontradas")

    created = 0
    errors = 0
    stop_id_map = {}  # GTFS stop_id → backend stop id

    for stop in stops:
        dto = {
            "name": stop["stop_name"].strip(),
            "code": f"P{stop['stop_id']}",
            "latitude": float(stop["stop_lat"]),
            "longitude": float(stop["stop_lon"])
        }

        status, body = api_post("/api/v1/stops", dto)
        if status == 201:
            created += 1
            resp = json.loads(body)
            stop_id_map[stop["stop_id"]] = resp["id"]
        else:
            errors += 1
            if created == 0 and errors == 1:
                print(f"[GTFS]   Primeiro erro: {status} — {body[:200]}")

    print(f"[GTFS] Paragens: {created} criadas, {errors} erros")
    return stop_id_map


# ==========================================
# CONSTRUIR MAPA ROTA → PARAGENS (ORDENADAS)
# ==========================================
def build_route_stops_map(zf):
    """
    Usa trips.txt + stop_times.txt para mapear:
    route_id → [(stop_id, stop_sequence), ...] ordenados
    Pega apenas 1 trip por rota (direction_id=0) para evitar duplicados.
    Também retorna route_id → shape_id para associar shapes.
    """
    trips = parse_csv(zf, "trips.txt")
    stop_times = parse_csv(zf, "stop_times.txt")

    # Pegar 1 trip por rota (direction_id = 0, primeiro encontrado)
    route_trip = {}
    route_shape = {}  # route_id → shape_id
    for trip in trips:
        rid = trip["route_id"]
        direction = trip.get("direction_id", "0")
        if rid not in route_trip and direction == "0":
            route_trip[rid] = trip["trip_id"]
            shape_id = trip.get("shape_id", "").strip()
            if shape_id:
                route_shape[rid] = shape_id

    # Para rotas que só têm direction_id=1
    for trip in trips:
        rid = trip["route_id"]
        if rid not in route_trip:
            route_trip[rid] = trip["trip_id"]
            shape_id = trip.get("shape_id", "").strip()
            if shape_id and rid not in route_shape:
                route_shape[rid] = shape_id

    selected_trips = set(route_trip.values())

    # Mapear trip_id → route_id
    trip_to_route = {v: k for k, v in route_trip.items()}

    # Construir route_id → [(stop_id, sequence)]
    route_stops = {}
    for st in stop_times:
        if st["trip_id"] in selected_trips:
            rid = trip_to_route[st["trip_id"]]
            if rid not in route_stops:
                route_stops[rid] = []
            route_stops[rid].append((st["stop_id"], int(st["stop_sequence"])))

    # Ordenar por sequence
    for rid in route_stops:
        route_stops[rid].sort(key=lambda x: x[1])

    return route_stops, route_shape


# ==========================================
# CARREGAR SHAPES DO GTFS
# ==========================================
def build_shapes_map(zf):
    """
    Lê shapes.txt e retorna shape_id → [[lat, lon], ...] ordenado por sequence.
    Estes são os percursos reais dos autocarros definidos pelos TUB.
    """
    if "shapes.txt" not in zf.namelist():
        print("[GTFS] shapes.txt não encontrado — será usado OSRM como fallback")
        return {}

    shapes_raw = parse_csv(zf, "shapes.txt")
    print(f"[GTFS] {len(shapes_raw)} pontos de shape encontrados")

    # Detectar nomes das colunas (podem ter espaços)
    if shapes_raw:
        sample = shapes_raw[0]
        lat_key = next((k for k in sample.keys() if "lat" in k.lower()), None)
        lon_key = next((k for k in sample.keys() if "lon" in k.lower()), None)
        seq_key = next((k for k in sample.keys() if "sequence" in k.lower()), None)
        id_key = next((k for k in sample.keys() if "shape_id" in k.lower()), None)
    else:
        return {}

    # Agrupar por shape_id
    shapes = {}
    for row in shapes_raw:
        sid = row.get(id_key, "").strip()
        if not sid:
            continue
        if sid not in shapes:
            shapes[sid] = []
        try:
            lat = float(row[lat_key].strip())
            lon = float(row[lon_key].strip())
            seq = int(row[seq_key].strip()) if seq_key and row.get(seq_key, "").strip() else len(shapes[sid])
            shapes[sid].append((seq, lat, lon))
        except (ValueError, TypeError):
            continue

    # Ordenar por sequence e converter para [[lat, lon], ...]
    result = {}
    for sid, points in shapes.items():
        points.sort(key=lambda x: x[0])
        result[sid] = [[p[1], p[2]] for p in points]

    print(f"[GTFS] {len(result)} shapes processados")
    return result


# ==========================================
# CARREGAR ROTAS
# ==========================================
def load_routes(zf, stop_id_map, route_stops_map, route_shape_map, shapes_map):
    """Carrega routes.txt → POST /api/v1/routes (com paragens e shapes GTFS)"""
    routes = parse_csv(zf, "routes.txt")
    print(f"[GTFS] {len(routes)} rotas encontradas")

    # Cores para as rotas (cicla por estas)
    colors = ["#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4",
              "#42d4f4", "#f032e6", "#bfef45", "#fabed4", "#469990",
              "#dcbeff", "#9A6324", "#800000", "#aaffc3", "#808000",
              "#000075", "#a9a9a9"]

    created = 0
    errors = 0
    with_shape = 0
    route_id_map = {}  # GTFS route_id → backend route id

    for i, route in enumerate(routes):
        gtfs_route_id = route["route_id"]
        short_name = route.get("route_short_name", gtfs_route_id)

        # Construir lista de paragens para esta rota
        stops_list = []
        if gtfs_route_id in route_stops_map:
            for order, (stop_id, seq) in enumerate(route_stops_map[gtfs_route_id], 1):
                backend_stop_id = stop_id_map.get(stop_id)
                if backend_stop_id:
                    stops_list.append({
                        "stopId": backend_stop_id,
                        "stopOrder": order
                    })

        dto = {
            "name": route.get("route_long_name", f"Linha {short_name}").strip(),
            "code": f"L{short_name}",
            "color": colors[i % len(colors)],
            "stops": stops_list
        }

        # Incluir shape GTFS se disponível (percurso real do autocarro)
        shape_id = route_shape_map.get(gtfs_route_id)
        if shape_id and shape_id in shapes_map:
            dto["shapePoints"] = shapes_map[shape_id]
            with_shape += 1

        status, body = api_post("/api/v1/routes", dto)
        if status == 201:
            created += 1
            resp = json.loads(body)
            route_id_map[gtfs_route_id] = resp["id"]
        else:
            errors += 1
            if created == 0 and errors == 1:
                print(f"[GTFS]   Primeiro erro: {status} — {body[:200]}")

    print(f"[GTFS] Rotas: {created} criadas, {errors} erros")
    print(f"[GTFS] Shapes GTFS: {with_shape} rotas com percurso real dos TUB")
    if with_shape < created:
        print(f"[GTFS] {created - with_shape} rotas sem shape — segmentos OSRM serão usados como fallback")


# ==========================================
# MAIN
# ==========================================
def main():
    print("=" * 50)
    print("GTFS Loader — TUB Braga")
    print("=" * 50)

    zf = download_gtfs()

    # 1. Carregar paragens
    stop_id_map = load_stops(zf)

    if not stop_id_map:
        print("[GTFS] ERRO: Nenhuma paragem criada. Verifica se o backend está a correr.")
        sys.exit(1)

    # 2. Construir mapa rota → paragens + shapes
    route_stops_map, route_shape_map = build_route_stops_map(zf)
    print(f"[GTFS] {len(route_stops_map)} rotas com paragens mapeadas")
    print(f"[GTFS] {len(route_shape_map)} rotas com shape_id associado")

    # 3. Carregar shapes (percursos reais dos autocarros)
    shapes_map = build_shapes_map(zf)

    # 4. Carregar rotas (com paragens e shapes GTFS)
    load_routes(zf, stop_id_map, route_stops_map, route_shape_map, shapes_map)

    print("=" * 50)
    print("[GTFS] Carga completa!")
    print("=" * 50)


if __name__ == "__main__":
    main()
