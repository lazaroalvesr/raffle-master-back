import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { CreateTicketDTO } from '../dto/ticket/CreateTicketDTO';
import { PrismaService } from '../prisma/prisma.service';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import * as cron from 'node-cron';

const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

const client = new MercadoPagoConfig({
    accessToken: ACCESS_TOKEN,
});
const payment = new Payment(client);

@Injectable()
export class TicketService {
    private readonly logger = new Logger(TicketService.name);

    constructor(private prismaService: PrismaService) { }

    async create(body: CreateTicketDTO): Promise<{ paymentDetails: any; generatedNumbers: number[] }> {

        const getRandomAvailableTickets = async (
            prisma: PrismaService,
            raffleId: string,
            quantity: number
        ): Promise<number[]> => {
            // Buscar todos os tickets disponíveis
            const availableTickets = await prisma.availableTicket.findMany({
                where: {
                    raffleId: raffleId,
                    isReserved: false,
                    isPurchased: false,
                },
                select: {
                    ticketNumber: true,
                },
            });

            if (availableTickets.length < quantity) {
                throw new Error('Não há tickets suficientes disponíveis');
            }

            // Embaralhar os tickets disponíveis (algoritmo Fisher-Yates)
            const shuffledTickets = availableTickets.map(t => t.ticketNumber);
            for (let i = shuffledTickets.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffledTickets[i], shuffledTickets[j]] = [shuffledTickets[j], shuffledTickets[i]];
            }

            // Pegar a quantidade solicitada de tickets
            return shuffledTickets.slice(0, quantity);
        };


        return this.prismaService.$transaction(async (prisma) => {
            const raffle = await prisma.raffle.findUnique({
                where: { id: body.raffleId },
                select: {
                    endDate: true,
                    id: true,
                    ticketPrice: true,
                    description: true,
                    AvailableTicket: {
                        where: {
                            isReserved: false,
                            isPurchased: false
                        },
                        select: { ticketNumber: true },
                    },
                },
            });



            if (!raffle) {
                throw new BadRequestException('Raffle not found.');
            }

            if (new Date() > raffle.endDate) {
                throw new BadRequestException('Raffle has ended. Tickets can no longer be purchased.');
            }

            const pricePerTicket = parseFloat(raffle.ticketPrice);
            const quantity = body.quantity;
            const priceTotal = pricePerTicket * quantity;

            const increments = [1, 5, 10, 20];
            if (!increments.includes(quantity)) {
                throw new BadRequestException('Invalid quantity. Must be in increments of 1, 5, 10, or 20.');
            }

            if (raffle.AvailableTicket.length < quantity) {
                throw new BadRequestException('Not enough available tickets.');
            }

            const expirationDate = new Date();
            expirationDate.setMinutes(expirationDate.getMinutes() + 10);
            this.logger.log(`Payment expiration date: ${expirationDate.toISOString()}`);

            const generatedNumbers = raffle.AvailableTicket.slice(0, quantity).map((ticket) => ticket.ticketNumber);

            const uniqueIdempotencyKey = `key-${Date.now()}-${Math.random()}`;
            this.logger.log(`Idempotency key: ${uniqueIdempotencyKey}`);


            try {
                // Gerar números aleatórios antes da transação principal
                const generatedNumbers = await getRandomAvailableTickets(
                    this.prismaService,
                    body.raffleId,
                    body.quantity
                );

                const result = await this.prismaService.$transaction(async (prisma) => {
                    // Verificar se os tickets ainda estão disponíveis
                    const availableCount = await prisma.availableTicket.count({
                        where: {
                            raffleId: body.raffleId,
                            ticketNumber: { in: generatedNumbers },
                            isReserved: false,
                            isPurchased: false
                        }
                    });

                    if (availableCount !== generatedNumbers.length) {
                        throw new Error('Alguns tickets selecionados já não estão mais disponíveis');
                    }

                    // Reservar os tickets temporariamente
                    await prisma.availableTicket.updateMany({
                        where: {
                            raffleId: body.raffleId,
                            ticketNumber: { in: generatedNumbers },
                            isReserved: false,
                            isPurchased: false
                        },
                        data: {
                            isReserved: true,
                        },
                    });

                    // Criar pagamento
                    const paymentResponse = await payment.create({
                        body: {
                            transaction_amount: priceTotal,
                            description: raffle.description,
                            payment_method_id: "pix",
                            notification_url: "https://raffle-master-back.vercel.app/notification",
                            payer: {
                                email: body.email,
                            },
                            date_of_expiration: expirationDate.toISOString(),
                        },
                        requestOptions: { idempotencyKey: uniqueIdempotencyKey },
                    });

                    const pixUrl = paymentResponse.point_of_interaction.transaction_data.ticket_url;

                    // Salvar pagamento
                    const newPayment = await prisma.payment.create({
                        data: {
                            transactionId: String(paymentResponse.id),
                            userId: body.userId,
                            raffleId: body.raffleId,
                            amount: priceTotal,
                            paymentMethod: 'pix',
                            status: 'pending',
                            payerEmail: body.email,
                            ticketNumbers: generatedNumbers,
                            pixUrl,
                        },
                    });

                    return { paymentDetails: newPayment, generatedNumbers };
                });

                return result;
            } catch (error) {
                // Se algo der errado, liberar os tickets
                if (generatedNumbers) {
                    await this.prismaService.$transaction(async (prisma) => {
                        await prisma.availableTicket.updateMany({
                            where: {
                                raffleId: body.raffleId,
                                ticketNumber: { in: generatedNumbers }
                            },
                            data: {
                                isReserved: false,
                                reservedUntil: null
                            },
                        });
                    });
                }
            }
        });
    }


    async handlePaymentApproved(paymentId: string) {
        await this.prismaService.$transaction(async (prisma) => {
            const payment = await prisma.payment.findUnique({
                where: { id: paymentId }
            });

            if (!payment) throw new BadRequestException('Payment not found.');

            await prisma.ticket.createMany({
                data: payment.ticketNumbers.map((number) => ({
                    userId: payment.userId,
                    raffleId: payment.raffleId,
                    number,
                })),
                skipDuplicates: true,
            });

            await prisma.payment.update({
                where: { id: paymentId },
                data: { status: 'approved' }
            });

            await prisma.availableTicket.updateMany({
                where: {
                    raffleId: payment.raffleId,
                    ticketNumber: { in: payment.ticketNumbers }
                },
                data: {
                    isPurchased: true,
                    isReserved: false,
                    reservedUntil: null
                },
            });
        });
    }

    async handlePaymentNotApproved(paymentId: string) {
        await this.prismaService.$transaction(async (prisma) => {
            const payment = await prisma.payment.findUnique({
                where: { id: paymentId },
                select: { raffleId: true, ticketNumbers: true }
            });

            if (!payment) throw new BadRequestException('Payment not found.');

            await prisma.availableTicket.updateMany({
                where: {
                    raffleId: payment.raffleId,
                    ticketNumber: { in: payment.ticketNumbers }
                },
                data: {
                    isReserved: false,
                    reservedUntil: null
                },
            });

            await prisma.payment.update({
                where: { id: paymentId },
                data: { status: 'cancelled' },
            });
        });
    }







    async getByIdTicket(userId: string) {
        const result = await this.prismaService.ticket.findFirst({
            where: { userId: userId },
            include: {
                user: {
                    select: {
                        name: true
                    }
                },
                raffle: {
                    select: {
                        name: true,
                        _count: true,
                    }
                },
            }
        });


        return result;
    }

}


