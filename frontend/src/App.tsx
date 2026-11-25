import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  Building2,
  Calendar,
  CalendarDays,
  Layers,
  SlidersHorizontal,
  Clock,
  LayoutDashboard,
  Shield,
  LogOut,
  Menu,
  X,
  ChevronRight,
  AlertTriangle,
  TrendingUp,
  CheckCircle,
} from "lucide-react";
import EmployeeManagement from "./components/employees/EmployeeManagement";
import PodManagement from "./components/pods/PodManagement";
import BrandProcessManagement from "./components/brands/BrandProcessManagement";
import AssignmentsManagement from "./components/assignments/AssignmentsManagement";
import AvailabilityManagement from "./components/availability/AvailabilityManagement";
import MonthlyRosterGeneration from "./components/rosters/MonthlyRosterGeneration";
import MonthlyRosterViews from "./components/rosters/MonthlyRosterViews";
import { fetchEmployees } from "./api/employees";
import { fetchPods } from "./api/pods";
import { fetchBrands } from "./api/brands";
import { fetchProcesses } from "./api/processes";
import { fetchAssignments } from "./api/assignments";
import { AuthUser, fetchCurrentUser, logout } from "./api/auth";
import Login from "./components/auth/Login";
import UserManagement from "./components/auth/UserManagement";

export default function App() {
  const queryClient = useQueryClient();
  const authQuery = useQuery({
    queryKey: ["auth", "current-user"],
    queryFn: fetchCurrentUser,
    retry: false,
  });

  useEffect(() => {
    if (authQuery.data !== null) return;

    const protectedQueries = {
      predicate: (query: { queryKey: readonly unknown[] }) => query.queryKey[0] !== "auth",
    };
    void queryClient.cancelQueries(protectedQueries).then(() => {
      queryClient.removeQueries(protectedQueries);
    });
  }, [authQuery.data, queryClient]);

  if (authQuery.isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin" />
          <p className="text-sm text-slate-500">Verifying session...</p>
        </div>
      </main>
    );
  }
  if (authQuery.isError) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-50">
        <p className="text-sm text-rose-700">Unable to verify your sign-in session.</p>
        <button onClick={() => void authQuery.refetch()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">Retry</button>
      </main>
    );
  }
  if (!authQuery.data) return <Login />;

  return <ApplicationShell user={authQuery.data} />;
}

type NavItem = { id: string; label: string; icon: React.ComponentType<{ className?: string }> };

