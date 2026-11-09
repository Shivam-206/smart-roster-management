import { PrismaClient } from "@prisma/client";
import {
  seedPods,
  seedEmployees,
  seedBrands,
  seedProcesses,
  seedAssignments,
  seedPublicHolidays,
  seedLeaves,
} from "./seedData.js";

const prisma = new PrismaClient();

export async function runSeed() {
  console.log("🌱 Starting Smart Roster seed execution...");

  // 1. Clean existing records in reverse dependency order
  console.log("🧹 Clearing previous records...");
  await prisma.rosterConflict.deleteMany();
  await prisma.rosterShift.deleteMany();
  await prisma.roster.deleteMany();
  await prisma.employeeLeave.deleteMany();
  await prisma.employeeWeeklyOff.deleteMany();
  await prisma.publicHoliday.deleteMany();
  await prisma.employeeProcessAssignment.deleteMany();
  await prisma.processCoverageRule.deleteMany();
  await prisma.process.deleteMany();
  await prisma.brand.deleteMany();
  
  // Unlink pod leads first to avoid circular FK locks
  await prisma.pod.updateMany({ data: { leadEmployeeId: null } });
  await prisma.employee.deleteMany();
  await prisma.pod.deleteMany();

  // 2. Insert Pods (without leadEmployeeId initially)
  console.log(`📦 Creating ${seedPods.length} operational pods...`);
  const podMap = new Map<string, string>();
  for (const pod of seedPods) {
    const created = await prisma.pod.create({
      data: {
        code: pod.code,
        name: pod.name,
        description: pod.description,
      },
    });
    podMap.set(pod.code, created.id);
  }

  // 3. Insert Employees
  console.log(`👥 Creating ${seedEmployees.length} employees (at least 30 required)...`);
  const employeeMap = new Map<string, string>();
  for (const emp of seedEmployees) {
    const podId = podMap.get(emp.podCode);
    const created = await prisma.employee.create({
      data: {
        employeeCode: emp.employeeCode,
        name: emp.name,
        email: emp.email,
        role: emp.role,
        isPodLead: emp.isPodLead,
        podId: podId,
        contractType: emp.contractType,
        weeklyWorkDays: emp.weeklyWorkDays,
        maxConsecutiveDays: emp.maxConsecutiveDays,
      },
    });
    employeeMap.set(emp.employeeCode, created.id);

    // Create standard weekly offs
    for (const dayOfWeek of emp.standardWeeklyOffs) {
      await prisma.employeeWeeklyOff.create({
        data: {
          employeeId: created.id,
          dayOfWeek: dayOfWeek,
          isStandard: true,
        },
      });
    }
  }

  // 4. Update Pod Leads
  console.log("🎖️ Assigning Pod Leads...");
  for (const pod of seedPods) {
    const podId = podMap.get(pod.code);
    const leadEmpId = employeeMap.get(pod.leadEmployeeCode);
    if (podId && leadEmpId) {
      await prisma.pod.update({
        where: { id: podId },
        data: { leadEmployeeId: leadEmpId },
      });
    }
  }

  // 5. Insert Brands
  console.log(`🏷️ Creating ${seedBrands.length} brands (~80% single-resource)...`);
  const brandMap = new Map<string, string>();
  for (const brand of seedBrands) {
    const podId = podMap.get(brand.podCode);
    if (!podId) continue;
    const created = await prisma.brand.create({
      data: {
        code: brand.code,
        name: brand.name,
        description: brand.description,
        podId: podId,
        isSingleResource: brand.isSingleResource,
      },
    });
    brandMap.set(brand.code, created.id);
  }

  // 6. Insert Processes & Coverage Rules
  console.log(`⚙️ Creating ${seedProcesses.length} processes across all 3 calendar types...`);
  const processMap = new Map<string, string>();
  for (const proc of seedProcesses) {
    const brandId = brandMap.get(proc.brandCode);
    if (!brandId) continue;
    const created = await prisma.process.create({
      data: {
        code: proc.code,
        name: proc.name,
        brandId: brandId,
        calendarType: proc.calendarType,
        defaultMinStaff: proc.defaultMinStaff,
        description: proc.description,
      },
    });
    processMap.set(proc.code, created.id);

    if (proc.customRules) {
      for (const rule of proc.customRules) {
        await prisma.processCoverageRule.create({
          data: {
            processId: created.id,
            dateOverride: rule.dateOverride,
            dayOfWeek: rule.dayOfWeek,
            requiredStaffCount: rule.requiredStaffCount,
            note: rule.note,
          },
        });
      }
    }
  }

  // 7. Insert Assignments
  console.log(`🔗 Creating ${seedAssignments.length} process assignments (Primary & Backups)...`);
  for (const assign of seedAssignments) {
    const empId = employeeMap.get(assign.employeeCode);
    const procId = processMap.get(assign.processCode);
    if (empId && procId) {
      await prisma.employeeProcessAssignment.create({
        data: {
          employeeId: empId,
          processId: procId,
          assignmentType: assign.assignmentType,
          priorityRank: assign.priorityRank,
        },
      });
    }
  }

  // 8. Insert Public Holidays
  console.log(`📅 Inserting ${seedPublicHolidays.length} public holidays...`);
  for (const holiday of seedPublicHolidays) {
    await prisma.publicHoliday.create({
      data: {
        date: holiday.date,
        name: holiday.name,
        isMandatoryOff: holiday.isMandatoryOff,
      },
    });
  }

  // 9. Insert Sample Leaves
  console.log(`🏖️ Inserting ${seedLeaves.length} sample approved leaves...`);
  for (const leave of seedLeaves) {
    const empId = employeeMap.get(leave.employeeCode);
    if (empId) {
      await prisma.employeeLeave.create({
        data: {
          employeeId: empId,
          startDate: leave.startDate,
          endDate: leave.endDate,
          leaveType: leave.leaveType,
          status: leave.status,
          reason: leave.reason,
        },
      });
    }
  }

  console.log("✅ Smart Roster seed completed successfully!");
  return {
    podsCount: seedPods.length,
    employeesCount: seedEmployees.length,
    brandsCount: seedBrands.length,
    processesCount: seedProcesses.length,
    assignmentsCount: seedAssignments.length,
    holidaysCount: seedPublicHolidays.length,
    leavesCount: seedLeaves.length,
  };
}

if (process.env.NODE_ENV !== "test" && process.argv[1]?.includes("seed")) {
  runSeed()
    .catch((e) => {
      console.error("❌ Seed failed with error:", e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
