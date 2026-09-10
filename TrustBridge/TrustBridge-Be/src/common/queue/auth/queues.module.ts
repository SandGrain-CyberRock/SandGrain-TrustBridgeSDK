import { BullModule } from '@nestjs/bullmq';
import { forwardRef, Logger, Module, OnModuleInit } from '@nestjs/common';

import Redis from 'ioredis';
import { DeviceModule } from 'src/modules/device/device.module';
import { MqttModule } from 'src/modules/mqtt/mqtt.module';

import {
    QUEUE_AUTH_TIMEOUT,
    QUEUE_LIFECYCLE_AUTH,
    QUEUE_LIFECYCLE_SCAN,
    QUEUE_MQTT_REQUEST,
    QUEUE_OFFLINE_DEVICE_AUTH,
    QUEUE_ONLINE_DEVICE_AUTH,
} from './constant';
import { AuthTimeoutWorker } from './workers/auth-timeout.worker';
import { LifecycleAuthScanWorker } from './workers/lifecycle-auth-scan.worker';
import { LifecycleAuthWorker } from './workers/lifecycle-auth.worker.ts';
import { MqttRequestWorker } from './workers/mqtt-request.worker';
import { OfflineAuthWorker } from './workers/offline-auth.worker';
import { OnlineAuthWorker } from './workers/online-auth.worker';

@Module({
    imports: [
        BullModule.forRoot({
            connection: {
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT || '6379'),
                password: process.env.REDIS_PASSWORD || undefined,
            },
        }),
        BullModule.registerQueue(
            { name: QUEUE_LIFECYCLE_SCAN },
            { name: QUEUE_AUTH_TIMEOUT },
            { name: QUEUE_MQTT_REQUEST },
            { name: QUEUE_LIFECYCLE_AUTH },
            { name: QUEUE_ONLINE_DEVICE_AUTH },
            { name: QUEUE_OFFLINE_DEVICE_AUTH },
        ),
        forwardRef(() => DeviceModule),
        MqttModule
    ],
    providers: [LifecycleAuthScanWorker, AuthTimeoutWorker, MqttRequestWorker, LifecycleAuthWorker, OnlineAuthWorker, OfflineAuthWorker],
    exports: [BullModule],
})
export class QueuesModule implements OnModuleInit {
    private readonly logger = new Logger(QueuesModule.name);

    async onModuleInit(): Promise<void> {
        const host = process.env.REDIS_HOST || 'localhost';
        const port = parseInt(process.env.REDIS_PORT || '6379');
        const password = process.env.REDIS_PASSWORD || undefined;

        const redis = new Redis({ host, port, password, lazyConnect: true });

        try {
            await redis.connect();
            await redis.ping();
            this.logger.log(`Redis connected at ${host}:${port}`);
        } catch (err: any) {
            this.logger.error(`Redis connection failed at ${host}:${port} — ${err.message}`);
            process.exit(1); // hard stop, app cannot run without queues
        } finally {
            await redis.quit();
        }
    }
}