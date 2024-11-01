import { Injectable } from '@nestjs/common';
import MercadoPagoConfig, { Payment } from 'mercadopago';
import { PrismaService } from 'src/prisma/prisma.service';


const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const client = new MercadoPagoConfig({
    accessToken: ACCESS_TOKEN,
});
const payment = new Payment(client);

@Injectable()
export class PaymentService {
    constructor(private prismaService: PrismaService) { }

    async create(paymentData: any): Promise<any> {
        try {
            const paymentRes = await payment.create(paymentData);
            return paymentRes.additional_info;
        } catch (error) {
            console.error('Erro ao criar pagamento:', error);
            throw error; // Re-lance o erro para ser tratado pelo TicketService
        }
    }
    async getAll() {
        return await this.prismaService.payment.findMany()
    }

    async getById(userId: string) {
        const result = await this.prismaService.payment.findMany({
            where: { userId: userId },
            include: {
                raffle: {
                    select: {
                        _count: true,
                        tickets: true,
                        name: true,
                    }
                },
                user: {
                    select: {
                        name: true
                    }
                }

            }
        })

        return result
    }
}
