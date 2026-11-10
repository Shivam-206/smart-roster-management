import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CalendarDays, CheckCircle2, LoaderCircle, Pencil, RefreshCw, Trash2, TriangleAlert, UserPlus, X } from "lucide-react";
import { fetchBrands } from "../../api/brands";
import { fetchEmployees } from "../../api/employees";
import { fetchPods } from "../../api/pods";
import { fetchProcesses } from "../../api/processes";
import {
  fetchRosterConflicts,
  fetchRosterReplacements,
  fetchRosterView,
  fillRosterPosition,
  revalidateRoster,
  removeRosterShift,
  replaceRosterShift,
  RosterRevalidationResult,
  RosterViewData,
  RosterViewShift,
} from "../../api/rosters";

type ViewMode = "company" | "pod" | "brand" | "process" | "employee";

const viewOptions: Array<{ id: ViewMode; label: string }> = [
  { id: "company", label: "Company-wide" },
  { id: "pod", label: "Pod-wise" },
  { id: "brand", label: "Brand-wise" },
  { id: "process", label: "Process-wise" },
  { id: "employee", label: "Employee-wise" },
];

const statusStyles: Record<string, string> = {
  WORKING: "bg-emerald-100 text-emerald-800 border-emerald-200",
  WEEKLY_OFF: "bg-slate-100 text-slate-700 border-slate-200",
  LEAVE: "bg-amber-100 text-amber-800 border-amber-200",
  COMP_OFF: "bg-violet-100 text-violet-800 border-violet-200",
  HOLIDAY: "bg-sky-100 text-sky-800 border-sky-200",
};

const statusLabels: Record<string, string> = {
  WORKING: "Working",
  WEEKLY_OFF: "Weekly off",
  LEAVE: "Leave",
  COMP_OFF: "Comp-off",
  HOLIDAY: "Holiday",
};

function getDates(month: number, year: number): string[] {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: days }, (_, index) =>
    `${year}-${String(month).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`
  );
}

function dateLabel(date: string): { day: string; weekday: string } {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return {
    day: String(parsed.getUTCDate()),
    weekday: parsed.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }),
  };
}

function StatusBadge({ shift }: { shift: RosterViewShift }) {
  return (
    <span className={`inline-flex rounded-md border px-1.5 py-1 text-[11px] font-semibold ${statusStyles[shift.status] || "bg-slate-50 text-slate-600 border-slate-200"}`}>
      {statusLabels[shift.status] || shift.status}
    </span>
  );
}

interface EditTarget {
  date: string;
  processId: string;
  shift?: RosterViewShift;
}

