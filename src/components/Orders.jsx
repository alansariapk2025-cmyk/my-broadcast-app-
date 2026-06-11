// src/components/Orders.jsx
import { useEffect, useState, useMemo, useCallback } from "react";
import { db } from "../firebase";
import { collection, getDocs, updateDoc, deleteDoc, doc, query, orderBy } from "firebase/firestore";
import { useShop } from "../contexts/ShopContext";
import { filterByShop } from "../utils/shopUtils";
import notify from "../utils/notify";
import PageShell, { SectionCard } from "./ui/PageShell";
import { FaTrash, FaMotorcycle, FaSearch, FaDownload, FaUpload, FaFilter, FaTimes, FaSync, FaPrint, FaEye, FaBoxOpen, FaBell } from "react-icons/fa";
import { Workbook } from "exceljs";
import { saveAs } from "file-saver";

const num = (v) => (typeof v === "number" && !isNaN(v) ? v : Number(v) || 0);

const formatDateTime = (ts) => {
  if (!ts) return "N/A";
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString("en-PK", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return "N/A"; }
};

const timeAgo = (ts) => {
  if (!ts) return "";
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const diffMs = Date.now() - d;
    const mins = Math.floor(diffMs / 60000);
    const hrs = Math.floor(diffMs / 3600000);
    const days = Math.floor(diffMs / 86400000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    if (hrs < 24) return `${hrs}h ago`;
    return `${days}d ago`;
  } catch { return ""; }
};

const NEW_STATUSES = ["Pending", "Placed"];
const MAIN_STATUSES = ["Preparing", "Rider Assigned", "On Route", "Delivered", "Cancelled"];

