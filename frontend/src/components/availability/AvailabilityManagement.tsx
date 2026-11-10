import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CalendarDays, Clock3 } from "lucide-react";
import { fetchEmployees } from "../../api/employees";
import {
  deleteHoliday,
  deleteLeave,
  deleteWeeklyOff,
  deleteCoverageRule,
  fetchCoverageRules,
  fetchHolidays,
  fetchLeaves,
  fetchProcessSchedule,
  fetchWeeklyOffs,
  saveCoverageRule,
  saveHoliday,
  saveLeave,
  saveWeeklyOff,
} from "../../api/availability";
import { updateProcess } from "../../api/processes";
import { fetchProcesses } from "../../api/processes";
import {
  CalendarType,
  CoverageRule,
  Employee,
  EmployeeLeaveRecord,
  EmployeeWeeklyOffRecord,
  LeaveStatus,
  LeaveType,
  Process,
  PublicHoliday,
} from "../../types";

type Section = "weekly" | "leaves" | "holidays" | "processes";
const SECTION_LABELS: { id: Section; label: string }[] = [
  { id: "weekly", label: "Weekly Offs" },
  { id: "leaves", label: "Leaves & Comp-Offs" },
  { id: "holidays", label: "Public Holidays" },
  { id: "processes", label: "Process Calendars & Staffing" },
];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const LEAVE_TYPES: LeaveType[] = ["ANNUAL", "SICK", "CASUAL", "COMP_OFF"];
const LEAVE_STATUSES: LeaveStatus[] = ["PENDING", "APPROVED", "REJECTED"];
const CALENDAR_TYPES: CalendarType[] = [
  "ALL_365_DAYS",
  "ALL_EXCEPT_PUBLIC_HOLIDAYS",
  "ALL_EXCEPT_SUNDAYS_AND_PUBLIC_HOLIDAYS",
  "CUSTOM",
];

function ErrorState({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="p-8 text-center">
      <AlertCircle className="w-7 h-7 text-rose-500 mx-auto mb-2" />
      <p className="text-sm text-rose-700">{error instanceof Error ? error.message : "Unable to load data."}</p>
      <button onClick={retry} className="mt-2 text-sm text-indigo-600 font-semibold">Try again</button>
    </div>
  );
}

function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  return <p role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">{error instanceof Error ? error.message : "Request failed"}</p>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-xs font-semibold text-slate-700 mb-1">{label}</span>{children}</label>;
}

const inputClass = "w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500";

