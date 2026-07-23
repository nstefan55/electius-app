-- AlterTable
ALTER TABLE "elections" ADD COLUMN     "adminTurnoutReminder" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sealedResults" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "vote_options" ADD COLUMN     "description" TEXT;
