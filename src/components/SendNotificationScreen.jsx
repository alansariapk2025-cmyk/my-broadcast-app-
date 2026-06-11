import { useState, useEffect, useCallback } from "react";
import { db } from "../firebase";
import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  deleteDoc,
  doc,
} from "firebase/firestore";
import {
  FaHistory,
  FaTrash,
  FaBell,
  FaServer,
  FaAndroid,
  FaUsers,
  FaSync,
  FaCheckCircle,
  FaExclamationTriangle,
  FaPaperPlane,
} from "react-icons/fa";
import { Radio, Sparkles, Clock, Shield } from "lucide-react";
import PageShell, { SectionCard, FormField } from "./ui/PageShell";
import notify from "../utils/notify";

const getBackendURL = () => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  const hostname = window.location.hostname;
  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    return "https://my-broadcast-app.onrender.com";
  }
  return "http://localhost:5000";
};

const BACKEND_URL = getBackendURL();

const NOTIFICATION_TEMPLATES = [
  { id: "eid_offer", title: "Eid Special Sale!", body: "Celebrate Eid with up to 40% discount on all items!", action: "home" },
  { id: "discount_offer", title: "Mega Discount Offer!", body: "Flat 30% off on selected products. Limited time only!", action: "home" },
  { id: "new_arrival", title: "New Products Arrived!", body: "Check out our latest collection. Shop now!", action: "home" },
  { id: "order_reminder", title: "Complete Your Order!", body: "You have items in your cart. Don't miss out!", action: "cart" },
  { id: "flash_sale", title: "Flash Sale Alert!", body: "24-hour flash sale - Up to 50% off! Hurry!", action: "home" },
];

const ACTION_ROUTES = {
  home: "/home",
  cart: "/cart",
  account: "/account",
  orders: "/account/OrderHistoryScreen",
};

