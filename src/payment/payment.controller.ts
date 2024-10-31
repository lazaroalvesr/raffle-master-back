import { Controller, Get, Param } from '@nestjs/common';
import { PaymentService } from './payment.service';

@Controller('payment')
export class PaymentController {
    constructor(private paymentService: PaymentService) { }

    @Get("getAll")
    async getAll() {
        return await this.paymentService.getAll()
    }
    
    @Get("getById/:id")
    async getById(@Param("id") id: string) {
        return await this.paymentService.getById(id)
    }
}
