"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface UserOption {
  id: number;
  name: string;
  role: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((data) => {
        if (data.session) {
          router.replace("/dashboard");
          return;
        }
        setUsers(data.users || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Auth check failed:", err);
        setError("Failed to connect. Check server logs.");
        setLoading(false);
      });
  }, [router]);

  async function handleLogin() {
    if (!selectedUser || pin.length !== 4) return;
    setError("");

    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: selectedUser.id, pin }),
    });

    if (res.ok) {
      router.replace("/dashboard");
    } else {
      setError("Wrong PIN. Try again.");
      setPin("");
    }
  }

  function handlePinInput(digit: string) {
    if (pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      if (newPin.length === 4) {
        // Auto-submit on 4 digits
        setTimeout(() => {
          setError("");
          fetch("/api/auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: selectedUser!.id, pin: newPin }),
          }).then((res) => {
            if (res.ok) {
              router.replace("/dashboard");
            } else {
              setError("Wrong PIN. Try again.");
              setPin("");
            }
          });
        }, 100);
      }
    }
  }

  function handleBackspace() {
    setPin((prev) => prev.slice(0, -1));
    setError("");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400 text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-50">
      <div className="w-full max-w-sm">
        <h1 className="text-4xl font-bold text-center mb-2 text-gray-900">
          Proof
        </h1>
        <p className="text-center text-gray-500 mb-8">Academic Tracker</p>

        {!selectedUser ? (
          <div className="space-y-3">
            <p className="text-center text-gray-600 mb-4">Who are you?</p>
            {users.map((user) => (
              <button
                key={user.id}
                onClick={() => setSelectedUser(user)}
                className="w-full p-4 rounded-xl border-2 border-gray-200 hover:border-blue-400
                  bg-white hover:bg-blue-50 transition-all text-left flex items-center gap-4"
              >
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center text-white text-xl font-bold ${
                    user.role === "student" ? "bg-blue-500" : "bg-purple-500"
                  }`}
                >
                  {user.name[0]}
                </div>
                <div>
                  <div className="font-semibold text-lg text-gray-900">
                    {user.name}
                  </div>
                  <div className="text-sm text-gray-500 capitalize">
                    {user.role}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div>
            <button
              onClick={() => {
                setSelectedUser(null);
                setPin("");
                setError("");
              }}
              className="text-sm text-gray-500 hover:text-gray-700 mb-6 flex items-center gap-1"
            >
              &larr; Back
            </button>

            <div className="text-center mb-6">
              <div
                className={`w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto mb-3 ${
                  selectedUser.role === "student"
                    ? "bg-blue-500"
                    : "bg-purple-500"
                }`}
              >
                {selectedUser.name[0]}
              </div>
              <div className="font-semibold text-lg text-gray-900">
                {selectedUser.name}
              </div>
              <p className="text-gray-500 text-sm mt-1">Enter your PIN</p>
            </div>

            {/* PIN dots */}
            <div className="flex justify-center gap-3 mb-6">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`w-4 h-4 rounded-full transition-all ${
                    i < pin.length ? "bg-blue-500 scale-110" : "bg-gray-300"
                  }`}
                />
              ))}
            </div>

            {error && (
              <p className="text-red-500 text-center text-sm mb-4">{error}</p>
            )}

            {/* Number pad */}
            <div className="grid grid-cols-3 gap-3 max-w-[240px] mx-auto">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "←"].map(
                (key) => {
                  if (key === "") return <div key="empty" />;
                  if (key === "←") {
                    return (
                      <button
                        key="back"
                        onClick={handleBackspace}
                        className="w-16 h-16 rounded-full bg-gray-200 hover:bg-gray-300
                          flex items-center justify-center text-xl font-semibold text-gray-700
                          transition-colors mx-auto"
                      >
                        &larr;
                      </button>
                    );
                  }
                  return (
                    <button
                      key={key}
                      onClick={() => handlePinInput(key)}
                      className="w-16 h-16 rounded-full bg-white border-2 border-gray-200
                        hover:border-blue-400 hover:bg-blue-50 flex items-center justify-center
                        text-2xl font-semibold text-gray-800 transition-colors mx-auto"
                    >
                      {key}
                    </button>
                  );
                }
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
