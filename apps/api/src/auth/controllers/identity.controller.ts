import { Controller, Get, Req, UnauthorizedException } from '@nestjs/common';
import type { IdentityRequest } from '../../infrastructure/http/google-access.guard';
@Controller('auth')
export class IdentityController {
  @Get('identity')
  identity(@Req() request: IdentityRequest) {
    if (!request.identity) throw new UnauthorizedException('Google認証が必要です。');
    return request.identity;
  }
}
