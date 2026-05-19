// src/components/ActivityLogs.jsx
// ✅ SUPER_ADMIN only: Real-time activity log viewer

import { useEffect, useState, useCallback } from "react";
import { db } from "../firebase";
import {
  collection, query, orderBy, limit, getDocs, where, startAfter,
} from "firebase/firestore";

const ACTION_META = {
  LOGIN:           { emoji: "🔑", label: "Login",           color: "bg-green-100 text-green-700" },
  LOGOUT:          { emoji: "🚪", label: "Logout",           color: "bg-gray-100 text-gray-700" },
  PRODUCT_ADD:     { emoji: "📦", label: "Product Added",    color: "bg-blue-100 text-blue-700" },
  PRODUCT_UPDATE:  { emoji: "✏️", label: "Product Updated",  color: "bg-yellow-100 text-yellow-700" },
  PRODUCT_DELETE:  { emoji: "🗑️", label: "Product Deleted",  color: "bg-red-100 text-red-700" },
  CATEGORY_ADD:    { emoji: "🏷️", label: "Category Added",   color: "bg-indigo-100 text-indigo-700" },
  CATEGORY_UPDATE: { emoji: "✏️", label: "Category Updated", color: "bg-yellow-100 text-yellow-700" },
  CATEGORY_DELETE: { emoji: "🗑️", label: "Category Deleted", color: "bg-red-100 text-red-700" },
  INVOICE_CREATE:  { emoji: "🧾", label: "Invoice Created",  color: "bg-purple-100 text-purple-700" },
  USER_CREATE:     { emoji: "👤", label: "User Created",     color: "bg-emerald-100 text-emerald-700" },
  USER_DELETE:     { emoji: "🗑️", label: "User Deleted",     color: "bg-red-100 text-red-700" },
  USER_SUSPEND:    { emoji: "⛔", label: "User Suspended",   color: "bg-orange-100 text-orange-700" },
  USER_ACTIVATE:   { emoji: "✅", label: "User Activated",   color: "bg-green-100 text-green-700" },
  SHOP_CREATE:     { emoji: "🏬", label: "Shop Created",     color: "bg-teal-100 text-teal-700" },
  SHOP_DELETE:     { emoji: "🗑️", label: "Shop Deleted",     color: "bg-red-100 text-red-700" },
};

const PAGE_SIZE = 30;

export default function ActivityLogs() {
  const [logs, setLogs]               = useState([]);
  const [loading, setLoading]         = useState(true);
  const [lastDoc, setLastDoc]         = useState(null);
  const [hasMore, setHasMore]         = useState(true);
  const [filterAction, setFilterAction] = useState("");
  const [filterShop, setFilterShop]   = useState("");
  const [shops, setShops]             = useState([]);

  // ── Load Shops for filter ──────────────────────────────────────
  useEffect(() => {
    getDocs(collection(db, "shops"))
      .then((snap) => setShops(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
      .catch(() => {});
  }, []);

  // ── Fetch Logs ─────────────────────────────────────────────────
  const fetchLogs = useCallback(async (reset = false) => {
    setLoading(true);
    try {
      let q = query(
        collection(db, "activityLogs"),
        orderBy("timestamp", "desc"),
        limit(PAGE_SIZE)
      );

      if (!reset && lastDoc) q = query(q, startAfter(lastDoc));

      const snap = await getDocs(q);
      const newLogs = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        timestamp: d.data().timestamp?.toDate?.()?.toISOString() || null,
      }));

      if (reset) {
        setLogs(newLogs);
      } else {
        setLogs((prev) => [...prev, ...newLogs]);
      }

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

  // ── Filter (client-side for simplicity, no extra index needed) ──
  const filtered = logs.filter((log) => {
    if (filterAction && log.action !== filterAction) return false;
    if (filterShop   && log.shopId   !== filterShop)   return false;
    return true;
  });

  const formatTime = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 p-6">
      <div className="max-w-6xl mx-auto space-y-5">

        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-indigo-800 rounded-2xl p-6 text-white shadow-xl">
          <h1 className="text-2xl font-bold flex items-center gap-2">📋 Activity Logs</h1>
          <p className="text-slate-300 text-sm mt-1">
            Full audit trail of all user actions across all shops.
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl shadow p-4 flex flex-wrap gap-3 items-center">
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="p-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            <option value="">All Actions</option>
            {Object.entries(ACTION_META).map(([key, meta]) => (
              <option key={key} value={key}>{meta.emoji} {meta.label}</option>
            ))}
          </select>

          <select
            value={filterShop}
            onChange={(e) => setFilterShop(e.target.value)}
            className="p-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            <option value="">All Shops</option>
            {shops.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          <button
            onClick={() => { setFilterAction(""); setFilterShop(""); }}
            className="px-3 py-2 bg-slate-100 rounded-xl text-sm hover:bg-slate-200 transition"
          >
            Clear Filters
          </button>

          <span className="ml-auto text-sm text-slate-500">
            {filtered.length} of {logs.length} logs
          </span>

          <button
            onClick={() => { setLastDoc(null); fetchLogs(true); }}
            className="px-3 py-2 bg-indigo-50 text-indigo-700 rounded-xl text-sm font-semibold hover:bg-indigo-100 transition"
          >
            🔄 Refresh
          </button>
        </div>

        {/* Logs Table */}
        <div className="bg-white rounded-2xl shadow overflow-hidden">
          {loading && logs.length === 0 ? (
            <div className="text-center py-12 text-slate-400">🔄 Loading logs...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <p className="text-4xl mb-2">📋</p>
              <p>No activity logs yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gradient-to-r from-slate-700 to-indigo-700 text-white">
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
                  {filtered.map((log, i) => {
                    const meta = ACTION_META[log.action] || { emoji: "📌", label: log.action, color: "bg-gray-100 text-gray-700" };
                    return (
                      <tr key={log.id} className={`border-b hover:bg-indigo-50/30 ${i % 2 === 0 ? "" : "bg-slate-50/50"}`}>
                        <td className="p-3 text-slate-500 whitespace-nowrap text-xs">{formatTime(log.timestamp)}</td>
                        <td className="p-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${meta.color}`}>
                            {meta.emoji} {meta.label}
                          </span>
                        </td>
                        <td className="p-3 text-slate-700 text-xs">{log.userEmail || "—"}</td>
                        <td className="p-3">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            log.userRole === "SUPER_ADMIN"
                              ? "bg-purple-100 text-purple-700"
                              : "bg-blue-100 text-blue-700"
                          }`}>
                            {log.userRole || "—"}
                          </span>
                        </td>
                        <td className="p-3 text-slate-600 text-xs">{log.shopName || "—"}</td>
                        <td className="p-3 text-slate-700 text-xs max-w-[200px] truncate">{log.entityName || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Load More */}
          {hasMore && !loading && (
            <div className="p-4 text-center border-t">
              <button
                onClick={() => fetchLogs(false)}
                className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition"
              >
                Load More
              </button>
            </div>
          )}

          {loading && logs.length > 0 && (
            <div className="p-4 text-center text-slate-500 text-sm">🔄 Loading more...</div>
          )}
        </div>

      </div>
    </div>
  );
}
