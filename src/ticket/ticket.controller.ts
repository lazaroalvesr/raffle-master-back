import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { TicketService } from './ticket.service';
import { CreateTicketDTO } from '../dto/ticket/CreateTicketDTO';

@Controller('tickets')
export class TicketController {
    constructor(private readonly ticketService: TicketService) { }

    @Post("buy")
    async create(@Body() createTicketDTO: CreateTicketDTO) {
        return await this.ticketService.create(createTicketDTO);
    }

    @Get("getById/:id")
    async getById(@Param("id") id: string) {
        return await this.ticketService.getByIdTicket(id)
    }
}