function WeeklyOffs({ employees, allEmployees }: { employees: Employee[]; allEmployees: Employee[] }) {
  const client = useQueryClient();
  const [filterEmployee, setFilterEmployee] = useState("ALL");
  const [filterDate, setFilterDate] = useState("");
  const [editing, setEditing] = useState<EmployeeWeeklyOffRecord | null>(null);
  const [employeeId, setEmployeeId] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState("0");
  const [isStandard, setIsStandard] = useState(true);
  const [specificDate, setSpecificDate] = useState("");
  const query = useQuery({
    queryKey: ["weekly-offs", filterEmployee, filterDate],
    queryFn: () => fetchWeeklyOffs({ employeeId: filterEmployee, date: filterDate }),
  });
  const mutation = useMutation({
    mutationFn: (data: Parameters<typeof saveWeeklyOff>[0]) => saveWeeklyOff(data, editing?.id),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["weekly-offs"] });
      setEditing(null);
      setEmployeeId("");
      setSpecificDate("");
    },
  });
  const remove = useMutation({
    mutationFn: deleteWeeklyOff,
    onSuccess: () => client.invalidateQueries({ queryKey: ["weekly-offs"] }),
  });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    mutation.reset();
    await mutation.mutateAsync({
      ...(editing ? {} : { employeeId }),
      dayOfWeek: Number(dayOfWeek),
      isStandard,
      specificDate: isStandard ? null : specificDate,
    });
  };
  const startEdit = (record: EmployeeWeeklyOffRecord) => {
    setEditing(record);
    setEmployeeId(record.employeeId);
    setDayOfWeek(String(record.dayOfWeek));
    setIsStandard(record.isStandard);
    setSpecificDate(record.specificDate || "");
    mutation.reset();
  };
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b flex flex-wrap gap-3">
          <select value={filterEmployee} onChange={(e) => setFilterEmployee(e.target.value)} className={`${inputClass} sm:max-w-xs`}>
            <option value="ALL">All employees</option>{allEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employeeCode} — {employee.name}</option>)}
          </select>
          <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className={`${inputClass} sm:max-w-xs`} aria-label="Filter weekly offs by date" />
          {filterDate && <button onClick={() => setFilterDate("")} className="text-sm text-indigo-600">Clear date filter</button>}
        </div>
        <div className="px-4"><FormError error={remove.error} /></div>
        {query.isLoading ? <p className="p-8 text-center text-sm text-slate-500">Loading weekly offs...</p>
          : query.isError ? <ErrorState error={query.error} retry={() => query.refetch()} />
            : query.data?.length ? (
              <div className="overflow-x-auto"><table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Employee", "Weekly off", "Type / date", "Actions"].map((item) => <th key={item} className="px-4 py-3 text-left">{item}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">{query.data.map((record) => (
                  <tr key={record.id}>
                    <td className="px-4 py-3"><strong>{record.employee.name}</strong><div className="text-xs text-slate-500">{record.employee.employeeCode}</div></td>
                    <td className="px-4 py-3">{DAYS[record.dayOfWeek]}</td>
                    <td className="px-4 py-3">{record.isStandard ? "Recurring" : `One-time · ${record.specificDate}`}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button onClick={() => startEdit(record)} className="text-indigo-600 text-xs font-semibold mr-3">Edit</button>
                      <button onClick={() => window.confirm(`Delete ${record.employee.name}'s weekly off?`) && remove.mutate(record.id)} className="text-rose-600 text-xs font-semibold">Delete</button>
                    </td>
                  </tr>
                ))}</tbody>
              </table></div>
            ) : <p className="p-8 text-center text-sm text-slate-500">No weekly offs match these filters.</p>}
      </section>
      <form onSubmit={submit} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 h-fit">
        <h3 className="font-bold text-slate-900">{editing ? "Edit weekly off" : "Add weekly off"}</h3>
        {!editing && <Field label="Employee"><select required value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={inputClass}><option value="">Select employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employeeCode} — {employee.name}</option>)}</select></Field>}
        <Field label="Day of week"><select value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value)} className={inputClass}>{DAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></Field>
        <Field label="Schedule type"><select value={isStandard ? "standard" : "specific"} onChange={(e) => setIsStandard(e.target.value === "standard")} className={inputClass}><option value="standard">Recurring weekly</option><option value="specific">One-time date</option></select></Field>
        {!isStandard && <Field label="Date"><input type="date" required value={specificDate} onChange={(e) => setSpecificDate(e.target.value)} className={inputClass} /></Field>}
        <FormError error={mutation.error} />
        <div className="flex gap-2"><button disabled={mutation.isPending} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">{mutation.isPending ? "Saving..." : editing ? "Save changes" : "Add weekly off"}</button>{editing && <button type="button" onClick={() => { setEditing(null); mutation.reset(); }} className="px-4 py-2 text-sm text-slate-600">Cancel</button>}</div>
      </form>
    </div>
  );
}

