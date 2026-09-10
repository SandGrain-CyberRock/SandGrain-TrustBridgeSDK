import { Module } from "@nestjs/common";

import { TraceLogModule } from "src/common/trace-logs/trace-log.module";

import { MqttService } from "./mqtt.service";

@Module({
  imports: [TraceLogModule],
  providers: [MqttService],
  exports: [MqttService],
})
export class MqttModule { }
