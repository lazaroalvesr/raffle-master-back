import { Module } from '@nestjs/common';
import { RaffleService } from './raffle.service';
import { RaffleController } from './raffle.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  providers: [RaffleService, PrismaService],
  controllers: [RaffleController]
})
export class RaffleModule {}
