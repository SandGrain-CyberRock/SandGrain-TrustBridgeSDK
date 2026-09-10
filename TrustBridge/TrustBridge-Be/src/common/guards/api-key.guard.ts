import {
  CanActivate,
  ExecutionContext,
  Injectable,
  BadRequestException,
} from '@nestjs/common';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor() { }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    const apiKey = request.headers['X-Internal-Api-Key'] || request.headers['x-internal-api-key'];
    const validApiKey = process.env.INTERNAL_API_KEY

    if (!apiKey) {
      throw new BadRequestException('Missing API Key');
    }

    if (apiKey !== validApiKey) {
      throw new BadRequestException('Invalid API Key');
    }

    return true;
  }
}
