import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";

import { CyberRockService } from "./cyberRock.service";

@Module({
    imports: [HttpModule],
    providers: [CyberRockService],
    exports: [CyberRockService],
})
export class CyberRockModule { }
