import { FormEvent, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shield, Plus, AlertCircle, CheckCircle2, X, UserCog, Power } from "lucide-react";
import { createUser, fetchUsers, setUserActive } from "../../api/auth";

export default function UserManagement({ currentUserId }: { currentUserId: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"ADMIN" | "MANAGER">("MANAGER");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);
  const queryClient = useQueryClient();

  const showToast = (message: string, type: "success" | "error" = "success") => {
    if (toastTimeoutRef.current !== null) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    setToast({ message, type });
    toastTimeoutRef.current = window.setTimeout(() => {
      toastTimeoutRef.current = null;
      setToast(null);
    }, 4500);
  };

  const dismissToast = () => {
    if (toastTimeoutRef.current !== null) {
      window.clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = null;
    }
    setToast(null);
  };

  useEffect(() => () => {
    if (toastTimeoutRef.current !== null) {
      window.clearTimeout(toastTimeoutRef.current);
    }
  }, []);

  const usersQuery = useQuery({ queryKey: ["auth", "users"], queryFn: fetchUsers });
  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: (created) => {
      setName("");
      setEmail("");
      setPassword("");
      void queryClient.invalidateQueries({ queryKey: ["auth", "users"] });
      showToast(`Account created for ${created.name} (${created.role}).`);
    },
    onError: (err: Error) => showToast(err.message || "Failed to create account.", "error"),
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => setUserActive(id, isActive),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["auth", "users"] });
      showToast(`Account ${variables.isActive ? "activated" : "deactivated"} successfully.`);
    },
    onError: (err: Error) => showToast(err.message || "Failed to update account status.", "error"),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createMutation.mutate({ name, email, password, role });
  }

  const inputClass = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-400";

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`flex items-center justify-between p-4 rounded-xl border shadow-sm ${
          toast.type === "success"
            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
            : "bg-rose-50 border-rose-200 text-rose-800"
        }`}>
          <div className="flex items-center gap-2">
            {toast.type === "success"
              ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              : <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
          <button type="button" onClick={dismissToast} className="p-1 rounded-md hover:bg-slate-200/50 text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-1">
          <Shield className="w-5 h-5 text-indigo-600" />
          <h2 className="app-page-title">User Accounts</h2>
        </div>
        <p className="text-sm text-slate-500">Create and manage administrator and manager access to this system.</p>
      </div>

      {/* Create Account Form */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
          <Plus className="w-4 h-4 text-slate-500" />
          <h3 className="app-section-title">Create New Account</h3>
        </div>
        <form onSubmit={submit} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Full Name</label>
            <input
              required
              minLength={2}
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Jane Smith"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="e.g. jane@company.com"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Initial Password <span className="font-normal text-slate-400">(min. 12 characters)</span></label>
            <input
              type="password"
              required
              minLength={12}
              maxLength={72}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Minimum 12 characters"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Role</label>
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as "ADMIN" | "MANAGER")}
              className={inputClass}
            >
              <option value="MANAGER">Manager — roster and master data access</option>
              <option value="ADMIN">Administrator — full access including user management</option>
            </select>
          </div>

          {createMutation.isError && (
            <div className="md:col-span-2 flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{createMutation.error.message}</span>
            </div>
          )}

          <div className="md:col-span-2 pt-2 border-t border-slate-100">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="inline-flex min-h-10 items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
            >
              <Plus className="w-4 h-4" />
              {createMutation.isPending ? "Creating account..." : "Create Account"}
            </button>
          </div>
        </form>
      </div>

      {/* Existing Accounts Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
          <UserCog className="w-4 h-4 text-slate-500" />
          <h3 className="app-section-title">Existing Accounts</h3>
          {usersQuery.data && (
            <span className="ml-auto text-xs text-slate-400">{usersQuery.data.length} accounts</span>
          )}
        </div>

        {usersQuery.isLoading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-500">Loading accounts...</p>
          </div>
        ) : usersQuery.isError ? (
          <div className="p-8 text-center">
            <AlertCircle className="w-7 h-7 text-rose-500 mx-auto mb-2" />
            <p className="text-sm text-rose-700">{usersQuery.error.message}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr className="text-[13px] font-semibold text-slate-500 uppercase tracking-wide">
                  <th className="px-6 py-3 text-left">Name</th>
                  <th className="px-6 py-3 text-left">Email</th>
                  <th className="px-6 py-3 text-left">Role</th>
                  <th className="px-6 py-3 text-left">Status</th>
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {usersQuery.data?.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/60">
                    <td className="px-6 py-4">
                      <span className="font-semibold text-slate-900">{user.name}</span>
                      {user.id === currentUserId && (
                        <span className="ml-2 text-[10px] font-semibold bg-indigo-50 text-indigo-600 border border-indigo-200 px-1.5 py-0.5 rounded">You</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-600">{user.email}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${
                        user.role === "ADMIN"
                          ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                          : "bg-slate-100 text-slate-700 border-slate-200"
                      }`}>
                        {user.role === "ADMIN" ? "Administrator" : "Manager"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                        user.isActive
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-slate-100 text-slate-500 border-slate-200"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${user.isActive ? "bg-emerald-500" : "bg-slate-400"}`} />
                        {user.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {user.id === currentUserId && user.isActive ? (
                        <span className="text-xs text-slate-400 italic">Current session</span>
                      ) : (
                        <button
                          disabled={statusMutation.isPending}
                          onClick={() => statusMutation.mutate({ id: user.id, isActive: !user.isActive })}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
                            user.isActive
                              ? "text-rose-700 hover:bg-rose-50 border border-rose-200"
                              : "text-emerald-700 hover:bg-emerald-50 border border-emerald-200"
                          }`}
                        >
                          <Power className="w-3 h-3" />
                          {user.isActive ? "Deactivate" : "Activate"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {statusMutation.isError && (
          <div className="border-t border-slate-100 px-6 py-3">
            <p role="alert" className="text-sm text-rose-700">{statusMutation.error.message}</p>
          </div>
        )}
      </div>
    </div>
  );
}
