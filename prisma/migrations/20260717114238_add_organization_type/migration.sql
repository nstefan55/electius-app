-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('UNIVERSITY', 'COMPANY', 'UNION', 'ASSOCIATION', 'OTHER');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "type" "OrganizationType";
