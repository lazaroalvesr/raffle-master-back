import { Body, Controller, Get, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { RaffleService } from './raffle.service';
import { CreateRaffleDTO } from '../dto/raffle/CreateDTO';
import { FileInterceptor } from '@nestjs/platform-express';
import { AdminGuard } from '../lib/AdmGuard';
import { Public } from 'src/lib/public.decorator';

@Controller('raffle')
export class RaffleController {
    constructor(private readonly raffleService: RaffleService) { }

    @Post("create")
    @UseGuards(AdminGuard)
    @UseInterceptors(FileInterceptor('image'))
    async create(@Body() body: CreateRaffleDTO, @UploadedFile() image: Express.Multer.File) {
        return await this.raffleService.createRaffle(body, image);
    }

    @Public()
    @Get("getAll")
    async getAll() {
        return await this.raffleService.getAll()
    }

    @Public()
    @Get("getById/:id")
    async getById(@Param("id") id: string) {
        return await this.raffleService.getById(id)
    }

    @Post(':id/draw-winner')
    async drawWinner(@Param('id') raffleId: string) {
        const winnerTicket = await this.raffleService.drawWinner(raffleId);
        return { message: 'Winner drawn successfully', winnerTicket };
    }
}
