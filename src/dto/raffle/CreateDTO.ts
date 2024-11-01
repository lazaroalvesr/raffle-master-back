import { IsNotEmpty, IsString } from 'class-validator';

export class CreateRaffleDTO {

    @IsNotEmpty()
    @IsString()
    name: string;

    @IsNotEmpty()
    @IsString()
    description: string;

    @IsNotEmpty()
    @IsString()
    startDate: Date;

    @IsNotEmpty()
    @IsString()
    endDate: Date;

    @IsNotEmpty()
    quantityNumbers: string

    @IsNotEmpty()
    ticketPrice: string

    @IsNotEmpty()
    @IsString()
    userId: string

}
