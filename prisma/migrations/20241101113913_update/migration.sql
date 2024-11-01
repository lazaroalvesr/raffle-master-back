/*
  Warnings:

  - You are about to drop the column `availableTickets` on the `Raffle` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Raffle" DROP COLUMN "availableTickets";

-- CreateTable
CREATE TABLE "AvailableTicket" (
    "id" SERIAL NOT NULL,
    "raffleId" VARCHAR(255) NOT NULL,
    "ticketNumber" INTEGER NOT NULL,

    CONSTRAINT "AvailableTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AvailableTicket_raffleId_ticketNumber_key" ON "AvailableTicket"("raffleId", "ticketNumber");

-- AddForeignKey
ALTER TABLE "AvailableTicket" ADD CONSTRAINT "AvailableTicket_raffleId_fkey" FOREIGN KEY ("raffleId") REFERENCES "Raffle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
