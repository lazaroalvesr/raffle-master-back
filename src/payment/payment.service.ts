import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class PaymentService {
    constructor(private prismaService: PrismaService) { }

    async getAll() {
        return await this.prismaService.payment.findMany()
    }

    async getById(userId: string) {
        const result= await this.prismaService.payment.findMany({
            where: { userId: userId },
            include: {
                raffle: {
                    select: {
                        _count: true,
                        tickets: true,
                        name: true,
                    }
                },
                user:{
                    select:{
                        name: true
                    }
                }
                
            }
        })

        return result
    }
}
