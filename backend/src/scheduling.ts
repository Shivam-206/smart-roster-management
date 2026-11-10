export type SchedulingCalendarType =
  | "ALL_365_DAYS"
  | "ALL_EXCEPT_PUBLIC_HOLIDAYS"
  | "ALL_EXCEPT_SUNDAYS_AND_PUBLIC_HOLIDAYS"
  | "CUSTOM";

export interface StaffingCalendarRule {
  dateOverride: string | null;
  dayOfWeek: number | null;
  requiredStaffCount: number;
}

export function getProcessScheduleForDate(
  calendarType: SchedulingCalendarType,
  date: string,
  isMandatoryHoliday: boolean,
  rules: StaffingCalendarRule[],
  defaultMinStaff: number
): { operates: boolean; requiredStaffCount: number } {
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  const dateRule = rules.find((rule) => rule.dateOverride === date);
  const weekdayRule = rules.find((rule) => rule.dayOfWeek === weekday);
  const effectiveRule = dateRule || weekdayRule;
  const requiredStaffCount = effectiveRule?.requiredStaffCount ?? defaultMinStaff;

  if (calendarType === "ALL_365_DAYS") {
    return { operates: true, requiredStaffCount };
  }
  if (calendarType === "ALL_EXCEPT_PUBLIC_HOLIDAYS") {
    return { operates: !isMandatoryHoliday, requiredStaffCount };
  }
  if (calendarType === "ALL_EXCEPT_SUNDAYS_AND_PUBLIC_HOLIDAYS") {
    return { operates: weekday !== 0 && !isMandatoryHoliday, requiredStaffCount };
  }

  return {
    operates: Boolean(effectiveRule && effectiveRule.requiredStaffCount > 0),
    requiredStaffCount,
  };
}
