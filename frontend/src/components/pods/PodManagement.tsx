import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Layers, 
  Plus, 
  Search, 
  Users, 
  Building2, 
  ShieldCheck, 
  Edit2, 
  Trash2, 
  AlertCircle, 
  CheckCircle2, 
  X,
  ArrowRight
} from "lucide-react";
import { fetchPods, createPod, updatePod, deletePod } from "../../api/pods";
import { fetchEmployees } from "../../api/employees";
import { Pod, PodFormData } from "../../types";
import PodModal from "./PodModal";
import PodMembersModal from "./PodMembersModal";
import DeletePodModal from "./DeletePodModal";

export default function PodManagement() {
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState("");

  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPod, setEditingPod] = useState<Pod | null>(null);

  const [isMembersOpen, setIsMembersOpen] = useState(false);
  const [inspectingPodId, setInspectingPodId] = useState<string | null>(null);

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deletingPod, setDeletingPod] = useState<Pod | null>(null);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);

  // Notification Toast
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4500);
  };

  // Queries
  const {
    data: pods = [],
    isLoading: isPodsLoading,
    isError: isPodsError,
    error: podsError,
    refetch,
  } = useQuery({
    queryKey: ["pods", searchTerm],
    queryFn: () => fetchPods(searchTerm),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["employees", "", "ALL"],
    queryFn: () => fetchEmployees(),
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: PodFormData) => createPod(data),
    onSuccess: (newPod) => {
      queryClient.invalidateQueries({ queryKey: ["pods"] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      showToast(`Pod '${newPod.name}' (${newPod.code}) created successfully.`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<PodFormData> }) =>
      updatePod(id, data),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["pods"] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      showToast(`Pod '${updated.name}' updated successfully.`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePod(id),
    onSuccess: (msg) => {
      queryClient.invalidateQueries({ queryKey: ["pods"] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      setIsDeleteOpen(false);
      setDeletingPod(null);
      showToast(msg);
    },
    onError: (err: any) => {
      setDeleteErrorMessage(err.message || "Failed to delete pod.");
    },
  });

  const handleOpenAdd = () => {
    setEditingPod(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (pod: Pod) => {
    setEditingPod(pod);
    setIsModalOpen(true);
  };

  const handleOpenMembers = (podId: string) => {
    setInspectingPodId(podId);
    setIsMembersOpen(true);
  };

  const handleOpenDelete = (pod: Pod) => {
    setDeletingPod(pod);
    setDeleteErrorMessage(null);
    setIsDeleteOpen(true);
  };

  const handleSavePod = async (formData: PodFormData) => {
    if (editingPod) {
      await updateMutation.mutateAsync({ id: editingPod.id, data: formData });
    } else {
      await createMutation.mutateAsync(formData);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingPod) return;
    await deleteMutation.mutateAsync(deletingPod.id);
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
            <h2 className="text-xl font-bold text-slate-900">Operational Pods</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
              {pods.length} Active Pods
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Manage operational teams, pod lead assignments, member allocations, and client brand coverage.
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="inline-flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Create New Pod</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by pod code or name..."
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
        <p className="text-xs text-slate-400 hidden sm:block">
          Showing {pods.length} operational units
        </p>
      </div>

      {/* Main Grid */}
      {isPodsLoading ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <div className="w-8 h-8 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500">Loading operational pods from database...</p>
        </div>
      ) : isPodsError ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <AlertCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-900">Failed to load operational pods</p>
          <p className="text-xs text-slate-500 mb-4">
            {(podsError as any)?.message || "Network error"}
          </p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      ) : pods.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <Layers className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-bold text-slate-800">No operational pods match your query</p>
          <p className="text-xs text-slate-500 mb-4">Try clearing your search term.</p>
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-md transition-colors"
            >
              Clear search
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {pods.map((pod) => (
            <div
              key={pod.id}
              className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between hover:border-slate-300 transition-all"
            >
              <div>
                {/* Pod Card Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-xs font-bold bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-md border border-indigo-200">
                      {pod.code}
                    </span>
                    <h3 className="text-base font-bold text-slate-900">{pod.name}</h3>
                  </div>

                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => handleOpenEdit(pod)}
                      title="Edit Pod"
                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleOpenDelete(pod)}
                      title="Delete Pod"
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-600 mt-2.5 line-clamp-2 leading-relaxed">
                  {pod.description || "No specific operational description provided."}
                </p>

                {/* Pod Lead Banner */}
                <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center font-bold text-amber-800 text-xs shrink-0">
                      {pod.lead
                        ? pod.lead.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .slice(0, 2)
                        : "?"}
                    </div>
                    <div>
                      <div className="flex items-center space-x-1.5">
                        <span className="text-xs font-bold text-slate-900">
                          {pod.lead ? pod.lead.name : "No Pod Lead"}
                        </span>
                        {pod.lead && (
                          <span className="font-mono text-[10px] text-slate-500">
                            ({pod.lead.employeeCode})
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500">
                        {pod.lead?.email || "Assign a lead to oversee this operational pod"}
                      </p>
                    </div>
                  </div>

                  <span className="inline-flex items-center space-x-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                    <span>Lead</span>
                  </span>
                </div>
              </div>

              {/* Stats & Actions */}
              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-1.5 text-xs text-slate-600">
                    <Users className="w-4 h-4 text-slate-400" />
                    <span className="font-semibold text-slate-900">{pod._count?.members || 0}</span>
                    <span>Staff</span>
                  </div>

                  <div className="flex items-center space-x-1.5 text-xs text-slate-600">
                    <Building2 className="w-4 h-4 text-slate-400" />
                    <span className="font-semibold text-slate-900">{pod._count?.brands || 0}</span>
                    <span>Brands</span>
                  </div>
                </div>

                <button
                  onClick={() => handleOpenMembers(pod.id)}
                  className="inline-flex items-center space-x-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 py-1 px-2.5 rounded-md hover:bg-indigo-50 transition-colors"
                >
                  <span>Manage Members</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      <PodModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSavePod}
        pod={editingPod}
        employees={employees}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />

      {/* Pod Members & Transfer Modal */}
      <PodMembersModal
        isOpen={isMembersOpen}
        onClose={() => setIsMembersOpen(false)}
        podId={inspectingPodId}
        allPods={pods}
        onSuccessToast={(msg) => showToast(msg)}
      />

      {/* Delete Pod Confirmation Modal */}
      <DeletePodModal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleConfirmDelete}
        pod={deletingPod}
        isLoading={deleteMutation.isPending}
        errorMessage={deleteErrorMessage}
      />
    </div>
  );
}