function EmployeeGrid({
  data,
  dates,
  onEdit,
  onRemove,
}: {
  data: RosterViewData;
  dates: string[];
  onEdit: (shift: RosterViewShift) => void;
  onRemove: (shift: RosterViewShift) => void;
}) {
  const shiftByEmployeeDate = useMemo(() => {
    const shifts = new Map<string, RosterViewShift>();
    for (const shift of data.shifts) shifts.set(`${shift.employeeId}:${shift.shiftDate}`, shift);
    return shifts;
  }, [data.shifts]);

  return (
    <div className="overflow-auto">
      <table className="min-w-max border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-slate-50">
          <tr>
            <th className="sticky left-0 z-20 min-w-56 border-b border-r border-slate-200 bg-slate-50 px-4 py-3 text-left">Employee / Pod</th>
            {dates.map((date) => {
              const label = dateLabel(date);
              return <th key={date} className="min-w-32 border-b border-slate-200 px-2 py-2 text-center">
                <span className="block font-semibold text-slate-800">{label.day}</span>
                <span className="text-[11px] text-slate-500">{label.weekday}</span>
              </th>;
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.employees.map((employee) => (
            <tr key={employee.id} className="hover:bg-slate-50/70">
              <th className="sticky left-0 z-[1] border-r border-slate-200 bg-white px-4 py-3 text-left">
                <span className="block font-semibold text-slate-900">{employee.name}</span>
                <span className="block text-xs text-slate-500">{employee.employeeCode} · {employee.pod?.name || "No pod"}</span>
              </th>
              {dates.map((date) => {
                const shift = shiftByEmployeeDate.get(`${employee.id}:${date}`);
                return (
                  <td key={date} className="border-l border-slate-100 px-2 py-2 align-top">
                    {shift ? (
                      <div className="space-y-1">
                        <StatusBadge shift={shift} />
                        {shift.status === "WORKING" && shift.process && (
                          <div className="max-w-32 text-[11px] leading-4 text-slate-600">
                            <span className="block truncate" title={shift.process.name}>{shift.process.name}</span>
                            <span className="block truncate text-slate-400" title={shift.process.brand.name}>{shift.process.brand.name}</span>
                            <div className="mt-1 flex gap-1">
                              <button type="button" onClick={() => onEdit(shift)} className="inline-flex items-center gap-1 rounded border border-indigo-200 px-1.5 py-1 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-50" aria-label={`Edit ${employee.name}'s assignment on ${date}`}>
                                <Pencil className="h-3 w-3" /> Edit
                              </button>
                              <button type="button" onClick={() => onRemove(shift)} className="inline-flex items-center gap-1 rounded border border-rose-200 px-1.5 py-1 text-[10px] font-semibold text-rose-700 hover:bg-rose-50" aria-label={`Remove ${employee.name}'s assignment on ${date}`}>
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : <span className="text-xs text-slate-300" title="No shift entry was saved for this date">—</span>}
                  </td>
                );
              })}
            </tr>
          ))}
          {!data.employees.length && <tr><td colSpan={dates.length + 1} className="px-6 py-10 text-center text-sm text-slate-500">No employees have entries in this roster.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function ProcessGrid({
  data,
  dates,
  brandId,
  onEdit,
  onFill,
  onRemove,
}: {
  data: RosterViewData;
  dates: string[];
  brandId?: string;
  onEdit: (shift: RosterViewShift) => void;
  onFill: (date: string, processId: string) => void;
  onRemove: (shift: RosterViewShift) => void;
}) {
  const processes = data.processes.filter((process) => !brandId || process.brand.id === brandId);
  return (
    <div className="overflow-auto">
      <table className="min-w-max border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-slate-50">
          <tr>
            <th className="sticky left-0 z-20 min-w-64 border-b border-r border-slate-200 bg-slate-50 px-4 py-3 text-left">Process / Brand</th>
            {dates.map((date) => {
              const label = dateLabel(date);
              return <th key={date} className="min-w-44 border-b border-slate-200 px-3 py-2 text-center">
                <span className="block font-semibold text-slate-800">{label.day}</span>
                <span className="text-[11px] text-slate-500">{label.weekday}</span>
              </th>;
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {processes.map((process) => (
            <tr key={process.id} className="align-top hover:bg-slate-50/70">
              <th className="sticky left-0 z-[1] border-r border-slate-200 bg-white px-4 py-3 text-left">
                <span className="block font-semibold text-slate-900">{process.name}</span>
                <span className="block text-xs text-slate-500">{process.code} · {process.brand.name}</span>
              </th>
              {dates.map((date) => {
                const staffing = data.processStaffing.find((item) => item.date === date && item.processId === process.id);
                const working = data.shifts.filter((shift) =>
                  shift.shiftDate === date && shift.processId === process.id && shift.status === "WORKING"
                );
                return (
                  <td key={date} className="border-l border-slate-100 px-3 py-2">
                    {staffing ? (
                      <div className="space-y-1.5">
                        <p className={`text-xs font-semibold ${staffing.unfilledPositions ? "text-rose-700" : "text-slate-600"}`}>
                          {staffing.actualStaffCount}/{staffing.requiredStaffCount} staffed
                          {staffing.unfilledPositions > 0 && ` · ${staffing.unfilledPositions} unfilled`}
                        </p>
                        {working.length ? working.map((shift) => (
                          <div key={shift.id} className="flex items-center justify-between gap-1">
                            <p className="max-w-32 truncate text-[11px] text-slate-700" title={`${shift.employee.name} (${shift.employee.employeeCode})`}>
                              {shift.employee.name}
                            </p>
                            <span className="flex shrink-0 gap-1">
                              <button type="button" onClick={() => onEdit(shift)} className="rounded border border-indigo-200 p-1 text-indigo-700 hover:bg-indigo-50" aria-label={`Edit ${shift.employee.name}`}><Pencil className="h-3 w-3" /></button>
                              <button type="button" onClick={() => onRemove(shift)} className="rounded border border-rose-200 p-1 text-rose-700 hover:bg-rose-50" aria-label={`Remove ${shift.employee.name}`}><Trash2 className="h-3 w-3" /></button>
                            </span>
                          </div>
                        )) : <span className="text-[11px] text-slate-400">No assigned staff</span>}
                        {staffing.unfilledPositions > 0 && (
                          <button type="button" onClick={() => onFill(date, process.id)} className="inline-flex items-center gap-1 rounded border border-indigo-200 px-2 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50">
                            <UserPlus className="h-3 w-3" /> Fill position
                          </button>
                        )}
                      </div>
                    ) : <span className="text-[11px] text-slate-300">Not operating</span>}
                  </td>
                );
              })}
            </tr>
          ))}
          {!processes.length && <tr><td colSpan={dates.length + 1} className="px-6 py-10 text-center text-sm text-slate-500">No processes match this selection.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export default function MonthlyRosterViews() {
  const queryClient = useQueryClient();
  const today = new Date();
  const [month, setMonth] = useState(String(today.getMonth() + 1));
  const [year, setYear] = useState(String(today.getFullYear()));
  const [mode, setMode] = useState<ViewMode>("company");
  const [podId, setPodId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [processId, setProcessId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [replacementEmployeeId, setReplacementEmployeeId] = useState("");
  const [conflictStatus, setConflictStatus] = useState<"active" | "resolved" | "all">("active");
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [revalidationResult, setRevalidationResult] = useState<RosterRevalidationResult | null>(null);

  const podsQuery = useQuery({ queryKey: ["roster-view-options", "pods"], queryFn: () => fetchPods() });
  const brandsQuery = useQuery({ queryKey: ["roster-view-options", "brands"], queryFn: () => fetchBrands() });
  const processesQuery = useQuery({ queryKey: ["roster-view-options", "processes"], queryFn: () => fetchProcesses() });
  const employeesQuery = useQuery({ queryKey: ["roster-view-options", "employees"], queryFn: () => fetchEmployees() });

  const filterId = mode === "pod" ? podId : mode === "brand" ? brandId : mode === "process" ? processId : mode === "employee" ? employeeId : "";
  const numericMonth = Number(month);
  const numericYear = Number(year);
  const validDate = Number.isInteger(numericMonth) && numericMonth >= 1 && numericMonth <= 12 &&
    Number.isInteger(numericYear) && numericYear >= 1900 && numericYear <= 9999;
  const rosterQuery = useQuery({
    queryKey: ["roster-view", numericMonth, numericYear, mode, filterId],
    queryFn: () => fetchRosterView({
      month: numericMonth,
      year: numericYear,
      ...(mode === "pod" ? { podId } : {}),
      ...(mode === "brand" ? { brandId } : {}),
      ...(mode === "process" ? { processId } : {}),
      ...(mode === "employee" ? { employeeId } : {}),
    }),
    enabled: validDate && (mode === "company" || Boolean(filterId)),
  });

  const data = rosterQuery.data;
  const conflictsQuery = useQuery({
    queryKey: ["roster-conflicts", data?.roster.id, conflictStatus],
    queryFn: () => fetchRosterConflicts(data!.roster.id, conflictStatus),
    enabled: Boolean(data?.roster.id),
  });
  const replacementsQuery = useQuery({
    queryKey: ["roster-replacements", data?.roster.id, editTarget?.date, editTarget?.processId, editTarget?.shift?.id, editTarget?.shift?.employeeId],
    queryFn: () => fetchRosterReplacements(data!.roster.id, {
      date: editTarget!.date,
      processId: editTarget!.processId,
      ...(editTarget!.shift ? {
        shiftId: editTarget!.shift.id,
        excludeEmployeeId: editTarget!.shift.employeeId,
      } : {}),
    }),
    enabled: Boolean(data?.roster.id && editTarget),
  });
  const invalidateRosterData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["roster-view"] }),
      queryClient.invalidateQueries({ queryKey: ["roster-conflicts", data?.roster.id] }),
      queryClient.invalidateQueries({ queryKey: ["roster-replacements", data?.roster.id] }),
    ]);
  };
  const editMutation = useMutation({
    mutationFn: (input: { target: EditTarget; employeeId: string }) => input.target.shift
      ? replaceRosterShift(data!.roster.id, input.target.shift.id, input.employeeId)
      : fillRosterPosition(data!.roster.id, {
          shiftDate: input.target.date,
          processId: input.target.processId,
          employeeId: input.employeeId,
        }),
    onSuccess: async () => {
      setNotice({ type: "success", message: "Roster assignment saved and conflicts refreshed." });
      setEditTarget(null);
      setReplacementEmployeeId("");
      await invalidateRosterData();
    },
    onError: (error) => setNotice({ type: "error", message: error.message }),
  });
  const removeMutation = useMutation({
    mutationFn: (shift: RosterViewShift) => removeRosterShift(data!.roster.id, shift.id),
    onSuccess: async () => {
      setNotice({ type: "success", message: "Assignment removed. Any coverage gap is recorded as an active conflict." });
      await invalidateRosterData();
    },
    onError: (error) => setNotice({ type: "error", message: error.message }),
  });
  const revalidateMutation = useMutation({
    mutationFn: () => revalidateRoster(data!.roster.id),
    onSuccess: async (result) => {
      setRevalidationResult(result);
      setNotice({ type: "success", message: "Roster revalidated against current availability, assignments, calendars, and staffing rules." });
      await invalidateRosterData();
    },
    onError: (error) => setNotice({ type: "error", message: error.message }),
  });
  const openReplacement = (shift: RosterViewShift) => {
    setNotice(null);
    setReplacementEmployeeId("");
    setEditTarget({ date: shift.shiftDate, processId: shift.processId!, shift });
  };
  const openVacancy = (date: string, processId: string) => {
    setNotice(null);
    setReplacementEmployeeId("");
    setEditTarget({ date, processId });
  };
  const removeAssignment = (shift: RosterViewShift) => {
    if (window.confirm(`Remove ${shift.employee.name}'s ${shift.process?.name || "process"} assignment on ${shift.shiftDate}?`)) {
      setNotice(null);
      removeMutation.mutate(shift);
    }
  };
  const dates = useMemo(() => validDate ? getDates(numericMonth, numericYear) : [], [validDate, numericMonth, numericYear]);
  const catalogError = podsQuery.error || brandsQuery.error || processesQuery.error || employeesQuery.error;
  const showRosterError = rosterQuery.isError;

  const selectedLabel = mode === "pod"
    ? podsQuery.data?.find((item) => item.id === podId)?.name
    : mode === "brand"
      ? brandsQuery.data?.find((item) => item.id === brandId)?.name
      : mode === "process"
        ? processesQuery.data?.find((item) => item.id === processId)?.name
        : mode === "employee"
          ? employeesQuery.data?.find((item) => item.id === employeeId)?.name
          : null;

  return (
    <div className="space-y-5">
      <header className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-bold text-slate-900">Monthly Roster Views</h2>
          <p className="text-sm text-slate-500">Explore the same saved roster by company, pod, brand, process, or employee. These views do not change roster data.</p>
        </div>
        <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="Roster view">
          {viewOptions.map((option) => (
            <button
              key={option.id}
              role="tab"
              aria-selected={mode === option.id}
              onClick={() => setMode(option.id)}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${mode === option.id ? "bg-indigo-600 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-700">Month</span>
            <select value={month} onChange={(event) => setMonth(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm sm:w-44">
              {Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{new Date(2024, index, 1).toLocaleString(undefined, { month: "long" })}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-700">Year</span>
            <input type="number" min={1900} max={9999} value={year} onChange={(event) => setYear(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:w-28" />
          </label>
          {mode !== "company" && (
            <label className="block min-w-56 flex-1">
              <span className="mb-1 block text-xs font-semibold text-slate-700">{mode === "pod" ? "Pod" : mode === "brand" ? "Brand" : mode === "process" ? "Process" : "Employee"}</span>
              <select
                value={filterId}
                onChange={(event) => {
                  if (mode === "pod") setPodId(event.target.value);
                  else if (mode === "brand") setBrandId(event.target.value);
                  else if (mode === "process") setProcessId(event.target.value);
                  else setEmployeeId(event.target.value);
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select {mode}</option>
                {mode === "pod" && podsQuery.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                {mode === "brand" && brandsQuery.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                {mode === "process" && processesQuery.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                {mode === "employee" && employeesQuery.data?.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.employeeCode})</option>)}
              </select>
            </label>
          )}
        </div>
        {!validDate && <p role="alert" className="mt-3 text-sm text-rose-700">Enter a valid month and year.</p>}
        {catalogError && <p role="alert" className="mt-3 text-sm text-rose-700">Could not load view filters: {(catalogError as Error).message}</p>}
      </header>

      {mode !== "company" && !filterId && validDate && !catalogError && (
        <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-800">Select a {mode} to view its saved monthly schedule.</div>
      )}
      {rosterQuery.isFetching && (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">
          <LoaderCircle className="h-4 w-4 animate-spin" /> Loading saved roster...
        </div>
      )}
      {showRosterError && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{rosterQuery.error.message.includes("No roster exists") ? `No saved roster exists for ${numericYear}-${String(numericMonth).padStart(2, "0")}. Generate it first in Monthly Roster Generation.` : rosterQuery.error.message}</span>
        </div>
      )}
      {data && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600">Managers can edit saved working assignments. Each change is revalidated and recorded as a manual override.</p>
            <button
              type="button"
              onClick={() => revalidateMutation.mutate()}
              disabled={revalidateMutation.isPending}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
            >
              {revalidateMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {revalidateMutation.isPending ? "Revalidating..." : "Revalidate roster"}
            </button>
          </div>
          {notice && (
            <div role={notice.type === "error" ? "alert" : "status"} className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${notice.type === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
              {notice.type === "error" ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
              {notice.message}
            </div>
          )}
          <div className="flex flex-col justify-between gap-2 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
            <div>
              <p className="font-semibold text-slate-900">{data.roster.monthYear} saved roster{selectedLabel ? ` · ${selectedLabel}` : ""}</p>
              <p className="text-xs text-slate-500">Generated {new Date(data.roster.generatedAt).toLocaleString()} · {data.roster.status}</p>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
              <span>{data.summary.workingShifts} working</span>
              <span>{data.summary.weeklyOffs} weekly offs</span>
              <span>{data.summary.leaves} leaves</span>
              <span>{data.summary.compOffs} comp-offs</span>
              <span>{data.summary.holidays} holidays</span>
              <span className={conflictsQuery.data?.summary.active ? "font-semibold text-rose-700" : ""}>{conflictsQuery.data?.summary.active ?? data.summary.conflicts} active conflicts</span>
              <span>{conflictsQuery.data?.summary.resolved ?? 0} resolved</span>
              {(mode === "brand" || mode === "process") && <span className={data.summary.unfilledPositions ? "font-semibold text-rose-700" : ""}>{data.summary.unfilledPositions} unfilled</span>}
            </div>
          </div>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-1 border-b border-slate-200 p-4 sm:p-5">
              <h3 className="font-bold text-slate-900">{viewOptions.find((option) => option.id === mode)?.label} schedule</h3>
              <p className="text-xs text-slate-500">
                {mode === "company" ? "Saved roster entries for the company." : mode === "pod" ? "All roster entries for employees currently associated with this pod." : mode === "brand" ? "Daily staffing and assigned employees across this brand's processes." : mode === "process" ? "Saved assignments compared with the current staffing rules." : "Complete set of saved roster entries for the selected employee."}
              </p>
            </div>
            {mode === "brand" || mode === "process"
              ? <ProcessGrid
                  data={data}
                  dates={dates}
                  brandId={mode === "brand" ? brandId : undefined}
                  onEdit={openReplacement}
                  onFill={openVacancy}
                  onRemove={removeAssignment}
                />
              : <EmployeeGrid data={data} dates={dates} onEdit={openReplacement} onRemove={removeAssignment} />}
          </section>

          {(mode === "brand" || mode === "process") && data.staffingBasis && (
            <p className="text-xs text-slate-500">{data.staffingBasis}</p>
          )}
          {revalidationResult && (
            <section className="overflow-hidden rounded-xl border border-amber-200 bg-white">
              <div className="border-b border-amber-100 bg-amber-50 p-4">
                <h3 className="font-semibold text-amber-900">Revalidation summary</h3>
                <p className="mt-1 text-xs text-amber-800">
                  {revalidationResult.summary.activeConflicts} active · {revalidationResult.summary.resolvedConflicts} resolved · {revalidationResult.summary.unfilledPositions} unfilled positions
                </p>
              </div>
              {revalidationResult.recommendations.length ? (
                <div className="divide-y divide-slate-100">
                  {revalidationResult.recommendations.map((item) => (
                    <div key={`${item.shiftId || item.processId}:${item.date}`} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{item.date} · {item.reason}</p>
                        <p className="text-xs text-slate-500">
                          Suggested: {item.replacements.length
                            ? item.replacements.map((candidate) => `${candidate.name} (${candidate.assignmentType.replace(/_/g, " ")})`).join(", ")
                            : "No eligible replacement available."}
                        </p>
                      </div>
                      {item.replacements.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const shift = data.shifts.find((candidate) => candidate.id === item.shiftId);
                            if (shift) openReplacement(shift);
                            else openVacancy(item.date, item.processId);
                          }}
                          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                        >
                          <UserPlus className="h-3.5 w-3.5" /> Choose replacement
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : <p className="p-4 text-sm text-slate-600">No working assignments need attention.</p>}
            </section>
          )}
          {((conflictsQuery.data?.data.length || 0) > 0 || data.conflicts.length > 0) && (
            <section className="overflow-hidden rounded-xl border border-rose-200 bg-white">
              <div className="flex flex-col gap-2 border-b border-rose-100 bg-rose-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <TriangleAlert className="h-4 w-4 text-rose-700" />
                  <h3 className="font-semibold text-rose-900">Roster conflicts</h3>
                </div>
                <select value={conflictStatus} onChange={(event) => setConflictStatus(event.target.value as "active" | "resolved" | "all")} className="rounded-md border border-rose-200 bg-white px-2 py-1 text-xs">
                  <option value="active">Active</option>
                  <option value="resolved">Resolved</option>
                  <option value="all">All</option>
                </select>
              </div>
              {conflictsQuery.isError && <p role="alert" className="p-4 text-sm text-rose-700">{conflictsQuery.error.message}</p>}
              <div className="max-h-80 divide-y divide-slate-100 overflow-auto">
                {(conflictsQuery.data?.data || data.conflicts.filter((conflict) =>
                  conflictStatus === "all" ||
                  (conflictStatus === "resolved" ? conflict.isResolved : !conflict.isResolved)
                )).map((conflict) => (
                  <div key={conflict.id} className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[7rem_8rem_1fr]">
                    <span className="text-slate-500">{conflict.shiftDate}</span>
                    <span className={conflict.severity === "HARD_ERROR" ? "font-semibold text-rose-700" : "font-semibold text-amber-700"}>{conflict.category.replace(/_/g, " ")} · {conflict.isResolved ? "resolved" : "active"}</span>
                    <span className="text-slate-700">{conflict.message}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs">
            <span className="inline-flex items-center gap-1 text-slate-500"><CalendarDays className="h-3.5 w-3.5" /> Status legend:</span>
            {Object.entries(statusLabels).map(([status, label]) => (
              <span key={status} className={`rounded-md border px-2 py-1 font-semibold ${statusStyles[status]}`}>{label}</span>
            ))}
            <span className="self-center text-slate-400">— No saved shift entry</span>
          </div>
          {editTarget && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="presentation" onMouseDown={(event) => {
              if (event.target === event.currentTarget) setEditTarget(null);
            }}>
              <section role="dialog" aria-modal="true" aria-labelledby="roster-edit-title" className="w-full max-w-lg rounded-xl bg-white shadow-xl">
                <div className="flex items-start justify-between border-b border-slate-200 p-5">
                  <div>
                    <h3 id="roster-edit-title" className="font-bold text-slate-900">{editTarget.shift ? "Replace working assignment" : "Fill unassigned position"}</h3>
                    <p className="mt-1 text-xs text-slate-500">{editTarget.date} · {data.processes.find((process) => process.id === editTarget.processId)?.name}</p>
                  </div>
                  <button type="button" onClick={() => setEditTarget(null)} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Close dialog"><X className="h-4 w-4" /></button>
                </div>
                <div className="space-y-4 p-5">
                  {editTarget.shift && <p className="text-sm text-slate-600">Replacing {editTarget.shift.employee.name}. Eligible resources are ranked by assignment tier.</p>}
                  {replacementsQuery.isLoading ? (
                    <p className="flex items-center gap-2 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" /> Checking availability and assignments...</p>
                  ) : replacementsQuery.isError ? (
                    <p role="alert" className="text-sm text-rose-700">{replacementsQuery.error.message}</p>
                  ) : replacementsQuery.data?.candidates.length ? (
                    <>
                      <p className="text-xs text-slate-500">
                        Staffing: {replacementsQuery.data.staffing.assigned}/{replacementsQuery.data.staffing.required} · {replacementsQuery.data.staffing.unfilled} unfilled
                      </p>
                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold text-slate-700">Eligible replacement</span>
                        <select value={replacementEmployeeId} onChange={(event) => setReplacementEmployeeId(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                          <option value="">Select an employee</option>
                          {replacementsQuery.data.candidates.map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>{candidate.name} ({candidate.employeeCode}) · {candidate.assignmentType.replace(/_/g, " ")}</option>
                          ))}
                        </select>
                      </label>
                    </>
                  ) : <p className="text-sm text-amber-800">No eligible employee is available for this process and date.</p>}
                  {editMutation.isError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{editMutation.error.message}</p>}
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setEditTarget(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Cancel</button>
                    <button
                      type="button"
                      disabled={!replacementEmployeeId || editMutation.isPending || replacementsQuery.isLoading}
                      onClick={() => editMutation.mutate({ target: editTarget, employeeId: replacementEmployeeId })}
                      className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {editMutation.isPending && <LoaderCircle className="h-4 w-4 animate-spin" />}
                      {editTarget.shift ? "Save replacement" : "Assign employee"}
                    </button>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
