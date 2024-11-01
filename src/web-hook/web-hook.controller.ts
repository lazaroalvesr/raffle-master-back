import { Controller, Post, Body, Headers, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../lib/public.decorator';
import axios from 'axios';

@Controller('notification')
export class WebhookController {
    private secretKey = process.env.MP_WEBHOOK_SECRET;

    constructor(private readonly prismaService: PrismaService) {}

    // Adicione a função de log aqui
    private async logPaymentProcess(payment: any, status: string, tickets: number[]) {
        console.log('=== Payment Process Log ===');
        console.log('Payment ID:', payment.transactionId);
        console.log('New Status:', status);
        console.log('Affected Tickets:', tickets);
        console.log('Raffle ID:', payment.raffleId);
        
        // Log do estado atual dos tickets
        const ticketStates = await this.prismaService.availableTicket.findMany({
            where: {
                raffleId: payment.raffleId,
                ticketNumber: { in: tickets }
            },
            select: {
                ticketNumber: true,
                isReserved: true,
                isPurchased: true
            }
        });
        
        console.log('Ticket States:', ticketStates);
        console.log('========================');
    }

    @Public()
    @Post()
    async handleWebhook(@Body() body: any, @Headers() headers: any) {
        console.log('Received webhook headers:', headers);
        console.log('Received webhook body:', body);

        const paymentId = body.data?.id;

        if (!paymentId) {
            throw new BadRequestException('Payment ID not found in webhook body');
        }

        console.log('Fetching payment status for ID:', paymentId);

        const config = {
            method: 'GET',
            url: `https://api.mercadopago.com/v1/payments/${paymentId}`,
            headers: {
                'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`
            }
        };

        try {
            const response = await axios.request(config);
            const paymentStatus = response.data.status;
            console.log('Payment details:', paymentStatus);

            if (!paymentStatus) {
                throw new BadRequestException('Payment status not found in response');
            }

            await this.prismaService.$transaction(async (prisma) => {
                // Buscar o pagamento e seus tickets
                const payment = await prisma.payment.findUnique({
                    where: { transactionId: String(paymentId) }
                });

                if (!payment) {
                    throw new BadRequestException(`Payment not found: ${paymentId}`);
                }

                // Log antes da atualização
                await this.logPaymentProcess(payment, paymentStatus, payment.ticketNumbers);

                // Atualizar status do pagamento
                await prisma.payment.update({
                    where: { transactionId: String(paymentId) },
                    data: { status: paymentStatus }
                });

                // Atualizar tickets baseado no status
                if (paymentStatus === 'approved') {
                    console.log("Payment approved! Updating tickets...");
                    await prisma.availableTicket.updateMany({
                        where: {
                            raffleId: payment.raffleId,
                            ticketNumber: { in: payment.ticketNumbers }
                        },
                        data: {
                            isReserved: true,
                            isPurchased: true,
                        }
                    });

                    // Log após aprovação
                    await this.logPaymentProcess(payment, 'approved', payment.ticketNumbers);

                } else if (['cancelled', 'rejected', 'refunded', 'charged_back'].includes(paymentStatus)) {
                    console.log("Payment cancelled/rejected! Releasing tickets...");
                    await prisma.availableTicket.updateMany({
                        where: {
                            raffleId: payment.raffleId,
                            ticketNumber: { in: payment.ticketNumbers }
                        },
                        data: {
                            isReserved: false,
                            isPurchased: false,
                            reservedUntil: null,
                        }
                    });

                    // Log após cancelamento
                    await this.logPaymentProcess(payment, 'cancelled/rejected', payment.ticketNumbers);
                }
            });

            return { message: 'Webhook received and processed successfully' };

        } catch (error) {
            console.error('Error processing webhook:', error);
            
            if (error.response) {
                console.error('Error response status:', error.response.status);
                console.error('Error response data:', error.response.data);
                throw new BadRequestException(`Error fetching payment: ${error.response.data.message}`);
            } else {
                console.error('Error message:', error.message);
                throw new BadRequestException('Error fetching payment status');
            }
        }
    }
}