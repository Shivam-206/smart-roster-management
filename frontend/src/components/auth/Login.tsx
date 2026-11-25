import { FormEvent, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LogIn, Eye, EyeOff } from "lucide-react";
import { login } from "../../api/auth";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => login(email, password),
    onSuccess: (user) => queryClient.setQueryData(["auth", "current-user"], user),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-600 text-white font-bold text-lg shadow-sm mb-4">
            SR
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Smart Roster</h1>
          <p className="text-sm text-slate-500 mt-1">DataStraw Operations Platform</p>
        </div>

        <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div>
            <label htmlFor="login-email" className="mb-1 block text-sm font-medium text-slate-700">Email address</label>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm bg-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-colors"
            />
          </div>

          <div>
            <label htmlFor="login-password" className="mb-1 block text-sm font-medium text-slate-700">Password</label>
            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 pr-10 text-sm bg-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {mutation.isError && (
            <p role="alert" className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">
              {mutation.error.message}
            </p>
          )}

          <button
            type="submit"
            disabled={mutation.isPending}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          >
            <LogIn className="h-4 w-4" />
            {mutation.isPending ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="text-center text-xs text-slate-400 mt-4">
          Sessions expire after 8 hours. Contact your administrator if you need access.
        </p>
      </div>
    </main>
  );
}
