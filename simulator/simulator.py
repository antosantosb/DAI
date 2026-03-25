import json
import time
import random
import os
from datetime import datetime, timezone
from paho.mqtt import client as mqtt_client

# ==========================================
# CONFIGURAÇÃO
# ==========================================
BROKER   = os.getenv("MQTT_BROKER", "mosquitto")
PORT     = int(os.getenv("MQTT_PORT", 1883))
TOPIC    = os.getenv("MQTT_TOPIC", "tub/telemetry")
INTERVAL = float(os.getenv("INTERVAL_SECONDS", 5))

# Frota simulada — autocarros de Braga
BUSES = [
    {"id": "bus001", "route": "Linha 1", "lat_base": 41.5508, "lon_base": -8.4284},
    {"id": "bus002", "route": "Linha 2", "lat_base": 41.5490, "lon_base": -8.4260},
    {"id": "bus003", "route": "Linha 3", "lat_base": 41.5520, "lon_base": -8.4300},
    {"id": "bus004", "route": "Linha 5", "lat_base": 41.5550, "lon_base": -8.4350},
    {"id": "bus005", "route": "Linha 7", "lat_base": 41.5470, "lon_base": -8.4200},
]

def generate_telemetry(bus):
    status = random.choices(
        ["active", "stopped", "delayed"],
        weights=[70, 20, 10]
    )[0]
    speed = round(random.uniform(0, 60), 1) if status == "active" else 0.0

    return {
        "id_veiculo":        bus["id"],
        "velocidade_atual":  speed,
        "lat":               round(bus["lat_base"] + random.uniform(-0.01, 0.01), 6),
        "lon":               round(bus["lon_base"] + random.uniform(-0.01, 0.01), 6),
        "passageiros":       random.randint(0, 60),
        "estado":            status,
        "timestamp_leitura": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    }

def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        print(f"[SIM] Ligado ao broker MQTT ({BROKER}:{PORT})")
    else:
        print(f"[SIM] Falha na ligação. Código: {rc}")

client = mqtt_client.Client(mqtt_client.CallbackAPIVersion.VERSION2, client_id="pgu-simulator")
client.on_connect = on_connect
client.connect(BROKER, PORT)
client.loop_start()

print(f"[SIM] A simular {len(BUSES)} autocarros a cada {INTERVAL}s no tópico '{TOPIC}'")

while True:
    for bus in BUSES:
        payload = generate_telemetry(bus)
        client.publish(TOPIC, json.dumps(payload))
        print(f"[SIM] → {payload['id_veiculo']} | {payload['estado']} | {payload['velocidade_atual']}km/h | {payload['passageiros']} pax")
    time.sleep(INTERVAL)