function Leaves({ employees, allEmployees }: { employees: Employee[]; allEmployees: Employee[] }) {
  const client = useQueryClient();
  const [filterEmployee, setFilterEmployee] = useState("ALL");
  const [filterStart, setFilterStart] = useState("");
  const [filterEnd, setFilterEnd] = useState("");
  const [editing, setEditing] = useState<EmployeeLeaveRecord | null>(null);
  const [employeeId, setEmployeeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [leaveType, setLeaveType] = useState<LeaveType>("ANNUAL");
  const [status, setStatus] = useState<LeaveStatus>("APPROVED");
  const [reason, setReason] = useState("");
  const query = useQuery({
    queryKey: ["leaves", filterEmployee, filterStart, filterEnd],
    queryFn: () => fetchLeaves({ employeeId: filterEmployee, startDate: filterStart, endDate: filterEnd }),
  });
  const mutation = useMutation({
    mutationFn: (data: Parameters<typeof saveLeave>[0]) => saveLeave(data, editing?.id),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["leaves"] });
      setEditing(null);
      setEmployeeId(""); setStartDate(""); setEndDate(""); setReason("");
    },
  });
  const remove = useMutation({
    mutationFn: deleteLeave,
    onSuccess: () => client.invalidateQueries({ queryKey: ["leaves"] }),
  });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    mutation.reset();
    await mutation.mutateAsync({
      ...(editing ? {} : { employeeId }),
      startDate,
      endDate: leaveType === "COMP_OFF" ? startDate : endDate,
      leaveType,
      status,
      reason,
    });
  };
  const startEdit = (record: EmployeeLeaveRecord) => {
    setEditing(record); setEmployeeId(record.employeeId); setStartDate(record.startDate);
    setEndDate(record.endDate); setLeaveType(record.leaveType); setStatus(record.status);
    setReason(record.reason || ""); mutation.reset();
  };
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b grid gap-3 sm:grid-cols-3">
          <select value={filterEmployee} onChange={(e) => setFilterEmployee(e.target.value)} className={inputClass}><option value="ALL">All employees</option>{allEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employeeCode} — {employee.name}</option>)}</select>
          <input type="date" aria-label="Filter leaves from" value={filterStart} onChange={(e) => setFilterStart(e.target.value)} className={inputClass} />
          <input type="date" aria-label="Filter leaves to" value={filterEnd} onChange={(e) => setFilterEnd(e.target.value)} className={inputClass} />
        </div>
        <div className="px-4"><FormError error={remove.error} /></div>
        {query.isLoading ? <p className="p-8 text-center text-sm text-slate-500">Loading leave records...</p>
          : query.isError ? <ErrorState error={query.error} retry={() => query.refetch()} />
            : query.data?.length ? <div className="overflow-x-auto"><table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Employee", "Dates", "Type", "Status", "Actions"].map((item) => <th key={item} className="px-4 py-3 text-left">{item}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">{query.data.map((record) => (
                <tr key={record.id}>
                  <td className="px-4 py-3"><strong>{record.employee.name}</strong><div className="text-xs text-slate-500">{record.employee.employeeCode}</div></td>
                  <td className="px-4 py-3">{record.startDate}{record.endDate !== record.startDate ? ` – ${record.endDate}` : ""}</td>
                  <td className="px-4 py-3">{record.leaveType === "COMP_OFF" ? "Comp-Off" : record.leaveType}</td>
                  <td className="px-4 py-3">{record.status}</td>
                  <td className="px-4 py-3 whitespace-nowrap"><button onClick={() => startEdit(record)} className="text-indigo-600 text-xs font-semibold mr-3">Edit</button><button onClick={() => window.confirm(`Delete this ${record.leaveType === "COMP_OFF" ? "comp-off" : "leave"} record?`) && remove.mutate(record.id)} className="text-rose-600 text-xs font-semibold">Delete</button></td>
                </tr>
              ))}</tbody>
            </table></div> : <p className="p-8 text-center text-sm text-slate-500">No leave records match these filters.</p>}
      </section>
      <form onSubmit={submit} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 h-fit">
        <h3 className="font-bold text-slate-900">{editing ? "Edit leave / comp-off" : "Add leave / comp-off"}</h3>
        {!editing && <Field label="Employee"><select required value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={inputClass}><option value="">Select employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employeeCode} — {employee.name}</option>)}</select></Field>}
        <Field label="Type"><select value={leaveType} onChange={(e) => setLeaveType(e.target.value as LeaveType)} className={inputClass}>{LEAVE_TYPES.map((type) => <option key={type} value={type}>{type === "COMP_OFF" ? "Comp-Off" : type}</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={leaveType === "COMP_OFF" ? "Comp-off date" : "Start date"}><input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} /></Field>
          {leaveType !== "COMP_OFF" && <Field label="End date"><input type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} /></Field>}
        </div>
        <Field label="Status"><select value={status} onChange={(e) => setStatus(e.target.value as LeaveStatus)} className={inputClass}>{LEAVE_STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}</select></Field>
        <Field label="Reason (optional)"><input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className={inputClass} /></Field>
        <FormError error={mutation.error} />
        <div className="flex gap-2"><button disabled={mutation.isPending} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold">{mutation.isPending ? "Saving..." : editing ? "Save changes" : "Add record"}</button>{editing && <button type="button" onClick={() => { setEditing(null); mutation.reset(); }} className="px-4 py-2 text-sm text-slate-600">Cancel</button>}</div>
      </form>
    </div>
  );
}

