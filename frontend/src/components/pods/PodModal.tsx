import { useState, useEffect } from "react";
import { X, AlertCircle } from "lucide-react";
import { Pod, PodFormData, Employee } from "../../types";

interface PodModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: PodFormData) => Promise<void>;
  pod?: Pod | null;
  employees: Employee[];
  isLoading: boolean;
}

export default function PodModal({
  isOpen,
  onClose,
  onSubmit,
  pod,
  employees,
  isLoading,
}: PodModalProps) {
  const isEditing = Boolean(pod);

  const [formData, setFormData] = useState<PodFormData>({
    code: "",
    name: "",
    description: "",
    leadEmployeeId: "",
  });

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (pod) {
      setFormData({
        code: pod.code,
        name: pod.name,
        description: pod.description || "",
        leadEmployeeId: pod.leadEmployeeId || "",
      });
    } else {
      setFormData({
        code: "",
        name: "",
        description: "",
        leadEmployeeId: "",
      });
    }
    setError(null);
  }, [pod, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.code.trim()) {
      setError("Pod code is required.");
      return;
    }
    if (!formData.name.trim()) {
      setError("Pod name is required.");
      return;
    }

    try {
      await onSubmit({
        code: formData.code.trim().toUpperCase(),
        name: formData.name.trim(),
        description: formData.description?.trim() || undefined,
        leadEmployeeId: formData.leadEmployeeId || null,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save pod.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {isEditing ? `Edit Pod (${pod?.code})` : "Create New Operational Pod"}
            </h3>
            <p className="text-xs text-slate-500">
              {isEditing ? "Update pod leadership and details" : "Set up a new operational unit and assign a lead"}
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
                Pod Code *
              </label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                disabled={isEditing}
                placeholder="e.g. POD-OPS"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none uppercase font-mono disabled:bg-slate-100 disabled:text-slate-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Pod Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Special Operations Pod"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Description
            </label>
            <textarea
              rows={3}
              value={formData.description || ""}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Operational responsibilities, scope and process domain..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Designated Pod Lead
            </label>
            <select
              value={formData.leadEmployeeId || ""}
              onChange={(e) => setFormData({ ...formData, leadEmployeeId: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
            >
              <option value="">No Pod Lead Assigned</option>
              {employees.map((emp) => {
                const isLeadingOther = emp.leadingPod && emp.leadingPod.id !== pod?.id;
                return (
                  <option
                    key={emp.id}
                    value={emp.id}
                    disabled={Boolean(isLeadingOther)}
                  >
                    {emp.name} ({emp.employeeCode}) — {emp.role}
                    {isLeadingOther ? ` [Leads ${emp.leadingPod?.code}]` : ""}
                  </option>
                );
              })}
            </select>
            <p className="text-[11px] text-slate-400 mt-1">
              Note: An employee can lead only one pod. If assigned, this employee is automatically added to this pod.
            </p>
          </div>

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
              <span>{isEditing ? "Save Changes" : "Create Pod"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
