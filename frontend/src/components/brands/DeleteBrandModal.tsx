import { AlertTriangle, X } from "lucide-react";
import { Brand } from "../../types";

interface DeleteBrandModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  brand: Brand | null;
  isLoading: boolean;
  errorMessage?: string | null;
}

export default function DeleteBrandModal({
  isOpen,
  onClose,
  onConfirm,
  brand,
  isLoading,
  errorMessage,
}: DeleteBrandModalProps) {
  if (!isOpen || !brand) return null;

  const hasProcesses = (brand._count?.processes || brand.processes?.length || 0) > 0;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-rose-50/50">
          <div className="flex items-center space-x-2 text-rose-700">
            <AlertTriangle className="w-5 h-5 text-rose-600" />
            <h3 className="text-base font-bold text-slate-900">Delete Brand</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {errorMessage ? (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs leading-relaxed">
              <strong>Cannot Delete:</strong> {errorMessage}
            </div>
          ) : hasProcesses ? (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-xs leading-relaxed space-y-1">
              <p className="font-semibold">Deletion Blocked by Active Dependencies:</p>
              <p>
                • Brand currently contains {brand._count?.processes || brand.processes?.length} operational process(es).
              </p>
              <p className="text-slate-500">
                You must remove or reassign all processes before deleting this brand.
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-600 leading-relaxed">
              Are you sure you want to permanently delete brand{" "}
              <strong className="text-slate-900 font-semibold">{brand.name}</strong>{" "}
              (<span className="font-mono text-xs">{brand.code}</span>)?
            </p>
          )}

          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              {hasProcesses ? "Dismiss" : "Cancel"}
            </button>
            {!hasProcesses && (
              <button
                type="button"
                onClick={onConfirm}
                disabled={isLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition-colors flex items-center space-x-2 disabled:opacity-50"
              >
                {isLoading && (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                <span>Delete Brand</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
