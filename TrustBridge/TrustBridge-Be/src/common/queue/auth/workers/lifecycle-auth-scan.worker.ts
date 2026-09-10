import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';

import { Job } from 'bullmq';
import { DeviceAuthService } from 'src/modules/device/device-auth.service';

import { QUEUE_LIFECYCLE_SCAN, JOB_LIFECYCLE_SCAN } from '../constant';

@Processor(QUEUE_LIFECYCLE_SCAN, { concurrency: 1 })
export class LifecycleAuthScanWorker extends WorkerHost {
    private readonly logger = new Logger(LifecycleAuthScanWorker.name);

    constructor(private readonly deviceAuthService: DeviceAuthService) {
        super();
    }

    async process(job: Job): Promise<void> {
        this.logger.log(`INFO::LifecycleAuthScanWorker::process::Processing lifecycle scan job ${job.id}`);
        if (job.name !== JOB_LIFECYCLE_SCAN) return;
        this.logger.log(`INFO::LifecycleAuthScanWorker::process::Processing lifecycle scan job ${job.id} for running lifecycle scan`);
        await this.deviceAuthService.runLifecycleAuthScan();
        this.logger.log(`INFO::LifecycleAuthScanWorker::process::Lifecycle scan job ${job.id} completed`);
    }

    @OnWorkerEvent('failed')
    onFailed(job: Job, err: Error) {
        this.logger.error(`ERROR::LifecycleAuthScanWorker::onFailed::Lifecycle scan job ${job.id} failed: ${err.message}`);
    }
}