import { FormEvent, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, CalendarDays, CheckCircle2, LoaderCircle } from "lucide-react";
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
  const workingShifts = roster?.shifts.filter((shift) => shift.status === "WORKING") || [];
  const hardErrors = roster?.conflicts.filter((conflict) => conflict.severity === "HARD_ERROR") || [];

  return (
    <div className="space-y-6">
      <header className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-xl font-bold text-slate-900">Monthly Roster Generation</h2>
        <p className="text-sm text-slate-500 mt-1">
          Generate a draft roster from active assignments, availability, public holidays, process calendars, and staffing rules.
        </p>
        <form onSubmit={submit} className="mt-5 flex flex-col sm:flex-row sm:items-end gap-3">
          <label className="block">
            <span className="block text-xs font-semibold text-slate-700 mb-1">Month</span>
            <select value={month} onChange={(event) => setMonth(event.target.value)} className="w-full sm:w-48 px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white">
              {Array.from({ length: 12 }, (_, index) => (
                <option key={index + 1} value={index + 1}>
                  {new Date(2024, index, 1).toLocaleString(undefined, { month: "long" })}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-slate-700 mb-1">Year</span>
            <input type="number" min={1900} max={9999} required value={year} onChange={(event) => setYear(event.target.value)} className="w-full sm:w-32 px-3 py-2 text-sm border border-slate-300 rounded-lg" />
          </label>
          <button type="submit" disabled={mutation.isPending || !month || !year} className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
            {mutation.isPending ? <><LoaderCircle className="w-4 h-4 animate-spin" /> Generating...</> : <><CalendarDays className="w-4 h-4" /> Generate Roster</>}
          </button>
        </form>
        {mutation.isPending && (
          <p className="mt-3 text-xs text-slate-500">Evaluating employee availability, process calendars, and staffing for each date...</p>
        )}
        {mutation.isError && (
          <div role="alert" className="mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg flex items-start gap-2 text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{mutation.error.message}</span>
          </div>
        )}
      </header>

      {roster && (
        <div className="space-y-5">
          <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl p-4">
            <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Draft roster generated for {roster.monthYear}</p>
              <p className="text-xs text-emerald-800 mt-1">Generation completed {new Date(roster.generatedAt).toLocaleString()}. Existing rosters are not overwritten.</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Assigned working shifts", value: roster.summary.totalAssignedShifts },
              { label: "Unfilled staffing positions", value: roster.summary.unfilledPositions },
              { label: "Total conflicts", value: roster.summary.totalConflicts },
              { label: "Operating process-days", value: roster.summary.processDays },
            ].map((item) => (
              <div key={item.label} className="bg-white border border-slate-200 rounded-xl p-5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{item.label}</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{item.value}</p>
              </div>
            ))}
          </div>

          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-slate-200">
              <h3 className="font-bold text-slate-900">Generated working assignments</h3>
              <p className="text-xs text-slate-500 mt-1">Showing {workingShifts.length} actual working shifts returned by the backend.</p>
            </div>
            {workingShifts.length ? (
              <div className="max-h-96 overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>{["Date", "Employee", "Brand", "Process", "Assignment"].map((heading) => <th key={heading} className="px-4 py-3 text-left">{heading}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {workingShifts.map((shift) => (
                      <tr key={shift.id}>
                        <td className="px-4 py-3">{shift.shiftDate}</td>
                        <td className="px-4 py-3">{shift.employee.name}<div className="text-xs text-slate-500">{shift.employee.employeeCode}</div></td>
                        <td className="px-4 py-3">{shift.process?.brand.name || "—"}</td>
                        <td className="px-4 py-3">{shift.process?.name || "—"}</td>
                        <td className="px-4 py-3">{shift.shiftType === "BACKUP_COVERAGE" ? "Backup coverage" : "Regular"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="p-6 text-sm text-slate-500">No working shifts were allocated. Review the conflicts below.</p>}
          </section>

          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-slate-200">
              <h3 className="font-bold text-slate-900">Conflicts and coverage gaps</h3>
              <p className="text-xs text-slate-500 mt-1">{hardErrors.length} hard coverage or scheduling errors; all unfilled positions are reported.</p>
            </div>
            {roster.conflicts.length ? (
              <div className="max-h-[32rem] overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>{["Date", "Severity", "Category", "Process", "Employee", "Details"].map((heading) => <th key={heading} className="px-4 py-3 text-left">{heading}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {roster.conflicts.map((conflict) => (
                      <tr key={conflict.id} className="align-top">
                        <td className="px-4 py-3 whitespace-nowrap">{conflict.shiftDate}</td>
                        <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-semibold ${conflict.severity === "HARD_ERROR" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>{conflict.severity === "HARD_ERROR" ? "Hard error" : "Warning"}</span></td>
                        <td className="px-4 py-3 whitespace-nowrap">{conflict.category.replace(/_/g, " ")}</td>
                        <td className="px-4 py-3">{conflict.process?.code || "—"}</td>
                        <td className="px-4 py-3">{conflict.employee ? `${conflict.employee.name} (${conflict.employee.employeeCode})` : "—"}</td>
                        <td className="px-4 py-3 min-w-72 text-slate-700">{conflict.message}{conflict.detailsJson && <details className="mt-1 text-xs text-slate-500"><summary className="cursor-pointer">Technical details</summary><pre className="whitespace-pre-wrap mt-1">{JSON.stringify(JSON.parse(conflict.detailsJson), null, 2)}</pre></details>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="p-6 text-sm text-emerald-700">No conflicts were reported.</p>}
          </section>

          <p className="text-xs text-slate-500">The result is a draft. This phase generates a roster only; it does not provide manual editing, approval, or alternate roster views.</p>
        </div>
      )}
    </div>
  );
}
