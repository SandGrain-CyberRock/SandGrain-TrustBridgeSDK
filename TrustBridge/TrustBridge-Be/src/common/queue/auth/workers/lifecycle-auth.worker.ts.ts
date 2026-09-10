import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';

import { Job } from 'bullmq';
import { DeviceAuthService } from 'src/modules/device/device-auth.service';

import { JOB_LIFECYCLE_AUTH, QUEUE_LIFECYCLE_AUTH } from '../constant';

@Processor(QUEUE_LIFECYCLE_AUTH, { concurrency: 100 })
export class LifecycleAuthWorker extends WorkerHost {
    private readonly logger = new Logger(LifecycleAuthWorker.name);

    constructor(private readonly deviceAuthService: DeviceAuthService) {
        super();
    }

    async process(job: Job): Promise<void> {
        this.logger.log(`INFO::LifecycleAuthWorker::process::Processing lifecycle auth job ${job.id}`);
        if (job.name !== JOB_LIFECYCLE_AUTH) return;
        const { deviceId } = job.data;
        this.logger.debug(`INFO::LifecycleAuthWorker::process::Lifecycle auth job ${job.id} device=${deviceId}`);
        await this.deviceAuthService.processLifecycleAuthById(deviceId);
        this.logger.log(`INFO::LifecycleAuthWorker::process::Lifecycle auth job ${job.id} completed`);
    }

    @OnWorkerEvent('failed')
    onFailed(job: Job, err: Error) {
        this.logger.error(`ERROR::LifecycleAuthWorker::onFailed::Lifecycle auth job ${job.id} device=${job.data?.deviceId} failed: ${err.message}`);
    }
}