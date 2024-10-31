import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class RegisterDTO {

    @IsNotEmpty()
    @IsString()
    name: string;

    @IsNotEmpty()
    @IsEmail()
    email: string;

    @IsNotEmpty()
    @IsString()
    telephone: string

    @IsNotEmpty()
    @IsString()
    password: string;

}
