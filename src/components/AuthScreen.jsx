// src/screens/AuthScreen.jsx
// ✅ Production-ready login with backend setup check
// ✅ Fixed JSX structure - all divs properly closed

import { useState, useEffect } from "react";
import { Eye, EyeOff } from "lucide-react";
import { auth, db } from "../firebase";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ||
  import.meta.env.VITE_API_URL ||
  "http://localhost:5000";

export default function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [initPending, setInitPending] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [setupMode, setSetupMode] = useState("normal");

  // ─────────────────────────────────────────────────────────────────
  // Check Admin Setup via Backend
  // ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const checkSetup = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const res = await fetch(`${BACKEND_URL}/check-admin-setup`, {
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();

        if (data.hasRealAdmin) {
          setSetupMode("normal");
        } else if (data.hasDemoAdmin) {
          setSetupMode("demo_only");
          setEmail("demo.admin@ansari.com");
          setPassword("Demo1234");
        } else {
          setSetupMode("first_time");
        }
      } catch (err) {
        console.warn("⚠️ Setup check fallback:", err.message);
        setSetupMode("normal");
      } finally {
        setCheckingSetup(false);
      }
    };

    checkSetup();
  }, []);

  // ─────────────────────────────────────────────────────────────────
  // Initialize Demo Admin
  // ─────────────────────────────────────────────────────────────────
  const createDemoAdmin = async () => {
    setInitPending(true);
    setMessage("🔧 Creating demo admin account...");

    try {
      const res = await fetch(`${BACKEND_URL}/init-demo-admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to create demo admin");
      }

      setMessage(
        "✅ Demo account created successfully. Sign in with the new admin account."
      );
      setSetupMode("demo_only");
    } catch (err) {
      setMessage(`❌ ${err.message}`);
    } finally {
      setInitPending(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────
  // Login Handler
  // ─────────────────────────────────────────────────────────────────
  const submitLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const trimmedEmail = email.trim().toLowerCase();

      const cred = await signInWithEmailAndPassword(
        auth,
        trimmedEmail,
        password
      );

      await cred.user.getIdToken(true);

      const uid = cred.user.uid;

      // Check admins/
      const adminSnap = await getDoc(doc(db, "admins", uid));
      if (adminSnap.exists()) {
        const d = adminSnap.data();
        setMessage(
          d.isDemo
            ? "✅ Logged in with demo account."
            : "✅ Logged in successfully."
        );
        return;
      }

      // Check users/
      const userSnap = await getDoc(doc(db, "users", uid));
      if (userSnap.exists()) {
        const d = userSnap.data();
        if (d.status === "suspended") {
          await auth.signOut();
          setMessage("❌ Account suspended. Contact the super admin.");
          return;
        }
        setMessage("✅ Logged in successfully.");
        return;
      }

      await auth.signOut();
      setMessage(
        "❌ This account is not authorized to access the admin panel."
      );
    } catch (err) {
      const credErrors = [
        "auth/invalid-email",
        "auth/user-not-found",
        "auth/wrong-password",
        "auth/invalid-credential",
      ];

      if (credErrors.includes(err.code)) {
        setMessage(
          setupMode === "first_time"
            ? "⚠️ Demo account not found. Click 'Initialize Demo Admin'."
            : "❌ Invalid email or password."
        );
      } else {
        setMessage(`❌ ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────
  // Loading State
  // ─────────────────────────────────────────────────────────────────
  if (checkingSetup) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white text-sm">Checking admin setup...</p>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // Computed Values
  // ─────────────────────────────────────────────────────────────────
  const isFirstTime = setupMode === "first_time";
  const isDemoOnly = setupMode === "demo_only";
  const alertVariant = message.startsWith("✅")
    ? "success"
    : message.startsWith("⚠️")
    ? "warning"
    : message.startsWith("❌")
    ? "error"
    : "info";

  // ─────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950 p-4">
      <div className="relative w-full max-w-md overflow-hidden rounded-[32px] border border-white/10 bg-white/10 p-6 shadow-2xl shadow-black/20 backdrop-blur-xl">
        
        {/* Background Decorations */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.25),_transparent_35%)] pointer-events-none" />
        <div className="absolute top-0 right-0 h-32 w-32 rounded-full bg-blue-500/10 blur-3xl" />

        {/* Main Content Container */}
        <div className="relative z-10">
          
          {/* Header */}
          <div className="text-center mb-8">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-500 to-blue-600 text-3xl text-white shadow-xl shadow-indigo-500/20">
              🔐
            </div>
            <h1 className="text-3xl font-semibold text-slate-100">
              Admin Login
            </h1>
            <p className="mt-2 text-sm text-slate-300">
              {setupMode === "normal"
                ? "Secure access to the admin dashboard."
                : "Initialize the first administrator account."}
            </p>
          </div>

          {/* First Time Setup Banner */}
          {(isFirstTime || isDemoOnly) && (
            <div className="rounded-[28px] border border-slate-700/70 bg-slate-950/70 p-4 mb-6 text-sm text-slate-200 shadow-lg shadow-black/20">
              <div className="font-semibold mb-2 text-slate-50">
                {isFirstTime ? "First Time Setup" : "Demo Mode"}
              </div>
              <p className="text-slate-300">
                {isFirstTime
                  ? "No admin user exists yet. Initialize a demo account to start."
                  : "A demo admin account is available for initial access."}
              </p>

              {isFirstTime && (
                <button
                  onClick={createDemoAdmin}
                  disabled={initPending}
                  className="mt-4 w-full rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-amber-500/30 transition hover:brightness-110 disabled:opacity-60"
                >
                  {initPending
                    ? "Creating demo admin..."
                    : "Initialize Demo Admin"}
                </button>
              )}
            </div>
          )}

          {/* Alert Message */}
          {message && (
            <div
              className={`relative mb-5 overflow-hidden rounded-3xl border px-4 py-4 text-sm shadow-xl transition ${
                alertVariant === "success"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : alertVariant === "warning"
                  ? "border-amber-300 bg-amber-50 text-amber-800"
                  : alertVariant === "error"
                  ? "border-rose-300 bg-rose-50 text-rose-800"
                  : "border-slate-300 bg-slate-50 text-slate-800"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-lg">
                  {alertVariant === "success"
                    ? "✅"
                    : alertVariant === "warning"
                    ? "⚠️"
                    : alertVariant === "error"
                    ? "❌"
                    : "ℹ️"}
                </span>
                <div className="flex-1 whitespace-pre-line">{message}</div>
              </div>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={submitLogin} className="space-y-4">
            
            {/* Email Field */}
            <div>
              <label className="block text-sm font-semibold text-slate-200 mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="admin@example.com"
                disabled={loading}
                className="w-full rounded-3xl border border-slate-300 bg-white/90 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100"
              />
            </div>

            {/* Password Field */}
            <div>
              <label className="block text-sm font-semibold text-slate-200 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="••••••••"
                  disabled={loading}
                  className="w-full rounded-3xl border border-slate-300 bg-white/90 px-4 py-3 pr-12 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-slate-900"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-3xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white py-3 font-bold hover:brightness-110 disabled:opacity-60 transition-all text-sm shadow-lg shadow-indigo-500/30"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : (
                "Sign In →"
              )}
            </button>
          </form>

          {/* Footer Note */}
          {setupMode === "normal" && (
            <p className="mt-4 text-center text-xs text-slate-400">
              Contact super admin if you need access.
            </p>
          )}

        </div>
        {/* End: Main Content Container */}
      </div>
      {/* End: Card */}
    </div>
    // End: Page Container
  );
}