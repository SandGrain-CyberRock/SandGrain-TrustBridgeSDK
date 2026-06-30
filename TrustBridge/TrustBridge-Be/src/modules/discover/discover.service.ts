import { Injectable } from '@nestjs/common';

export interface DiscoverPayload {
  be_url: string;
  mqtt_broker: string;
  mqtt_port: number;
  mqtt_user: string;
  mqtt_pass: string;
  mqtt_log_broker: string;
  mqtt_log_port: number;
}

@Injectable()
export class DiscoverService {
  build(hostIp: string): DiscoverPayload {
    const bePort = parseInt(process.env.PORT || '3000', 10);
    const mqttPort = parseInt(process.env.MQTT_EXTERNAL_PORT || '1883', 10);

    // be_url is the BASE URL of the BE — no /api suffix. Consumers that need
    // the /api prefix (FE axios paths, SDK curl calls) append it themselves.
    return {
      be_url: `http://${hostIp}:${bePort}/`,
      mqtt_broker: hostIp,
      mqtt_port: mqttPort,
      mqtt_user: process.env.MQTT_USER || '',
      mqtt_pass: process.env.MQTT_PASS || '',
      mqtt_log_broker: hostIp,
      mqtt_log_port: mqttPort,
    };
  }
}
