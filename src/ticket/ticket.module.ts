import { Module } from '@nestjs/common';
import { TicketService } from './ticket.service';
import { TicketController } from './ticket.controller';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentService } from '../payment/payment.service';

@Module({
  providers: [TicketService, PrismaService, PaymentService],
  controllers: [TicketController]
})
export class TicketModule {}
