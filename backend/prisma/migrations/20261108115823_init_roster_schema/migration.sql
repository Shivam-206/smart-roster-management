-- CreateEnum
CREATE TYPE "CalendarType" AS ENUM ('ALL_365_DAYS', 'ALL_EXCEPT_PUBLIC_HOLIDAYS', 'ALL_EXCEPT_SUNDAYS_AND_PUBLIC_HOLIDAYS', 'CUSTOM');

-- CreateEnum
CREATE TYPE "AssignmentType" AS ENUM ('PRIMARY', 'SECONDARY_BACKUP', 'FLOAT');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('ANNUAL', 'SICK', 'CASUAL', 'COMP_OFF');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RosterStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RosterShiftStatus" AS ENUM ('WORKING', 'WEEKLY_OFF', 'LEAVE', 'COMP_OFF', 'HOLIDAY');

-- CreateEnum
CREATE TYPE "ShiftType" AS ENUM ('REGULAR', 'BACKUP_COVERAGE', 'OVERTIME');

-- CreateEnum
CREATE TYPE "ConflictSeverity" AS ENUM ('HARD_ERROR', 'SOFT_WARNING');

-- CreateEnum
CREATE TYPE "ConflictCategory" AS ENUM ('UNDER_COVERAGE', 'DOUBLE_BOOKING', 'LEAVE_COLLISION', 'MAX_CONSECUTIVE_DAYS', 'UNQUALIFIED_ASSIGNMENT', 'CALENDAR_INCONSISTENCY', 'SINGLE_POINT_FAILURE', 'UNEVEN_WORKLOAD');

-- CreateTable
CREATE TABLE "Pod" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "leadEmployeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'OPERATIONS_ASSOCIATE',
    "isPodLead" BOOLEAN NOT NULL DEFAULT false,
    "podId" TEXT,
    "contractType" TEXT NOT NULL DEFAULT 'FULL_TIME',
    "weeklyWorkDays" INTEGER NOT NULL DEFAULT 5,
    "maxConsecutiveDays" INTEGER NOT NULL DEFAULT 6,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "podId" TEXT NOT NULL,
    "isSingleResource" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Process" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "calendarType" "CalendarType" NOT NULL DEFAULT 'ALL_365_DAYS',
    "defaultMinStaff" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Process_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessCoverageRule" (
    "id" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "dateOverride" TEXT,
    "dayOfWeek" INTEGER,
    "requiredStaffCount" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessCoverageRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeProcessAssignment" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "assignmentType" "AssignmentType" NOT NULL DEFAULT 'PRIMARY',
    "priorityRank" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeProcessAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicHoliday" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isMandatoryOff" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeLeave" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "leaveType" "LeaveType" NOT NULL DEFAULT 'ANNUAL',
    "status" "LeaveStatus" NOT NULL DEFAULT 'APPROVED',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeLeave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeWeeklyOff" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "isStandard" BOOLEAN NOT NULL DEFAULT true,
    "specificDate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeWeeklyOff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Roster" (
    "id" TEXT NOT NULL,
    "monthYear" TEXT NOT NULL,
    "status" "RosterStatus" NOT NULL DEFAULT 'DRAFT',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Roster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RosterShift" (
    "id" TEXT NOT NULL,
    "rosterId" TEXT NOT NULL,
    "shiftDate" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "processId" TEXT,
    "status" "RosterShiftStatus" NOT NULL DEFAULT 'WORKING',
    "shiftType" "ShiftType" NOT NULL DEFAULT 'REGULAR',
    "isManualOverride" BOOLEAN NOT NULL DEFAULT false,
    "overrideReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RosterShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RosterConflict" (
    "id" TEXT NOT NULL,
    "rosterId" TEXT NOT NULL,
    "shiftDate" TEXT NOT NULL,
    "severity" "ConflictSeverity" NOT NULL,
    "category" "ConflictCategory" NOT NULL,
    "processId" TEXT,
    "employeeId" TEXT,
    "message" TEXT NOT NULL,
    "detailsJson" TEXT,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RosterConflict_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Pod_code_key" ON "Pod"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Pod_leadEmployeeId_key" ON "Pod"("leadEmployeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_employeeCode_key" ON "Employee"("employeeCode");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_email_key" ON "Employee"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_code_key" ON "Brand"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Process_code_key" ON "Process"("code");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeProcessAssignment_employeeId_processId_key" ON "EmployeeProcessAssignment"("employeeId", "processId");

-- CreateIndex
CREATE UNIQUE INDEX "PublicHoliday_date_key" ON "PublicHoliday"("date");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeWeeklyOff_employeeId_dayOfWeek_specificDate_key" ON "EmployeeWeeklyOff"("employeeId", "dayOfWeek", "specificDate");

-- CreateIndex
CREATE UNIQUE INDEX "Roster_monthYear_key" ON "Roster"("monthYear");

-- CreateIndex
CREATE INDEX "RosterShift_rosterId_shiftDate_idx" ON "RosterShift"("rosterId", "shiftDate");

-- CreateIndex
CREATE INDEX "RosterShift_employeeId_shiftDate_idx" ON "RosterShift"("employeeId", "shiftDate");

-- CreateIndex
CREATE UNIQUE INDEX "RosterShift_rosterId_shiftDate_employeeId_processId_key" ON "RosterShift"("rosterId", "shiftDate", "employeeId", "processId");

-- AddForeignKey
ALTER TABLE "Pod" ADD CONSTRAINT "Pod_leadEmployeeId_fkey" FOREIGN KEY ("leadEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_podId_fkey" FOREIGN KEY ("podId") REFERENCES "Pod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_podId_fkey" FOREIGN KEY ("podId") REFERENCES "Pod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Process" ADD CONSTRAINT "Process_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessCoverageRule" ADD CONSTRAINT "ProcessCoverageRule_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeProcessAssignment" ADD CONSTRAINT "EmployeeProcessAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeProcessAssignment" ADD CONSTRAINT "EmployeeProcessAssignment_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLeave" ADD CONSTRAINT "EmployeeLeave_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeWeeklyOff" ADD CONSTRAINT "EmployeeWeeklyOff_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterShift" ADD CONSTRAINT "RosterShift_rosterId_fkey" FOREIGN KEY ("rosterId") REFERENCES "Roster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterShift" ADD CONSTRAINT "RosterShift_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterShift" ADD CONSTRAINT "RosterShift_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterConflict" ADD CONSTRAINT "RosterConflict_rosterId_fkey" FOREIGN KEY ("rosterId") REFERENCES "Roster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
