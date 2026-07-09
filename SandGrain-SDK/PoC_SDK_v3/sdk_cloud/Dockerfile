FROM python:3.12-slim

WORKDIR /app

COPY . /app

RUN pip install --no-cache-dir -e sandgrain_cloud_sdk

RUN pip install --no-cache-dir -r application_PoC_MQTT/requirements.txt

WORKDIR /app/application_PoC_MQTT

CMD ["python", "-m", "app.main"]
