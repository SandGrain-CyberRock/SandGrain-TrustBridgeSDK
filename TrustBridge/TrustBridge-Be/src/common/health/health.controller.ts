// health.controller.ts
import { Controller, Get } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";

import { HealthCheckResponseDto } from "./dto/health-check-response.dto";
import { HealthService } from "./health.service";
import { Public } from "../../common/decorators";

@ApiTags("Health")
@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) { }

  @Public()
  @Get()
  @ApiOperation({
    summary: "Check system health",
    description:
      "Returns connection status for cache (Redis), database (MySQL), and the MQTT broker. Used by load balancers and uptime monitors — no auth required.",
  })
  @ApiResponse({
    status: 200,
    description: "Health check completed. Inspect individual service statuses in the response body.",
    type: HealthCheckResponseDto,
  })
  async checkHealth() {
    return this.healthService.checkHealth();
  }
}