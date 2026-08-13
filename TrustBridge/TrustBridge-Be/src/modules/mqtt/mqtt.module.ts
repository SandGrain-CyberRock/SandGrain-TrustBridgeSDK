import { Module } from "@nestjs/common";
import { MqttService } from "./mqtt.service";
import { TraceLogService } from "src/common/services/trace-log.service";

@Module({
  providers: [MqttService, TraceLogService],
  exports: [MqttService],
})
export class MqttModule { }
