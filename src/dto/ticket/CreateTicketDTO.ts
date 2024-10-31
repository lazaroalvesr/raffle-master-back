import { IsNotEmpty, IsString, IsNumber, IsEmail } from 'class-validator';
import { RegisterDTO } from '../auth/RegisterDto';
import { PartialType } from '@nestjs/mapped-types';

export class CreateTicketDTO extends PartialType(RegisterDTO) {
    @IsNotEmpty()
    @IsString()
    userId: string;

    @IsEmail()
    email: string;

    @IsNotEmpty()
    @IsString()
    raffleId: string;

    @IsNotEmpty()
    @IsNumber()
    quantity: number;

}
