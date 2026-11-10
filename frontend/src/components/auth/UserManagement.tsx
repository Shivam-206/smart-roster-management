import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createUser, fetchUsers, setUserActive } from "../../api/auth";

export default function UserManagement({ currentUserId }: { currentUserId: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"ADMIN" | "MANAGER">("MANAGER");
  const queryClient = useQueryClient();
  const usersQuery = useQuery({ queryKey: ["auth", "users"], queryFn: fetchUsers });
  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      setName("");
      setEmail("");
      setPassword("");
      void queryClient.invalidateQueries({ queryKey: ["auth", "users"] });
    },
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => setUserActive(id, isActive),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["auth", "users"] }),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createMutation.mutate({ name, email, password, role });
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">User accounts</h2>
        <p className="mt-1 text-sm text-slate-600">Create administrator and manager accounts or deactivate access.</p>
      </div>
      <form onSubmit={submit} className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">Name
          <input required minLength={2} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
        </label>
        <label className="text-sm font-medium text-slate-700">Email
          <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
        </label>
        <label className="text-sm font-medium text-slate-700">Initial password (at least 12 characters)
          <input type="password" required minLength={12} maxLength={72} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
        </label>
        <label className="text-sm font-medium text-slate-700">Role
          <select value={role} onChange={(event) => setRole(event.target.value as "ADMIN" | "MANAGER")} className="mt-1 w-full rounded border border-slate-300 px-3 py-2">
            <option value="MANAGER">Manager</option>
            <option value="ADMIN">Administrator</option>
          </select>
        </label>
        {createMutation.isError && <p role="alert" className="text-sm text-rose-700 md:col-span-2">{createMutation.error.message}</p>}
        <button disabled={createMutation.isPending} className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white disabled:opacity-60 md:col-span-2">
          {createMutation.isPending ? "Creating..." : "Create account"}
        </button>
      </form>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        {usersQuery.isLoading ? <p className="p-5 text-sm text-slate-500">Loading accounts...</p>
          : usersQuery.isError ? <p role="alert" className="p-5 text-sm text-rose-700">{usersQuery.error.message}</p>
            : <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Name</th><th className="p-3">Email</th><th className="p-3">Role</th><th className="p-3">Status</th><th className="p-3">Action</th></tr></thead>
              <tbody>{usersQuery.data?.map((user) => <tr key={user.id} className="border-t border-slate-100">
                <td className="p-3 font-medium text-slate-800">{user.name}</td><td className="p-3">{user.email}</td><td className="p-3">{user.role}</td><td className="p-3">{user.isActive ? "Active" : "Inactive"}</td>
                <td className="p-3"><button
                  disabled={user.id === currentUserId && user.isActive}
                  onClick={() => statusMutation.mutate({ id: user.id, isActive: !user.isActive })}
                  className="font-semibold text-indigo-700 hover:text-indigo-900 disabled:cursor-not-allowed disabled:text-slate-400"
                >{user.id === currentUserId && user.isActive ? "Current account" : user.isActive ? "Deactivate" : "Activate"}</button></td>
              </tr>)}</tbody>
            </table>}
        {statusMutation.isError && <p role="alert" className="p-4 text-sm text-rose-700">{statusMutation.error.message}</p>}
      </div>
    </section>
  );
}
