/*
  Warnings:

  - You are about to drop the column `fileName` on the `archives` table. All the data in the column will be lost.
  - You are about to drop the column `fileSize` on the `archives` table. All the data in the column will be lost.
  - You are about to drop the column `fileUrl` on the `archives` table. All the data in the column will be lost.
  - You are about to drop the column `url` on the `archives` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "archives" DROP COLUMN "fileName",
DROP COLUMN "fileSize",
DROP COLUMN "fileUrl",
DROP COLUMN "url";

-- AlterTable
ALTER TABLE "elections" ADD COLUMN     "reportGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "reportKey" TEXT,
ADD COLUMN     "reportLocale" TEXT;
