import { Controller, Get, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../../common/decorators';
import { DiscoverService, DiscoverPayload } from './discover.service';

@ApiTags('Discover')
@Controller('discover')
export class DiscoverController {
  constructor(private readonly discoverService: DiscoverService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Discover BE + MQTT endpoints from this server',
    description:
      'Public endpoint used by Raspberry Pi devices/gateways to bootstrap their .env files. ' +
      'Returns BE URL and MQTT broker info derived from the request Host header (i.e. the LAN IP ' +
      'the caller used to reach this server) plus server-side port configuration. No auth required.',
  })
  @ApiResponse({
    status: 200,
    description: 'Discovery payload',
  })
  discover(@Req() req: Request): DiscoverPayload {
    const hostHeader = req.headers.host || '';
    const hostOnly = hostHeader.split(':')[0] || 'localhost';
    return this.discoverService.build(hostOnly);
  }
}
