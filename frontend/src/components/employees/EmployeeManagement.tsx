import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Users, 
  Plus, 
  Search, 
  Filter, 
  Edit2, 
  Trash2, 
  ShieldCheck, 
  AlertCircle,
  CheckCircle2,
  X
} from "lucide-react";
import { fetchEmployees, fetchPods, createEmployee, updateEmployee, deleteEmployee } from "../../api/employees";
import { Employee, EmployeeFormData } from "../../types";
import EmployeeModal from "./EmployeeModal";
import DeleteEmployeeModal from "./DeleteEmployeeModal";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function EmployeeManagement() {
  const queryClient = useQueryClient();

  // Filters state
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPodId, setSelectedPodId] = useState("ALL");

  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deletingEmployee, setDeletingEmployee] = useState<Employee | null>(null);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);

  // Notification Banner
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4500);
  };

  // Queries
  const {
    data: employees = [],
    isLoading: isEmployeesLoading,
    isError: isEmployeesError,
    error: employeesError,
    refetch,
  } = useQuery({
    queryKey: ["employees", searchTerm, selectedPodId],
    queryFn: () => fetchEmployees({ search: searchTerm, podId: selectedPodId }),
  });

  const { data: pods = [] } = useQuery({
    queryKey: ["pods"],
    queryFn: fetchPods,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: EmployeeFormData) => createEmployee(data),
    onSuccess: (newEmp) => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      showToast(`Employee '${newEmp.name}' (${newEmp.employeeCode}) created successfully.`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<EmployeeFormData> }) =>
      updateEmployee(id, data),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      showToast(`Employee '${updated.name}' updated successfully.`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteEmployee(id),
    onSuccess: (msg) => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      setIsDeleteOpen(false);
      setDeletingEmployee(null);
      showToast(msg);
    },
    onError: (err: any) => {
      setDeleteErrorMessage(err.message || "Failed to delete employee.");
    },
  });

  const handleOpenAdd = () => {
    setEditingEmployee(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (emp: Employee) => {
    setEditingEmployee(emp);
    setIsModalOpen(true);
  };

  const handleOpenDelete = (emp: Employee) => {
    setDeletingEmployee(emp);
    setDeleteErrorMessage(null);
    setIsDeleteOpen(true);
  };

  const handleSaveEmployee = async (formData: EmployeeFormData) => {
    if (editingEmployee) {
      await updateMutation.mutateAsync({ id: editingEmployee.id, data: formData });
    } else {
      await createMutation.mutateAsync(formData);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingEmployee) return;
    await deleteMutation.mutateAsync(deletingEmployee.id);
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toast && (
        <div
          className={`flex items-center justify-between p-4 rounded-xl border shadow-sm transition-all animate-in fade-in slide-in-from-top-2 ${
            toast.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          <div className="flex items-center space-x-2">
            {toast.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
          <button
            onClick={() => setToast(null)}
            className="p-1 rounded-md hover:bg-slate-200/50 text-slate-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Control Header */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold text-slate-900">Staff & Employee Directory</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
              {employees.length} Members
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Manage operational associates, pod leads, working contracts, and weekly off patterns.
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="inline-flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add Employee</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name, code or email..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={selectedPodId}
            onChange={(e) => setSelectedPodId(e.target.value)}
            className="w-full sm:w-auto px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            <option value="ALL">All Operational Pods ({pods.length})</option>
            {pods.map((pod) => (
              <option key={pod.id} value={pod.id}>
                {pod.code} — {pod.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isEmployeesLoading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-500">Loading employees from Neon PostgreSQL...</p>
          </div>
        ) : isEmployeesError ? (
          <div className="p-12 text-center">
            <AlertCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-900">Failed to load employees</p>
            <p className="text-xs text-slate-500 mb-4">
              {(employeesError as any)?.message || "Network error"}
            </p>
            <button
              onClick={() => refetch()}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
            >
              Retry
            </button>
          </div>
        ) : employees.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-800">No employees match your search</p>
            <p className="text-xs text-slate-500 mb-4">
              Try adjusting your search terms or pod filter.
            </p>
            {(searchTerm || selectedPodId !== "ALL") && (
              <button
                onClick={() => {
                  setSearchTerm("");
                  setSelectedPodId("ALL");
                }}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-md transition-colors"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 text-xs font-semibold uppercase tracking-wider">
                  <th className="px-6 py-3">Employee</th>
                  <th className="px-6 py-3">Pod Assignment</th>
                  <th className="px-6 py-3">Role & Status</th>
                  <th className="px-6 py-3">Weekly Offs</th>
                  <th className="px-6 py-3">Contract</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50/60 transition-colors">
                    {/* Employee Identity */}
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-600 text-xs shrink-0">
                          {emp.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .slice(0, 2)}
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-semibold text-slate-900">{emp.name}</span>
                            <span className="font-mono text-[11px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                              {emp.employeeCode}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500">{emp.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* Pod */}
                    <td className="px-6 py-4">
                      {emp.pod ? (
                        <div>
                          <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                            {emp.pod.code}
                          </span>
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{emp.pod.name}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Unassigned</span>
                      )}
                    </td>

                    {/* Role & Lead Status */}
                    <td className="px-6 py-4">
                      <div className="flex flex-col items-start space-y-1">
                        {emp.isPodLead ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                            <span>Pod Lead</span>
                          </span>
                        ) : (
                          <span className="text-xs text-slate-600 font-medium">
                            {emp.role.replace(/_/g, " ")}
                          </span>
                        )}
                        {emp.leadingPod && (
                          <span className="text-[10px] text-amber-600 font-medium">
                            Leads {emp.leadingPod.code}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Weekly Offs */}
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-1">
                        {emp.weeklyOffs && emp.weeklyOffs.length > 0 ? (
                          emp.weeklyOffs.map((w, idx) => (
                            <span
                              key={idx}
                              className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100 text-[11px] font-medium"
                            >
                              {DAY_NAMES[w.dayOfWeek] || `Day ${w.dayOfWeek}`}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-slate-400">Standard</span>
                        )}
                      </div>
                    </td>

                    {/* Contract */}
                    <td className="px-6 py-4">
                      <div className="text-xs">
                        <span className="font-medium text-slate-700">
                          {emp.contractType.replace(/_/g, " ")}
                        </span>
                        <p className="text-slate-400 text-[11px]">
                          {emp.weeklyWorkDays}d/wk • Max {emp.maxConsecutiveDays} streak
                        </p>
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => handleOpenEdit(emp)}
                          title="Edit Employee"
                          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleOpenDelete(emp)}
                          title="Delete Employee"
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      <EmployeeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSaveEmployee}
        employee={editingEmployee}
        pods={pods}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />

      {/* Delete Confirmation Modal */}
      <DeleteEmployeeModal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleConfirmDelete}
        employee={deletingEmployee}
        isLoading={deleteMutation.isPending}
        errorMessage={deleteErrorMessage}
      />
    </div>
  );
}