function Holidays() {
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [editing, setEditing] = useState<PublicHoliday | null>(null);
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [isMandatoryOff, setIsMandatoryOff] = useState(true);
  const [description, setDescription] = useState("");
  const query = useQuery({
    queryKey: ["holidays", search, year, filterFrom, filterTo],
    queryFn: () => fetchHolidays({ search, year, from: filterFrom, to: filterTo }),
  });
  const mutation = useMutation({
    mutationFn: (data: Parameters<typeof saveHoliday>[0]) => saveHoliday(data, editing?.id),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["holidays"] });
      client.invalidateQueries({ queryKey: ["process-schedule"] });
      setEditing(null); setDate(""); setName(""); setDescription("");
    },
  });
  const remove = useMutation({
    mutationFn: deleteHoliday,
    onSuccess: () => { client.invalidateQueries({ queryKey: ["holidays"] }); client.invalidateQueries({ queryKey: ["process-schedule"] }); },
  });
  const submit = async (event: FormEvent) => {
    event.preventDefault(); mutation.reset();
    await mutation.mutateAsync({ date, name, isMandatoryOff, description });
  };
  const startEdit = (holiday: PublicHoliday) => {
    setEditing(holiday); setDate(holiday.date); setName(holiday.name);
    setIsMandatoryOff(holiday.isMandatoryOff); setDescription(holiday.description || ""); mutation.reset();
  };
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search holiday name..." className={inputClass} />
          <input aria-label="Filter year" value={year} onChange={(e) => setYear(e.target.value)} pattern="\d{4}" placeholder="YYYY" className={inputClass} />
          <input type="date" aria-label="Holidays from date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} className={inputClass} />
          <input type="date" aria-label="Holidays to date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} className={inputClass} />
        </div>
        <div className="px-4"><FormError error={remove.error} /></div>
        {query.isLoading ? <p className="p-8 text-center text-sm text-slate-500">Loading public holidays...</p>
          : query.isError ? <ErrorState error={query.error} retry={() => query.refetch()} />
            : query.data?.length ? <div className="overflow-x-auto"><table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Date", "Holiday", "Scheduling", "Actions"].map((item) => <th key={item} className="px-4 py-3 text-left">{item}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">{query.data.map((holiday) => (
                <tr key={holiday.id}>
                  <td className="px-4 py-3">{holiday.date}</td><td className="px-4 py-3"><strong>{holiday.name}</strong>{holiday.description && <div className="text-xs text-slate-500">{holiday.description}</div>}</td>
                  <td className="px-4 py-3">{holiday.isMandatoryOff ? "Mandatory off" : "Optional holiday"}</td>
                  <td className="px-4 py-3 whitespace-nowrap"><button onClick={() => startEdit(holiday)} className="text-indigo-600 text-xs font-semibold mr-3">Edit</button><button onClick={() => window.confirm(`Delete ${holiday.name}?`) && remove.mutate(holiday.id)} className="text-rose-600 text-xs font-semibold">Delete</button></td>
                </tr>
              ))}</tbody>
            </table></div> : <p className="p-8 text-center text-sm text-slate-500">No public holidays found.</p>}
      </section>
      <form onSubmit={submit} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 h-fit">
        <h3 className="font-bold text-slate-900">{editing ? "Edit public holiday" : "Add public holiday"}</h3>
        <Field label="Date"><input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} /></Field>
        <Field label="Holiday name"><input required minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} /></Field>
        <Field label="Description"><input maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} /></Field>
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={isMandatoryOff} onChange={(e) => setIsMandatoryOff(e.target.checked)} /> Mandatory day off for calendars that exclude public holidays</label>
        <FormError error={mutation.error} />
        <div className="flex gap-2"><button disabled={mutation.isPending} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold">{mutation.isPending ? "Saving..." : editing ? "Save changes" : "Add holiday"}</button>{editing && <button type="button" onClick={() => { setEditing(null); mutation.reset(); }} className="px-4 py-2 text-sm text-slate-600">Cancel</button>}</div>
      </form>
    </div>
  );
}

