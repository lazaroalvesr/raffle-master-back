import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { CreateTicketDTO } from '../dto/ticket/CreateTicketDTO';
import { PrismaService } from '../prisma/prisma.service';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { PaymentService } from 'src/payment/payment.service';

const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

const client = new MercadoPagoConfig({
    accessToken: ACCESS_TOKEN,
});
const payment = new Payment(client);

@Injectable()
export class TicketService {
    private readonly logger = new Logger(TicketService.name);

    constructor(private prismaService: PrismaService, private paymentService: PaymentService) { }

    async create(body: CreateTicketDTO): Promise<{ paymentDetails: any; generatedNumbers: number[] }> {
        return this.prismaService.$transaction(async (prisma) => {
            const raffle = await prisma.raffle.findUnique({
                where: { id: body.raffleId },
                select: {
                    endDate: true,
                    id: true,
                    ticketPrice: true,
                    description: true,
                    AvailableTicket: {
                        select: { ticketNumber: true },
                    },
                },
            });

            if (!raffle) {
                throw new BadRequestException('Raffle not found.');
            }

            const currentDate = new Date();
            if (currentDate > raffle.endDate) {
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


            const raffleTickPrice = await this.prismaService.raffle.findFirst({
                where: { id: body.raffleId },
                select: {
                    ticketPrice: true,
                    description: true,
                    quantityNumbers: true,
                },
            });


            const expirationDate = new Date();
            expirationDate.setMinutes(expirationDate.getMinutes() + 30);
            this.logger.log(`Payment expiration date: ${expirationDate.toISOString()}`);

            const generatedNumbers = raffle.AvailableTicket.slice(0, quantity).map((ticket) => ticket.ticketNumber);

            const uniqueIdempotencyKey = `key-${Date.now()}-${Math.random()}`;
            this.logger.log(`Idempotency key: ${uniqueIdempotencyKey}`);

            try {
                const uniqueIdempotencyKey = `key-${Date.now()}-${Math.random()}`;
                this.logger.log(`Idempotency key: ${uniqueIdempotencyKey}`);

                const result = await this.prismaService.$transaction(async (prisma) => {
                    // 2. Remover números da lista de disponíveis (reservar)
                    await prisma.availableTicket.deleteMany({
                        where: {
                            raffleId: body.raffleId,
                            ticketNumber: { in: generatedNumbers }
                        },
                    });

                    // 3. Criar pagamento
                    const paymentResponse = await payment.create({
                        body: {
                            transaction_amount: priceTotal,
                            description: raffleTickPrice.description,
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

                    // 4. Salvar pagamento
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
                }, {
                    maxWait: 10000,
                    timeout: 10000
                });

                return result;
            } catch (error) {
                // Em caso de erro, restaurar números para disponíveis
                await this.prismaService.$transaction(async (prisma) => {
                    await prisma.availableTicket.createMany({
                        data: generatedNumbers.map(number => ({
                            raffleId: body.raffleId,
                            ticketNumber: number
                        })),
                        skipDuplicates: true
                    });

                    throw error;
                });
            }
        });
    }

    async handlePaymentApproved(paymentId: string) {
        await this.prismaService.$transaction(async (prisma) => {
            // Buscar o pagamento
            const payment = await prisma.payment.findUnique({
                where: { id: paymentId }
            });

            // Criar tickets apenas quando o pagamento for aprovado
            await prisma.ticket.createMany({
                data: payment.ticketNumbers.map((number) => ({
                    userId: payment.userId,
                    raffleId: payment.raffleId,
                    number,
                })),
                skipDuplicates: true,
            });

            // Atualizar status do pagamento
            await prisma.payment.update({
                where: { id: paymentId },
                data: { status: 'approved' }
            });
        });
    }


    // Método para retornar os tickets se o pagamento falhar (chamado pelo webhook)
    async handlePaymentNotApproved(paymentId: string) {
        await this.prismaService.$transaction(async (prisma) => {
            // Buscar o pagamento
            const payment = await prisma.payment.findUnique({
                where: { id: paymentId }
            });

            // Restaurar números para disponíveis
            await prisma.availableTicket.createMany({
                data: payment.ticketNumbers.map(number => ({
                    raffleId: payment.raffleId,
                    ticketNumber: number
                })),
                skipDuplicates: true
            });

            // Atualizar status do pagamento
            await prisma.payment.update({
                where: { id: paymentId },
                data: { status: 'cancelled' }
            });
        });
    }

    async generateAndSaveTicketNumbers(
        quantity: number,
        raffleId: string,
        maxNumber: number,
        userId: string,
    ): Promise<any> {
        return this.prismaService.$transaction(async (tx) => {
            const generatedNumbers = await this.generateUniqueRandomTicketNumbers(
                quantity,
                raffleId,
                maxNumber,
            );

            const tickets = await tx.ticket.createMany({
                data: generatedNumbers.map((number) => ({
                    number,
                    raffleId,
                    userId,
                })),
            });

            return tickets;
        });
    }



    private async generateUniqueRandomTicketNumbers(
        quantity: number,
        raffleId: string,
        maxNumber: number,
    ): Promise<number[]> {
        const existingTickets = await this.prismaService.ticket.findMany({
            where: { raffleId },
            select: { number: true },
        });

        const existingNumbers = new Set(existingTickets.map((ticket) => ticket.number));
        const generatedNumbers = new Set<number>();

        while (generatedNumbers.size < quantity) {
            const randomNumber = Math.floor(Math.random() * maxNumber) + 1;
            if (!existingNumbers.has(randomNumber)) {
                generatedNumbers.add(randomNumber);
            }
        }

        if (generatedNumbers.size < quantity) {
            throw new BadRequestException(
                'Not enough unique numbers available for tickets.',
            );
        }

        return Array.from(generatedNumbers);
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
