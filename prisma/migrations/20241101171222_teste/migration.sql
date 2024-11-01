/*
  Warnings:

  - The primary key for the `AvailableTicket` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- DropForeignKey
ALTER TABLE "AvailableTicket" DROP CONSTRAINT "AvailableTicket_raffleId_fkey";

-- AlterTable
ALTER TABLE "AvailableTicket" DROP CONSTRAINT "AvailableTicket_pkey",
ADD COLUMN     "isPurchased" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isReserved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reservedUntil" TIMESTAMP(3),
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "raffleId" SET DATA TYPE TEXT,
ADD CONSTRAINT "AvailableTicket_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "AvailableTicket_id_seq";

-- AddForeignKey
ALTER TABLE "AvailableTicket" ADD CONSTRAINT "AvailableTicket_raffleId_fkey" FOREIGN KEY ("raffleId") REFERENCES "Raffle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
