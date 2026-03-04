import requests
import time
import random
import json

# O endereço do Orion Context Broker local
ORION_URL = "http://localhost:1026/ngsi-ld/v1/entities"

# 1. Definir o payload do Autocarro no formato NGSI-LD
autocarro_id = "urn:ngsi-ld:Vehicle:BusTUB-001"

payload_criacao = {
    "id": autocarro_id,
    "type": "Vehicle",
    "category": {
        "type": "Property",
        "value": ["bus"]
    },
    "passengerCount": {
        "type": "Property",
        "value": 0
    },
    "@context": [
        "https://smartdatamodels.org/context.jsonld"
    ]
}

headers = {
    "Content-Type": "application/ld+json"
}

# 2. Registar o autocarro no Orion
print(f"A registar o autocarro {autocarro_id} no Orion...")
response = requests.post(ORION_URL, json=payload_criacao, headers=headers)

if response.status_code == 201:
    print("Autocarro criado com sucesso!")
elif response.status_code == 409:
    print("O autocarro já existe. Vamos atualizar os dados.")
else:
    print(f"Erro ao criar: {response.text}")

# 3. Simular a viagem (atualizar passageiros de 5 em 5 segundos)
print("\nA iniciar simulação de viagem...")
try:
    while True:
        # Simula pessoas a entrar (0 a 5) e a sair (0 a 3)
        passageiros_atuais = random.randint(10, 50)
        
        # Payload de atualização NGSI-LD
        payload_atualizacao = {
            "passengerCount": {
                "type": "Property",
                "value": passageiros_atuais
            },
            "@context": [
                "https://smartdatamodels.org/context.jsonld"
            ]
        }
        
        update_url = f"{ORION_URL}/{autocarro_id}/attrs"
        res = requests.patch(update_url, json=payload_atualizacao, headers=headers)
        
        print(f"Lotação atualizada: {passageiros_atuais} passageiros. (Status: {res.status_code})")
        time.sleep(5) # Espera 5 segundos até à próxima paragem

except KeyboardInterrupt:
    print("\nSimulação terminada pelo utilizador.")