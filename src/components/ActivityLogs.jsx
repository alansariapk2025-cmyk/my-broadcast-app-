// Activity Logs — Super Admin audit trail
import { useEffect, useState, useCallback } from "react";
import { db } from "../firebase";
import { collection, query, orderBy, limit, getDocs, startAfter } from "firebase/firestore";
import { ClipboardList, RefreshCw, Loader2 } from "lucide-react";
import PageShell, { SectionCard } from "./ui/PageShell";

const ACTION_META = {
  LOGIN:           { label: "Login",           badge: "theme-badge-success" },
  LOGOUT:          { label: "Logout",          badge: "theme-badge-neutral" },
  PRODUCT_ADD:     { label: "Product Added",   badge: "theme-badge-info" },
  PRODUCT_UPDATE:  { label: "Product Updated", badge: "theme-badge-warning" },
  PRODUCT_DELETE:  { label: "Product Deleted", badge: "theme-badge-danger" },
  CATEGORY_ADD:    { label: "Category Added",  badge: "theme-badge-info" },
  CATEGORY_UPDATE: { label: "Category Updated", badge: "theme-badge-warning" },
  CATEGORY_DELETE: { label: "Category Deleted", badge: "theme-badge-danger" },
  INVOICE_CREATE:  { label: "Invoice Created", badge: "theme-badge-info" },
  USER_CREATE:     { label: "User Created",    badge: "theme-badge-success" },
  USER_DELETE:     { label: "User Deleted",    badge: "theme-badge-danger" },
  USER_SUSPEND:    { label: "User Suspended",  badge: "theme-badge-warning" },
  USER_ACTIVATE:   { label: "User Activated",  badge: "theme-badge-success" },
  SHOP_CREATE:     { label: "Shop Created",    badge: "theme-badge-info" },
  SHOP_DELETE:     { label: "Shop Deleted",    badge: "theme-badge-danger" },
};

const PAGE_SIZE = 30;

export default function ActivityLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [filterAction, setFilterAction] = useState("");
  const [filterShop, setFilterShop] = useState("");
  const [shops, setShops] = useState([]);

  useEffect(() => {
    getDocs(collection(db, "shops"))
      .then((snap) => setShops(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
      .catch(() => {});
  }, []);

  const fetchLogs = useCallback(async (reset = false) => {
    setLoading(true);
    try {
      let q = query(collection(db, "activityLogs"), orderBy("timestamp", "desc"), limit(PAGE_SIZE));
      if (!reset && lastDoc) q = query(q, startAfter(lastDoc));

      const snap = await getDocs(q);
      const newLogs = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        timestamp: d.data().timestamp?.toDate?.()?.toISOString() || null,
      }));

      setLogs((prev) => (reset ? newLogs : [...prev, ...newLogs]));
      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (e) {
      console.error("Failed to load activity logs:", e);
    } finally {
      setLoading(false);
    }
  }, [lastDoc]);

  useEffect(() => {
    fetchLogs(true);
  }, []);

  const filtered = logs.filter((log) => {
    if (filterAction && log.action !== filterAction) return false;
    if (filterShop && log.shopId !== filterShop) return false;
    return true;
  });

  const formatTime = (iso) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" });
  };

  return (
    <PageShell
      title="Activity Logs"
      subtitle="Full audit trail of all user actions across all shops"
      icon={ClipboardList}
      actions={
        <button type="button" onClick={() => { setLastDoc(null); fetchLogs(true); }} className="theme-btn-secondary text-sm">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      }
    >
      <SectionCard title="Filters">
        <div className="flex flex-wrap gap-3 items-center">
          <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)} className="theme-select min-w-[180px]">
            <option value="">All Actions</option>
            {Object.entries(ACTION_META).map(([key, meta]) => (
              <option key={key} value={key}>{meta.label}</option>
            ))}
          </select>

          <select value={filterShop} onChange={(e) => setFilterShop(e.target.value)} className="theme-select min-w-[180px]">
            <option value="">All Shops</option>
            {shops.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          <button type="button" onClick={() => { setFilterAction(""); setFilterShop(""); }} className="theme-btn-secondary text-sm">
            Clear Filters
          </button>

          <span className="ml-auto text-sm theme-page-muted">
            {filtered.length} of {logs.length} logs
          </span>
        </div>
      </SectionCard>

      <SectionCard title="Audit Trail">
        {loading && logs.length === 0 ? (
          <div className="text-center py-12 theme-page-muted flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            Loading logs...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 theme-page-muted">No activity logs yet.</div>
        ) : (
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="p-3 text-left">Time</th>
                  <th className="p-3 text-left">Action</th>
                  <th className="p-3 text-left">User</th>
                  <th className="p-3 text-left">Role</th>
                  <th className="p-3 text-left">Shop</th>
                  <th className="p-3 text-left">Entity</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((log) => {
                  const meta = ACTION_META[log.action] || { label: log.action, badge: "theme-badge-neutral" };
                  return (
                    <tr key={log.id} className="border-t theme-card-inner hover:bg-blue-500/5">
                      <td className="p-3 theme-page-muted whitespace-nowrap text-xs">{formatTime(log.timestamp)}</td>
                      <td className="p-3">
                        <span className={`theme-badge ${meta.badge}`}>{meta.label}</span>
                      </td>
                      <td className="p-3 text-xs theme-page-title">{log.userEmail || "—"}</td>
                      <td className="p-3">
                        <span className={`theme-badge ${log.userRole === "SUPER_ADMIN" ? "theme-badge-warning" : "theme-badge-info"}`}>
                          {log.userRole || "—"}
                        </span>
                      </td>
                      <td className="p-3 text-xs theme-page-muted">{log.shopName || "—"}</td>
                      <td className="p-3 text-xs theme-page-title max-w-[200px] truncate">{log.entityName || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {hasMore && !loading && (
          <div className="p-4 text-center border-t theme-card-inner mt-4 rounded-xl">
            <button type="button" onClick={() => fetchLogs(false)} className="theme-btn-primary">
              Load More
            </button>
          </div>
        )}

        {loading && logs.length > 0 && (
          <div className="p-4 text-center theme-page-muted text-sm flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading more...
          </div>
        )}
      </SectionCard>
    </PageShell>
  );
}