function ProcessRules({ processes }: { processes: Process[] }) {
  const client = useQueryClient();
  const [processId, setProcessId] = useState("");
  const [calendarType, setCalendarType] = useState<CalendarType>("ALL_365_DAYS");
  const [defaultMinStaff, setDefaultMinStaff] = useState("1");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [ruleKind, setRuleKind] = useState<"date" | "weekday">("date");
  const [dateOverride, setDateOverride] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [requiredStaffCount, setRequiredStaffCount] = useState("1");
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState<CoverageRule | null>(null);
  const selectedProcess = processes.find((process) => process.id === processId);
  const rulesQuery = useQuery({
    queryKey: ["coverage-rules", processId],
    queryFn: () => fetchCoverageRules(processId),
    enabled: Boolean(processId),
  });
  const scheduleQuery = useQuery({
    queryKey: ["process-schedule", processId, effectiveDate],
    queryFn: () => fetchProcessSchedule(processId, effectiveDate),
    enabled: Boolean(processId && effectiveDate),
  });
  const processMutation = useMutation({
    mutationFn: () => updateProcess(processId, { calendarType, defaultMinStaff: Number(defaultMinStaff) }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["processes"] });
      client.invalidateQueries({ queryKey: ["process-schedule", processId] });
    },
  });
  const ruleMutation = useMutation({
    mutationFn: () => saveCoverageRule({
      dateOverride: ruleKind === "date" ? dateOverride : null,
      dayOfWeek: ruleKind === "weekday" ? Number(dayOfWeek) : null,
      requiredStaffCount: Number(requiredStaffCount),
      note,
    }, processId, editing?.id),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["coverage-rules", processId] });
      client.invalidateQueries({ queryKey: ["process-schedule", processId] });
      setEditing(null); setDateOverride(""); setNote("");
    },
  });
  const removeRule = useMutation({
    mutationFn: deleteCoverageRule,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["coverage-rules", processId] });
      client.invalidateQueries({ queryKey: ["process-schedule", processId] });
    },
  });
  const selectProcess = (id: string) => {
    setProcessId(id);
    const process = processes.find((item) => item.id === id);
    if (process) { setCalendarType(process.calendarType); setDefaultMinStaff(String(process.defaultMinStaff)); }
    processMutation.reset(); ruleMutation.reset();
  };
  const submitRule = async (event: FormEvent) => {
    event.preventDefault(); ruleMutation.reset(); await ruleMutation.mutateAsync();
  };
  const startEdit = (rule: CoverageRule) => {
    setEditing(rule);
    setRuleKind(rule.dateOverride ? "date" : "weekday");
    setDateOverride(rule.dateOverride || "");
    setDayOfWeek(String(rule.dayOfWeek ?? 1));
    setRequiredStaffCount(String(rule.requiredStaffCount));
    setNote(rule.note || "");
    ruleMutation.reset();
  };
  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="grid gap-4 md:grid-cols-[1fr_180px]">
          <Field label="Process"><select value={processId} onChange={(e) => selectProcess(e.target.value)} className={inputClass}><option value="">Select process</option>{processes.map((process) => <option key={process.id} value={process.id}>{process.code} — {process.name}</option>)}</select></Field>
          <Field label="Evaluate date"><input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className={inputClass} /></Field>
        </div>
        {selectedProcess && <form onSubmit={(event) => { event.preventDefault(); processMutation.mutate(); }} className="mt-4 grid gap-4 md:grid-cols-[1fr_180px_auto] items-end">
          <Field label="Calendar type"><select value={calendarType} onChange={(e) => setCalendarType(e.target.value as CalendarType)} className={inputClass}>{CALENDAR_TYPES.map((type) => <option key={type} value={type}>{type.replace(/_/g, " ")}</option>)}</select></Field>
          <Field label="Default minimum staff"><input type="number" min={1} step={1} required value={defaultMinStaff} onChange={(e) => setDefaultMinStaff(e.target.value)} className={inputClass} /></Field>
          <button disabled={processMutation.isPending} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold">{processMutation.isPending ? "Saving..." : "Save defaults"}</button>
        </form>}
        <FormError error={processMutation.error} />
        {effectiveDate && processId && <div className="mt-4">
          {scheduleQuery.isLoading ? <p className="text-sm text-slate-500">Calculating date rule...</p>
            : scheduleQuery.isError ? <FormError error={scheduleQuery.error} />
              : scheduleQuery.data && <div className={`p-4 rounded-lg border ${scheduleQuery.data.operates ? "bg-emerald-50 border-emerald-200" : "bg-slate-100 border-slate-200"}`}>
                <div className="flex items-center gap-2 font-semibold text-sm">{scheduleQuery.data.operates ? <CalendarDays className="w-4 h-4 text-emerald-700" /> : <Clock3 className="w-4 h-4 text-slate-500" />}{scheduleQuery.data.operates ? "Scheduled to operate" : "Not scheduled to operate"} on {effectiveDate}</div>
                <p className="text-sm text-slate-600 mt-1">Effective minimum staffing: <strong>{scheduleQuery.data.requiredStaffCount}</strong></p>
              </div>}
        </div>}
      </div>
      {selectedProcess && <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-4 border-b"><h3 className="font-bold text-slate-900">Date-specific and weekday staffing rules</h3><p className="text-xs text-slate-500 mt-1">A matching date rule takes precedence over a weekday rule; otherwise the process default applies.</p></div>
          <div className="px-4"><FormError error={removeRule.error} /></div>
          {rulesQuery.isLoading ? <p className="p-8 text-center text-sm text-slate-500">Loading staffing rules...</p>
            : rulesQuery.isError ? <ErrorState error={rulesQuery.error} retry={() => rulesQuery.refetch()} />
              : rulesQuery.data?.length ? <div className="overflow-x-auto"><table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Rule", "Minimum staff", "Note", "Actions"].map((item) => <th key={item} className="px-4 py-3 text-left">{item}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">{rulesQuery.data.map((rule) => <tr key={rule.id}>
                  <td className="px-4 py-3">{rule.dateOverride || (rule.dayOfWeek !== null ? `Every ${DAYS[rule.dayOfWeek]}` : "")}</td>
                  <td className="px-4 py-3">{rule.requiredStaffCount}</td><td className="px-4 py-3 text-slate-600">{rule.note || "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap"><button onClick={() => startEdit(rule)} className="text-indigo-600 text-xs font-semibold mr-3">Edit</button><button onClick={() => window.confirm("Delete this staffing rule?") && removeRule.mutate(rule.id)} className="text-rose-600 text-xs font-semibold">Delete</button></td>
                </tr>)}</tbody>
              </table></div> : <p className="p-8 text-center text-sm text-slate-500">No date or weekday staffing overrides.</p>}
        </section>
        <form onSubmit={submitRule} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 h-fit">
          <h3 className="font-bold text-slate-900">{editing ? "Edit staffing rule" : "Add staffing override"}</h3>
          <Field label="Rule applies to"><select value={ruleKind} onChange={(e) => setRuleKind(e.target.value as "date" | "weekday")} className={inputClass}><option value="date">Specific date</option><option value="weekday">Weekday</option></select></Field>
          {ruleKind === "date" ? <Field label="Date"><input type="date" required value={dateOverride} onChange={(e) => setDateOverride(e.target.value)} className={inputClass} /></Field>
            : <Field label="Weekday"><select value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value)} className={inputClass}>{DAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></Field>}
          <Field label="Required staff"><input type="number" min={1} step={1} required value={requiredStaffCount} onChange={(e) => setRequiredStaffCount(e.target.value)} className={inputClass} /></Field>
          <Field label="Note (optional)"><input maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} /></Field>
          <FormError error={ruleMutation.error} />
          <div className="flex gap-2"><button disabled={ruleMutation.isPending} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold">{ruleMutation.isPending ? "Saving..." : editing ? "Save rule" : "Add rule"}</button>{editing && <button type="button" onClick={() => { setEditing(null); ruleMutation.reset(); }} className="px-4 py-2 text-sm text-slate-600">Cancel</button>}</div>
        </form>
      </div>}
      <p className="text-xs text-slate-500">CUSTOM calendars operate only on dates with a matching date-specific or weekday staffing rule. The current schema cannot represent explicit closure overrides for CUSTOM calendars.</p>
    </div>
  );
}

