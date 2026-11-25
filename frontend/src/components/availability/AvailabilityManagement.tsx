import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CalendarDays, Clock3, Trash2, Pencil, Plus, X } from "lucide-react";
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

const LEAVE_STATUS_STYLES: Record<string, string> = {
  APPROVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  REJECTED: "bg-rose-50 text-rose-700 border-rose-200",
};

function ErrorState({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="p-10 text-center">
      <AlertCircle className="w-7 h-7 text-rose-500 mx-auto mb-2" />
      <p className="text-sm text-rose-700 mb-3">{error instanceof Error ? error.message : "Unable to load data."}</p>
      <button onClick={retry} className="px-3 py-1.5 text-sm font-semibold text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50">Try again</button>
    </div>
  );
}

function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div role="alert" className="flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">
      <AlertCircle className="w-4 h-4 shrink-0" />
      <span>{error instanceof Error ? error.message : "Request failed"}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

const inputClass = "w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-400 transition-colors";

function SectionPanel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h3 className="app-section-title">{title}</h3>
        <p className="mt-0.5 text-sm leading-5 text-slate-500">{description}</p>
      </div>
      {children}
    </div>
  );
}

function ActionCell({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-1">
      <button onClick={onEdit} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Edit">
        <Pencil className="w-3.5 h-3.5" />
      </button>
      <button onClick={onDelete} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Delete">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

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
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <SectionPanel title="Weekly Off Records" description="Recurring and one-time weekly offs by employee">
        <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3">
          <select value={filterEmployee} onChange={(e) => setFilterEmployee(e.target.value)} className={`${inputClass} sm:max-w-xs`}>
            <option value="ALL">All employees</option>
            {allEmployees.map((emp) => <option key={emp.id} value={emp.id}>{emp.employeeCode} — {emp.name}</option>)}
          </select>
          <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className={`${inputClass} sm:max-w-xs`} aria-label="Filter by date" />
          {filterDate && (
            <button onClick={() => setFilterDate("")} className="text-xs text-indigo-600 font-medium hover:text-indigo-800 flex items-center gap-1">
              <X className="w-3 h-3" /> Clear date
            </button>
          )}
        </div>
        {remove.error && <div className="px-4 pt-3"><FormError error={remove.error} /></div>}
        {query.isLoading ? (
          <p className="p-10 text-center text-sm text-slate-500">Loading weekly offs...</p>
        ) : query.isError ? (
          <ErrorState error={query.error} retry={() => query.refetch()} />
        ) : query.data?.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100 text-[13px] font-semibold text-slate-500 uppercase tracking-wide">
                <tr>
                  {["Employee", "Day Off", "Schedule Type", "Actions"].map((h) => (
                    <th key={h} className="px-5 py-3 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {query.data.map((record) => (
                  <tr key={record.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3">
                      <span className="font-semibold text-slate-900">{record.employee.name}</span>
                      <div className="text-xs text-slate-400">{record.employee.employeeCode}</div>
                    </td>
                    <td className="px-5 py-3 text-slate-700">{DAYS[record.dayOfWeek]}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${record.isStandard ? "bg-slate-100 text-slate-700 border-slate-200" : "bg-indigo-50 text-indigo-700 border-indigo-200"}`}>
                        {record.isStandard ? "Recurring weekly" : `One-time · ${record.specificDate}`}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <ActionCell
                        onEdit={() => startEdit(record)}
                        onDelete={() => window.confirm(`Delete ${record.employee.name}'s weekly off on ${DAYS[record.dayOfWeek]}?`) && remove.mutate(record.id)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-10 text-center text-sm text-slate-400">No weekly offs match these filters.</p>
        )}
      </SectionPanel>

      <form onSubmit={submit} className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-4 h-fit">
        <div className="flex items-center justify-between">
          <h3 className="app-section-title">{editing ? "Edit weekly off" : "Add weekly off"}</h3>
          {editing && (
            <button type="button" onClick={() => { setEditing(null); mutation.reset(); }} className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1">
              <X className="w-3 h-3" /> Cancel
            </button>
          )}
        </div>
        {!editing && (
          <Field label="Employee">
            <select required value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={inputClass}>
              <option value="">Select employee</option>
              {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.employeeCode} — {emp.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Day of week">
          <select value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value)} className={inputClass}>
            {DAYS.map((day, i) => <option key={day} value={i}>{day}</option>)}
          </select>
        </Field>
        <Field label="Schedule type">
          <select value={isStandard ? "standard" : "specific"} onChange={(e) => setIsStandard(e.target.value === "standard")} className={inputClass}>
            <option value="standard">Recurring weekly</option>
            <option value="specific">One-time date</option>
          </select>
        </Field>
        {!isStandard && (
          <Field label="Specific date">
            <input type="date" required value={specificDate} onChange={(e) => setSpecificDate(e.target.value)} className={inputClass} />
          </Field>
        )}
        <FormError error={mutation.error} />
        <button disabled={mutation.isPending} className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 w-full justify-center transition-colors">
          <Plus className="w-4 h-4" />
          {mutation.isPending ? "Saving..." : editing ? "Save changes" : "Add weekly off"}
        </button>
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
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <SectionPanel title="Leave & Comp-Off Records" description="Employee leave history by date range">
        <div className="p-4 border-b border-slate-100 grid gap-3 sm:grid-cols-3">
          <select value={filterEmployee} onChange={(e) => setFilterEmployee(e.target.value)} className={inputClass}>
            <option value="ALL">All employees</option>
            {allEmployees.map((emp) => <option key={emp.id} value={emp.id}>{emp.employeeCode} — {emp.name}</option>)}
          </select>
          <input type="date" aria-label="Filter from date" value={filterStart} onChange={(e) => setFilterStart(e.target.value)} className={inputClass} />
          <input type="date" aria-label="Filter to date" value={filterEnd} onChange={(e) => setFilterEnd(e.target.value)} className={inputClass} />
        </div>
        {remove.error && <div className="px-4 pt-3"><FormError error={remove.error} /></div>}
        {query.isLoading ? (
          <p className="p-10 text-center text-sm text-slate-500">Loading leave records...</p>
        ) : query.isError ? (
          <ErrorState error={query.error} retry={() => query.refetch()} />
        ) : query.data?.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100 text-[13px] font-semibold text-slate-500 uppercase tracking-wide">
                <tr>
                  {["Employee", "Dates", "Type", "Status", "Actions"].map((h) => (
                    <th key={h} className="px-5 py-3 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {query.data.map((record) => (
                  <tr key={record.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3">
                      <span className="font-semibold text-slate-900">{record.employee.name}</span>
                      <div className="text-xs text-slate-400">{record.employee.employeeCode}</div>
                    </td>
                    <td className="px-5 py-3 text-slate-700 text-xs">
                      {record.startDate}
                      {record.endDate !== record.startDate ? ` – ${record.endDate}` : ""}
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-xs font-medium text-slate-700">
                        {record.leaveType === "COMP_OFF" ? "Comp-Off" : record.leaveType}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold border ${LEAVE_STATUS_STYLES[record.status] || "bg-slate-100 text-slate-600 border-slate-200"}`}>
                        {record.status}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <ActionCell
                        onEdit={() => startEdit(record)}
                        onDelete={() => window.confirm(`Delete this ${record.leaveType === "COMP_OFF" ? "comp-off" : "leave"} record?`) && remove.mutate(record.id)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-10 text-center text-sm text-slate-400">No leave records match these filters.</p>
        )}
      </SectionPanel>

      <form onSubmit={submit} className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-4 h-fit">
        <div className="flex items-center justify-between">
          <h3 className="app-section-title">{editing ? "Edit leave / comp-off" : "Add leave / comp-off"}</h3>
          {editing && (
            <button type="button" onClick={() => { setEditing(null); mutation.reset(); }} className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1">
              <X className="w-3 h-3" /> Cancel
            </button>
          )}
        </div>
        {!editing && (
          <Field label="Employee">
            <select required value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={inputClass}>
              <option value="">Select employee</option>
              {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.employeeCode} — {emp.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Leave type">
          <select value={leaveType} onChange={(e) => setLeaveType(e.target.value as LeaveType)} className={inputClass}>
            {LEAVE_TYPES.map((type) => <option key={type} value={type}>{type === "COMP_OFF" ? "Comp-Off" : type}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={leaveType === "COMP_OFF" ? "Comp-off date" : "Start date"}>
            <input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
          </Field>
          {leaveType !== "COMP_OFF" && (
            <Field label="End date">
              <input type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
            </Field>
          )}
        </div>
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value as LeaveStatus)} className={inputClass}>
            {LEAVE_STATUSES.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </Field>
        <Field label="Reason (optional)">
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className={inputClass} />
        </Field>
        <FormError error={mutation.error} />
        <button disabled={mutation.isPending} className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 w-full justify-center transition-colors">
          <Plus className="w-4 h-4" />
          {mutation.isPending ? "Saving..." : editing ? "Save changes" : "Add record"}
        </button>
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
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <SectionPanel title="Public Holidays" description="Mandatory and optional days that affect process scheduling">
        <div className="p-4 border-b border-slate-100 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search holiday name..." className={inputClass} />
          <input aria-label="Filter year" value={year} onChange={(e) => setYear(e.target.value)} pattern="\d{4}" placeholder="YYYY" className={inputClass} />
          <input type="date" aria-label="From date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} className={inputClass} />
          <input type="date" aria-label="To date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} className={inputClass} />
        </div>
        {remove.error && <div className="px-4 pt-3"><FormError error={remove.error} /></div>}
        {query.isLoading ? (
          <p className="p-10 text-center text-sm text-slate-500">Loading public holidays...</p>
        ) : query.isError ? (
          <ErrorState error={query.error} retry={() => query.refetch()} />
        ) : query.data?.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100 text-[13px] font-semibold text-slate-500 uppercase tracking-wide">
                <tr>
                  {["Date", "Holiday", "Scheduling Impact", "Actions"].map((h) => (
                    <th key={h} className="px-5 py-3 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {query.data.map((holiday) => (
                  <tr key={holiday.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3 text-xs font-mono text-slate-600 whitespace-nowrap">{holiday.date}</td>
                    <td className="px-5 py-3">
                      <span className="font-semibold text-slate-900">{holiday.name}</span>
                      {holiday.description && <div className="text-xs text-slate-400 mt-0.5">{holiday.description}</div>}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold border ${holiday.isMandatoryOff ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-slate-100 text-slate-600 border-slate-200"}`}>
                        {holiday.isMandatoryOff ? "Mandatory off" : "Optional"}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <ActionCell
                        onEdit={() => startEdit(holiday)}
                        onDelete={() => window.confirm(`Delete ${holiday.name}?`) && remove.mutate(holiday.id)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-10 text-center text-sm text-slate-400">No public holidays found.</p>
        )}
      </SectionPanel>

      <form onSubmit={submit} className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-4 h-fit">
        <div className="flex items-center justify-between">
          <h3 className="app-section-title">{editing ? "Edit public holiday" : "Add public holiday"}</h3>
          {editing && (
            <button type="button" onClick={() => { setEditing(null); mutation.reset(); }} className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1">
              <X className="w-3 h-3" /> Cancel
            </button>
          )}
        </div>
        <Field label="Date"><input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} /></Field>
        <Field label="Holiday name"><input required minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} /></Field>
        <Field label="Description (optional)"><input maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} /></Field>
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input type="checkbox" checked={isMandatoryOff} onChange={(e) => setIsMandatoryOff(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-indigo-600" />
          Mandatory off for calendars that exclude public holidays
        </label>
        <FormError error={mutation.error} />
        <button disabled={mutation.isPending} className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 w-full justify-center transition-colors">
          <Plus className="w-4 h-4" />
          {mutation.isPending ? "Saving..." : editing ? "Save changes" : "Add holiday"}
        </button>
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
  const selectedProcess = processes.find((p) => p.id === processId);
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

  const calendarLabels: Record<CalendarType, string> = {
    ALL_365_DAYS: "365 Days (all days incl. Sundays & PH)",
    ALL_EXCEPT_PUBLIC_HOLIDAYS: "All days except public holidays",
    ALL_EXCEPT_SUNDAYS_AND_PUBLIC_HOLIDAYS: "Mon–Sat, excluding public holidays",
    CUSTOM: "Custom (date/weekday rules only)",
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
        <h3 className="app-section-title mb-4">Select Process</h3>
        <div className="grid gap-4 md:grid-cols-[1fr_200px]">
          <Field label="Process">
            <select value={processId} onChange={(e) => selectProcess(e.target.value)} className={inputClass}>
              <option value="">Select a process to configure</option>
              {processes.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
            </select>
          </Field>
          <Field label="Preview date (optional)">
            <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className={inputClass} />
          </Field>
        </div>

        {selectedProcess && (
          <form onSubmit={(e) => { e.preventDefault(); processMutation.mutate(); }} className="mt-5 pt-5 border-t border-slate-100 grid gap-4 md:grid-cols-[1fr_180px_auto] items-end">
            <Field label="Calendar type">
              <select value={calendarType} onChange={(e) => setCalendarType(e.target.value as CalendarType)} className={inputClass}>
                {CALENDAR_TYPES.map((type) => <option key={type} value={type}>{calendarLabels[type]}</option>)}
              </select>
            </Field>
            <Field label="Default minimum staff">
              <input type="number" min={1} step={1} required value={defaultMinStaff} onChange={(e) => setDefaultMinStaff(e.target.value)} className={inputClass} />
            </Field>
            <button disabled={processMutation.isPending} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap">
              {processMutation.isPending ? "Saving..." : "Save defaults"}
            </button>
          </form>
        )}
        <FormError error={processMutation.error} />

        {effectiveDate && processId && (
          <div className="mt-4">
            {scheduleQuery.isLoading && <p className="text-sm text-slate-500">Calculating rule...</p>}
            {scheduleQuery.isError && <FormError error={scheduleQuery.error} />}
            {scheduleQuery.data && (
              <div className={`flex items-start gap-3 p-4 rounded-lg border ${scheduleQuery.data.operates ? "bg-emerald-50 border-emerald-200" : "bg-slate-100 border-slate-200"}`}>
                {scheduleQuery.data.operates
                  ? <CalendarDays className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  : <Clock3 className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />}
                <div>
                  <p className={`font-semibold text-sm ${scheduleQuery.data.operates ? "text-emerald-900" : "text-slate-700"}`}>
                    {scheduleQuery.data.operates ? "Scheduled to operate" : "Not scheduled to operate"} on {effectiveDate}
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">Effective minimum staffing: <strong>{scheduleQuery.data.requiredStaffCount}</strong></p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {selectedProcess && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <SectionPanel title="Staffing Override Rules" description="Date-specific or weekday rules that override the process default">
            {removeRule.error && <div className="px-4 pt-3"><FormError error={removeRule.error} /></div>}
            {rulesQuery.isLoading ? (
              <p className="p-10 text-center text-sm text-slate-500">Loading staffing rules...</p>
            ) : rulesQuery.isError ? (
              <ErrorState error={rulesQuery.error} retry={() => rulesQuery.refetch()} />
            ) : rulesQuery.data?.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100 text-[13px] font-semibold text-slate-500 uppercase tracking-wide">
                    <tr>
                      {["Rule applies to", "Min. Staff", "Note", "Actions"].map((h) => (
                        <th key={h} className="px-5 py-3 text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {rulesQuery.data.map((rule) => (
                      <tr key={rule.id} className="hover:bg-slate-50/60">
                        <td className="px-5 py-3 font-mono text-xs text-slate-700">
                          {rule.dateOverride || (rule.dayOfWeek !== null ? `Every ${DAYS[rule.dayOfWeek]}` : "")}
                        </td>
                        <td className="px-5 py-3">
                          <span className="font-bold text-slate-900">{rule.requiredStaffCount}</span>
                          <span className="text-xs text-slate-400 ml-1">staff</span>
                        </td>
                        <td className="px-5 py-3 text-slate-500 text-xs">{rule.note || "—"}</td>
                        <td className="px-5 py-3">
                          <ActionCell
                            onEdit={() => startEdit(rule)}
                            onDelete={() => window.confirm("Delete this staffing rule?") && removeRule.mutate(rule.id)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="p-10 text-center text-sm text-slate-400">No date or weekday overrides configured.</p>
            )}
          </SectionPanel>

          <form onSubmit={submitRule} className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-4 h-fit">
            <div className="flex items-center justify-between">
              <h3 className="app-section-title">{editing ? "Edit staffing rule" : "Add staffing override"}</h3>
              {editing && (
                <button type="button" onClick={() => { setEditing(null); ruleMutation.reset(); }} className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1">
                  <X className="w-3 h-3" /> Cancel
                </button>
              )}
            </div>
            <Field label="Rule applies to">
              <select value={ruleKind} onChange={(e) => setRuleKind(e.target.value as "date" | "weekday")} className={inputClass}>
                <option value="date">Specific date</option>
                <option value="weekday">Weekday (recurring)</option>
              </select>
            </Field>
            {ruleKind === "date" ? (
              <Field label="Date"><input type="date" required value={dateOverride} onChange={(e) => setDateOverride(e.target.value)} className={inputClass} /></Field>
            ) : (
              <Field label="Day of week">
                <select value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value)} className={inputClass}>
                  {DAYS.map((day, i) => <option key={day} value={i}>{day}</option>)}
                </select>
              </Field>
            )}
            <Field label="Required staff">
              <input type="number" min={1} step={1} required value={requiredStaffCount} onChange={(e) => setRequiredStaffCount(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Note (optional)">
              <input maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
            </Field>
            <FormError error={ruleMutation.error} />
            <button disabled={ruleMutation.isPending} className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 w-full justify-center transition-colors">
              <Plus className="w-4 h-4" />
              {ruleMutation.isPending ? "Saving..." : editing ? "Save rule" : "Add override"}
            </button>
          </form>
        </div>
      )}

      {selectedProcess && (
        <p className="text-xs text-slate-400 pl-1">
          CUSTOM calendars operate only on dates with a matching date-specific or weekday staffing rule.
        </p>
      )}
    </div>
  );
}

export default function AvailabilityManagement() {
  const [section, setSection] = useState<Section>("weekly");
  const employeesQuery = useQuery({ queryKey: ["employees"], queryFn: () => fetchEmployees() });
  const processesQuery = useQuery({ queryKey: ["processes"], queryFn: () => fetchProcesses() });
  const allEmployees = employeesQuery.data || [];
  const activeEmployees = allEmployees.filter((emp) => emp.isActive);
  const processes = processesQuery.data || [];

  if (employeesQuery.isError || (section === "processes" && processesQuery.isError)) {
    const error = employeesQuery.error || processesQuery.error;
    return <ErrorState error={error} retry={() => { employeesQuery.refetch(); processesQuery.refetch(); }} />;
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        <h2 className="app-page-title">Availability & Scheduling Rules</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">Manage employee availability, public holidays, process calendars, and staffing inputs used during roster generation.</p>
        <div className="flex gap-1 overflow-x-auto mt-4 pb-0.5">
          {SECTION_LABELS.map((item) => (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className={`min-h-10 rounded-lg px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                section === item.id
                  ? "bg-indigo-50 text-indigo-700 font-semibold"
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {employeesQuery.isLoading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <div className="w-8 h-8 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500">Loading employee directory...</p>
        </div>
      ) : section === "weekly" ? (
        <WeeklyOffs employees={activeEmployees} allEmployees={allEmployees} />
      ) : section === "leaves" ? (
        <Leaves employees={activeEmployees} allEmployees={allEmployees} />
      ) : section === "holidays" ? (
        <Holidays />
      ) : processesQuery.isLoading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <div className="w-8 h-8 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500">Loading processes...</p>
        </div>
      ) : (
        <ProcessRules processes={processes} />
      )}
    </div>
  );
}
