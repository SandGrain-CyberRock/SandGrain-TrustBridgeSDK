import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';

import { Job } from 'bullmq';
import { DeviceAuthService } from 'src/modules/device/device-auth.service';

import { JOB_ONLINE_DEVICE_AUTH, QUEUE_ONLINE_DEVICE_AUTH } from '../constant';

@Processor(QUEUE_ONLINE_DEVICE_AUTH, { concurrency: 100 })
export class OnlineAuthWorker extends WorkerHost {
    private readonly logger = new Logger(OnlineAuthWorker.name);

    constructor(private readonly deviceAuthService: DeviceAuthService) {
        super();
    }

    async process(job: Job): Promise<void> {
        this.logger.log(`INFO::OnlineAuthWorker::process::Processing online device auth job ${job.id}`);
        if (job.name !== JOB_ONLINE_DEVICE_AUTH) return;
        const { deviceId } = job.data;
        if (!deviceId) {
            this.logger.error(`ERROR::OnlineAuthWorker::process::Online device auth job ${job.id} deviceId is required`);
            return;
        }
        this.logger.debug(`INFO::OnlineAuthWorker::process::Online device auth job ${job.id} device=${deviceId}`);
        await this.deviceAuthService.processOnlineDeviceAuthViaQueue(deviceId);
        this.logger.log(`INFO::OnlineAuthWorker::process::Online device auth job ${job.id} completed`);
    }

    @OnWorkerEvent('failed')
    onFailed(job: Job, err: Error) {
        this.logger.error(`ERROR::OnlineAuthWorker::onFailed::Online device auth job ${job.id} device=${job.data?.deviceId} failed: ${err.message}`);
    }
}