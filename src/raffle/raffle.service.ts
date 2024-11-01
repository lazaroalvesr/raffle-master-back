import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { CreateRaffleDTO } from '../dto/raffle/CreateDTO';
import { PrismaService } from '../prisma/prisma.service';
import { supabase } from '../supabaseClient';

@Injectable()
export class RaffleService {
    constructor(private readonly prismaService: PrismaService) { }

    async createRaffle(body: CreateRaffleDTO, image: Express.Multer.File) {
        const imageUrl = await this.uploadImage(body.userId, image);

        if (!imageUrl) {
            throw new BadRequestException('Failed to upload image.');
        }


        return this.prismaService.$transaction(async (prisma) => {
          const raffle = await prisma.raffle.create({
            data: {
              name: body.name,
              description: body.description,
              startDate: body.startDate,
              endDate: body.endDate,
              quantityNumbers: body.quantityNumbers,
              ticketPrice: body.ticketPrice,
              image: imageUrl,
              userId: body.userId,
            },
          });
      
          // Criar os bilhetes disponíveis em uma etapa separada
          const availableTickets = [];
          for (let i = 1; i <= parseInt(body.quantityNumbers); i++) {
            availableTickets.push({
              raffleId: raffle.id,
              ticketNumber: i,
            });
          }
      
          await prisma.availableTicket.createMany({
            data: availableTickets,
          });
      
          return raffle;
        });
      }

    private async uploadImage(id: string, profileImage: Express.Multer.File): Promise<string | null> {
        const uniqueFileName = `raffle${Date.now()}.png`;

        const { data: uploadData, error: uploadError } = await supabase
            .storage
            .from('raffle-img')
            .upload(`raffle/${id}/${uniqueFileName}`, profileImage.buffer, {
                contentType: profileImage.mimetype,
                upsert: true,
            });

        if (uploadError) {
            console.error(uploadError);
            return null;
        }

        const { data } = supabase
            .storage
            .from('raffle-img')
            .getPublicUrl(`raffle/${id}/${uniqueFileName}`);

        return data.publicUrl;
    }

    async getAll() {
        return await this.prismaService.raffle.findMany();
    }

    async getById(id: string) {
        return await this.prismaService.raffle.findUnique({
            where: {
                id
            }
        })
    }

    async drawWinner(raffleId: string) {
        const raffle = await this.prismaService.raffle.findUnique({
            where: { id: raffleId },
            include: { tickets: true },
        });

        if (!raffle) {
            throw new NotFoundException('Raffle not found.');
        }

        if (raffle.tickets.length === 0) {
            throw new BadRequestException('No tickets available for this raffle.');
        }

        const winnerIndex = Math.floor(Math.random() * raffle.tickets.length);
        const winnerTicket = raffle.tickets[winnerIndex];

        await this.prismaService.raffle.update({
            where: { id: raffleId },
            data: { winnerTicketId: winnerTicket.id },
        });

        return winnerTicket;
    }
}
