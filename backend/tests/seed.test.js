"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const seedData_js_1 = require("../prisma/seedData.js");
(0, vitest_1.describe)("Phase 1: Seed Data & Domain Specification Validation", () => {
    (0, vitest_1.it)("should contain at least 30 employees", () => {
        (0, vitest_1.expect)(seedData_js_1.seedEmployees.length).toBeGreaterThanOrEqual(30);
        (0, vitest_1.expect)(seedData_js_1.seedEmployees.length).toBe(32);
    });
    (0, vitest_1.it)("should have unique employee codes and emails", () => {
        const codes = new Set(seedData_js_1.seedEmployees.map((e) => e.employeeCode));
        const emails = new Set(seedData_js_1.seedEmployees.map((e) => e.email));
        (0, vitest_1.expect)(codes.size).toBe(seedData_js_1.seedEmployees.length);
        (0, vitest_1.expect)(emails.size).toBe(seedData_js_1.seedEmployees.length);
    });
    (0, vitest_1.it)("should have multiple operational pods, each with a designated pod lead", () => {
        (0, vitest_1.expect)(seedData_js_1.seedPods.length).toBeGreaterThanOrEqual(4);
        for (const pod of seedData_js_1.seedPods) {
            (0, vitest_1.expect)(pod.leadEmployeeCode).toBeDefined();
            const lead = seedData_js_1.seedEmployees.find((e) => e.employeeCode === pod.leadEmployeeCode);
            (0, vitest_1.expect)(lead).toBeDefined();
            (0, vitest_1.expect)(lead?.isPodLead).toBe(true);
            (0, vitest_1.expect)(lead?.podCode).toBe(pod.code);
        }
    });
    (0, vitest_1.it)("should satisfy the ~80% single-resource brands requirement", () => {
        const totalBrands = seedData_js_1.seedBrands.length;
        const singleResourceBrands = seedData_js_1.seedBrands.filter((b) => b.isSingleResource);
        const ratio = singleResourceBrands.length / totalBrands;
        // Expected: ~80% (11 out of 14 is 78.57%)
        (0, vitest_1.expect)(ratio).toBeGreaterThanOrEqual(0.75);
        (0, vitest_1.expect)(ratio).toBeLessThanOrEqual(0.85);
    });
    (0, vitest_1.it)("should cover all 3 required operating calendar types", () => {
        const calendarTypes = new Set(seedData_js_1.seedProcesses.map((p) => p.calendarType));
        (0, vitest_1.expect)(calendarTypes.has("ALL_365_DAYS")).toBe(true);
        (0, vitest_1.expect)(calendarTypes.has("ALL_EXCEPT_PUBLIC_HOLIDAYS")).toBe(true);
        (0, vitest_1.expect)(calendarTypes.has("ALL_EXCEPT_SUNDAYS_AND_PUBLIC_HOLIDAYS")).toBe(true);
    });
    (0, vitest_1.it)("should ensure all single-resource processes have designated secondary backups to enable holiday/off coverage", () => {
        const singleResourceBrandCodes = new Set(seedData_js_1.seedBrands.filter((b) => b.isSingleResource).map((b) => b.code));
        const singleResourceProcesses = seedData_js_1.seedProcesses.filter((p) => singleResourceBrandCodes.has(p.brandCode));
        (0, vitest_1.expect)(singleResourceProcesses.length).toBeGreaterThan(0);
        for (const proc of singleResourceProcesses) {
            const assignments = seedData_js_1.seedAssignments.filter((a) => a.processCode === proc.code);
            const hasPrimary = assignments.some((a) => a.assignmentType === "PRIMARY");
            const hasBackup = assignments.some((a) => a.assignmentType === "SECONDARY_BACKUP" || a.assignmentType === "FLOAT");
            (0, vitest_1.expect)(hasPrimary).toBe(true);
            (0, vitest_1.expect)(hasBackup).toBe(true);
        }
    });
    (0, vitest_1.it)("should ensure multi-resource brands have 2-3 resources assigned", () => {
        const multiResourceBrandCodes = seedData_js_1.seedBrands
            .filter((b) => !b.isSingleResource)
            .map((b) => b.code);
        (0, vitest_1.expect)(multiResourceBrandCodes.length).toBeGreaterThanOrEqual(2);
        for (const bCode of multiResourceBrandCodes) {
            const processes = seedData_js_1.seedProcesses.filter((p) => p.brandCode === bCode);
            const assignedEmployees = new Set(seedData_js_1.seedAssignments
                .filter((a) => processes.some((p) => p.code === a.processCode))
                .map((a) => a.employeeCode));
            (0, vitest_1.expect)(assignedEmployees.size).toBeGreaterThanOrEqual(2);
        }
    });
    (0, vitest_1.it)("should have valid weekly offs configured for all employees", () => {
        for (const emp of seedData_js_1.seedEmployees) {
            (0, vitest_1.expect)(emp.standardWeeklyOffs.length).toBe(7 - emp.weeklyWorkDays);
            for (const day of emp.standardWeeklyOffs) {
                (0, vitest_1.expect)(day).toBeGreaterThanOrEqual(0);
                (0, vitest_1.expect)(day).toBeLessThanOrEqual(6);
            }
        }
    });
    (0, vitest_1.it)("should have valid ISO date formats for public holidays and approved leaves", () => {
        const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
        for (const holiday of seedData_js_1.seedPublicHolidays) {
            (0, vitest_1.expect)(holiday.date).toMatch(isoDateRegex);
        }
        for (const leave of seedData_js_1.seedLeaves) {
            (0, vitest_1.expect)(leave.startDate).toMatch(isoDateRegex);
            (0, vitest_1.expect)(leave.endDate).toMatch(isoDateRegex);
            (0, vitest_1.expect)(leave.startDate <= leave.endDate).toBe(true);
        }
    });
});
