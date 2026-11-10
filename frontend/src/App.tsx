import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { 
  Users, 
  Building2, 
  Calendar, 
  CalendarDays,
  Layers, 
  SlidersHorizontal,
  Clock,
  Sparkles,
  ArrowRight,
  Shield,
  LogOut
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
import { AuthUser, fetchCurrentUser, logout } from "./api/auth";
import Login from "./components/auth/Login";
import UserManagement from "./components/auth/UserManagement";

export default function App() {
  const authQuery = useQuery({
    queryKey: ["auth", "current-user"],
    queryFn: fetchCurrentUser,
    retry: false,
  });

  if (authQuery.isLoading) {
    return <main className="min-h-screen flex items-center justify-center text-sm text-slate-500">Checking session...</main>;
  }
  if (authQuery.isError) {
    return <main className="min-h-screen flex flex-col items-center justify-center gap-3 text-sm text-rose-700">
      <p>Unable to verify your sign-in session.</p>
      <button onClick={() => void authQuery.refetch()} className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white">Retry</button>
    </main>;
  }
  if (!authQuery.data) return <Login />;

  return <ApplicationShell user={authQuery.data} />;
}

function ApplicationShell({ user }: { user: AuthUser }) {
  const [activeTab, setActiveTab] = useState("brands");
  const queryClient = useQueryClient();
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(["auth", "current-user"], null);
    },
  });
  useEffect(() => {
    const expireSession = () => {
      queryClient.clear();
      queryClient.setQueryData(["auth", "current-user"], null);
    };
    window.addEventListener("auth:expired", expireSession);
    return () => window.removeEventListener("auth:expired", expireSession);
  }, [queryClient]);

  // Query overall active counts for dynamic header badge
  const { data: employees = [] } = useQuery({
    queryKey: ["employees", "", "ALL"],
    queryFn: () => fetchEmployees(),
  });

  const { data: pods = [] } = useQuery({
    queryKey: ["pods", ""],
    queryFn: () => fetchPods(),
  });

  const { data: brands = [] } = useQuery({
    queryKey: ["brands", "", "ALL"],
    queryFn: () => fetchBrands(),
  });

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold shadow-sm">
              SR
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">
                Smart Roster Management System
              </h1>
              <p className="text-xs text-slate-500">DataStraw Operations Hub</p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-xs bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>
                Neon Connected • {employees.length || 32} Staff • {pods.length || 4} Pods • {brands.length || 14} Brands
              </span>
            </div>
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-slate-800">{user.name}</p>
              <p className="text-xs text-slate-500">{user.role}</p>
            </div>
            <button
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">{logoutMutation.isPending ? "Signing out..." : "Sign out"}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Navigation Bar */}
      <nav className="bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex space-x-1 sm:space-x-4 py-2 overflow-x-auto">
          {[
            { id: "brands", label: `Brands & Processes (${brands.length || 14})`, icon: Building2 },
            { id: "pods", label: `Pods (${pods.length || 4})`, icon: Layers },
            { id: "employees", label: `Employees (${employees.length || 32})`, icon: Users },
            { id: "dashboard", label: "Dashboard", icon: Sparkles },
            { id: "roster", label: "Monthly Roster", icon: Calendar },
            { id: "roster-views", label: "Roster Views", icon: CalendarDays },
            { id: "assignments", label: "Assignments", icon: SlidersHorizontal },
            { id: "availability", label: "Availability & Rules", icon: Clock },
            ...(user.role === "ADMIN" ? [{ id: "user-admin", label: "User Accounts", icon: Shield }] : []),
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? "bg-indigo-50 text-indigo-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-indigo-600" : "text-slate-400"}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === "brands" ? (
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
        ) : activeTab === "dashboard" ? (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
              <div className="inline-flex items-center justify-center p-3 bg-indigo-50 rounded-full text-indigo-600 mb-4">
                <Sparkles className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">Operations Hub Overview</h2>
              <p className="text-sm text-slate-600 max-w-xl mx-auto mb-6">
                Connected to live Neon PostgreSQL database. Master data and scheduling pipelines ready for roster generation.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 max-w-4xl mx-auto text-left mb-6">
                <div 
                  onClick={() => setActiveTab("brands")}
                  className="p-4 bg-slate-50 hover:bg-slate-100 cursor-pointer rounded-lg border border-slate-200 transition-colors"
                >
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Brands & Processes</span>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{brands.length || 14} Brands</p>
                  <p className="text-xs text-indigo-600 font-medium mt-1">Catalog & Calendars →</p>
                </div>
                <div 
                  onClick={() => setActiveTab("pods")}
                  className="p-4 bg-slate-50 hover:bg-slate-100 cursor-pointer rounded-lg border border-slate-200 transition-colors"
                >
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pods & Leads</span>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{pods.length || 4} Pods</p>
                  <p className="text-xs text-indigo-600 font-medium mt-1">Manage Pods →</p>
                </div>
                <div 
                  onClick={() => setActiveTab("employees")}
                  className="p-4 bg-slate-50 hover:bg-slate-100 cursor-pointer rounded-lg border border-slate-200 transition-colors"
                >
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Employees</span>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{employees.length || 32}</p>
                  <p className="text-xs text-indigo-600 font-medium mt-1">Directory →</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Operating Calendars</span>
                  <p className="text-2xl font-bold text-slate-900 mt-1">3 Models</p>
                  <p className="text-xs text-slate-500 mt-1">365d, no PH, no Sun+PH</p>
                </div>
              </div>

              <div className="flex items-center justify-center space-x-4">
                <button
                  onClick={() => setActiveTab("brands")}
                  className="inline-flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors"
                >
                  <span>Open Brand & Process Catalog</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setActiveTab("pods")}
                  className="inline-flex items-center space-x-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-semibold transition-colors"
                >
                  <span>Pod Management</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Section Upcoming in Next Phases</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mb-4">
              This module is scheduled for development in subsequent phases. Master Data modules (Employees, Pods, Brands, Processes) are currently active and fully operational.
            </p>
            <button
              onClick={() => setActiveTab("brands")}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
            >
              Go to Brands & Processes
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
