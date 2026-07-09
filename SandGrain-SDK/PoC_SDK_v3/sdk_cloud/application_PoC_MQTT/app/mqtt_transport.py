from __future__ import annotations

import json
import logging
from typing import Any, Callable, Optional

import paho.mqtt.client as mqtt

log = logging.getLogger("sandgrain-poc-cloud")


MessageHandler = Callable[[str, bytes], None]


class MQTTTransport:
    """
    Thin wrapper over Paho. Calls `on_message(topic, payload_bytes)` from Paho callback thread.
    """

    def __init__(
        self,
        *,
        host: str,
        port: int,
        username: Optional[str],
        password: Optional[str],
        on_message: MessageHandler,
        keepalive: int = 30,
    ) -> None:
        self._host = host
        self._port = port
        self._keepalive = keepalive
        self._on_message_cb = on_message

        self._client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
        self._client.on_connect = self._on_connect
        self._client.on_message = self._on_message
        self._client.on_disconnect = self._on_disconnect
        self._client.reconnect_delay_set(min_delay=1, max_delay=30) 

        if username:
            self._client.username_pw_set(username, password or "")

        # If you need mutual TLS, configure here, e.g.:
        # self._client.tls_set(ca_certs=..., certfile=..., keyfile=...)

    def start(self) -> None:
        self._client.connect(self._host, self._port, keepalive=self._keepalive)
        self._client.loop_start()
        log.info("MQTT started (loop thread).")

    def stop(self) -> None:
        try:
            self._client.disconnect()
        except Exception:
            pass
        try:
            self._client.loop_stop(force=True)
        except TypeError:
            self._client.loop_stop()
        log.info("MQTT stopped.")

    def publish(self, topic: str, body: dict, *, qos: int = 1) -> None:
        info = self._client.publish(topic, json.dumps(body, separators=(",", ":")), qos=qos)
        if info.rc != mqtt.MQTT_ERR_SUCCESS:
            log.error("Publish failed rc=%s topic=%s", info.rc, topic)

    def _on_disconnect(self, client, userdata, reason_code, properties=None):
        log.error("MQTT disconnected reason_code=%s", reason_code)
        
    def _on_connect(self, client, userdata, flags, reason_code, properties=None):
        if reason_code != 0:
            log.error("MQTT connection failed: %s", reason_code)
            return

        topic = "sandgrain/v1/+/req/+"
        client.subscribe(topic, qos=1)
        log.info("Subscribed to %s", topic)

    def _on_message(self, client, userdata, msg):
        try:
            self._on_message_cb(msg.topic, msg.payload)
        except Exception:
            log.exception("Unhandled exception in on_message callback (topic=%s)", msg.topic)
