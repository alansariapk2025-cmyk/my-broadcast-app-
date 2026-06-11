// src/components/NewOrders.jsx
import { useEffect, useState, useMemo, useCallback } from "react";
import { db } from "../firebase";
import {
  collection,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
} from "firebase/firestore";
import {
  FaMotorcycle,
  FaSearch,
  FaClock,
  FaBell,
  FaCheckCircle,
  FaTimesCircle,
  FaBoxOpen,
  FaSync,
  FaEye,
  FaTimes,
  FaTrash,
  FaDownload,
  FaUpload,
  FaFilter,
} from "react-icons/fa";
import * as Excel from "exceljs";
import { saveAs } from "file-saver";
import { useShop } from "../contexts/ShopContext";
import { filterByShop } from "../utils/shopUtils";
import notify from "../utils/notify";
import PageShell, { SectionCard } from "./ui/PageShell";

const num = (v) => (typeof v === "number" && !isNaN(v) ? v : Number(v) || 0);

const formatDateTime = (ts) => {
  if (!ts) return "N/A";
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString("en-PK", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "N/A";
  }
};

const timeAgo = (ts) => {
  if (!ts) return "";
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  } catch {
    return "";
  }
};

const NEW_ORDER_STATUSES = ["Pending", "Placed"];

export default function NewOrders({ onNavigate, assignedShopId: propShopId }) {
  const { effectiveShopId: ctxShopId } = useShop();
  const effectiveShopId = propShopId || ctxShopId;

  const [orders, setOrders] = useState([]);
  const [charges, setCharges] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [ageFilter, setAgeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const perPage = 10;

  const isNewOrder = useCallback(
    (o) => NEW_ORDER_STATUSES.includes(o.status || "Pending"),
    []
  );

  const fetchOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
      const snapshot = await getDocs(q);
      let ordersData = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (effectiveShopId) ordersData = filterByShop(ordersData, effectiveShopId);
      setOrders(ordersData);
    } catch (err) {
      console.error("Orders fetch error:", err);
      notify.error("Failed to load new orders");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [effectiveShopId]);

  useEffect(() => {
    fetchOrders();
    const timer = setInterval(() => fetchOrders(true), 60_000);
    return () => clearInterval(timer);
  }, [fetchOrders]);

  const filtered = useMemo(() => {
    const now = new Date();

    let result = orders.filter((o) => {
      if (!isNewOrder(o)) return false;

      const term = search.trim().toLowerCase();
      const oid = (o.orderId || o.id || "").toLowerCase();

      const matchesSearch =
        !term ||
        oid.includes(term) ||
        (o.customerName || o.userName || "").toLowerCase().includes(term) ||
        (o.customerPhone || "").toLowerCase().includes(term) ||
        (o.email || "").toLowerCase().includes(term) ||
        (o.customerAddress || "").toLowerCase().includes(term);

      const d = o.createdAt?.toDate ? o.createdAt.toDate() : new Date(o.createdAt || now);

      const matchesDateRange =
        (!startDate || d >= new Date(startDate)) &&
        (!endDate || d <= new Date(endDate + "T23:59:59"));

      const diffHours = (now - d) / 36e5;
      let matchesAge = true;
      if (ageFilter === "1h") matchesAge = diffHours <= 1;
      else if (ageFilter === "24h") matchesAge = diffHours <= 24;
      else if (ageFilter === "7d") matchesAge = diffHours <= 168;
      else if (ageFilter === "30d") matchesAge = diffHours <= 720;

      return matchesSearch && matchesDateRange && matchesAge;
    });

    result.sort((a, b) => {
      const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt || 0);
      const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt || 0);

      switch (sortBy) {
        case "newest":
          return dateB - dateA;
        case "oldest":
          return dateA - dateB;
        case "amount-high":
          return num(b.grandTotal || b.total) - num(a.grandTotal || a.total);
        case "amount-low":
          return num(a.grandTotal || a.total) - num(b.grandTotal || b.total);
        default:
          return dateB - dateA;
      }
    });

    return result;
  }, [orders, search, startDate, endDate, ageFilter, sortBy, isNewOrder]);

  const totalPages = Math.ceil(filtered.length / perPage) || 1;
  const current = filtered.slice((page - 1) * perPage, page * perPage);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  };

  const handleSaveCharge = async (id) => {
    const charge = charges[id];
    if (charge === "" || charge == null) return alert("⚠️ Enter delivery charge first!");

    const order = orders.find((o) => o.id === id);
    const base = num(order?.subtotal ?? order?.total ?? 0);
    const grandTotal = base + num(charge);

    try {
      await updateDoc(doc(db, "orders", id), {
        deliveryCharge: num(charge),
        grandTotal,
        updatedAt: new Date(),
      });
      setCharges((prev) => ({ ...prev, [id]: "" }));
      alert("✅ Delivery charge updated!");
    } catch (err) {
      console.error(err);
      alert("❌ Error updating delivery charge");
    }
  };

  const handleQuickComplete = async (id) => {
    if (!window.confirm("Mark this order as Delivered?")) return;
    try {
      await updateDoc(doc(db, "orders", id), {
        status: "Delivered",
        deliveredAt: new Date(),
        updatedAt: new Date(),
      });
      alert("✅ Order marked as Delivered");
    } catch (err) {
      console.error(err);
      alert("❌ Error updating order");
    }
  };

  const handleQuickCancel = async (id) => {
    const reason = prompt("Enter cancellation reason (optional):");
    if (reason === null) return;

    try {
      await updateDoc(doc(db, "orders", id), {
        status: "Cancelled",
        cancelledAt: new Date(),
        cancellationReason: reason || "No reason provided",
        updatedAt: new Date(),
      });
      alert("❌ Order cancelled");
    } catch (err) {
      console.error(err);
      alert("❌ Error cancelling order");
    }
  };

  const handleAssignRider = async (id) => {
    const name = prompt("Enter rider name:");
    if (!name) return;
    const phone = prompt("Enter rider phone:");
    if (!phone) return;
    const vehicle = prompt("Enter vehicle number (optional):");

    try {
      await updateDoc(doc(db, "orders", id), {
        riderName: name,
        riderPhone: phone,
        riderVehicle: vehicle || "",
        status: "Rider Assigned",
        riderAssignedAt: new Date(),
        updatedAt: new Date(),
      });
      alert("✅ Rider assigned successfully!");
    } catch (err) {
      console.error(err);
      alert("❌ Error assigning rider");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this order?")) return;
    try {
      await deleteDoc(doc(db, "orders", id));
      alert("🗑️ Order deleted successfully");
    } catch (err) {
      console.error(err);
      alert("❌ Error deleting order");
    }
  };

  const exportToExcel = () => {
    const data = filtered.map((o) => ({
      "Order ID": o.orderId || o.id,
      Status: o.status,
      "Created At": formatDateTime(o.createdAt),
      "Customer Name": o.customerName || o.userName || "",
      "Customer Phone": o.customerPhone || "",
      "Customer Address": o.customerAddress || "",
      Email: o.email || "",
      "Delivery Type": o.deliveryType || "",
      Subtotal: num(o.subtotal || o.total || 0),
      "Delivery Charge": num(o.deliveryCharge || 0),
      "Grand Total": num(o.grandTotal || o.total || 0),
      "Payment Method": o.paymentMethod || "",
      "Rider Name": o.riderName || "",
      "Rider Phone": o.riderPhone || "",
      "Items Count": o.items?.length || 0,
      Items: o.items?.map((i) => `${i.nameEn || i.name} x${i.qty || 1}`).join(", ") || "",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "NewOrders");
    XLSX.writeFile(wb, `new_orders_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb = new Excel.Workbook();
        await wb.xlsx.load(evt.target.result);
        const ws = wb.getWorksheet(1);
        const data = [];
        ws.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return;
          const values = row.values.slice(1);
          const headers = ws.getRow(1).values.slice(1);
          const obj = {};
          headers.forEach((h, i) => { obj[h] = values[i]; });
          data.push(obj);
        });
        console.log("Imported data:", data);
        alert(`📥 Imported ${data.length} records. Check console for data.`);
        setShowImportModal(false);
      } catch (err) {
        console.error("Import error:", err);
        alert("❌ Error importing file");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const clearFilters = () => {
    setSearch("");
    setStartDate("");
    setEndDate("");
    setAgeFilter("all");
    setSortBy("newest");
    setPage(1);
  };

  return (
    <PageShell
      title="New Orders"
      subtitle="Sirf Pending / Placed orders yahan row-wise show honge"
      icon={FaBell}
      actions={
        <div className="flex gap-2">
          <button type="button" onClick={handleRefresh} disabled={refreshing} className={`theme-btn-secondary p-2.5 ${refreshing ? "animate-spin" : ""}`}>
            <FaSync className="w-5 h-5" />
          </button>
          <button type="button" onClick={() => onNavigate?.("orders")} className="theme-btn-primary">Main Orders</button>
        </div>
      }
    >
        <div className="theme-card theme-glass p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex-1 min-w-[200px] relative">
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 theme-page-muted" />
              <input
                type="text"
                placeholder="Search new order..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="theme-input w-full pl-10 pr-4 py-2.5"
              />
            </div>

            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={showFilters ? "theme-btn-primary" : "theme-btn-secondary"}
            >
              <FaFilter className="w-4 h-4" />
              Filters
            </button>

            <button type="button" onClick={exportToExcel} className="theme-btn-primary">
              <FaDownload className="w-4 h-4" />
              Export
            </button>

            <button type="button" onClick={() => setShowImportModal(true)} className="theme-btn-secondary">
              <FaUpload className="w-4 h-4" />
              Import
            </button>

            <div className="theme-stat-accent px-4 py-2.5 rounded-xl font-semibold text-sm">
              Total New: {filtered.length}
            </div>
          </div>

          {showFilters && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="theme-label text-xs">Time Period</label>
                  <select
                    value={ageFilter}
                    onChange={(e) => {
                      setAgeFilter(e.target.value);
                      setPage(1);
                    }}
                    className="theme-select w-full"
                  >
                    <option value="all">All Time</option>
                    <option value="1h">Last 1 Hour</option>
                    <option value="24h">Last 24 Hours</option>
                    <option value="7d">Last 7 Days</option>
                    <option value="30d">Last 30 Days</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setPage(1);
                    }}
                    className="theme-select w-full"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setPage(1);
                    }}
                    className="theme-select w-full"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Sort By</label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="theme-select w-full"
                  >
                    <option value="newest">Newest First</option>
                    <option value="oldest">Oldest First</option>
                    <option value="amount-high">Amount: High to Low</option>
                    <option value="amount-low">Amount: Low to High</option>
                  </select>
                </div>
              </div>

              <button
                onClick={clearFilters}
                className="mt-3 flex items-center gap-2 text-sm text-red-500 hover:text-red-600 font-semibold"
              >
                <FaTimes className="w-3 h-3" />
                Clear All Filters
              </button>
            </div>
          )}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-600 font-semibold">Loading new orders...</p>
            </div>
          </div>
        )}

        {!loading && current.length === 0 && (
          <div className="bg-white rounded-2xl shadow-md p-12 text-center">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FaBoxOpen className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">No New Orders</h3>
            <p className="text-gray-600">Abhi koi pending / placed order nahi hai.</p>
          </div>
        )}

        {!loading && current.length > 0 && (
          <div className="theme-table-wrap mb-6">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="p-4 text-left font-semibold">Order</th>
                    <th className="p-4 text-left font-semibold">Customer</th>
                    <th className="p-4 text-left font-semibold">Items</th>
                    <th className="p-4 text-left font-semibold">Amount</th>
                    <th className="p-4 text-left font-semibold">Delivery</th>
                    <th className="p-4 text-left font-semibold">Rider</th>
                    <th className="p-4 text-center font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {current.map((order, idx) => {
                    const sub = num(order.subtotal ?? order.total ?? 0);
                    const grand = num(order.grandTotal ?? sub + num(order.deliveryCharge));

                    return (
                      <tr
                        key={order.id}
                        className={`border-b border-gray-100 hover:bg-orange-50/50 transition ${
                          idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"
                        }`}
                      >
                        <td className="p-4">
                          <div className="flex items-start gap-2">
                            <div className="cursor-pointer hover:text-orange-600" onClick={() => setSelected(order)}>
                              <p className="font-bold text-gray-800">#{order.orderId || order.id?.slice(-8)}</p>
                              <p className="text-xs text-gray-500 flex items-center gap-1">
                                <FaClock className="w-3 h-3" />
                                {timeAgo(order.createdAt)}
                              </p>
                            </div>
                            <span className="px-2 py-0.5 bg-red-500 text-white text-xs font-bold rounded-full animate-bounce">
                              NEW
                            </span>
                          </div>
                        </td>

                        <td className="p-4">
                          <p className="font-semibold text-gray-800">{order.customerName || order.userName || "N/A"}</p>
                          <p className="text-xs text-gray-500">{order.customerPhone || "No phone"}</p>
                          <p className="text-xs text-gray-400 truncate max-w-[180px]">
                            {order.customerAddress || "No address"}
                          </p>
                        </td>

                        <td className="p-4">
                          <p className="text-sm font-semibold text-gray-700">{order.items?.length || 0} items</p>
                          <p className="text-xs text-gray-500 truncate max-w-[200px]">
                            {order.items?.map((i) => `${i.nameEn || i.name} x${i.qty || 1}`).join(", ") || "No items"}
                          </p>
                        </td>

                        <td className="p-4">
                          <p className="font-bold text-green-600">PKR {grand.toLocaleString()}</p>
                          <p className="text-xs text-gray-500">{order.paymentMethod || "N/A"}</p>
                        </td>

                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              placeholder="Rs."
                              value={charges[order.id] ?? order.deliveryCharge ?? ""}
                              onChange={(e) => setCharges({ ...charges, [order.id]: e.target.value })}
                              className="w-20 p-1.5 border border-gray-200 rounded-lg text-sm text-center"
                            />
                            <button
                              onClick={() => handleSaveCharge(order.id)}
                              className="px-2 py-1.5 bg-blue-500 text-white rounded-lg text-xs font-semibold hover:bg-blue-600"
                            >
                              Save
                            </button>
                          </div>
                        </td>

                        <td className="p-4">
                          {order.riderName ? (
                            <div>
                              <p className="font-semibold text-purple-700 text-sm">{order.riderName}</p>
                              <p className="text-xs text-gray-500">{order.riderPhone}</p>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleAssignRider(order.id)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-purple-500 text-white rounded-lg text-xs font-semibold hover:bg-purple-600"
                            >
                              <FaMotorcycle className="w-3 h-3" />
                              Assign
                            </button>
                          )}
                        </td>

                        <td className="p-4">
                          <div className="flex items-center justify-center gap-2 flex-wrap">
                            <button
                              onClick={() => setSelected(order)}
                              className="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition"
                              title="View"
                            >
                              <FaEye className="w-4 h-4" />
                            </button>

                            <button
                              onClick={() => handleQuickComplete(order.id)}
                              className="px-3 py-2 bg-green-500 text-white rounded-lg text-xs font-semibold hover:bg-green-600 transition"
                            >
                              Complete
                            </button>

                            <button
                              onClick={() => handleQuickCancel(order.id)}
                              className="px-3 py-2 bg-red-500 text-white rounded-lg text-xs font-semibold hover:bg-red-600 transition"
                            >
                              Cancel
                            </button>

                            <button
                              onClick={() => handleDelete(order.id)}
                              className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition"
                              title="Delete"
                            >
                              <FaTrash className="w-4 h-4" />
                            </button>
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

        {!loading && filtered.length > perPage && (
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="px-3 py-2 bg-white border border-gray-200 rounded-lg disabled:opacity-50 hover:bg-gray-50"
            >
              First
            </button>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg disabled:opacity-50 hover:bg-orange-600"
            >
              Prev
            </button>
            <span className="px-4 py-2 bg-white border border-gray-200 rounded-lg font-semibold">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg disabled:opacity-50 hover:bg-orange-600"
            >
              Next
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages}
              className="px-3 py-2 bg-white border border-gray-200 rounded-lg disabled:opacity-50 hover:bg-gray-50"
            >
              Last
            </button>
          </div>
        )}

        {selected && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
              <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white p-4 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold">New Order Details</h3>
                  <p className="text-orange-100 text-sm">#{selected.orderId || selected.id}</p>
                </div>
                <button onClick={() => setSelected(null)} className="p-2 hover:bg-white/20 rounded-lg transition">
                  <FaTimes className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
                <div className="flex items-center gap-3 mb-6">
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-700 border border-orange-300">
                    <FaBell className="w-3 h-3" />
                    New Order
                  </span>
                  <span className="text-sm text-gray-500">{formatDateTime(selected.createdAt)}</span>
                </div>

                <div className="bg-gray-50 rounded-xl p-4 mb-4">
                  <h4 className="font-bold text-gray-800 mb-2">👤 Customer Information</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-gray-500">Name</p>
                      <p className="font-semibold">{selected.customerName || selected.userName || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Phone</p>
                      <p className="font-semibold">{selected.customerPhone || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Email</p>
                      <p className="font-semibold">{selected.email || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Delivery Type</p>
                      <p className="font-semibold">{selected.deliveryType || "N/A"}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-gray-500">Address</p>
                      <p className="font-semibold">{selected.customerAddress || "N/A"}</p>
                    </div>
                    {selected.customerNote && (
                      <div className="col-span-2">
                        <p className="text-gray-500">Note</p>
                        <p className="font-semibold text-orange-600">{selected.customerNote}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-blue-50 rounded-xl p-4 mb-4">
                  <h4 className="font-bold text-gray-800 mb-2">💰 Amount Summary</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Subtotal</span>
                      <span className="font-semibold">
                        PKR {num(selected.subtotal || selected.total || 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Delivery Charge</span>
                      <span className="font-semibold">
                        PKR {num(selected.deliveryCharge || 0).toLocaleString()}
                      </span>
                    </div>
                    <hr className="border-blue-200" />
                    <div className="flex justify-between text-lg">
                      <span className="font-bold text-gray-800">Grand Total</span>
                      <span className="font-bold text-green-600">
                        PKR{" "}
                        {num(
                          selected.grandTotal ||
                            num(selected.subtotal || selected.total || 0) +
                              num(selected.deliveryCharge || 0)
                        ).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-xl p-4">
                  <h4 className="font-bold text-gray-800 mb-2">
                    📦 Order Items ({selected.items?.length || 0})
                  </h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {selected.items?.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center p-3 bg-white rounded-lg border border-gray-100">
                        <div>
                          <p className="font-semibold text-gray-800">{item.nameEn || item.name}</p>
                          <p className="text-xs text-gray-500">
                            Qty: {item.qty || 1}
                            {item.weight ? ` • ${item.weight}` : ""}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-gray-800">PKR {num(item.price).toLocaleString()}</p>
                          <p className="text-xs text-green-600 font-semibold">
                            Total: PKR {(num(item.price) * num(item.qty || 1)).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                    {(!selected.items || selected.items.length === 0) && (
                      <p className="text-gray-500 text-center py-4">No items</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 p-4 flex gap-3">
                <button
                  onClick={() => {
                    setSelected(null);
                    handleQuickComplete(selected.id);
                  }}
                  className="flex-1 py-2.5 bg-green-500 text-white rounded-xl font-semibold hover:bg-green-600 transition flex items-center justify-center gap-2"
                >
                  <FaCheckCircle /> Complete
                </button>
                <button
                  onClick={() => {
                    setSelected(null);
                    handleQuickCancel(selected.id);
                  }}
                  className="flex-1 py-2.5 bg-red-500 text-white rounded-xl font-semibold hover:bg-red-600 transition flex items-center justify-center gap-2"
                >
                  <FaTimesCircle /> Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {showImportModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
              <h3 className="text-xl font-bold text-gray-800 mb-4">Import New Orders</h3>
              <p className="text-gray-600 mb-4">Upload an Excel file (.xlsx) to import orders.</p>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleImport}
                className="w-full p-3 border-2 border-dashed border-gray-300 rounded-xl text-sm"
              />
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => setShowImportModal(false)}
                  className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
    </PageShell>
  );
}