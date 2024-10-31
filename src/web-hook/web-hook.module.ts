import { Module } from '@nestjs/common';
import { WebhookController } from './web-hook.controller';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  controllers: [WebhookController],
  providers: [PrismaService]
})
export class WebHookModule { }