export default function SendNotificationScreen() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [selectedAction, setSelectedAction] = useState("home");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [notificationHistory, setNotificationHistory] = useState([]);
  const [serverStatus, setServerStatus] = useState("checking");
  const [lastPing, setLastPing] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [stats, setStats] = useState({
    totalPushTokens: 0,
    enabledPushTokens: 0,
    guestTokens: 0,
    userTokens: 0,
  });

  const checkServerHealth = async () => {
    setServerStatus("checking");
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(`${BACKEND_URL}/ping`, { method: "GET", signal: controller.signal });
      clearTimeout(timeoutId);
      if (response.ok) {
        setServerStatus("online");
        setLastPing(new Date().toLocaleTimeString());
      } else {
        setServerStatus("offline");
      }
    } catch {
      setServerStatus("offline");
    }
  };

  useEffect(() => {
    checkServerHealth();
    const interval = setInterval(checkServerHealth, 120_000);
    return () => clearInterval(interval);
  }, []);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const pushTokensSnapshot = await getDocs(collection(db, "push_tokens"));
      let enabledPushTokens = 0;
      let guestTokens = 0;
      let userTokens = 0;
      pushTokensSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data?.pushEnabled === true && data?.fcmToken?.trim()) {
          enabledPushTokens++;
          if (data?.isGuest === true) guestTokens++;
          else userTokens++;
        }
      });
      setStats({
        totalPushTokens: pushTokensSnapshot.size,
        enabledPushTokens,
        guestTokens,
        userTokens,
      });
    } catch {
      notify.error("Failed to load FCM stats");
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const q = query(
        collection(db, "notification_history"),
        orderBy("sentAt", "desc"),
        limit(20)
      );
      const snap = await getDocs(q);
      setNotificationHistory(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch {
      notify.error("Failed to load broadcast history");
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchHistory();
  }, [fetchStats, fetchHistory]);

  const sendNotificationToAll = async () => {
    if (!title.trim() || !body.trim()) {
      notify.warning("Enter title and body");
      return;
    }
    if (serverStatus !== "online") {
      if (!window.confirm("Server offline. Try anyway?")) return;
    }

    setLoading(true);
    setStatus("Sending via FCM...");
    try {
      const link = ACTION_ROUTES[selectedAction] || "/home";
      const response = await fetch(`${BACKEND_URL}/send-broadcast`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ title: title.trim(), body: body.trim(), link }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Error: ${response.status}`);

      const totalSent = result.totalSent ?? 0;
      const totalDevices = result.totalDevices ?? 0;
      setStatus(`Sent to ${totalSent}/${totalDevices} devices`);
      notify.success(`Broadcast sent to ${totalSent} devices`);
      setTitle("");
      setBody("");
      setSelectedAction("home");
      await Promise.all([fetchStats(), fetchHistory()]);
      setTimeout(() => setStatus(""), 8000);
    } catch (error) {
      setStatus(`Error: ${error.message}`);
      notify.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const useTemplate = (template) => {
    setTitle(template.title);
    setBody(template.body);
    setSelectedAction(template.action);
  };

  const deleteFromHistory = async (id) => {
    if (!window.confirm("Delete this broadcast record?")) return;
    try {
      await deleteDoc(doc(db, "notification_history", id));
      setNotificationHistory((prev) => prev.filter((h) => h.id !== id));
      notify.success("Record removed");
    } catch (error) {
      notify.error(error.message);
    }
  };

  const refreshAll = () => {
    checkServerHealth();
    fetchStats();
    fetchHistory();
  };

  return (
    <PageShell
      title="Push Notifications"
      subtitle="FCM broadcast — manual refresh (Spark-friendly, no live listeners)"
      icon={FaBell}
      actions={
        <button type="button" onClick={refreshAll} className="theme-btn-secondary text-sm">
          <FaSync className={`w-4 h-4 ${statsLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="stat-card p-4 flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${serverStatus === "online" ? "bg-green-500 animate-pulse" : serverStatus === "offline" ? "bg-red-500" : "bg-amber-400 animate-pulse"}`} />
          <div>
            <p className="text-xs theme-page-muted flex items-center gap-1"><FaServer className="w-3 h-3" /> Server</p>
            <p className="font-bold theme-highlight capitalize">{serverStatus}</p>
            {lastPing && <p className="text-[10px] theme-page-muted">{lastPing}</p>}
          </div>
        </div>
        <div className="stat-card p-4">
          <p className="text-xs theme-page-muted flex items-center gap-1"><FaBell className="w-3 h-3" /> Total Tokens</p>
          <p className="text-2xl font-bold theme-page-title">{stats.totalPushTokens}</p>
        </div>
        <div className="stat-card p-4">
          <p className="text-xs theme-page-muted flex items-center gap-1"><FaAndroid className="w-3 h-3" /> FCM Enabled</p>
          <p className="text-2xl font-bold theme-highlight">{stats.enabledPushTokens}</p>
        </div>
        <div className="stat-card p-4">
          <p className="text-xs theme-page-muted flex items-center gap-1"><FaUsers className="w-3 h-3" /> User Devices</p>
          <p className="text-2xl font-bold theme-highlight">{stats.userTokens}</p>
        </div>
        <div className="stat-card p-4">
          <p className="text-xs theme-page-muted">Guest Devices</p>
          <p className="text-2xl font-bold theme-page-title">{stats.guestTokens}</p>
        </div>
      </div>

      <div className="theme-card-inner px-4 py-3 flex flex-wrap items-center gap-2 text-xs theme-page-muted">
        <Shield className="w-4 h-4 text-blue-400" />
        <span>Backend:</span>
        <code className="theme-badge truncate max-w-full">{BACKEND_URL}</code>
        <span className="hidden sm:inline">· Stats load once + on refresh only</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Compose Broadcast" icon={FaPaperPlane}>
          <div className="space-y-4">
            <FormField label="Title" required>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="E.g. Eid Offer - 40% off"
                maxLength={100}
                className="theme-input"
              />
              <p className="text-xs theme-page-muted text-right mt-1">{title.length}/100</p>
            </FormField>

            <FormField label="Message Body" required>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your notification message..."
                rows={5}
                maxLength={500}
                className="theme-input resize-none min-h-[120px]"
              />
              <p className="text-xs theme-page-muted text-right mt-1">{body.length}/500</p>
            </FormField>

            <FormField label="Open Screen">
              <select value={selectedAction} onChange={(e) => setSelectedAction(e.target.value)} className="theme-select">
                <option value="home">Home</option>
                <option value="cart">Cart</option>
                <option value="account">Account</option>
                <option value="orders">Orders</option>
              </select>
            </FormField>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={sendNotificationToAll}
                disabled={loading || !title.trim() || !body.trim() || serverStatus === "offline"}
                className="theme-btn-primary flex-1 justify-center"
              >
                {loading ? <><FaSync className="animate-spin" /> Sending...</> : <><Radio className="w-4 h-4" /> Send to {stats.enabledPushTokens} devices</>}
              </button>
            </div>

            {status && (
              <div className={`rounded-xl p-3 text-sm font-medium theme-card-inner ${status.includes("Error") ? "border-red-500/40 text-red-400" : "border-green-500/40 text-green-400"}`}>
                {status.includes("Error") ? <FaExclamationTriangle className="inline mr-2" /> : <FaCheckCircle className="inline mr-2" />}
                {status}
              </div>
            )}
          </div>

          <div className="mt-6 pt-5 border-t border-white/10">
            <h4 className="text-sm font-bold theme-page-title mb-3 flex items-center gap-2"><Sparkles className="w-4 h-4 text-blue-400" /> Quick Templates</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {NOTIFICATION_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => useTemplate(t)}
                  disabled={loading}
                  className="theme-card-inner p-3 text-left hover:border-blue-500/40 transition text-sm"
                >
                  <span className="font-semibold theme-page-title block truncate">{t.title}</span>
                  <span className="text-xs theme-page-muted line-clamp-2 mt-1">{t.body}</span>
                </button>
              ))}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Recent Broadcasts" icon={FaHistory}>
          {notificationHistory.length === 0 ? (
            <div className="text-center py-16 theme-page-muted">
              <FaBell className="text-5xl mx-auto mb-4 opacity-30" />
              <p>No broadcasts yet</p>
            </div>
          ) : (
            <ul className="space-y-3 max-h-[640px] overflow-y-auto pr-1">
              {notificationHistory.map((item) => (
                <li key={item.id} className="theme-card-inner p-4 hover:border-blue-500/30 transition">
                  <div className="flex justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold theme-page-title truncate">{item.title}</p>
                      <p className="text-sm theme-page-muted line-clamp-2 mt-1">{item.body}</p>
                      <div className="flex flex-wrap gap-2 mt-3">
                        <span className="theme-badge theme-badge-info">{item.totalSent || 0} sent</span>
                        {item.invalidTokensRemoved > 0 && (
                          <span className="theme-badge theme-badge-danger">{item.invalidTokensRemoved} removed</span>
                        )}
                      </div>
                      <p className="mt-2 text-xs theme-page-muted flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {item.sentAt?.toDate?.()?.toLocaleString() || "—"}
                      </p>
                    </div>
                    <button type="button" onClick={() => deleteFromHistory(item.id)} className="theme-btn-danger p-2 h-fit">
                      <FaTrash className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </PageShell>
  );
}
