import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { CreateTicketDTO } from '../dto/ticket/CreateTicketDTO';
import { PrismaService } from '../prisma/prisma.service';
import { MercadoPagoConfig, Payment } from 'mercadopago';

const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

const client = new MercadoPagoConfig({
    accessToken: ACCESS_TOKEN,
});
const payment = new Payment(client);

@Injectable()
export class TicketService {
    private readonly logger = new Logger(TicketService.name);

    constructor(private readonly prismaService: PrismaService) { }

    async create(body: CreateTicketDTO) {
        const raffle = await this.prismaService.raffle.findUnique({
            where: { id: body.raffleId },
            select: { endDate: true },
        });

        if (!raffle) {
            throw new BadRequestException('Raffle not found.');
        }

        const currentDate = new Date();
        if (currentDate > raffle.endDate) {
            throw new BadRequestException('Raffle has ended. Tickets can no longer be purchased.');
        }

        const raffleTickPrice = await this.prismaService.raffle.findFirst({
            where: { id: body.raffleId },
            select: {
                ticketPrice: true,
                description: true,
                availableTickets: true,
                quantityNumbers: true,
            },
        });

        if (!raffleTickPrice) {
            throw new BadRequestException('Raffle ticket price not found.');
        }

        const pricePerTicket = parseFloat(raffleTickPrice.ticketPrice);
        const quantity = body.quantity;
        const priceTotal = pricePerTicket * quantity;

        const increments = [1, 5, 10, 20];
        if (!increments.includes(quantity)) {
            throw new BadRequestException('Invalid quantity. Must be in increments of 1, 5, 10, or 20.');
        }

        if (parseInt(raffleTickPrice.availableTickets, 10) < quantity) {
            throw new BadRequestException('Not enough available tickets.');
        }

        const expirationDate = new Date();
        expirationDate.setMinutes(expirationDate.getMinutes() + 30);
        this.logger.log(`Payment expiration date: ${expirationDate.toISOString()}`);

        const generatedNumbers = await this.generateUniqueRandomTicketNumbers(
            quantity,
            body.raffleId,
            parseInt(raffleTickPrice.quantityNumbers, 10)
        );

        try {
            const uniqueIdempotencyKey = `key-${Date.now()}-${Math.random()}`;
            this.logger.log(`Idempotency key: ${uniqueIdempotencyKey}`);

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

            const newPayment = await this.prismaService.payment.create({
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

            if (paymentResponse.status === 'approved') {
                const generatedNumbers = await this.generateUniqueRandomTicketNumbers(
                    quantity,
                    body.raffleId,
                    parseInt(raffleTickPrice.quantityNumbers, 10)
                );

                await Promise.all(generatedNumbers.map((number) =>
                    this.prismaService.ticket.create({
                        data: {
                            userId: body.userId,
                            raffleId: body.raffleId,
                            number: number,
                        },
                    })
                ));

                await this.prismaService.raffle.update({
                    where: { id: body.raffleId },
                    data: {
                        availableTickets: (parseInt(raffleTickPrice.availableTickets, 10) - quantity).toString(),
                    },
                });

                await this.prismaService.payment.update({
                    where: { id: newPayment.id },
                    data: {
                        status: 'approved',
                        ticketNumbers: generatedNumbers,
                    },
                });

                return { paymentDetails: paymentResponse, generatedNumbers };
            } else {
                this.logger.warn('Payment not approved, keeping status as pending.');
                return { paymentDetails: paymentResponse, status: 'pending' };
            }
        } catch (error) {
            this.logger.error('Payment failed:', error.response || error);
            throw new BadRequestException('Payment failed. Please try again.');
        }
    }


    private async generateUniqueRandomTicketNumbers(quantity: number, raffleId: string, maxNumber: number): Promise<number[]> {
        const existingTickets = await this.prismaService.ticket.findMany({
            where: { raffleId },
            select: { number: true },
        });

        const existingNumbers = new Set<number>(existingTickets.map(ticket => ticket.number));

        const possibleNumbers = Array.from({ length: maxNumber }, (_, i) => i + 1);
        const availableNumbers = possibleNumbers.filter(num => !existingNumbers.has(num));

        if (availableNumbers.length < quantity) {
            throw new BadRequestException('Not enough unique numbers available for tickets.');
        }

        this.shuffleArray(availableNumbers);
        return availableNumbers.slice(0, quantity);
    }

    private shuffleArray(array: number[]): void {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
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
