import { useState, useEffect } from "react";
import { X, AlertCircle } from "lucide-react";
import { Employee, EmployeeFormData, Pod } from "../../types";

interface EmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: EmployeeFormData) => Promise<void>;
  employee?: Employee | null;
  pods: Pod[];
  isLoading: boolean;
}

const DAY_LABELS = [
  { day: 0, label: "Sun" },
  { day: 1, label: "Mon" },
  { day: 2, label: "Tue" },
  { day: 3, label: "Wed" },
  { day: 4, label: "Thu" },
  { day: 5, label: "Fri" },
  { day: 6, label: "Sat" },
];

export default function EmployeeModal({
  isOpen,
  onClose,
  onSubmit,
  employee,
  pods,
  isLoading,
}: EmployeeModalProps) {
  const isEditing = Boolean(employee);

  const [formData, setFormData] = useState<EmployeeFormData>({
    employeeCode: "",
    name: "",
    email: "",
    role: "OPERATIONS_ASSOCIATE",
    isPodLead: false,
    podId: "",
    contractType: "FULL_TIME",
    weeklyWorkDays: 5,
    maxConsecutiveDays: 6,
    weeklyOffs: [0, 6],
  });

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (employee) {
      setFormData({
        employeeCode: employee.employeeCode,
        name: employee.name,
        email: employee.email,
        role: employee.role,
        isPodLead: employee.isPodLead,
        podId: employee.podId || "",
        contractType: employee.contractType,
        weeklyWorkDays: employee.weeklyWorkDays,
        maxConsecutiveDays: employee.maxConsecutiveDays,
        weeklyOffs: employee.weeklyOffs.map((w) => w.dayOfWeek),
      });
    } else {
      setFormData({
        employeeCode: "",
        name: "",
        email: "",
        role: "OPERATIONS_ASSOCIATE",
        isPodLead: false,
        podId: pods[0]?.id || "",
        contractType: "FULL_TIME",
        weeklyWorkDays: 5,
        maxConsecutiveDays: 6,
        weeklyOffs: [0, 6],
      });
    }
    setError(null);
  }, [employee, pods, isOpen]);

  if (!isOpen) return null;

  const handleToggleOff = (day: number) => {
    const current = formData.weeklyOffs;
    if (current.includes(day)) {
      setFormData({ ...formData, weeklyOffs: current.filter((d) => d !== day) });
    } else {
      setFormData({ ...formData, weeklyOffs: [...current, day].sort() });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.name.trim()) {
      setError("Employee name is required.");
      return;
    }
    if (!formData.employeeCode.trim()) {
      setError("Employee code is required.");
      return;
    }
    if (!formData.email.trim()) {
      setError("Email address is required.");
      return;
    }

    try {
      await onSubmit(formData);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save employee.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {isEditing ? `Edit Employee (${employee?.employeeCode})` : "Add New Employee"}
            </h3>
            <p className="text-xs text-slate-500">
              {isEditing ? "Update staffing details and pod allocation" : "Register a new operations team member"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Employee Code *
              </label>
              <input
                type="text"
                value={formData.employeeCode}
                onChange={(e) => setFormData({ ...formData, employeeCode: e.target.value.toUpperCase() })}
                disabled={isEditing}
                placeholder="e.g. EMP033"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none uppercase font-mono disabled:bg-slate-100 disabled:text-slate-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Full Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Maya Chen"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Email Address *
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="e.g. maya.chen@datastraw-ops.com"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Assigned Pod
              </label>
              <select
                value={formData.podId}
                onChange={(e) => setFormData({ ...formData, podId: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
              >
                <option value="">No Pod Assigned</option>
                {pods.map((pod) => (
                  <option key={pod.id} value={pod.id}>
                    {pod.code} — {pod.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Role
              </label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
              >
                <option value="OPERATIONS_ASSOCIATE">Operations Associate</option>
                <option value="SENIOR_OPERATOR">Senior Operator</option>
                <option value="POD_LEAD">Pod Lead</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Contract Type
              </label>
              <select
                value={formData.contractType}
                onChange={(e) => setFormData({ ...formData, contractType: e.target.value as any })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
              >
                <option value="FULL_TIME">Full Time (5-6 days/wk)</option>
                <option value="CONTRACT">Contract</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Weekly Work Days
              </label>
              <input
                type="number"
                min={1}
                max={7}
                value={formData.weeklyWorkDays}
                onChange={(e) => setFormData({ ...formData, weeklyWorkDays: parseInt(e.target.value) || 5 })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Weekly Offs Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Standard Weekly Offs ({formData.weeklyOffs.length} selected)
            </label>
            <div className="flex items-center space-x-1.5">
              {DAY_LABELS.map(({ day, label }) => {
                const isSelected = formData.weeklyOffs.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => handleToggleOff(day)}
                    className={`flex-1 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                      isSelected
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Pod Lead Flag */}
          <div className="flex items-center space-x-2 pt-2">
            <input
              type="checkbox"
              id="isPodLead"
              checked={formData.isPodLead}
              onChange={(e) => setFormData({ ...formData, isPodLead: e.target.checked })}
              className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
            />
            <label htmlFor="isPodLead" className="text-xs text-slate-700 cursor-pointer">
              Designate as Pod Lead candidate
            </label>
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors flex items-center space-x-2 disabled:opacity-50"
            >
              {isLoading && (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              <span>{isEditing ? "Save Changes" : "Create Employee"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
