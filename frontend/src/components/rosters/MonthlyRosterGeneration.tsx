import { FormEvent, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, Calendar, CalendarDays, CheckCircle2, LoaderCircle, TriangleAlert } from "lucide-react";
import { generateRoster } from "../../api/rosters";

export default function MonthlyRosterGeneration() {
  const today = new Date();
  const [month, setMonth] = useState(String(today.getMonth() + 1));
  const [year, setYear] = useState(String(today.getFullYear()));
  const mutation = useMutation({
    mutationFn: () => generateRoster(Number(month), Number(year)),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.reset();
    mutation.mutate();
  };
  const roster = mutation.data;
  const hardErrors = roster?.conflicts.filter((c) => c.severity === "HARD_ERROR") || [];
  const warnings = roster?.conflicts.filter((c) => c.severity !== "HARD_ERROR") || [];

  return (
    <div className="space-y-6">
      {/* Header + Form */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-start gap-3 mb-5">
          <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
            <Calendar className="w-4 h-4 text-indigo-600" />
          </div>
          <div>
            <h2 className="app-page-title">Generate Monthly Roster</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Creates a saved roster from active assignments, availability, public holidays, process calendars, and staffing rules. An existing roster for the same month will not be overwritten.
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="flex flex-col sm:flex-row sm:items-end gap-3 pt-4 border-t border-slate-100">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Month</span>
            <select
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="w-full sm:w-48 px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {new Date(2024, i, 1).toLocaleString(undefined, { month: "long" })}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Year</span>
            <input
              type="number"
              min={1900}
              max={9999}
              required
              value={year}
              onChange={(event) => setYear(event.target.value)}
              className="w-full sm:w-28 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
          <button
            type="submit"
            disabled={mutation.isPending || !month || !year}
            className="inline-flex min-h-10 items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          >
            {mutation.isPending
              ? <><LoaderCircle className="w-4 h-4 animate-spin" /> Generating...</>
              : <><CalendarDays className="w-4 h-4" /> Generate Roster</>}
          </button>
        </form>

        {mutation.isPending && (
          <p className="mt-3 text-xs text-slate-400">Evaluating employee availability, process calendars, and staffing requirements for each day...</p>
        )}
        {mutation.isError && (
          <div role="alert" className="mt-4 flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{mutation.error.message}</span>
          </div>
        )}
      </div>

      {/* Results */}
      {roster && (
        <div className="space-y-4">
          {/* Success banner */}
          <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl p-4">
            <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Roster generated for {roster.monthYear}</p>
              <p className="text-xs text-emerald-700 mt-0.5">Completed {new Date(roster.generatedAt).toLocaleString()}</p>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Working shifts", value: roster.summary.totalAssignedShifts, highlight: false },
              { label: "Unfilled positions", value: roster.summary.unfilledPositions, highlight: roster.summary.unfilledPositions > 0 },
              { label: "Total conflicts", value: roster.summary.totalConflicts, highlight: roster.summary.totalConflicts > 0 },
              { label: "Process-days", value: roster.summary.processDays, highlight: false },
            ].map((item) => (
              <div key={item.label} className={`bg-white border rounded-xl p-5 ${item.highlight ? "border-rose-200" : "border-slate-200"}`}>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{item.label}</p>
                <p className={`text-2xl font-bold mt-1 ${item.highlight ? "text-rose-700" : "text-slate-900"}`}>{item.value}</p>
              </div>
            ))}
          </div>

          {/* Conflict summary */}
          {roster.conflicts.length > 0 && (
            <div className={`flex items-start gap-3 p-4 rounded-xl border ${hardErrors.length > 0 ? "bg-rose-50 border-rose-200" : "bg-amber-50 border-amber-200"}`}>
              <TriangleAlert className={`w-4 h-4 mt-0.5 shrink-0 ${hardErrors.length > 0 ? "text-rose-600" : "text-amber-600"}`} />
              <div>
                <p className={`text-sm font-semibold ${hardErrors.length > 0 ? "text-rose-900" : "text-amber-900"}`}>
                  {hardErrors.length > 0 ? `${hardErrors.length} hard coverage error${hardErrors.length !== 1 ? "s" : ""}` : "No hard errors"}{warnings.length > 0 ? ` · ${warnings.length} warning${warnings.length !== 1 ? "s" : ""}` : ""}
                </p>
                <p className="text-xs mt-0.5 text-slate-600">Review the conflict table below. Use Roster Views to fill vacancies and revalidate.</p>
              </div>
            </div>
          )}

          {/* Working shifts table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="app-section-title">Working Assignments</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {roster.shifts.filter((s) => s.status === "WORKING").length} working shifts allocated
                </p>
              </div>
            </div>
            {roster.shifts.filter((s) => s.status === "WORKING").length ? (
              <div className="max-h-96 overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-100 text-[13px] font-semibold text-slate-500 uppercase tracking-wide">
                    <tr>
                      {["Date", "Employee", "Brand", "Process", "Type"].map((h) => (
                        <th key={h} className="px-5 py-3.5 text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {roster.shifts
                      .filter((s) => s.status === "WORKING")
                      .map((shift) => (
                        <tr key={shift.id} className="hover:bg-slate-50/60">
                          <td className="px-5 py-3.5 font-mono text-[13px] text-slate-600 whitespace-nowrap">{shift.shiftDate}</td>
                          <td className="px-5 py-3.5">
                            <span className="font-semibold text-slate-900">{shift.employee.name}</span>
                            <div className="text-xs text-slate-400">{shift.employee.employeeCode}</div>
                          </td>
                          <td className="px-5 py-3.5 text-[13px] text-slate-700">{shift.process?.brand.name || "—"}</td>
                          <td className="px-5 py-3.5 text-[13px] text-slate-700">{shift.process?.name || "—"}</td>
                          <td className="px-5 py-3.5">
                            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold border ${shift.shiftType === "BACKUP_COVERAGE" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
                              {shift.shiftType === "BACKUP_COVERAGE" ? "Backup" : "Regular"}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="p-10 text-center text-sm text-slate-400">No working shifts were allocated. Review conflicts below.</p>
            )}
          </div>

          {/* Conflicts table */}
          {roster.conflicts.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="p-5 border-b border-slate-100">
                <h3 className="app-section-title">Conflicts & Coverage Gaps</h3>
                <p className="text-xs text-slate-400 mt-0.5">{roster.conflicts.length} total · {hardErrors.length} hard errors</p>
              </div>
              <div className="max-h-[32rem] overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-100 text-[13px] font-semibold text-slate-500 uppercase tracking-wide">
                    <tr>
                      {["Date", "Severity", "Category", "Process", "Employee", "Details"].map((h) => (
                        <th key={h} className="px-5 py-3.5 text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {roster.conflicts.map((conflict) => (
                      <tr key={conflict.id} className="align-top hover:bg-slate-50/60">
                        <td className="px-5 py-3.5 font-mono text-[13px] text-slate-600 whitespace-nowrap">{conflict.shiftDate}</td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold border ${conflict.severity === "HARD_ERROR" ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                            {conflict.severity === "HARD_ERROR" ? "Hard error" : "Warning"}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-[13px] text-slate-600 whitespace-nowrap">{conflict.category.replace(/_/g, " ")}</td>
                        <td className="px-5 py-3.5 text-[13px] text-slate-600">{conflict.process?.code || "—"}</td>
                        <td className="px-5 py-3.5 text-[13px] text-slate-600 whitespace-nowrap">
                          {conflict.employee ? `${conflict.employee.name} (${conflict.employee.employeeCode})` : "—"}
                        </td>
                        <td className="px-5 py-3.5 text-sm text-slate-700 min-w-72">
                          {conflict.message}
                          {conflict.detailsJson && (
                            <details className="mt-1 text-slate-500">
                              <summary className="cursor-pointer text-indigo-600 hover:text-indigo-800">Technical details</summary>
                              <pre className="whitespace-pre-wrap mt-1 text-[11px]">{JSON.stringify(JSON.parse(conflict.detailsJson), null, 2)}</pre>
                            </details>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p className="text-xs text-slate-400 pl-1">
            This is a saved draft. Use <strong>Roster Views</strong> to fill vacancies, replace assignments, and revalidate.
          </p>
        </div>
      )}
    </div>
  );
}
