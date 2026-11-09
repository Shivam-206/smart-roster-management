import { useState, useEffect } from "react";
import { X, AlertCircle } from "lucide-react";
import { Brand, BrandFormData, Pod } from "../../types";

interface BrandModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: BrandFormData) => Promise<void>;
  brand?: Brand | null;
  pods: Pod[];
  isLoading: boolean;
}

export default function BrandModal({
  isOpen,
  onClose,
  onSubmit,
  brand,
  pods,
  isLoading,
}: BrandModalProps) {
  const isEditing = Boolean(brand);

  const [formData, setFormData] = useState<BrandFormData>({
    code: "",
    name: "",
    description: "",
    podId: "",
    isSingleResource: true,
  });

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (brand) {
      setFormData({
        code: brand.code,
        name: brand.name,
        description: brand.description || "",
        podId: brand.podId,
        isSingleResource: brand.isSingleResource,
      });
    } else {
      setFormData({
        code: "",
        name: "",
        description: "",
        podId: pods[0]?.id || "",
        isSingleResource: true,
      });
    }
    setError(null);
  }, [brand, pods, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.code.trim()) {
      setError("Brand code is required.");
      return;
    }
    if (!formData.name.trim()) {
      setError("Brand name is required.");
      return;
    }
    if (!formData.podId) {
      setError("Managing operational pod is required.");
      return;
    }

    try {
      await onSubmit({
        code: formData.code.trim().toUpperCase(),
        name: formData.name.trim(),
        description: formData.description?.trim() || undefined,
        podId: formData.podId,
        isSingleResource: formData.isSingleResource,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save brand.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {isEditing ? `Edit Brand (${brand?.code})` : "Create New Brand"}
            </h3>
            <p className="text-xs text-slate-500">
              {isEditing ? "Update brand profile and staffing profile" : "Register a client brand under an operational pod"}
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
                Brand Code *
              </label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                disabled={isEditing}
                placeholder="e.g. BRD-AUR"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none uppercase font-mono disabled:bg-slate-100 disabled:text-slate-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Brand Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Aurora Apparel"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Managing Operational Pod *
            </label>
            <select
              value={formData.podId}
              onChange={(e) => setFormData({ ...formData, podId: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
              required
            >
              <option value="">Select a Pod</option>
              {pods.map((pod) => (
                <option key={pod.id} value={pod.id}>
                  {pod.code} — {pod.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Description
            </label>
            <textarea
              rows={2}
              value={formData.description || ""}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Client overview, service focus, operational scope..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          {/* Single-Resource vs Multi-Resource */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="isSingleResource"
                checked={formData.isSingleResource}
                onChange={(e) => setFormData({ ...formData, isSingleResource: e.target.checked })}
                className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
              />
              <label htmlFor="isSingleResource" className="text-xs font-bold text-slate-800 cursor-pointer">
                Single-Resource Brand Profile (~80% target)
              </label>
            </div>
            <p className="text-[11px] text-slate-500 pl-6 leading-relaxed">
              When checked, this brand is designated to have a single dedicated primary operator, with scheduled leaves and weekly offs covered by contingency backups.
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
              <span>{isEditing ? "Save Changes" : "Create Brand"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
