import { Module } from '@nestjs/common';
import { GoogleIdentityService } from './services/google-identity.service';
import { IdentityController } from './controllers/identity.controller';
@Module({ providers: [GoogleIdentityService], controllers: [IdentityController], exports: [GoogleIdentityService] })
export class AuthModule {}
