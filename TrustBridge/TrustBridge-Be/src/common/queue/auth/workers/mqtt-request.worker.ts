import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';

import { Job } from 'bullmq';
import { MqttService } from 'src/modules/mqtt/mqtt.service';

import { QUEUE_MQTT_REQUEST, JOB_MQTT_REQUEST } from '../constant';
import { MqttRequestJobData } from '../types';


@Processor(QUEUE_MQTT_REQUEST, { concurrency: 30 })
export class MqttRequestWorker extends WorkerHost {
    private readonly logger = new Logger(MqttRequestWorker.name);

    constructor(private readonly mqttService: MqttService) {
        super();
    }

    async process(job: Job<MqttRequestJobData>): Promise<any> {
        this.logger.log(`INFO::MqttRequestWorker::process::Processing MQTT request job ${job.id}`);
        if (job.name !== JOB_MQTT_REQUEST) return;
        const { tid, action, msgType, payload, credentials } = job.data
        this.logger.log(`INFO::MqttRequestWorker::process::Processing MQTT request job ${job.id} for TID=${tid}, Action=${action}, MsgType=${msgType}, Payload=${JSON.stringify(payload)}, Credentials=${JSON.stringify(credentials)}`);
        const result = await this.mqttService.request(tid, action, msgType, payload, credentials);
        this.logger.log(`INFO::MqttRequestWorker::process::MQTT request job ${job.id} completed`);
        return result;
    }

    @OnWorkerEvent('failed')
    onFailed(job: Job<MqttRequestJobData>, err: Error) {
        this.logger.error(`ERROR::MqttRequestWorker::onFailed::MQTT request job ${job.id} failed: ${err.message}`);
    }
}