function ApplicationShell({ user }: { user: AuthUser }) {
  const navItems = useMemo<NavItem[]>(() => [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "employees", label: "Employees", icon: Users },
    { id: "pods", label: "Pods", icon: Layers },
    { id: "brands", label: "Brands & Processes", icon: Building2 },
    { id: "assignments", label: "Assignments", icon: SlidersHorizontal },
    { id: "availability", label: "Availability & Rules", icon: Clock },
    { id: "roster", label: "Monthly Roster", icon: Calendar },
    { id: "roster-views", label: "Roster Views", icon: CalendarDays },
    ...(user.role === "ADMIN" ? [{ id: "user-admin", label: "User Accounts", icon: Shield }] : []),
  ], [user.role]);
  const [activeTab, setActiveTab] = useState(() => {
    const requestedTab = new URLSearchParams(window.location.search).get("tab");
    return navItems.find((item) => item.id === requestedTab)?.id || "dashboard";
  });
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const queryClient = useQueryClient();
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.setQueryData(["auth", "current-user"], null);
    },
  });
  useEffect(() => {
    const expireSession = () => {
      queryClient.setQueryData(["auth", "current-user"], null);
    };
    window.addEventListener("auth:expired", expireSession);
    return () => window.removeEventListener("auth:expired", expireSession);
  }, [queryClient]);

  useEffect(() => {
    const syncTabFromLocation = () => {
      const requestedTab = new URLSearchParams(window.location.search).get("tab");
      const nextTab = navItems.find((item) => item.id === requestedTab)?.id || "dashboard";

      if (requestedTab !== nextTab) {
        const url = new URL(window.location.href);
        url.searchParams.set("tab", nextTab);
        window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      }

      setActiveTab(nextTab);
      setIsMobileNavOpen(false);
    };

    syncTabFromLocation();
    window.addEventListener("popstate", syncTabFromLocation);
    return () => window.removeEventListener("popstate", syncTabFromLocation);
  }, [navItems]);

  const navigateTo = (tab: string) => {
    const availableTab = navItems.find((item) => item.id === tab);
    if (!availableTab) return;

    const url = new URL(window.location.href);
    if (url.searchParams.get("tab") !== availableTab.id) {
      url.searchParams.set("tab", availableTab.id);
      window.history.pushState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }

    setActiveTab(availableTab.id);
    setIsMobileNavOpen(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white shadow-sm">
        <div className="flex h-14 items-center justify-between gap-2 px-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => navigateTo("dashboard")}
              aria-label="Smart Roster dashboard"
              className="flex min-w-0 items-center gap-2.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white shadow-sm">
                SR
              </span>
              <span className="truncate text-base font-bold text-slate-900">
                Smart Roster<span className="hidden font-normal text-slate-400 sm:inline"> · DataStraw</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setIsMobileNavOpen((isOpen) => !isOpen)}
              aria-label={isMobileNavOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={isMobileNavOpen}
              aria-controls="primary-navigation"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 md:hidden"
            >
              {isMobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700 sm:px-2.5 sm:text-xs">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_7px_rgba(16,185,129,0.7)]" />
              <span>Neon connected</span>
            </div>
            <div className="hidden md:block text-right leading-tight">
              <p className="text-sm font-semibold text-slate-800">{user.name}</p>
              <p className="text-xs text-slate-400">{user.role === "ADMIN" ? "Administrator" : "Manager"}</p>
            </div>
            <button
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              aria-label={logoutMutation.isPending ? "Signing out" : "Sign out"}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{logoutMutation.isPending ? "Signing out..." : "Sign out"}</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {isMobileNavOpen && (
          <button
            type="button"
            onClick={() => setIsMobileNavOpen(false)}
            aria-label="Close navigation menu"
            className="fixed inset-x-0 bottom-0 top-14 z-40 bg-slate-950/30 md:hidden"
          />
        )}

        <aside
          className={`fixed inset-y-14 left-0 z-50 flex w-60 flex-col border-r border-slate-200 bg-white transition-transform duration-200 md:sticky md:top-14 md:z-30 md:h-[calc(100vh-3.5rem)] md:translate-x-0 md:shrink-0 ${
            isMobileNavOpen ? "visible translate-x-0" : "invisible -translate-x-full md:visible"
          }`}
        >
          <div className="px-3 pb-3 pt-6">
            <p className="mb-3 px-3 text-[11px] font-semibold tracking-[0.12em] text-slate-400">WORKSPACE</p>
            <nav id="primary-navigation" aria-label="Primary navigation" className="space-y-1">
              {navItems.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    type="button"
                    key={tab.id}
                    onClick={() => navigateTo(tab.id)}
                    aria-current={isActive ? "page" : undefined}
                    className={`group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 ${
                      isActive
                        ? "bg-indigo-50 text-indigo-700"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                  >
                    {isActive && <span aria-hidden="true" className="absolute bottom-2 left-0 top-2 w-0.5 rounded-r bg-indigo-600" />}
                    <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-600"}`} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="mt-auto border-t border-slate-100 p-4 md:hidden">
            <p className="truncate text-sm font-semibold text-slate-800">{user.name}</p>
            <p className="mt-0.5 text-xs text-slate-500">{user.role === "ADMIN" ? "Administrator" : "Manager"}</p>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
          {logoutMutation.isError && (
            <p role="alert" className="mb-4 text-sm text-rose-700">
              {logoutMutation.error instanceof Error ? logoutMutation.error.message : "Unable to sign out. Please try again."}
            </p>
          )}

          {activeTab === "dashboard" ? (
            <Dashboard onNavigate={navigateTo} />
          ) : activeTab === "brands" ? (
            <BrandProcessManagement />
          ) : activeTab === "pods" ? (
            <PodManagement />
          ) : activeTab === "employees" ? (
            <EmployeeManagement />
          ) : activeTab === "assignments" ? (
            <AssignmentsManagement />
          ) : activeTab === "availability" ? (
            <AvailabilityManagement />
          ) : activeTab === "roster" ? (
            <MonthlyRosterGeneration />
          ) : activeTab === "roster-views" ? (
            <MonthlyRosterViews />
          ) : activeTab === "user-admin" && user.role === "ADMIN" ? (
            <UserManagement currentUserId={user.id} />
          ) : null}
        </main>
      </div>
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  color,
  onClick,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color: "indigo" | "emerald" | "amber" | "slate";
  onClick?: () => void;
}) {
  const colorMap = {
    indigo: "bg-indigo-50 text-indigo-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    slate: "bg-slate-100 text-slate-500",
  };
  return (
    <div
      onClick={onClick}
      className={`bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-1 ${onClick ? "cursor-pointer hover:border-slate-300 hover:shadow-sm transition-all" : ""}`}
    >
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      {sub && <p className={`text-xs font-medium mt-0.5 ${colorMap[color]}`}>{sub}</p>}
    </div>
  );
}

function QuickLink({
  icon: Icon,
  label,
  description,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 p-4 bg-white border border-slate-200 rounded-xl text-left hover:border-indigo-200 hover:bg-indigo-50/30 transition-all group"
    >
      <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 group-hover:bg-indigo-100 transition-colors">
        <Icon className="w-4 h-4 text-slate-500 group-hover:text-indigo-600 transition-colors" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold text-slate-800 group-hover:text-indigo-700 transition-colors">{label}</p>
        <p className="mt-0.5 truncate text-sm leading-5 text-slate-500">{description}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 shrink-0 transition-colors" />
    </button>
  );
}

function Dashboard({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const { data: employees = [], isLoading: empLoading } = useQuery({
    queryKey: ["employees", "", "ALL"],
    queryFn: () => fetchEmployees(),
  });
  const { data: pods = [], isLoading: podsLoading } = useQuery({
    queryKey: ["pods", ""],
    queryFn: () => fetchPods(),
  });
  const { data: brands = [], isLoading: brandsLoading } = useQuery({
    queryKey: ["brands", "", "ALL"],
    queryFn: () => fetchBrands(),
  });
  const { data: processes = [], isLoading: procsLoading } = useQuery({
    queryKey: ["processes"],
    queryFn: () => fetchProcesses(),
  });
  const { data: assignments = [], isLoading: assignLoading } = useQuery({
    queryKey: ["assignments", { search: "", employeeId: "ALL", brandId: "ALL", processId: "ALL", podId: "ALL", assignmentType: "ALL" }],
    queryFn: () => fetchAssignments({ search: "", employeeId: "ALL", brandId: "ALL", processId: "ALL", podId: "ALL", assignmentType: "ALL" }),
  });

  const isLoading = empLoading || podsLoading || brandsLoading || procsLoading || assignLoading;

  const activeEmployees = employees.filter((e) => e.isActive);
  const inactiveEmployees = employees.filter((e) => !e.isActive);
  const primaryAssignments = assignments.filter((a) => a.assignmentType === "PRIMARY");
  const unassignedEmployees = activeEmployees.filter(
    (e) => !assignments.some((a) => a.employeeId === e.id)
  );

  const today = new Date();
  const monthLabel = today.toLocaleString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="app-page-title">Operations Overview</h1>
        <p className="mt-1 text-sm leading-6 text-slate-500">{monthLabel} · Workforce snapshot from live database</p>
      </div>

      {/* Stats Row */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl p-5 animate-pulse">
              <div className="h-3 bg-slate-100 rounded w-20 mb-3" />
              <div className="h-7 bg-slate-100 rounded w-12 mb-2" />
              <div className="h-3 bg-slate-100 rounded w-16" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Active Employees"
            value={activeEmployees.length}
            sub={inactiveEmployees.length > 0 ? `${inactiveEmployees.length} inactive` : "All active"}
            color="indigo"
            onClick={() => onNavigate("employees")}
          />
          <StatCard
            label="Operational Pods"
            value={pods.length}
            sub={`${brands.length} brands`}
            color="emerald"
            onClick={() => onNavigate("pods")}
          />
          <StatCard
            label="Processes"
            value={processes.length}
            sub={`${primaryAssignments.length} primary assignments`}
            color="amber"
            onClick={() => onNavigate("brands")}
          />
          <StatCard
            label="Assignment Coverage"
            value={`${assignments.length}`}
            sub={unassignedEmployees.length > 0 ? `${unassignedEmployees.length} unassigned staff` : "All staff assigned"}
            color={unassignedEmployees.length > 0 ? "amber" : "emerald"}
            onClick={() => onNavigate("assignments")}
          />
        </div>
      )}

      {/* Two-column section: Alerts + Quick Nav */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Alerts */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="app-section-title">Staffing Status</h2>
            <p className="text-xs text-slate-400 mt-0.5">Items that may need attention</p>
          </div>
          <div className="divide-y divide-slate-50">
            {isLoading ? (
              <div className="p-5 space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-4 bg-slate-100 rounded animate-pulse" />
                ))}
              </div>
            ) : (
              <>
                {unassignedEmployees.length > 0 ? (
                  <div className="flex items-start gap-3 px-5 py-3.5">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {unassignedEmployees.length} active {unassignedEmployees.length === 1 ? "employee" : "employees"} without process assignment
                      </p>
                      <button
                        onClick={() => onNavigate("assignments")}
                        className="text-xs text-indigo-600 font-medium mt-0.5 hover:text-indigo-800"
                      >
                        Review assignments →
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 px-5 py-3.5">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-slate-700">All active employees have process assignments</p>
                  </div>
                )}

                {processes.filter((p) => !assignments.some((a) => a.processId === p.id && a.assignmentType === "PRIMARY")).length > 0 ? (
                  <div className="flex items-start gap-3 px-5 py-3.5">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {processes.filter((p) => !assignments.some((a) => a.processId === p.id && a.assignmentType === "PRIMARY")).length} {processes.filter((p) => !assignments.some((a) => a.processId === p.id && a.assignmentType === "PRIMARY")).length === 1 ? "process" : "processes"} without a primary assignee
                      </p>
                      <button
                        onClick={() => onNavigate("assignments")}
                        className="text-xs text-indigo-600 font-medium mt-0.5 hover:text-indigo-800"
                      >
                        Assign staff →
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 px-5 py-3.5">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-slate-700">All processes have at least one primary assignee</p>
                  </div>
                )}

                {pods.filter((p) => !p.lead).length > 0 ? (
                  <div className="flex items-start gap-3 px-5 py-3.5">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {pods.filter((p) => !p.lead).length} {pods.filter((p) => !p.lead).length === 1 ? "pod" : "pods"} without an assigned lead
                      </p>
                      <button
                        onClick={() => onNavigate("pods")}
                        className="text-xs text-indigo-600 font-medium mt-0.5 hover:text-indigo-800"
                      >
                        Assign leads →
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 px-5 py-3.5">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-slate-700">All pods have an assigned lead</p>
                  </div>
                )}

                <div className="flex items-start gap-3 px-5 py-3.5">
                  <TrendingUp className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {assignments.filter((a) => a.assignmentType === "SECONDARY_BACKUP").length} backup designations configured
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {assignments.filter((a) => a.assignmentType === "FLOAT").length} float assignments available
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Quick Navigation */}
        <div className="space-y-3">
          <div className="px-1">
            <h2 className="app-section-title">Quick Access</h2>
            <p className="text-xs text-slate-400 mt-0.5">Navigate to key management areas</p>
          </div>
          <QuickLink
            icon={Calendar}
            label="Generate Monthly Roster"
            description="Create a new roster for a selected month and year"
            onClick={() => onNavigate("roster")}
          />
          <QuickLink
            icon={CalendarDays}
            label="View & Edit Roster"
            description="Inspect, replace, fill vacancies, and revalidate roster entries"
            onClick={() => onNavigate("roster-views")}
          />
          <QuickLink
            icon={Clock}
            label="Availability & Rules"
            description="Weekly offs, leaves, public holidays, process calendars"
            onClick={() => onNavigate("availability")}
          />
          <QuickLink
            icon={SlidersHorizontal}
            label="Manage Assignments"
            description="Employee–process qualifications and backup tiers"
            onClick={() => onNavigate("assignments")}
          />
        </div>
      </div>

      {/* Organization Summary */}
      {!isLoading && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="app-section-title">Organization Summary</h2>
            <p className="text-xs text-slate-400 mt-0.5">Pod breakdown</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-[13px] font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100">
                  <th className="px-5 py-3 text-left">Pod</th>
                  <th className="px-5 py-3 text-left">Lead</th>
                  <th className="px-5 py-3 text-left">Members</th>
                  <th className="px-5 py-3 text-left">Brands</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pods.map((pod) => (
                  <tr key={pod.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-100">{pod.code}</span>
                        <span className="font-medium text-slate-800">{pod.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 text-sm">
                      {pod.lead ? (
                        <span>{pod.lead.name} <span className="text-slate-400">({pod.lead.employeeCode})</span></span>
                      ) : (
                        <span className="text-amber-600 font-medium">No lead assigned</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-slate-700 font-semibold">{pod._count?.members ?? 0}</span>
                      <span className="text-slate-400 text-xs ml-1">staff</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-slate-700 font-semibold">{pod._count?.brands ?? 0}</span>
                      <span className="text-slate-400 text-xs ml-1">brands</span>
                    </td>
                  </tr>
                ))}
                {pods.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-sm text-slate-400">
                      No pods configured yet. <button onClick={() => onNavigate("pods")} className="text-indigo-600 font-medium hover:text-indigo-800">Create a pod →</button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
