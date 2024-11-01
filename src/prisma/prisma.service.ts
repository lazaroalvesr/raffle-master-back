import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
    constructor() {
        super({
            datasources: {
                db: {}
            },
            log: ['query', 'info', 'warn', 'error'],
            transactionOptions: {
                maxWait: 10000, 
                timeout: 10000   
            }
        });
    }

    async onModuleInit() {
        try {
            await this.$connect();
            console.log('Conectado ao banco de dados com sucesso');
        } catch (error) {
            console.error('Erro ao conectar ao banco de dados', error);
            throw error;
        }
    }

    async onModuleDestroy() {
        await this.$disconnect();
    }
}