const STATUS_CONFIG = {
  Pending: { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-300" },
  Placed: { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-300" },
  Preparing: { bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-300" },
  "Rider Assigned": { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-300" },
  "On Route": { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-300" },
  Delivered: { bg: "bg-green-50", text: "text-green-700", border: "border-green-300" },
  Cancelled: { bg: "bg-red-50", text: "text-red-700", border: "border-red-300" },
};

// NEW ORDER BADGE COMPONENT
const NewOrderBadge = () => (
  <span className="inline-flex items-center gap-1 px-2 py-1 bg-gradient-to-r from-orange-500 to-red-500 text-white text-xs font-bold rounded-full animate-pulse shadow-lg">
    <FaBell className="w-3 h-3 animate-bounce" />
    NEW
  </span>
);

export default function Orders({ onNavigate, assignedShopId: propShopId }) {
  const { effectiveShopId: ctxShopId } = useShop();
  const effectiveShopId = propShopId || ctxShopId;

  const [orders, setOrders] = useState([]);
  const [charges, setCharges] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selected, setSelected] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [ageFilter, setAgeFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState("newest");
  const [refreshing, setRefreshing] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const perPage = 10;

  const isNewOrder = useCallback((o) => NEW_STATUSES.includes(o.status || "Pending"), []);

  const fetchOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      let list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (effectiveShopId) list = filterByShop(list, effectiveShopId);
      setOrders(list);
    } catch (err) {
      console.error("Orders fetch error:", err);
      notify.error("Failed to load orders");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [effectiveShopId]);

  useEffect(() => {
    fetchOrders();
    const timer = setInterval(() => fetchOrders(true), 90_000);
    return () => clearInterval(timer);
  }, [fetchOrders]);

  const filtered = useMemo(() => {
    const now = new Date();
    return orders.filter((o) => {
      const term = search.trim().toLowerCase();
      const matchSearch = !term || (o.orderId || o.id || "").toLowerCase().includes(term) || 
        (o.customerName || o.userName || "").toLowerCase().includes(term) || 
        (o.customerPhone || "").includes(term);
      const d = o.createdAt?.toDate?.() || new Date(o.createdAt || now);
      const matchDate = (!startDate || d >= new Date(startDate)) && (!endDate || d <= new Date(endDate + "T23:59:59"));
      const matchStatus = statusFilter === "all" || o.status === statusFilter;
      const hrs = (now - d) / 36e5;
      const matchAge = ageFilter === "all" || (ageFilter === "1h" && hrs <= 1) || 
        (ageFilter === "24h" && hrs <= 24) || (ageFilter === "7d" && hrs <= 168) || (ageFilter === "30d" && hrs <= 720);
      return matchSearch && matchDate && matchStatus && matchAge;
    }).sort((a, b) => {
      const dA = a.createdAt?.toDate?.() || new Date(0);
      const dB = b.createdAt?.toDate?.() || new Date(0);
      if (sortBy === "oldest") return dA - dB;
      if (sortBy === "amount-high") return num(b.grandTotal || b.total) - num(a.grandTotal || a.total);
      if (sortBy === "amount-low") return num(a.grandTotal || a.total) - num(b.grandTotal || b.total);
      return dB - dA;
    });
  }, [orders, search, startDate, endDate, statusFilter, ageFilter, sortBy]);

  const stats = useMemo(() => {
    const newOrders = orders.filter(isNewOrder);
    const active = orders.filter((o) => ["Preparing", "Rider Assigned", "On Route"].includes(o.status));
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const today = orders.filter((o) => (o.createdAt?.toDate?.() || new Date(0)) >= todayStart);
    return {
      total: filtered.length, new: newOrders.length, active: active.length, today: today.length,
      sales: filtered.reduce((a, b) => a + num(b.grandTotal || b.total), 0),
      delivery: filtered.reduce((a, b) => a + num(b.deliveryCharge), 0),
    };
  }, [orders, filtered, isNewOrder]);

  const totalPages = Math.ceil(filtered.length / perPage) || 1;
  const current = filtered.slice((page - 1) * perPage, page * perPage);

  const handleSaveCharge = async (id) => {
    const charge = charges[id];
    if (!charge && charge !== 0) return alert("⚠️ Enter delivery charge!");
    const order = orders.find((o) => o.id === id);
    const base = num(order?.subtotal ?? order?.total ?? 0);
    try {
      await updateDoc(doc(db, "orders", id), { deliveryCharge: num(charge), grandTotal: base + num(charge), updatedAt: new Date() });
      setCharges((p) => ({ ...p, [id]: "" }));
      alert("✅ Saved!");
    } catch { alert("❌ Error!"); }
  };

  const handleStatusChange = async (id, status) => {
    try {
      await updateDoc(doc(db, "orders", id), {
        status, updatedAt: new Date(),
        ...(status === "Delivered" && { deliveredAt: new Date() }),
        ...(status === "Cancelled" && { cancelledAt: new Date() }),
      });
    } catch { alert("❌ Error!"); }
  };

  const handleAssignRider = async (id) => {
    const name = prompt("Rider name:"); if (!name) return;
    const phone = prompt("Rider phone:"); if (!phone) return;
    const vehicle = prompt("Vehicle (optional):");
    try {
      await updateDoc(doc(db, "orders", id), { riderName: name, riderPhone: phone, riderVehicle: vehicle || "", status: "Rider Assigned", riderAssignedAt: new Date(), updatedAt: new Date() });
      alert("✅ Rider assigned!");
    } catch { alert("❌ Error!"); }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this order?")) return;
    try { await deleteDoc(doc(db, "orders", id)); } catch { alert("❌ Error!"); }
  };

  const exportToExcel = () => {
    const data = filtered.map((o) => ({
      "Order ID": o.orderId || o.id, Status: o.status, "Created": formatDateTime(o.createdAt),
      Customer: o.customerName || o.userName, Phone: o.customerPhone, Address: o.customerAddress,
      Subtotal: num(o.subtotal || o.total), Delivery: num(o.deliveryCharge), Total: num(o.grandTotal || o.total),
      Rider: o.riderName, Items: o.items?.map((i) => `${i.nameEn || i.name} x${i.qty || 1}`).join(", "),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Orders");
    XLSX.writeFile(wb, `orders_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const clearFilters = () => { setSearch(""); setStartDate(""); setEndDate(""); setStatusFilter("all"); setAgeFilter("all"); setSortBy("newest"); setPage(1); };

  const StatusBadge = ({ status }) => {
    const c = STATUS_CONFIG[status] || { bg: "bg-gray-100", text: "text-gray-700", border: "border-gray-300" };
    return <span className={`px-2 py-1 rounded-full text-xs font-semibold ${c.bg} ${c.text} border ${c.border}`}>{status || "N/A"}</span>;
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <PageShell
      title="Orders"
      subtitle="Manage all customer orders"
      icon={FaBoxOpen}
      actions={
        <div className="flex gap-2">
          <button type="button" onClick={() => { setRefreshing(true); fetchOrders(true); }} className={`theme-btn-secondary p-2.5 ${refreshing ? "animate-spin" : ""}`}>
            <FaSync className="w-5 h-5" />
          </button>
          <button type="button" onClick={() => onNavigate?.("newOrders")} className="theme-btn-primary relative">
            <FaBell className="w-4 h-4" /> New Orders
            {stats.new > 0 && <span className="absolute -top-2 -right-2 w-5 h-5 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full">{stats.new}</span>}
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="stat-card p-3"><p className="text-xs theme-page-muted">Total</p><p className="text-xl font-bold theme-page-title">{stats.total}</p></div>
        <div className="theme-stat-accent p-3"><p className="text-xs opacity-80">New</p><p className="text-xl font-bold">{stats.new}</p></div>
        <div className="stat-card p-3"><p className="text-xs theme-page-muted">Active</p><p className="text-xl font-bold theme-highlight">{stats.active}</p></div>
        <div className="stat-card p-3"><p className="text-xs theme-page-muted">Today</p><p className="text-xl font-bold theme-highlight">{stats.today}</p></div>
        <div className="theme-stat-accent p-3"><p className="text-xs opacity-80">Sales</p><p className="text-lg font-bold">PKR {stats.sales.toLocaleString()}</p></div>
        <div className="stat-card p-3"><p className="text-xs theme-page-muted">Delivery</p><p className="text-lg font-bold theme-highlight">PKR {stats.delivery.toLocaleString()}</p></div>
      </div>

      <SectionCard title="Search & Filters">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex-1 min-w-[200px] relative">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 theme-page-muted" />
            <input type="text" placeholder="Search..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="theme-input w-full pl-10 pr-4 py-2.5" />
          </div>
          <button type="button" onClick={() => setShowFilters(!showFilters)} className={showFilters ? "theme-btn-primary" : "theme-btn-secondary"}>
            <FaFilter className="inline w-4 h-4 mr-1" /> Filters
          </button>
          <button type="button" onClick={exportToExcel} className="theme-btn-primary"><FaDownload className="inline w-4 h-4 mr-1" /> Export</button>
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 border-t theme-card-inner grid grid-cols-2 md:grid-cols-5 gap-3 p-4 rounded-xl">
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="theme-select">
              <option value="all">All Status</option>
              {[...NEW_STATUSES, ...MAIN_STATUSES].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={ageFilter} onChange={(e) => { setAgeFilter(e.target.value); setPage(1); }} className="theme-select">
              <option value="all">All Time</option>
              <option value="1h">Last 1h</option>
              <option value="24h">Last 24h</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="theme-input" />
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="theme-input" />
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="theme-select">
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="amount-high">Amount ↓</option>
              <option value="amount-low">Amount ↑</option>
            </select>
            <button type="button" onClick={clearFilters} className="theme-btn-danger text-sm"><FaTimes className="inline w-3 h-3" /> Clear</button>
          </div>
        )}
      </SectionCard>

      {/* Orders Table */}
      {current.length === 0 ? (
        <SectionCard>
          <div className="py-12 text-center">
            <FaBoxOpen className="w-16 h-16 theme-page-muted mx-auto mb-4 opacity-40" />
            <p className="theme-page-muted">No orders found</p>
          </div>
        </SectionCard>
      ) : (
        <div className="theme-table-wrap mb-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="p-3 text-left">Order</th>
                  <th className="p-3 text-left">Customer</th>
                  <th className="p-3 text-left">Amount</th>
                  <th className="p-3 text-left">Delivery</th>
                  <th className="p-3 text-left">Status</th>
                  <th className="p-3 text-left">Rider</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {current.map((o, i) => {
                  const isNew = isNewOrder(o);
                  const grand = num(o.grandTotal || num(o.subtotal || o.total) + num(o.deliveryCharge));
                  return (
                    <tr key={o.id} className={`border-b hover:bg-blue-50/50 ${i % 2 ? "bg-gray-50/30" : ""} ${isNew ? "bg-orange-50/50" : ""}`}>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          {/* NEW BADGE - Only shows when status is Pending/Placed */}
                          {isNew && <NewOrderBadge />}
                          <div className="cursor-pointer hover:text-blue-600" onClick={() => setSelected(o)}>
                            <p className="font-bold">#{o.orderId || o.id?.slice(-8)}</p>
                            <p className="text-xs text-gray-500">{timeAgo(o.createdAt)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        <p className="font-semibold">{o.customerName || o.userName || "N/A"}</p>
                        <p className="text-xs text-gray-500">{o.customerPhone || "-"}</p>
                      </td>
                      <td className="p-3">
                        <p className="font-bold text-green-600">PKR {grand.toLocaleString()}</p>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          <input type="number" placeholder="Rs." value={charges[o.id] ?? o.deliveryCharge ?? ""}
                            onChange={(e) => setCharges({ ...charges, [o.id]: e.target.value })}
                            className="w-16 p-1 border rounded text-center text-sm" />
                          <button onClick={() => handleSaveCharge(o.id)} className="px-2 py-1 bg-blue-500 text-white rounded text-xs">Save</button>
                        </div>
                      </td>
                      <td className="p-3">
                        <select value={o.status || "Pending"} onChange={(e) => handleStatusChange(o.id, e.target.value)}
                          className={`p-1.5 rounded text-xs font-semibold border ${STATUS_CONFIG[o.status]?.bg || "bg-gray-100"} ${STATUS_CONFIG[o.status]?.text || "text-gray-700"}`}>
                          {[...NEW_STATUSES, ...MAIN_STATUSES].map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td className="p-3">
                        {o.riderName ? (
                          <div><p className="font-semibold text-purple-700 text-sm">{o.riderName}</p><p className="text-xs text-gray-500">{o.riderPhone}</p></div>
                        ) : (
                          <button onClick={() => handleAssignRider(o.id)} className="px-2 py-1 bg-purple-500 text-white rounded text-xs">
                            <FaMotorcycle className="inline w-3 h-3 mr-1" /> Assign
                          </button>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex justify-center gap-1">
                          <button onClick={() => setSelected(o)} className="p-2 bg-blue-100 text-blue-600 rounded hover:bg-blue-200"><FaEye className="w-4 h-4" /></button>
                          <button onClick={() => handleDelete(o.id)} className="p-2 bg-red-100 text-red-600 rounded hover:bg-red-200"><FaTrash className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {filtered.length > perPage && (
        <div className="flex justify-center gap-2">
          <button onClick={() => setPage(1)} disabled={page === 1} className="px-3 py-2 bg-white border rounded disabled:opacity-50">First</button>
          <button onClick={() => setPage((p) => p - 1)} disabled={page === 1} className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50">Prev</button>
          <span className="px-4 py-2 bg-white border rounded font-semibold">{page}/{totalPages}</span>
          <button onClick={() => setPage((p) => p + 1)} disabled={page === totalPages} className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50">Next</button>
          <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="px-3 py-2 bg-white border rounded disabled:opacity-50">Last</button>
        </div>
      )}

      {/* Order Detail Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-500 text-white p-4 flex justify-between">
              <div>
                <h3 className="text-xl font-bold">Order Details</h3>
                <p className="text-blue-100 text-sm">#{selected.orderId || selected.id}</p>
              </div>
              <button onClick={() => setSelected(null)} className="p-2 hover:bg-white/20 rounded"><FaTimes className="w-5 h-5" /></button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
              <div className="flex items-center gap-3 mb-4">
                {isNewOrder(selected) && <NewOrderBadge />}
                <StatusBadge status={selected.status} />
                <span className="text-sm text-gray-500">{formatDateTime(selected.createdAt)}</span>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 mb-4">
                <h4 className="font-bold mb-2">👤 Customer</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><p className="text-gray-500">Name</p><p className="font-semibold">{selected.customerName || selected.userName || "N/A"}</p></div>
                  <div><p className="text-gray-500">Phone</p><p className="font-semibold">{selected.customerPhone || "N/A"}</p></div>
                  <div className="col-span-2"><p className="text-gray-500">Address</p><p className="font-semibold">{selected.customerAddress || "N/A"}</p></div>
                </div>
              </div>
              <div className="bg-blue-50 rounded-xl p-4 mb-4">
                <h4 className="font-bold mb-2">💰 Amount</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span>Subtotal</span><span className="font-semibold">PKR {num(selected.subtotal || selected.total).toLocaleString()}</span></div>
                  <div className="flex justify-between"><span>Delivery</span><span className="font-semibold">PKR {num(selected.deliveryCharge).toLocaleString()}</span></div>
                  <hr className="border-blue-200" />
                  <div className="flex justify-between text-lg"><span className="font-bold">Total</span><span className="font-bold text-green-600">PKR {num(selected.grandTotal || num(selected.subtotal || selected.total) + num(selected.deliveryCharge)).toLocaleString()}</span></div>
                </div>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <h4 className="font-bold mb-2">📦 Items ({selected.items?.length || 0})</h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {selected.items?.map((item, idx) => (
                    <div key={idx} className="flex justify-between p-2 bg-white rounded border">
                      <div><p className="font-semibold">{item.nameEn || item.name}</p><p className="text-xs text-gray-500">Qty: {item.qty || 1}</p></div>
                      <p className="font-semibold">PKR {(num(item.price) * num(item.qty || 1)).toLocaleString()}</p>
                    </div>
                  )) || <p className="text-gray-500 text-center">No items</p>}
                </div>
              </div>
            </div>
            <div className="border-t p-4 flex gap-2">
              <button onClick={() => window.print()} className="px-4 py-2 bg-gray-100 rounded-xl"><FaPrint /></button>
              <button onClick={() => setSelected(null)} className="flex-1 py-2 bg-blue-500 text-white rounded-xl font-semibold">Close</button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}