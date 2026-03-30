"""
DAG — Carga diária de dados GTFS dos TUB.
Descarrega o feed GTFS e sincroniza paragens e rotas com o backend.
"""

from airflow import DAG
from airflow.operators.python import PythonOperator
from datetime import datetime, timedelta
import subprocess
import sys

default_args = {
    "owner": "pgu",
    "retries": 2,
    "retry_delay": timedelta(minutes=5),
}

def run_gtfs_loader():
    result = subprocess.run(
        [sys.executable, "/opt/airflow/scripts/gtfs_loader.py"],
        capture_output=True, text=True
    )
    print(result.stdout)
    if result.returncode != 0:
        print(result.stderr)
        raise Exception(f"GTFS loader falhou com código {result.returncode}")

with DAG(
    dag_id="gtfs_tub_sync",
    description="Sincroniza paragens e rotas dos TUB via GTFS",
    default_args=default_args,
    schedule="0 4 * * *",  # Todos os dias às 04:00
    start_date=datetime(2026, 3, 28),
    catchup=False,
    tags=["gtfs", "tub", "etl"],
) as dag:

    load_gtfs = PythonOperator(
        task_id="load_gtfs_data",
        python_callable=run_gtfs_loader,
    )
