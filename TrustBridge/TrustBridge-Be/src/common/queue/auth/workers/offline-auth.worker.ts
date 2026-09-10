import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';

import { Job } from 'bullmq';
import { DeviceAuthService } from 'src/modules/device/device-auth.service';

import { JOB_OFFLINE_DEVICE_AUTH, QUEUE_OFFLINE_DEVICE_AUTH } from '../constant';

@Processor(QUEUE_OFFLINE_DEVICE_AUTH, { concurrency: 100 })
export class OfflineAuthWorker extends WorkerHost {
    private readonly logger = new Logger(OfflineAuthWorker.name);

    constructor(private readonly deviceAuthService: DeviceAuthService) {
        super();
    }

    async process(job: Job): Promise<void> {
        this.logger.log(`INFO::OfflineAuthWorker::process::Processing offline device auth job ${job.id}`);
        if (job.name !== JOB_OFFLINE_DEVICE_AUTH) return;
        const { deviceId, offlineCw, offlineRw } = job.data;
        if (!deviceId || !offlineCw || !offlineRw) {
            this.logger.error(`ERROR::OfflineAuthWorker::process::Offline device auth job ${job.id} deviceId, offlineCw and offlineRw are required`);
            return;
        }
        this.logger.debug(`INFO::OfflineAuthWorker::process::Offline device auth job ${job.id} device=${deviceId}`);
        await this.deviceAuthService.processOfflineDeviceAuthViaQueue(deviceId, offlineCw, offlineRw);
        this.logger.log(`INFO::OfflineAuthWorker::process::Offline device auth job ${job.id} completed`);
    }

    @OnWorkerEvent('failed')
    onFailed(job: Job, err: Error) {
        this.logger.error(`ERROR::OfflineAuthWorker::onFailed::Offline device auth job ${job.id} device=${job.data?.deviceId} failed: ${err.message}`);
    }
}