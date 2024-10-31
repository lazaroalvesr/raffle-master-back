import { Controller, Post, Body, Headers, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../lib/public.decorator';
import axios from 'axios';

@Controller('notification')
export class WebhookController {
    private secretKey = process.env.MP_WEBHOOK_SECRET; // Ensure this is set correctly

    constructor(private readonly prismaService: PrismaService) {}

    @Public()
    @Post()
    async handleWebhook(@Body() body: any, @Headers() headers: any) {
        console.log('Received webhook headers:', headers); // Log the headers
        console.log('Received webhook body:', body); // Log the body to check its structure

        // Extracting the payment ID
        const paymentId = body.data?.id;

        // Validating if the payment ID is present
        if (!paymentId) {
            throw new BadRequestException('Payment ID not found in webhook body');
        }

        // Log for verification
        console.log('Fetching payment status for ID:', paymentId);

        // Configuring the call to the Mercado Pago API
        const config = {
            method: 'GET',
            url: `https://api.mercadopago.com/v1/payments/${paymentId}`,
            headers: {
                'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}` // Use the correct access token
            }
        };

        try {
            const response = await axios.request(config); // Make the API call
            
            // Check if the payment status exists
            const paymentStatus = response.data.status;
            console.log('Payment details:', paymentStatus); // Log the payment details

            if (!paymentStatus) {
                throw new BadRequestException('Payment status not found in response');
            }

            await this.prismaService.payment.update({
                where: { transactionId: paymentId },
                data: { status: paymentStatus }
            });

            if (paymentStatus === 'approved') {
                console.log("Payment approved! Proceed with awarding the prize.");
            }

        } catch (error) {
            if (error.response) {
                console.error('Error response status:', error.response.status);
                console.error('Error response data:', error.response.data);
                throw new BadRequestException(`Error fetching payment: ${error.response.data.message}`);
            } else {
                console.error('Error message:', error.message);
                throw new BadRequestException('Error fetching payment status');
            }
        }

        // Respond with success
        return { message: 'Webhook received and processed successfully' };
    }
}
