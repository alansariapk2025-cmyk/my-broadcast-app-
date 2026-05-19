// src/screens/AuthScreen.jsx
// ✅ Production-ready login with backend setup check
// ✅ Fixed JSX structure - all divs properly closed

import { useState, useEffect } from "react";
import { Eye, EyeOff } from "lucide-react";
import { auth, db } from "../firebase";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import toast, { Toaster } from "react-hot-toast";

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
  const [loginRole, setLoginRole] = useState("super_admin");

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

        await res.json();
        setSetupMode("normal");
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
      const userSnap = await getDoc(doc(db, "users", uid));

      if (loginRole === "super_admin") {
        if (adminSnap.exists()) {
          const d = adminSnap.data();
          const successText = d.isDemo
            ? "✅ Logged in with demo account."
            : "✅ Super admin login successful.";
          setMessage(successText);
          toast.success(successText);
          return;
        }

        if (userSnap.exists()) {
          await auth.signOut();
          const errorText = "❌ This account is a staff user. Please choose Staff login.";
          setMessage(errorText);
          toast.error(errorText);
          return;
        }
      }

      if (loginRole === "staff") {
        if (userSnap.exists()) {
          const d = userSnap.data();
          if (d.status === "suspended") {
            await auth.signOut();
            const errorText = "❌ Account suspended. Contact the super admin.";
            setMessage(errorText);
            toast.error(errorText);
            return;
          }
          const successText = "✅ Staff login successful.";
          setMessage(successText);
          toast.success(successText);
          return;
        }

        if (adminSnap.exists()) {
          await auth.signOut();
          const errorText = "❌ This account is a super admin account. Please choose Super Admin login.";
          setMessage(errorText);
          toast.error(errorText);
          return;
        }
      }

      await auth.signOut();
      const errorText = "❌ This account is not authorized to access the admin panel.";
      setMessage(errorText);
      toast.error(errorText);
    } catch (err) {
      const credErrors = [
        "auth/invalid-email",
        "auth/user-not-found",
        "auth/wrong-password",
        "auth/invalid-credential",
      ];

      const errorText = credErrors.includes(err.code)
        ? "❌ Invalid email or password."
        : `❌ ${err.message}`;
      setMessage(errorText);
      toast.error(errorText);
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
            <div>
              <label className="block text-sm font-semibold text-slate-200 mb-1">
                Login As
              </label>
              <select
                value={loginRole}
                onChange={(e) => setLoginRole(e.target.value)}
                disabled={loading}
                className="w-full rounded-3xl border border-slate-300 bg-white/90 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100"
              >
                <option value="super_admin">Super Admin</option>
                <option value="staff">Staff</option>
              </select>
              <p className="mt-2 text-xs text-slate-400">
                Choose the login role before signing in.
              </p>
            </div>

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
              {loginRole === "super_admin"
                ? "Super Admin must login with admin credentials."
                : "Staff must login with assigned staff credentials."}
            </p>
          )}
          <Toaster position="top-right" />

        </div>
        {/* End: Main Content Container */}
      </div>
      {/* End: Card */}
    </div>
    // End: Page Container
  );
}