import { useState, useEffect } from "react";
import { X, AlertCircle } from "lucide-react";
import { Process, ProcessFormData, Brand, CalendarType } from "../../types";

interface ProcessModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ProcessFormData) => Promise<void>;
  processItem?: Process | null;
  brands: Brand[];
  isLoading: boolean;
}

const CALENDAR_OPTIONS: { value: CalendarType; label: string; desc: string }[] = [
  {
    value: "ALL_365_DAYS",
    label: "365 Days (Continuous)",
    desc: "Operates every day of the year, including Sundays and all public holidays.",
  },
  {
    value: "ALL_EXCEPT_PUBLIC_HOLIDAYS",
    label: "Open except Public Holidays",
    desc: "Operates 7 days a week, but closed on declared statutory public holidays.",
  },
  {
    value: "ALL_EXCEPT_SUNDAYS_AND_PUBLIC_HOLIDAYS",
    label: "Open except Sundays & PH",
    desc: "Standard business calendar: operates Mon–Sat; closed on Sundays and public holidays.",
  },
  {
    value: "CUSTOM",
    label: "Custom Calendar Rules",
    desc: "Operates according to specific date/day coverage rules.",
  },
];

export default function ProcessModal({
  isOpen,
  onClose,
  onSubmit,
  processItem,
  brands,
  isLoading,
}: ProcessModalProps) {
  const isEditing = Boolean(processItem);

  const [formData, setFormData] = useState<ProcessFormData>({
    code: "",
    name: "",
    description: "",
    brandId: "",
    calendarType: "ALL_365_DAYS",
    defaultMinStaff: 1,
  });

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (processItem) {
      setFormData({
        code: processItem.code,
        name: processItem.name,
        description: processItem.description || "",
        brandId: processItem.brandId,
        calendarType: processItem.calendarType,
        defaultMinStaff: processItem.defaultMinStaff,
      });
    } else {
      setFormData({
        code: "",
        name: "",
        description: "",
        brandId: brands[0]?.id || "",
        calendarType: "ALL_365_DAYS",
        defaultMinStaff: 1,
      });
    }
    setError(null);
  }, [processItem, brands, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.code.trim()) {
      setError("Process code is required.");
      return;
    }
    if (!formData.name.trim()) {
      setError("Process name is required.");
      return;
    }
    if (!formData.brandId) {
      setError("Parent brand is required.");
      return;
    }

    try {
      await onSubmit({
        code: formData.code.trim().toUpperCase(),
        name: formData.name.trim(),
        description: formData.description?.trim() || undefined,
        brandId: formData.brandId,
        calendarType: formData.calendarType,
        defaultMinStaff: Number(formData.defaultMinStaff) || 1,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save process.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {isEditing ? `Edit Process (${processItem?.code})` : "Create Operational Process"}
            </h3>
            <p className="text-xs text-slate-500">
              {isEditing ? "Update operating calendar & staffing rules" : "Define an operational workflow and operating calendar"}
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
                Process Code *
              </label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                disabled={isEditing}
                placeholder="e.g. PRC-AUR-OPS"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none uppercase font-mono disabled:bg-slate-100 disabled:text-slate-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Process Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Order Fulfillment Desk"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Parent Brand *
              </label>
              <select
                value={formData.brandId}
                onChange={(e) => setFormData({ ...formData, brandId: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                required
              >
                <option value="">Select a Brand</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} — {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Default Min Staff (Headcount) *
              </label>
              <input
                type="number"
                min={1}
                max={10}
                value={formData.defaultMinStaff}
                onChange={(e) => setFormData({ ...formData, defaultMinStaff: parseInt(e.target.value) || 1 })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                required
              />
            </div>
          </div>

          {/* Operating Calendar Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Operating Calendar Type *
            </label>
            <div className="space-y-2">
              {CALENDAR_OPTIONS.map((opt) => {
                const isSelected = formData.calendarType === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={`block p-2.5 rounded-lg border cursor-pointer transition-colors ${
                      isSelected
                        ? "border-indigo-600 bg-indigo-50/50"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name="calendarType"
                        value={opt.value}
                        checked={isSelected}
                        onChange={() => setFormData({ ...formData, calendarType: opt.value })}
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-xs font-bold text-slate-900">{opt.label}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 pl-5 mt-0.5">{opt.desc}</p>
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Description
            </label>
            <textarea
              rows={2}
              value={formData.description || ""}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="SLA details, triage queue specifics..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
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
              <span>{isEditing ? "Save Changes" : "Create Process"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