export default function AvailabilityManagement() {
  const [section, setSection] = useState<Section>("weekly");
  const employeesQuery = useQuery({ queryKey: ["employees"], queryFn: () => fetchEmployees() });
  const processesQuery = useQuery({ queryKey: ["processes"], queryFn: () => fetchProcesses() });
  const allEmployees = employeesQuery.data || [];
  const activeEmployees = allEmployees.filter((employee) => employee.isActive);
  const processes = processesQuery.data || [];
  if (employeesQuery.isError || (section === "processes" && processesQuery.isError)) {
    const error = employeesQuery.error || processesQuery.error;
    return <ErrorState error={error} retry={() => { employeesQuery.refetch(); processesQuery.refetch(); }} />;
  }
  return (
    <div className="space-y-5">
      <header className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="text-xl font-bold text-slate-900">Availability & Scheduling Rules</h2>
        <p className="text-sm text-slate-500 mt-1">Manage employee availability, public holidays, process calendars, and staffing inputs.</p>
        <div className="flex gap-2 overflow-x-auto mt-4">
          {SECTION_LABELS.map((item) => <button key={item.id} onClick={() => setSection(item.id)} className={`px-3 py-2 text-sm rounded-lg whitespace-nowrap ${section === item.id ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-slate-600 hover:bg-slate-100"}`}>{item.label}</button>)}
        </div>
      </header>
      {employeesQuery.isLoading ? <p className="p-8 text-center text-sm text-slate-500">Loading employee directory...</p>
        : section === "weekly" ? <WeeklyOffs employees={activeEmployees} allEmployees={allEmployees} />
          : section === "leaves" ? <Leaves employees={activeEmployees} allEmployees={allEmployees} />
            : section === "holidays" ? <Holidays />
              : processesQuery.isLoading ? <p className="p-8 text-center text-sm text-slate-500">Loading processes...</p>
                : <ProcessRules processes={processes} />}
    </div>
  );
}
