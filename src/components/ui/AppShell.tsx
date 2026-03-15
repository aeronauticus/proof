"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState, useEffect, createContext, useContext } from "react";

interface Session {
  userId: number;
  role: "student" | "parent";
  name: string;
}

const SessionContext = createContext<Session | null>(null);

export function useSession() {
  return useContext(SessionContext);
}

const NAV_ITEMS = [
  { href: "/dashboard", label: "Home", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
  { href: "/assignments", label: "Tasks", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" },
  { href: "/notes", label: "Notes", icon: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" },
  { href: "/tests", label: "Tests", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
  { href: "/settings", label: "More", icon: "M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((data) => {
        if (!data.session) {
          router.replace("/login");
          return;
        }
        setSession(data.session);
        setLoading(false);
      })
      .catch(() => {
        router.replace("/login");
      });
  }, [router]);

  async function handleSwitchProfile() {
    await fetch("/api/auth", { method: "DELETE" });
    router.replace("/login");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400 text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <SessionContext.Provider value={session}>
      <div className="min-h-screen pb-20">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
          <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-900">Proof</h1>
            <button
              onClick={handleSwitchProfile}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold ${
                  session?.role === "student" ? "bg-blue-500" : "bg-purple-500"
                }`}
              >
                {session?.name[0]}
              </div>
              <span className="text-sm font-medium text-gray-700">
                {session?.name}
              </span>
            </button>
          </div>
        </header>

        {/* Main content */}
        <main className="max-w-lg mx-auto px-4 py-4">{children}</main>

        {/* Bottom navigation */}
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          <div className="max-w-lg mx-auto flex">
            {NAV_ITEMS.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <button
                  key={item.href}
                  onClick={() => router.push(item.href)}
                  className={`flex-1 flex flex-col items-center py-2 gap-0.5 transition-colors ${
                    active ? "text-blue-600" : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={active ? 2.5 : 2}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d={item.icon}
                    />
                  </svg>
                  <span className="text-xs font-medium">{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </SessionContext.Provider>
  );
}
