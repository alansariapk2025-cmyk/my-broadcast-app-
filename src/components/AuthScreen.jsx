import { useState, useEffect } from "react";
import { Eye, EyeOff, Lock, Loader2, ShieldCheck, AlertCircle, CheckCircle2 } from "lucide-react";
import { auth } from "../firebase";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import notify from "../utils/notify";

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ||
  import.meta.env.VITE_API_URL ||
  "http://localhost:5000";

export default function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initPending, setInitPending] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [setupMode, setSetupMode] = useState("normal");

  useEffect(() => {
    const checkSetup = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`${BACKEND_URL}/check-admin-setup`, { signal: controller.signal });
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
      } catch {
        setSetupMode("normal");
      } finally {
        setCheckingSetup(false);
      }
    };
    checkSetup();
  }, []);

  const createDemoAdmin = async () => {
    setInitPending(true);
    const toastId = notify.loading("Creating demo admin account...");
    try {
      const res = await fetch(`${BACKEND_URL}/init-demo-admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to create demo admin");
      notify.dismiss(toastId);
      notify.success("Demo account created. Sign in with demo.admin@ansari.com / Demo1234");
      setSetupMode("demo_only");
      setEmail("demo.admin@ansari.com");
      setPassword("Demo1234");
    } catch (err) {
      notify.dismiss(toastId);
      notify.error(err.message);
    } finally {
      setInitPending(false);
    }
  };

  const submitLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const trimmedEmail = email.trim().toLowerCase();
      const cred = await signInWithEmailAndPassword(auth, trimmedEmail, password);
      await cred.user.getIdToken(true);
      const uid = cred.user.uid;

      const adminSnap = await getDoc(doc(db, "admins", uid));
      if (adminSnap.exists()) {
        notify.success("Welcome back, Super Admin");
        return;
      }

      const userSnap = await getDoc(doc(db, "users", uid));
      if (userSnap.exists()) {
        const d = userSnap.data();
        if (d.status === "suspended" || d.status === "disabled") {
          await signOut(auth);
          notify.error("Account suspended. Contact the super admin.");
          return;
        }
        notify.success(`Welcome, ${d.name || "User"}`);
        return;
      }

      await signOut(auth);
      notify.error("This account is not authorized to access the admin panel.");
    } catch (err) {
      const credErrors = [
        "auth/invalid-email",
        "auth/user-not-found",
        "auth/wrong-password",
        "auth/invalid-credential",
      ];
      if (credErrors.includes(err.code)) {
        notify.error(
          setupMode === "first_time"
            ? "Account not found. Initialize demo admin first."
            : "Invalid email or password."
        );
      } else if (err.code === "auth/too-many-requests") {
        notify.error("Too many attempts. Please wait and try again.");
      } else {
        notify.error(err.message || "Login failed");
      }
    } finally {
      setLoading(false);
    }
  };

  if (checkingSetup) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-amber-500 animate-spin mx-auto mb-3" />
          <p className="text-zinc-400 text-sm">Checking setup...</p>
        </div>
      </div>
    );
  }

  const isFirstTime = setupMode === "first_time";

  return (
    <div className="min-h-screen flex items-center justify-center theme-main p-4">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl theme-card p-8 shadow-2xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.12),_transparent_50%)] pointer-events-none" />

        <div className="relative z-10">
          <div className="text-center mb-8">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 shadow-lg shadow-blue-500/30">
              <ShieldCheck className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold theme-page-title">POS Admin Login</h1>
            <p className="mt-2 text-sm theme-page-muted">Secure multi-shop access</p>
          </div>

          {isFirstTime && (
            <div className="rounded-2xl border border-amber-500/20 bg-zinc-800/50 p-4 mb-6">
              <div className="flex items-start gap-2 mb-3">
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-100 text-sm">First Time Setup</p>
                  <p className="text-zinc-400 text-xs mt-1">No admin exists yet. Create a demo account to start.</p>
                </div>
              </div>
              <button
                onClick={createDemoAdmin}
                disabled={initPending}
                className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-3 text-sm font-semibold text-zinc-900 hover:brightness-110 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {initPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Initialize Demo Admin
                  </>
                )}
              </button>
            </div>
          )}

          <form onSubmit={submitLogin} className="space-y-4">
            <div>
              <label className="theme-label">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="admin@example.com"
                disabled={loading}
                className="theme-input w-full px-4 py-3"
              />
            </div>

            <div>
              <label className="theme-label">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="Enter password"
                  disabled={loading}
                  className="theme-input w-full px-4 py-3 pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-amber-400"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="theme-btn-primary w-full py-3"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  Sign In
                </>
              )}
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-zinc-500">
            Contact super admin if you need access.
          </p>
        </div>
      </div>
    </div>
  );
}
