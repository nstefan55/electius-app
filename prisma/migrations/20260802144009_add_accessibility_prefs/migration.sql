-- AlterTable
ALTER TABLE "users" ADD COLUMN     "focusOutlines" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "highContrast" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "largerText" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reduceMotion" BOOLEAN NOT NULL DEFAULT false;
