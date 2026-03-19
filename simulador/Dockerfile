FROM python:3.12-slim
WORKDIR /app
RUN pip install paho-mqtt --break-system-packages
COPY simulator.py .
CMD ["python", "-u", "simulator.py"]