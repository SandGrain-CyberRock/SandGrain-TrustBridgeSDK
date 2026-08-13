import { Module } from "@nestjs/common";
import { MqttService } from "./mqtt.service";
import { TraceLogModule } from "src/common/trace-logs/trace-log.module";

@Module({
  imports: [TraceLogModule],
  providers: [MqttService],
  exports: [MqttService],
})
export class MqttModule { }
