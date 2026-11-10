import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Filter,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  createAssignment,
  deleteAssignment,
  fetchAssignments,
  updateAssignment,
} from "../../api/assignments";
import { fetchBrands } from "../../api/brands";
import { fetchEmployees } from "../../api/employees";
import { fetchPods } from "../../api/pods";
import { fetchProcesses } from "../../api/processes";
import {
  AssignmentType,
  Brand,
  Employee,
  EmployeeProcessAssignment,
  Process,
} from "../../types";

const ASSIGNMENT_TYPES: { value: AssignmentType; label: string; className: string }[] = [
  { value: "PRIMARY", label: "Primary", className: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  { value: "SECONDARY_BACKUP", label: "Secondary Backup", className: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "FLOAT", label: "Float", className: "bg-cyan-50 text-cyan-700 border-cyan-200" },
];

interface AssignmentModalProps {
  isOpen: boolean;
  assignment: EmployeeProcessAssignment | null;
  employees: Employee[];
  brands: Brand[];
  processes: Process[];
  isSaving: boolean;
  onClose: () => void;
  onSave: (data: { employeeId: string; processId: string; assignmentType: AssignmentType }) => Promise<void>;
}

function AssignmentModal({
  isOpen,
  assignment,
  employees,
  brands,
  processes,
  isSaving,
  onClose,
  onSave,
}: AssignmentModalProps) {
  const [employeeId, setEmployeeId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [processId, setProcessId] = useState("");
  const [assignmentType, setAssignmentType] = useState<AssignmentType>("PRIMARY");
  const [error, setError] = useState<string | null>(null);
  const isEditing = Boolean(assignment);
  const availableProcesses = processes.filter((process) => process.brandId === brandId);

  useEffect(() => {
    if (assignment) {
      setEmployeeId(assignment.employeeId);
      setBrandId(assignment.process.brandId);
      setProcessId(assignment.processId);
      setAssignmentType(assignment.assignmentType);
    } else {
      const initialBrandId = brands[0]?.id || "";
      setEmployeeId(employees[0]?.id || "");
      setBrandId(initialBrandId);
      setProcessId(processes.find((process) => process.brandId === initialBrandId)?.id || "");
      setAssignmentType("PRIMARY");
    }
    setError(null);
  }, [assignment, brands, employees, processes, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!employeeId || !processId) {
      setError("Select an employee and process to continue.");
      return;
    }
    try {
      await onSave({ employeeId, processId, assignmentType });
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save assignment.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {isEditing ? "Edit Assignment Tier" : "Assign Employee to Process"}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Backup and float assignments do not schedule an employee to work.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm">
              {error}
            </div>
          )}
          <label className="block">
            <span className="block text-xs font-semibold text-slate-700 mb-1">Employee</span>
            <select
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
              disabled={isEditing}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white disabled:bg-slate-100"
              required
            >
              <option value="">Select an employee</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name} ({employee.employeeCode})
                </option>
              ))}
              {assignment && !employees.some((employee) => employee.id === assignment.employeeId) && (
                <option value={assignment.employeeId}>
                  {assignment.employee.name} ({assignment.employee.employeeCode})
                </option>
              )}
            </select>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-xs font-semibold text-slate-700 mb-1">Brand</span>
              <select
                value={brandId}
                onChange={(event) => {
                  const nextBrandId = event.target.value;
                  setBrandId(nextBrandId);
                  setProcessId(processes.find((process) => process.brandId === nextBrandId)?.id || "");
                }}
                disabled={isEditing}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white disabled:bg-slate-100"
                required
              >
                <option value="">Select a brand</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.code} — {brand.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-slate-700 mb-1">Process</span>
              <select
                value={processId}
                onChange={(event) => setProcessId(event.target.value)}
                disabled={isEditing || !brandId}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white disabled:bg-slate-100"
                required
              >
                <option value="">Select a process</option>
                {availableProcesses.map((process) => (
                  <option key={process.id} value={process.id}>
                    {process.code} — {process.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="block text-xs font-semibold text-slate-700 mb-1">Assignment Tier</span>
            <select
              value={assignmentType}
              onChange={(event) => setAssignmentType(event.target.value as AssignmentType)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {ASSIGNMENT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </label>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <button type="button" onClick={onClose} disabled={isSaving} className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg">
              Cancel
            </button>
            <button type="submit" disabled={isSaving} className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50">
              {isSaving ? "Saving..." : isEditing ? "Save Tier" : "Create Assignment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AssignmentsManagement() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [employeeId, setEmployeeId] = useState("ALL");
  const [brandId, setBrandId] = useState("ALL");
  const [processId, setProcessId] = useState("ALL");
  const [podId, setPodId] = useState("ALL");
  const [assignmentType, setAssignmentType] = useState<AssignmentType | "ALL">("ALL");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<EmployeeProcessAssignment | null>(null);
  const [deletingAssignment, setDeletingAssignment] = useState<EmployeeProcessAssignment | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const filters = { search, employeeId, brandId, processId, podId, assignmentType };
  const assignmentsQuery = useQuery({
    queryKey: ["assignments", filters],
    queryFn: () => fetchAssignments(filters),
  });
  const employeesQuery = useQuery({ queryKey: ["employees"], queryFn: () => fetchEmployees() });
  const brandsQuery = useQuery({ queryKey: ["brands"], queryFn: () => fetchBrands() });
  const processesQuery = useQuery({ queryKey: ["processes"], queryFn: () => fetchProcesses() });
  const podsQuery = useQuery({ queryKey: ["pods"], queryFn: () => fetchPods() });
  const employees = employeesQuery.data || [];
  const brands = brandsQuery.data || [];
  const processes = processesQuery.data || [];
  const pods = podsQuery.data || [];
  const visibleProcesses = processes.filter((process) => brandId === "ALL" || process.brandId === brandId);

  const invalidateAssignmentData = () => {
    queryClient.invalidateQueries({ queryKey: ["assignments"] });
    queryClient.invalidateQueries({ queryKey: ["employees"] });
    queryClient.invalidateQueries({ queryKey: ["processes"] });
    queryClient.invalidateQueries({ queryKey: ["brands"] });
  };

  const saveMutation = useMutation({
    mutationFn: (data: { employeeId: string; processId: string; assignmentType: AssignmentType }) =>
      editingAssignment
        ? updateAssignment(editingAssignment.id, data.assignmentType)
        : createAssignment(data),
    onSuccess: (saved) => {
      invalidateAssignmentData();
      setToast({
        message: `${saved.employee.name} is ${saved.assignmentType === "PRIMARY" ? "a primary" : saved.assignmentType === "FLOAT" ? "a float" : "a secondary backup"} for ${saved.process.name}.`,
        type: "success",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAssignment(id),
    onSuccess: (message) => {
      invalidateAssignmentData();
      setDeletingAssignment(null);
      setDeleteError(null);
      setToast({ message, type: "success" });
    },
    onError: (error) => {
      setDeleteError(error instanceof Error ? error.message : "Failed to delete assignment.");
    },
  });

  const openCreate = () => {
    setEditingAssignment(null);
    setIsModalOpen(true);
  };
  const openEdit = (assignment: EmployeeProcessAssignment) => {
    setEditingAssignment(assignment);
    setIsModalOpen(true);
  };

  const saveAssignment = async (data: {
    employeeId: string;
    processId: string;
    assignmentType: AssignmentType;
  }) => {
    await saveMutation.mutateAsync(data);
  };

  const assignments = assignmentsQuery.data || [];
  const isLoading = assignmentsQuery.isLoading || employeesQuery.isLoading ||
    brandsQuery.isLoading || processesQuery.isLoading || podsQuery.isLoading;
  const queryError = assignmentsQuery.error || employeesQuery.error || brandsQuery.error ||
    processesQuery.error || podsQuery.error;

  return (
    <div className="space-y-6">
      {toast && (
        <div className={`flex items-center justify-between p-4 rounded-xl border ${
          toast.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rose-50 border-rose-200 text-rose-800"
        }`}>
          <div className="flex items-center gap-2 text-sm font-medium">
            {toast.type === "success" ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            {toast.message}
          </div>
          <button onClick={() => setToast(null)} aria-label="Dismiss notification"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900">Employee–Process Assignments</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
              {assignments.length} assignments
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Manage process qualifications and backup designations. A backup assignment does not schedule an employee to work.
          </p>
        </div>
        <button onClick={openCreate} className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold">
          <Plus className="w-4 h-4" /> Assign Employee
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
        <div className="relative w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search employee, code, process, or brand..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <label className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
              <option value="ALL">All employees</option>
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employeeCode} — {employee.name}</option>)}
            </select>
          </label>
          <select value={podId} onChange={(event) => setPodId(event.target.value)} className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
            <option value="ALL">All pods</option>
            {pods.map((pod) => <option key={pod.id} value={pod.id}>{pod.code} — {pod.name}</option>)}
          </select>
          <select value={brandId} onChange={(event) => { setBrandId(event.target.value); setProcessId("ALL"); }} className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
            <option value="ALL">All brands</option>
            {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.code} — {brand.name}</option>)}
          </select>
          <select value={processId} onChange={(event) => setProcessId(event.target.value)} className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
            <option value="ALL">All processes</option>
            {visibleProcesses.map((process) => <option key={process.id} value={process.id}>{process.code} — {process.name}</option>)}
          </select>
          <select value={assignmentType} onChange={(event) => setAssignmentType(event.target.value as AssignmentType | "ALL")} className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
            <option value="ALL">All tiers</option>
            {ASSIGNMENT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-slate-500">Loading assignments...</div>
        ) : queryError ? (
          <div className="p-12 text-center">
            <AlertCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
            <p className="text-sm text-rose-700">{queryError instanceof Error ? queryError.message : "Failed to load assignment data."}</p>
            <button onClick={() => { assignmentsQuery.refetch(); employeesQuery.refetch(); brandsQuery.refetch(); processesQuery.refetch(); podsQuery.refetch(); }} className="mt-3 text-sm text-indigo-600 font-semibold">
              Try again
            </button>
          </div>
        ) : assignments.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-semibold text-slate-700">No assignments match these filters.</p>
            <p className="text-xs text-slate-500 mt-1">Try another search or add an employee to a process.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  {["Employee", "Pod", "Brand", "Process", "Assignment Tier", "Actions"].map((heading) => (
                    <th key={heading} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {assignments.map((assignment) => {
                  const tier = ASSIGNMENT_TYPES.find((type) => type.value === assignment.assignmentType) || ASSIGNMENT_TYPES[0];
                  return (
                    <tr key={assignment.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-4">
                        <div className="text-sm font-semibold text-slate-900">{assignment.employee.name}</div>
                        <div className="text-xs font-mono text-slate-500">{assignment.employee.employeeCode}</div>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600">{assignment.employee.pod?.name || "Unassigned"}</td>
                      <td className="px-5 py-4">
                        <div className="text-sm font-medium text-slate-800">{assignment.process.brand.name}</div>
                        <div className="text-xs font-mono text-slate-500">{assignment.process.brand.code}</div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="text-sm font-medium text-slate-800">{assignment.process.name}</div>
                        <div className="text-xs font-mono text-slate-500">{assignment.process.code}</div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex px-2.5 py-1 rounded-full border text-xs font-semibold ${tier.className}`}>
                          {tier.label}
                        </span>
                        {assignment.assignmentType === "SECONDARY_BACKUP" && (
                          <div className="text-[11px] text-slate-500 mt-1">Designation only — not scheduled</div>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(assignment)} aria-label={`Edit ${assignment.employee.name} assignment`} className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => { setDeletingAssignment(assignment); setDeleteError(null); }} aria-label={`Delete ${assignment.employee.name} assignment`} className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {ASSIGNMENT_TYPES.map((type) => (
          <span key={type.value} className={`inline-flex px-2.5 py-1 rounded-full border text-xs font-semibold ${type.className}`}>{type.label}</span>
        ))}
        <span className="text-xs text-slate-500 self-center">Tier indicates an assignment designation, not an actual scheduled shift.</span>
      </div>

      <AssignmentModal
        isOpen={isModalOpen}
        assignment={editingAssignment}
        employees={employees}
        brands={brands}
        processes={processes}
        isSaving={saveMutation.isPending}
        onClose={() => setIsModalOpen(false)}
        onSave={saveAssignment}
      />

      {deletingAssignment && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-rose-50/50">
              <h3 className="font-bold text-slate-900">Delete Assignment?</h3>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                Remove <strong>{deletingAssignment.employee.name}</strong> from{" "}
                <strong>{deletingAssignment.process.name}</strong>?
              </p>
              {deleteError && <p className="p-3 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">{deleteError}</p>}
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                <button onClick={() => { setDeletingAssignment(null); setDeleteError(null); }} disabled={deleteMutation.isPending} className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg">
                  Cancel
                </button>
                <button onClick={() => deleteMutation.mutate(deletingAssignment.id)} disabled={deleteMutation.isPending} className="px-4 py-2 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50">
                  {deleteMutation.isPending ? "Deleting..." : "Delete Assignment"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
