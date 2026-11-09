import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Building2, 
  Workflow, 
  Plus, 
  Search, 
  Filter, 
  Edit2, 
  Trash2, 
  Calendar, 
  Users, 
  AlertCircle, 
  CheckCircle2, 
  X,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { fetchBrands, createBrand, updateBrand, deleteBrand } from "../../api/brands";
import { fetchProcesses, createProcess, updateProcess, deleteProcess } from "../../api/processes";
import { fetchPods } from "../../api/pods";
import { Brand, BrandFormData, Process, ProcessFormData, CalendarType } from "../../types";
import BrandModal from "./BrandModal";
import DeleteBrandModal from "./DeleteBrandModal";
import ProcessModal from "./ProcessModal";
import DeleteProcessModal from "./DeleteProcessModal";

export default function BrandProcessManagement() {
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"brands" | "processes">("brands");

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPodId, setSelectedPodId] = useState("ALL");
  const [selectedBrandId, setSelectedBrandId] = useState("ALL");
  const [selectedCalendarType, setSelectedCalendarType] = useState("ALL");

  // Expanded brand rows
  const [expandedBrandIds, setExpandedBrandIds] = useState<Set<string>>(new Set());

  // Brand Modals
  const [isBrandModalOpen, setIsBrandModalOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [isDeleteBrandOpen, setIsDeleteBrandOpen] = useState(false);
  const [deletingBrand, setDeletingBrand] = useState<Brand | null>(null);
  const [deleteBrandError, setDeleteBrandError] = useState<string | null>(null);

  // Process Modals
  const [isProcessModalOpen, setIsProcessModalOpen] = useState(false);
  const [editingProcess, setEditingProcess] = useState<Process | null>(null);
  const [isDeleteProcessOpen, setIsDeleteProcessOpen] = useState(false);
  const [deletingProcess, setDeletingProcess] = useState<Process | null>(null);
  const [deleteProcessError, setDeleteProcessError] = useState<string | null>(null);

  // Toast feedback
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4500);
  };

  // Queries
  const { data: brands = [], isLoading: isBrandsLoading, isError: isBrandsError, refetch: refetchBrands } = useQuery({
    queryKey: ["brands", searchTerm, selectedPodId],
    queryFn: () => fetchBrands({ search: searchTerm, podId: selectedPodId }),
  });

  const { data: processes = [], isLoading: isProcessesLoading, isError: isProcessesError, refetch: refetchProcesses } = useQuery({
    queryKey: ["processes", searchTerm, selectedBrandId, selectedCalendarType],
    queryFn: () => fetchProcesses({ search: searchTerm, brandId: selectedBrandId, calendarType: selectedCalendarType }),
  });

  const { data: pods = [] } = useQuery({
    queryKey: ["pods", ""],
    queryFn: () => fetchPods(),
  });

  // Brand Mutations
  const createBrandMutation = useMutation({
    mutationFn: (data: BrandFormData) => createBrand(data),
    onSuccess: (newBrand) => {
      queryClient.invalidateQueries({ queryKey: ["brands"] });
      showToast(`Brand '${newBrand.name}' (${newBrand.code}) created successfully.`);
    },
  });

  const updateBrandMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<BrandFormData> }) => updateBrand(id, data),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["brands"] });
      showToast(`Brand '${updated.name}' updated successfully.`);
    },
  });

  const deleteBrandMutation = useMutation({
    mutationFn: (id: string) => deleteBrand(id),
    onSuccess: (msg) => {
      queryClient.invalidateQueries({ queryKey: ["brands"] });
      setIsDeleteBrandOpen(false);
      setDeletingBrand(null);
      showToast(msg);
    },
    onError: (err: any) => {
      setDeleteBrandError(err.message || "Failed to delete brand.");
    },
  });

  // Process Mutations
  const createProcessMutation = useMutation({
    mutationFn: (data: ProcessFormData) => createProcess(data),
    onSuccess: (newProc) => {
      queryClient.invalidateQueries({ queryKey: ["processes"] });
      queryClient.invalidateQueries({ queryKey: ["brands"] });
      showToast(`Process '${newProc.name}' (${newProc.code}) created successfully.`);
    },
  });

  const updateProcessMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ProcessFormData> }) => updateProcess(id, data),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["processes"] });
      queryClient.invalidateQueries({ queryKey: ["brands"] });
      showToast(`Process '${updated.name}' updated successfully.`);
    },
  });

  const deleteProcessMutation = useMutation({
    mutationFn: (id: string) => deleteProcess(id),
    onSuccess: (msg) => {
      queryClient.invalidateQueries({ queryKey: ["processes"] });
      queryClient.invalidateQueries({ queryKey: ["brands"] });
      setIsDeleteProcessOpen(false);
      setDeletingProcess(null);
      showToast(msg);
    },
    onError: (err: any) => {
      setDeleteProcessError(err.message || "Failed to delete process.");
    },
  });

  const toggleBrandExpand = (brandId: string) => {
    const next = new Set(expandedBrandIds);
    if (next.has(brandId)) {
      next.delete(brandId);
    } else {
      next.add(brandId);
    }
    setExpandedBrandIds(next);
  };

  const formatCalendarBadge = (cal: CalendarType) => {
    switch (cal) {
      case "ALL_365_DAYS":
        return {
          label: "365 Days (Sundays + PH)",
          color: "bg-emerald-50 text-emerald-700 border-emerald-200",
        };
      case "ALL_EXCEPT_PUBLIC_HOLIDAYS":
        return {
          label: "Open except PH",
          color: "bg-blue-50 text-blue-700 border-blue-200",
        };
      case "ALL_EXCEPT_SUNDAYS_AND_PUBLIC_HOLIDAYS":
        return {
          label: "Mon–Sat (No Sun/PH)",
          color: "bg-slate-100 text-slate-700 border-slate-200",
        };
      default:
        return {
          label: "Custom Rules",
          color: "bg-purple-50 text-purple-700 border-purple-200",
        };
    }
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

      {/* Control Header with Tab Switcher */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <h2 className="text-xl font-bold text-slate-900">Brand & Process Catalog</h2>
            <div className="flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200">
              <button
                onClick={() => {
                  setActiveTab("brands");
                  setSearchTerm("");
                }}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                  activeTab === "brands"
                    ? "bg-white text-indigo-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Brands ({brands.length})
              </button>
              <button
                onClick={() => {
                  setActiveTab("processes");
                  setSearchTerm("");
                }}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                  activeTab === "processes"
                    ? "bg-white text-indigo-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Processes ({processes.length})
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {activeTab === "brands"
              ? "Manage client brand contracts, single-resource profiles, and managing pod associations."
              : "Configure process-specific operating calendars (365d, No PH, No Sun+PH) and minimum staffing."}
          </p>
        </div>

        {activeTab === "brands" ? (
          <button
            onClick={() => {
              setEditingBrand(null);
              setIsBrandModalOpen(true);
            }}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors self-start md:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Add Brand</span>
          </button>
        ) : (
          <button
            onClick={() => {
              setEditingProcess(null);
              setIsProcessModalOpen(true);
            }}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors self-start md:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Add Process</span>
          </button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={
              activeTab === "brands"
                ? "Search brands by name or code..."
                : "Search processes by name or code..."
            }
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

        {/* Dynamic Filters depending on Tab */}
        {activeTab === "brands" ? (
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
        ) : (
          <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
            <select
              value={selectedBrandId}
              onChange={(e) => setSelectedBrandId(e.target.value)}
              className="w-full sm:w-auto px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="ALL">All Brands ({brands.length})</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} — {b.name}
                </option>
              ))}
            </select>

            <select
              value={selectedCalendarType}
              onChange={(e) => setSelectedCalendarType(e.target.value)}
              className="w-full sm:w-auto px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="ALL">All Calendar Types</option>
              <option value="ALL_365_DAYS">365 Days (Continuous)</option>
              <option value="ALL_EXCEPT_PUBLIC_HOLIDAYS">Open except PH</option>
              <option value="ALL_EXCEPT_SUNDAYS_AND_PUBLIC_HOLIDAYS">Mon–Sat (No Sun/PH)</option>
              <option value="CUSTOM">Custom Rules</option>
            </select>
          </div>
        )}
      </div>

      {/* Main Content: Brands View */}
      {activeTab === "brands" ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {isBrandsLoading ? (
            <div className="p-12 text-center">
              <div className="w-8 h-8 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-slate-500">Loading client brands from database...</p>
            </div>
          ) : isBrandsError ? (
            <div className="p-12 text-center">
              <AlertCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-900">Failed to load brands</p>
              <button
                onClick={() => refetchBrands()}
                className="mt-3 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
              >
                Retry
              </button>
            </div>
          ) : brands.length === 0 ? (
            <div className="p-12 text-center">
              <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-800">No brands found</p>
              <p className="text-xs text-slate-500">Try adjusting your search or pod filter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 text-xs font-semibold uppercase tracking-wider">
                    <th className="px-6 py-3">Brand</th>
                    <th className="px-6 py-3">Managing Pod</th>
                    <th className="px-6 py-3">Staffing Profile</th>
                    <th className="px-6 py-3">Processes</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {brands.map((b) => {
                    const isExpanded = expandedBrandIds.has(b.id);
                    return (
                      <div key={b.id} className="contents">
                        <tr className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center space-x-3">
                              <button
                                onClick={() => toggleBrandExpand(b.id)}
                                className="p-1 rounded hover:bg-slate-200/60 text-slate-400 hover:text-slate-600 transition-colors"
                              >
                                {isExpanded ? (
                                  <ChevronUp className="w-4 h-4 text-indigo-600" />
                                ) : (
                                  <ChevronDown className="w-4 h-4" />
                                )}
                              </button>
                              <div>
                                <div className="flex items-center space-x-2">
                                  <span className="font-semibold text-slate-900">{b.name}</span>
                                  <span className="font-mono text-[11px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                                    {b.code}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-500 line-clamp-1">{b.description || "No description"}</p>
                              </div>
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                              {b.pod.code} — {b.pod.name}
                            </span>
                          </td>

                          <td className="px-6 py-4">
                            <span
                              className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full border ${
                                b.isSingleResource
                                  ? "bg-amber-50 text-amber-700 border-amber-200"
                                  : "bg-indigo-50 text-indigo-700 border-indigo-200"
                              }`}
                            >
                              {b.isSingleResource ? "Single Resource" : "Multi Resource (2-3 Staff)"}
                            </span>
                          </td>

                          <td className="px-6 py-4">
                            <button
                              onClick={() => toggleBrandExpand(b.id)}
                              className="inline-flex items-center space-x-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-semibold py-1 px-2 rounded hover:bg-indigo-50 transition-colors"
                            >
                              <Workflow className="w-3.5 h-3.5" />
                              <span>{b.processes?.length || 0} process(es)</span>
                            </button>
                          </td>

                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end space-x-2">
                              <button
                                onClick={() => {
                                  setEditingBrand(b);
                                  setIsBrandModalOpen(true);
                                }}
                                title="Edit Brand"
                                className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  setDeletingBrand(b);
                                  setDeleteBrandError(null);
                                  setIsDeleteBrandOpen(true);
                                }}
                                title="Delete Brand"
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Expanded child processes row */}
                        {isExpanded && (
                          <tr className="bg-slate-50/80">
                            <td colSpan={5} className="px-12 py-3">
                              <div className="p-3 bg-white border border-slate-200 rounded-lg">
                                <h5 className="text-xs font-bold text-slate-700 mb-2 flex items-center space-x-1.5">
                                  <Workflow className="w-3.5 h-3.5 text-indigo-600" />
                                  <span>Processes under {b.name}:</span>
                                </h5>
                                {b.processes?.length === 0 ? (
                                  <p className="text-xs text-slate-400 italic">No processes created for this brand yet.</p>
                                ) : (
                                  <div className="space-y-1.5">
                                    {b.processes.map((proc) => {
                                      const badge = formatCalendarBadge(proc.calendarType);
                                      return (
                                        <div
                                          key={proc.id}
                                          className="p-2 bg-slate-50 rounded border border-slate-200 flex items-center justify-between text-xs"
                                        >
                                          <div className="flex items-center space-x-2">
                                            <span className="font-mono text-[10px] bg-slate-200 px-1 py-0.5 rounded font-semibold text-slate-700">
                                              {proc.code}
                                            </span>
                                            <span className="font-semibold text-slate-900">{proc.name}</span>
                                          </div>
                                          <div className="flex items-center space-x-2">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${badge.color}`}>
                                              {badge.label}
                                            </span>
                                            <span className="text-[11px] text-slate-600 font-medium">
                                              Min Staff: {proc.defaultMinStaff}
                                            </span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </div>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* Processes View */
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {isProcessesLoading ? (
            <div className="p-12 text-center">
              <div className="w-8 h-8 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-slate-500">Loading operational processes...</p>
            </div>
          ) : isProcessesError ? (
            <div className="p-12 text-center">
              <AlertCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-900">Failed to load processes</p>
              <button
                onClick={() => refetchProcesses()}
                className="mt-3 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
              >
                Retry
              </button>
            </div>
          ) : processes.length === 0 ? (
            <div className="p-12 text-center">
              <Workflow className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-800">No processes found</p>
              <p className="text-xs text-slate-500">Try adjusting your search or filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 text-xs font-semibold uppercase tracking-wider">
                    <th className="px-6 py-3">Process</th>
                    <th className="px-6 py-3">Parent Brand & Pod</th>
                    <th className="px-6 py-3">Operating Calendar</th>
                    <th className="px-6 py-3">Min Staff</th>
                    <th className="px-6 py-3">Assigned Staff</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {processes.map((proc) => {
                    const badge = formatCalendarBadge(proc.calendarType);
                    return (
                      <tr key={proc.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-6 py-4">
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="font-semibold text-slate-900">{proc.name}</span>
                              <span className="font-mono text-[11px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                                {proc.code}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 line-clamp-1">{proc.description || "No description"}</p>
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          <div>
                            <span className="font-semibold text-slate-900 text-xs">{proc.brand.name}</span>
                            <span className="ml-1.5 font-mono text-[10px] text-slate-500">({proc.brand.code})</span>
                            {proc.brand.pod && (
                              <p className="text-[11px] text-slate-400 mt-0.5">Pod: {proc.brand.pod.code}</p>
                            )}
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${badge.color}`}>
                            <Calendar className="w-3 h-3 shrink-0" />
                            <span>{badge.label}</span>
                          </span>
                        </td>

                        <td className="px-6 py-4">
                          <span className="font-semibold text-slate-900 text-xs bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
                            {proc.defaultMinStaff} staff
                          </span>
                        </td>

                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-1.5 text-xs text-slate-700">
                            <Users className="w-3.5 h-3.5 text-slate-400" />
                            <span className="font-semibold">{proc._count?.assignments || 0} qualified</span>
                          </div>
                        </td>

                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end space-x-2">
                            <button
                              onClick={() => {
                                setEditingProcess(proc);
                                setIsProcessModalOpen(true);
                              }}
                              title="Edit Process"
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                setDeletingProcess(proc);
                                setDeleteProcessError(null);
                                setIsDeleteProcessOpen(true);
                              }}
                              title="Delete Process"
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            >
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
      )}

      {/* Brand Modals */}
      <BrandModal
        isOpen={isBrandModalOpen}
        onClose={() => setIsBrandModalOpen(false)}
        onSubmit={async (data) => {
          if (editingBrand) {
            await updateBrandMutation.mutateAsync({ id: editingBrand.id, data });
          } else {
            await createBrandMutation.mutateAsync(data);
          }
        }}
        brand={editingBrand}
        pods={pods}
        isLoading={createBrandMutation.isPending || updateBrandMutation.isPending}
      />

      <DeleteBrandModal
        isOpen={isDeleteBrandOpen}
        onClose={() => setIsDeleteBrandOpen(false)}
        onConfirm={async () => {
          if (deletingBrand) {
            await deleteBrandMutation.mutateAsync(deletingBrand.id);
          }
        }}
        brand={deletingBrand}
        isLoading={deleteBrandMutation.isPending}
        errorMessage={deleteBrandError}
      />

      {/* Process Modals */}
      <ProcessModal
        isOpen={isProcessModalOpen}
        onClose={() => setIsProcessModalOpen(false)}
        onSubmit={async (data) => {
          if (editingProcess) {
            await updateProcessMutation.mutateAsync({ id: editingProcess.id, data });
          } else {
            await createProcessMutation.mutateAsync(data);
          }
        }}
        processItem={editingProcess}
        brands={brands}
        isLoading={createProcessMutation.isPending || updateProcessMutation.isPending}
      />

      <DeleteProcessModal
        isOpen={isDeleteProcessOpen}
        onClose={() => setIsDeleteProcessOpen(false)}
        onConfirm={async () => {
          if (deletingProcess) {
            await deleteProcessMutation.mutateAsync(deletingProcess.id);
          }
        }}
        processItem={deletingProcess}
        isLoading={deleteProcessMutation.isPending}
        errorMessage={deleteProcessError}
      />
    </div>
  );
}
