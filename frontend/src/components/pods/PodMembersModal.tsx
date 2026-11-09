import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Users, Building2, ArrowRightLeft, ShieldCheck, AlertCircle } from "lucide-react";
import { fetchPodById, transferPodMembers } from "../../api/pods";
import { Pod } from "../../types";

interface PodMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  podId: string | null;
  allPods: Pod[];
  onSuccessToast: (msg: string) => void;
}

export default function PodMembersModal({
  isOpen,
  onClose,
  podId,
  allPods,
  onSuccessToast,
}: PodMembersModalProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"members" | "brands">("members");
  const [transferringEmpId, setTransferringEmpId] = useState<string | null>(null);
  const [targetPodId, setTargetPodId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const { data: pod, isLoading, isError, error: fetchErr } = useQuery({
    queryKey: ["podDetails", podId],
    queryFn: () => (podId ? fetchPodById(podId) : Promise.reject("No Pod ID")),
    enabled: Boolean(isOpen && podId),
  });

  const transferMutation = useMutation({
    mutationFn: ({ empId, destPodId }: { empId: string; destPodId: string }) =>
      transferPodMembers(destPodId, [empId]),
    onSuccess: (msg) => {
      queryClient.invalidateQueries({ queryKey: ["pods"] });
      queryClient.invalidateQueries({ queryKey: ["podDetails", podId] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      setTransferringEmpId(null);
      setTargetPodId("");
      onSuccessToast(msg);
    },
    onError: (err: any) => {
      setError(err.message || "Failed to transfer employee.");
    },
  });

  if (!isOpen || !podId) return null;

  const handleStartTransfer = (empId: string) => {
    setError(null);
    setTransferringEmpId(empId);
    // Default to first other pod
    const otherPods = allPods.filter((p) => p.id !== podId);
    setTargetPodId(otherPods[0]?.id || "");
  };

  const handleExecuteTransfer = async (empId: string) => {
    if (!targetPodId) return;
    await transferMutation.mutateAsync({ empId, destPodId: targetPodId });
  };

  const otherPods = allPods.filter((p) => p.id !== podId);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-base font-bold text-slate-900">
                {pod ? `${pod.name} (${pod.code})` : "Loading Pod Details..."}
              </h3>
            </div>
            <p className="text-xs text-slate-500">
              Pod Lead:{" "}
              <strong className="text-slate-800">
                {pod?.lead ? `${pod.lead.name} (${pod.lead.employeeCode})` : "Unassigned"}
              </strong>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-6 border-b border-slate-200 flex space-x-4">
          <button
            onClick={() => setActiveTab("members")}
            className={`py-3 text-xs font-semibold flex items-center space-x-2 border-b-2 transition-colors ${
              activeTab === "members"
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Assigned Members ({pod?.members?.length || 0})</span>
          </button>
          <button
            onClick={() => setActiveTab("brands")}
            className={`py-3 text-xs font-semibold flex items-center space-x-2 border-b-2 transition-colors ${
              activeTab === "brands"
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Managed Brands ({pod?.brands?.length || 0})</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {error && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {isLoading ? (
            <div className="py-12 text-center">
              <div className="w-7 h-7 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-slate-500">Loading pod details...</p>
            </div>
          ) : isError ? (
            <div className="py-8 text-center text-rose-600 text-xs">
              {(fetchErr as any)?.message || "Failed to load pod members."}
            </div>
          ) : activeTab === "members" ? (
            pod?.members?.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                No employees currently assigned to this pod.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                {pod?.members.map((member) => (
                  <div
                    key={member.id}
                    className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-600 text-xs shrink-0">
                        {member.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-slate-900 text-xs">{member.name}</span>
                          <span className="font-mono text-[10px] bg-slate-100 text-slate-700 px-1 py-0.2 rounded border border-slate-200">
                            {member.employeeCode}
                          </span>
                          {member.isPodLead && (
                            <span className="inline-flex items-center space-x-0.5 text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                              <ShieldCheck className="w-3 h-3 text-amber-600" />
                              <span>Pod Lead</span>
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400">{member.email}</p>
                      </div>
                    </div>

                    {/* Transfer controls */}
                    <div className="flex items-center space-x-2 self-end sm:self-auto">
                      {transferringEmpId === member.id ? (
                        <div className="flex items-center space-x-2 animate-in fade-in">
                          <select
                            value={targetPodId}
                            onChange={(e) => setTargetPodId(e.target.value)}
                            className="px-2 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 bg-white"
                          >
                            {otherPods.map((p) => (
                              <option key={p.id} value={p.id}>
                                Move to {p.code}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleExecuteTransfer(member.id)}
                            disabled={transferMutation.isPending}
                            className="px-2.5 py-1 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded transition-colors disabled:opacity-50"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setTransferringEmpId(null)}
                            className="px-2 py-1 text-xs text-slate-500 hover:bg-slate-200 rounded"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleStartTransfer(member.id)}
                          title="Move to another pod"
                          className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded border border-slate-200 transition-colors"
                        >
                          <ArrowRightLeft className="w-3 h-3" />
                          <span>Move Pod</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : pod?.brands?.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              No client brands currently assigned to this pod.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {pod?.brands.map((brand) => (
                <div
                  key={brand.id}
                  className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex items-start justify-between"
                >
                  <div>
                    <span className="font-mono text-[10px] text-slate-500 font-semibold">{brand.code}</span>
                    <h4 className="text-xs font-bold text-slate-900 mt-0.5">{brand.name}</h4>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {brand._count?.processes || 0} active process(es)
                    </p>
                  </div>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                      brand.isSingleResource
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-indigo-50 text-indigo-700 border-indigo-200"
                    }`}
                  >
                    {brand.isSingleResource ? "Single Resource" : "Multi Resource"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
