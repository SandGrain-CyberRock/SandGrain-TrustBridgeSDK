import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';

import { Job } from 'bullmq';
import { DeviceAuthService } from 'src/modules/device/device-auth.service';

import { QUEUE_AUTH_TIMEOUT, JOB_AUTH_TIMEOUT } from '../constant';
import { AuthTimeoutJobData } from '../types';


@Processor(QUEUE_AUTH_TIMEOUT, { concurrency: 10 })
export class AuthTimeoutWorker extends WorkerHost {
    private readonly logger = new Logger(AuthTimeoutWorker.name);

    constructor(private readonly deviceAuthService: DeviceAuthService) {
        super();
    }

    async process(job: Job<AuthTimeoutJobData>): Promise<void> {
        this.logger.log(`INFO::AuthTimeoutWorker::process::Processing auth timeout job ${job.id}`);
        if (job.name !== JOB_AUTH_TIMEOUT) return;
        const { deviceId, attemptNumber } = job.data;
        this.logger.log(`INFO::AuthTimeoutWorker::process::Processing auth timeout job ${job.id} for deviceId=${deviceId}, attemptNumber=${attemptNumber}`);
        await this.deviceAuthService.handleAuthTimeout(deviceId, attemptNumber);
        this.logger.log(`INFO::AuthTimeoutWorker::process::Auth timeout job ${job.id} completed`);
    }

    @OnWorkerEvent('failed')
    onFailed(job: Job<AuthTimeoutJobData>, err: Error) {
        this.logger.error(`ERROR::AuthTimeoutWorker::onFailed::Auth timeout job ${job.id} failed: ${err.message}`);
    }
}