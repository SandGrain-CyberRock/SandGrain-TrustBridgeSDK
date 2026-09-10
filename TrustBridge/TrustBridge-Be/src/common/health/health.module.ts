import { Module } from '@nestjs/common';

import { MqttModule } from 'src/modules/mqtt/mqtt.module';

import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { QueuesModule } from '../queue/auth/queues.module';


@Module({
  imports: [MqttModule, QueuesModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule { }
