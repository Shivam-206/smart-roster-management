import { describe, it, expect } from "vitest";
import {
  seedPods,
  seedEmployees,
  seedBrands,
  seedProcesses,
  seedAssignments,
  seedPublicHolidays,
  seedLeaves,
} from "../prisma/seedData.js";

describe("Phase 1: Seed Data & Domain Specification Validation", () => {
  it("should contain at least 30 employees", () => {
    expect(seedEmployees.length).toBeGreaterThanOrEqual(30);
    expect(seedEmployees.length).toBe(32);
  });

  it("should have unique employee codes and emails", () => {
    const codes = new Set(seedEmployees.map((e) => e.employeeCode));
    const emails = new Set(seedEmployees.map((e) => e.email));
    expect(codes.size).toBe(seedEmployees.length);
    expect(emails.size).toBe(seedEmployees.length);
  });

  it("should have multiple operational pods, each with a designated pod lead", () => {
    expect(seedPods.length).toBeGreaterThanOrEqual(4);
    for (const pod of seedPods) {
      expect(pod.leadEmployeeCode).toBeDefined();
      const lead = seedEmployees.find((e) => e.employeeCode === pod.leadEmployeeCode);
      expect(lead).toBeDefined();
      expect(lead?.isPodLead).toBe(true);
      expect(lead?.podCode).toBe(pod.code);
    }
  });

  it("should satisfy the ~80% single-resource brands requirement", () => {
    const totalBrands = seedBrands.length;
    const singleResourceBrands = seedBrands.filter((b) => b.isSingleResource);
    const ratio = singleResourceBrands.length / totalBrands;

    // Expected: ~80% (11 out of 14 is 78.57%)
    expect(ratio).toBeGreaterThanOrEqual(0.75);
    expect(ratio).toBeLessThanOrEqual(0.85);
  });

  it("should cover all 3 required operating calendar types", () => {
    const calendarTypes = new Set(seedProcesses.map((p) => p.calendarType));
    expect(calendarTypes.has("ALL_365_DAYS")).toBe(true);
    expect(calendarTypes.has("ALL_EXCEPT_PUBLIC_HOLIDAYS")).toBe(true);
    expect(calendarTypes.has("ALL_EXCEPT_SUNDAYS_AND_PUBLIC_HOLIDAYS")).toBe(true);
  });

  it("should ensure all single-resource processes have designated secondary backups to enable holiday/off coverage", () => {
    const singleResourceBrandCodes = new Set(
      seedBrands.filter((b) => b.isSingleResource).map((b) => b.code)
    );

    const singleResourceProcesses = seedProcesses.filter((p) =>
      singleResourceBrandCodes.has(p.brandCode)
    );

    expect(singleResourceProcesses.length).toBeGreaterThan(0);

    for (const proc of singleResourceProcesses) {
      const assignments = seedAssignments.filter((a) => a.processCode === proc.code);
      const hasPrimary = assignments.some((a) => a.assignmentType === "PRIMARY");
      const hasBackup = assignments.some(
        (a) => a.assignmentType === "SECONDARY_BACKUP" || a.assignmentType === "FLOAT"
      );

      expect(hasPrimary).toBe(true);
      expect(hasBackup).toBe(true);
    }
  });

  it("should ensure multi-resource brands have 2-3 resources assigned", () => {
    const multiResourceBrandCodes = seedBrands
      .filter((b) => !b.isSingleResource)
      .map((b) => b.code);

    expect(multiResourceBrandCodes.length).toBeGreaterThanOrEqual(2);

    for (const bCode of multiResourceBrandCodes) {
      const processes = seedProcesses.filter((p) => p.brandCode === bCode);
      const assignedEmployees = new Set(
        seedAssignments
          .filter((a) => processes.some((p) => p.code === a.processCode))
          .map((a) => a.employeeCode)
      );

      expect(assignedEmployees.size).toBeGreaterThanOrEqual(2);
    }
  });

  it("should have valid weekly offs configured for all employees", () => {
    for (const emp of seedEmployees) {
      expect(emp.standardWeeklyOffs.length).toBe(7 - emp.weeklyWorkDays);
      for (const day of emp.standardWeeklyOffs) {
        expect(day).toBeGreaterThanOrEqual(0);
        expect(day).toBeLessThanOrEqual(6);
      }
    }
  });

  it("should have valid ISO date formats for public holidays and approved leaves", () => {
    const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
    for (const holiday of seedPublicHolidays) {
      expect(holiday.date).toMatch(isoDateRegex);
    }
    for (const leave of seedLeaves) {
      expect(leave.startDate).toMatch(isoDateRegex);
      expect(leave.endDate).toMatch(isoDateRegex);
      expect(leave.startDate <= leave.endDate).toBe(true);
    }
  });
});
