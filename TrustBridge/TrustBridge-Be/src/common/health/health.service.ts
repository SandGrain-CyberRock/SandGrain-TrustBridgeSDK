import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';

import { Queue } from 'bullmq';
import { MqttService } from 'src/modules/mqtt/mqtt.service';
import { DataSource } from 'typeorm';

import { QUEUE_AUTH_TIMEOUT, QUEUE_LIFECYCLE_AUTH, QUEUE_LIFECYCLE_SCAN, QUEUE_MQTT_REQUEST, QUEUE_OFFLINE_DEVICE_AUTH, QUEUE_ONLINE_DEVICE_AUTH } from '../queue/auth/constant';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  constructor(
    private readonly dataSource: DataSource,
    private readonly mqttService: MqttService,
    @InjectQueue(QUEUE_LIFECYCLE_SCAN) private readonly lifecycleScanQueue: Queue,
    @InjectQueue(QUEUE_LIFECYCLE_AUTH) private readonly lifecycleAuthQueue: Queue,
    @InjectQueue(QUEUE_ONLINE_DEVICE_AUTH) private readonly onlineDeviceAuthQueue: Queue,
    @InjectQueue(QUEUE_OFFLINE_DEVICE_AUTH) private readonly offlineDeviceAuthQueue: Queue,
    @InjectQueue(QUEUE_AUTH_TIMEOUT) private readonly authTimeoutQueue: Queue,
    @InjectQueue(QUEUE_MQTT_REQUEST) private readonly mqttRequestQueue: Queue,
  ) { }

  async checkHealth() {
    this.logger.log(`INFO::HealthService::checkHealth::Checking health`);
    const [databaseStatus, mqttStatus, queuesStatus] = await Promise.all([
      this.checkDatabase(),
      this.checkMqtt(),
      this.checkQueues(),
    ]);

    this.logger.log(`SUCCESS::HealthService::checkHealth::Health is up`);
    return { database: databaseStatus, mqtt: mqttStatus, queues: queuesStatus };
  }


  private async checkDatabase() {
    try {
      this.logger.log(`INFO::HealthService::checkDatabase::Checking database`);
      await this.dataSource.query('SELECT 1');
      this.logger.log(`SUCCESS::HealthService::checkDatabase::Database is up`);
      return { status: 'up' };
    } catch (err: any) {
      this.logger.error(`ERROR::HealthService::checkDatabase::Database is down: ${err.message}`);
      return { status: 'down', message: err.message };
    }
  }

  private async checkMqtt() {
    try {
      this.logger.log(`INFO::HealthService::checkMqtt::Checking MQTT`);
      const connected = await this.mqttService.checkHealth();
      this.logger.log(`SUCCESS::HealthService::checkMqtt::MQTT is up`);
      return { status: connected ? 'up' : 'down' };
    } catch (err: any) {
      this.logger.error(`ERROR::HealthService::checkMqtt::MQTT is down: ${err.message}`);
      return { status: 'down', message: err.message };
    }
  }

  private async checkQueues() {
    const queues: Array<[string, Queue]> = [
      [QUEUE_LIFECYCLE_SCAN, this.lifecycleScanQueue],
      [QUEUE_LIFECYCLE_AUTH, this.lifecycleAuthQueue],
      [QUEUE_ONLINE_DEVICE_AUTH, this.onlineDeviceAuthQueue],
      [QUEUE_OFFLINE_DEVICE_AUTH, this.offlineDeviceAuthQueue],
      [QUEUE_AUTH_TIMEOUT, this.authTimeoutQueue],
      [QUEUE_MQTT_REQUEST, this.mqttRequestQueue],
    ];

    this.logger.log(`INFO::HealthService::checkQueues::Checking queues`);
    const entries = await Promise.all(
      queues.map(async ([name, queue]) => {
        try {
          await queue.getJobCounts();
          this.logger.log(`SUCCESS::HealthService::checkQueues::Queue ${name} is up`);
          return [name, { status: 'up' }] as const;
        } catch (err: any) {
          this.logger.error(`ERROR::HealthService::checkQueues::Queue ${name} is down: ${err.message}`);
          return [name, { status: 'down', message: err.message }] as const;
        }
      }),
    );

    this.logger.log(`SUCCESS::HealthService::checkQueues::Queues are up`);
    return Object.fromEntries(entries);
  }
}