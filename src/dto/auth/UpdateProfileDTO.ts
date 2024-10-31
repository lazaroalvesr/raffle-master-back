import { IsEmail, IsOptional, IsString } from 'class-validator';

export class UpdateProfileDTO {
    
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsEmail()
    email?: string;

    @IsOptional()
    @IsString()
    profileImage?: Express.Multer.File | string;
}
