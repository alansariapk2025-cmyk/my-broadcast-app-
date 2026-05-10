// src/pages/Payments.jsx
import React, { useEffect, useState, useMemo, useCallback } from "react";
import { db } from "../firebase";
import {
  collection,
  onSnapshot,
  deleteDoc,
  doc,
  query,
  updateDoc,
  orderBy,
  limit,
} from "firebase/firestore";
import {
  FaTrash,
  FaFileInvoice,
  FaSearch,
  FaCog,
  FaTimes,
  FaSave,
  FaUndo,
} from "react-icons/fa";
import JsBarcode from "jsbarcode";

const num = (v) => (typeof v === "number" && !isNaN(v) ? v : Number(v) || 0);

// ── Default Print Settings ──
const DEFAULT_SETTINGS = {
  paperWidth: 80,           // mm (58, 72, 80, 100)
  paperHeight: "auto",      // auto or number in mm
  margin: 3,                // mm
  fontFamily: "Arial",
  storeNameSize: 18,
  headerInfoSize: 11,
  receiptTitleSize: 15,
  customerInfoSize: 11,
  tableHeaderSize: 11,
  itemNameSize: 12,
  qtyRateSize: 11,
  totalsSize: 12,
  grandTotalSize: 14,
  footerSize: 10,
  itemColWidth: 50,         // %
  qtyColWidth: 15,          // %
  rateColWidth: 35,         // %
  showBarcode: true,
  barcodeHeight: 35,
  storeName: "ANSARI TRADERS",
  storeAddress: "Korangi, Karachi - Pakistan",
  storePhone: "0213-5041666",
  receiptTitle: "SALE RECEIPT",
  footerText: "Thank you for shopping with us!",
  textColor: "#000000",
  bgColor: "#ffffff",
  lineSpacing: 1.4,
  autoOpenPrint: true,
};

const STORAGE_KEY = "invoice_print_settings_v1";

// ── Settings Helpers ──
const loadSettings = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
};

const saveSettings = (settings) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
};

export default function Payments() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [invoiceLoading, setInvoiceLoading] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [printSettings, setPrintSettings] = useState(loadSettings());
  const perPage = 15;

  // ── Fetch Orders ──
  useEffect(() => {
    const q = query(
      collection(db, "orders"),
      orderBy("createdAt", "desc"),
      limit(200)
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const allOrders = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        setOrders(allOrders);
        setLoading(false);
      },
      (err) => {
        console.error("Orders fetch error:", err);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // ── Filter Orders ──
  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return orders.filter((o) => {
      const st = String(o.status || "Pending").toLowerCase();
      if (statusFilter !== "All" && st !== statusFilter.toLowerCase())
        return false;
      if (!term) return true;
      const orderId = (o.orderId || o.id || "").toLowerCase();
      const name = (o.customerName || o.name || "").toLowerCase();
      const phone = (o.customerPhone || o.phone || "").toLowerCase();
      const email = (o.email || "").toLowerCase();
      return (
        orderId.includes(term) ||
        name.includes(term) ||
        phone.includes(term) ||
        email.includes(term)
      );
    });
  }, [orders, statusFilter, searchTerm]);

  const totalPages = Math.ceil(filtered.length / perPage) || 1;
  const current = filtered.slice((page - 1) * perPage, page * perPage);

  useEffect(() => setPage(1), [statusFilter, searchTerm]);

  // ── Delete Order ──
  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this order?")) return;
    try {
      await deleteDoc(doc(db, "orders", id));
    } catch (err) {
      console.error("Error deleting order:", err);
    }
  };

  // ── Update Status ──
  const handleStatusChange = async (id, status) => {
    try {
      await updateDoc(doc(db, "orders", id), {
        status,
        updatedAt: new Date(),
      });
    } catch (err) {
      console.error("Error updating status:", err);
    }
  };

  // ── Save Settings ──
  const handleSaveSettings = () => {
    if (saveSettings(printSettings)) {
      alert("✅ Settings saved successfully!");
      setShowSettings(false);
    } else {
      alert("❌ Failed to save settings");
    }
  };

  const handleResetSettings = () => {
    if (window.confirm("Reset all settings to default?")) {
      setPrintSettings(DEFAULT_SETTINGS);
      saveSettings(DEFAULT_SETTINGS);
    }
  };

  const updateSetting = (key, value) => {
    setPrintSettings((prev) => ({ ...prev, [key]: value }));
  };

  // ── Generate Invoice ──
  const handleInvoice = useCallback(
    async (order) => {
      setInvoiceLoading(order.id);
      const s = printSettings;

      try {
        const createdAt = order.createdAt?.toDate
          ? order.createdAt.toDate()
          : order.createdAt?.seconds
            ? new Date(order.createdAt.seconds * 1000)
            : new Date();

        const dateStr = createdAt.toLocaleString("en-PK", {
          day: "2-digit",
          month: "2-digit",
          year: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        });

        const items = Array.isArray(order.items) ? order.items : [];
        const sub = num(order.subtotal ?? order.total ?? 0);
        const del = num(order.deliveryCharge ?? 0);
        const grand = num(order.grandTotal ?? sub + del);

        // ── Barcode ──
        let barcodeDataUrl = "";
        if (s.showBarcode) {
          try {
            const bCanvas = document.createElement("canvas");
            JsBarcode(bCanvas, order.orderId || "000", {
              format: "CODE128",
              width: 2,
              height: s.barcodeHeight + 15,
              displayValue: false,
              background: s.bgColor,
              lineColor: s.textColor,
              margin: 0,
            });
            barcodeDataUrl = bCanvas.toDataURL("image/png");
          } catch (e) {
            console.warn("Barcode error:", e);
          }
        }

        // ── Items Rows ──
        const itemsRowsHTML = items
          .map((item) => {
            const price = num(item?.price || 0);
            const qty = num(item?.qty || 0);
            const itemName =
              item?.nameEn || item?.nameUrdu || item?.name || "-";
            const isUrduItem = !!item?.nameUrdu;
            const itemAlign = isUrduItem ? "right" : "left";
            const itemDirection = isUrduItem ? "rtl" : "ltr";
            const lineTotal = price * qty;

            return `
              <tr>
                <td class="item-cell" style="
                  vertical-align: top;
                  font-size: ${s.itemNameSize}px;
                  color: ${s.textColor};
                  width: ${s.itemColWidth}%;
                  line-height: ${s.lineSpacing};
                  direction: ${itemDirection};
                  text-align: ${itemAlign};
                  padding: 3px 2px;
                  word-wrap: break-word;
                  word-break: break-word;
                ">
                  ${itemName}
                </td>
                <td class="qty-cell" style="
                  text-align: center;
                  vertical-align: top;
                  font-size: ${s.qtyRateSize}px;
                  color: ${s.textColor};
                  width: ${s.qtyColWidth}%;
                  padding: 3px 2px;
                  white-space: nowrap;
                ">${qty}</td>
                <td class="rate-cell" style="
                  text-align: right;
                  vertical-align: top;
                  font-size: ${s.qtyRateSize}px;
                  color: ${s.textColor};
                  width: ${s.rateColWidth}%;
                  padding: 3px 2px;
                  white-space: nowrap;
                ">${lineTotal.toLocaleString()}</td>
              </tr>`;
          })
          .join("");

        // ── Page Settings ──
        const paperHeight =
          s.paperHeight === "auto" ? "auto" : `${s.paperHeight}mm`;
        const pageStyle = `@page { size: ${s.paperWidth}mm ${paperHeight}; margin: ${s.margin}mm; }`;

        // ── Invoice HTML ──
        const invoiceHTML = `
          <div class="invoice-container" style="
            width: 100%;
            max-width: ${s.paperWidth - s.margin * 2}mm;
            padding: 0;
            background: ${s.bgColor};
            color: ${s.textColor};
            font-family: ${s.fontFamily}, sans-serif;
            box-sizing: border-box;
            margin: 0 auto;
          ">
            
            <!-- STORE HEADER -->
            <div style="text-align: center; padding-bottom: 6px;">
              <div style="
                font-size: ${s.storeNameSize}px;
                font-weight: bold;
                letter-spacing: 0.5px;
                margin: 0 0 4px 0;
                text-transform: uppercase;
              ">${s.storeName}</div>
              <div style="font-size: ${s.headerInfoSize}px; margin: 2px 0;">${s.storeAddress}</div>
              <div style="font-size: ${s.headerInfoSize}px; margin: 2px 0;">Phone: ${s.storePhone}</div>
              <div style="
                font-size: ${s.receiptTitleSize}px;
                font-weight: bold;
                margin-top: 6px;
              ">${s.receiptTitle}</div>
            </div>

            <div style="border-top: 1px dashed ${s.textColor}; margin: 6px 0;"></div>

            <!-- ORDER DETAILS -->
            <div style="
              font-size: ${s.customerInfoSize}px;
              line-height: ${s.lineSpacing};
              text-align: left;
            ">
              <div><strong>Invoice:</strong> ${order.orderId || "000"}</div>
              <div><strong>Customer:</strong> ${order.customerName || "-"}</div>
              ${order.customerAddress
            ? `<div><strong>Address:</strong> ${order.customerAddress}</div>`
            : ""
          }
              <div><strong>Phone:</strong> ${order.customerPhone || "-"}</div>
              <div><strong>Payment:</strong> ${order.paymentMethod || "-"}</div>
              <div><strong>Type:</strong> ${order.deliveryType || "-"}</div>
              <div><strong>Time:</strong> ${dateStr}</div>
            </div>

            <div style="border-top: 1px dashed ${s.textColor}; margin: 6px 0;"></div>

            <!-- ITEMS TABLE -->
            <table style="
              width: 100%;
              border-collapse: collapse;
              table-layout: fixed;
              margin-bottom: 6px;
            ">
              <thead>
                <tr style="border-bottom: 1px solid ${s.textColor};">
                  <th style="
                    padding: 4px 2px;
                    text-align: left;
                    font-size: ${s.tableHeaderSize}px;
                    font-weight: bold;
                    width: ${s.itemColWidth}%;
                  ">Item</th>
                  <th style="
                    padding: 4px 2px;
                    text-align: center;
                    font-size: ${s.tableHeaderSize}px;
                    font-weight: bold;
                    width: ${s.qtyColWidth}%;
                  ">Qty</th>
                  <th style="
                    padding: 4px 2px;
                    text-align: right;
                    font-size: ${s.tableHeaderSize}px;
                    font-weight: bold;
                    width: ${s.rateColWidth}%;
                  ">Total</th>
                </tr>
              </thead>
              <tbody>${itemsRowsHTML}</tbody>
            </table>

            <div style="border-top: 1px dashed ${s.textColor}; margin: 4px 0;"></div>

            <!-- TOTALS -->
            <table style="width: 100%; font-size: ${s.totalsSize}px; border-collapse: collapse;">
              <tbody>
                <tr>
                  <td style="padding: 3px 2px; text-align: right; width: 60%;">Subtotal:</td>
                  <td style="padding: 3px 2px; text-align: right; font-weight: bold; white-space: nowrap;">
                    Rs. ${sub.toLocaleString()}
                  </td>
                </tr>
                ${del > 0
            ? `<tr>
                  <td style="padding: 3px 2px; text-align: right;">Delivery:</td>
                  <td style="padding: 3px 2px; text-align: right; font-weight: bold; white-space: nowrap;">
                    Rs. ${del.toLocaleString()}
                  </td>
                </tr>`
            : ""
          }
                <tr>
                  <td style="
                    padding: 5px 2px;
                    text-align: right;
                    font-size: ${s.grandTotalSize}px;
                    font-weight: bold;
                    border-top: 2px solid ${s.textColor};
                  ">Grand Total:</td>
                  <td style="
                    padding: 5px 2px;
                    text-align: right;
                    font-size: ${s.grandTotalSize}px;
                    font-weight: bold;
                    border-top: 2px solid ${s.textColor};
                    white-space: nowrap;
                  ">Rs. ${grand.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>

            ${barcodeDataUrl
            ? `<div style="text-align: center; margin-top: 12px;">
                <img src="${barcodeDataUrl}" style="height: ${s.barcodeHeight}px; max-width: 100%; display: block; margin: 0 auto;" />
                <div style="font-size: 9px; color: ${s.textColor}; letter-spacing: 1px; margin-top: 3px;">${order.orderId || "000"}</div>
              </div>`
            : ""
          }

            <div style="text-align: center; margin-top: 10px; padding-top: 6px; border-top: 1px dashed ${s.textColor};">
              <div style="font-size: ${s.footerSize}px;">${s.footerText}</div>
            </div>
          </div>
        `;

        // ── Open Print Window ──
        const printWindow = window.open("", "", "height=900,width=400");
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Invoice - ${order.orderId || "000"}</title>
            <link href='https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;700&display=swap' rel='stylesheet'>
            <style>
              ${pageStyle}
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body {
                font-family: ${s.fontFamily}, sans-serif;
                margin: 0;
                padding: 0;
                background: ${s.bgColor};
                color: ${s.textColor};
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              table { border-collapse: collapse; }
              .item-cell { word-break: break-word; white-space: normal; }
              .qty-cell, .rate-cell { white-space: nowrap; }
              @media print {
                body { width: ${s.paperWidth}mm; }
                .invoice-container { page-break-inside: avoid; }
              }
            </style>
          </head>
          <body>${invoiceHTML}</body>
          </html>
        `);
        printWindow.document.close();

        if (s.autoOpenPrint) {
          setTimeout(() => {
            printWindow.focus();
            printWindow.print();
          }, 600);
        }
      } catch (err) {
        console.error("Invoice error:", err);
        alert("Invoice error: " + err.message);
      } finally {
        setInvoiceLoading(null);
      }
    },
    [printSettings]
  );

  return (
    <div className="p-6 bg-gradient-to-br from-slate-50 to-blue-50 rounded-2xl shadow-2xl w-full max-w-7xl mx-auto overflow-auto border border-blue-200">

      {/* ── Page Title with Settings Button ── */}
      <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-3xl md:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-indigo-700 tracking-tight">
            Orders & Payments
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            Manage all customer orders and invoices
          </p>
        </div>
        <button
          onClick={() => setShowSettings(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl shadow-lg font-semibold text-sm transition-all"
        >
          <FaCog className="animate-spin-slow" />
          Print Settings
        </button>
      </div>

      {/* ── Stats Bar ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total Orders", value: orders.length, color: "from-blue-500 to-blue-600" },
          { label: "Pending", value: orders.filter((o) => (o.status || "Pending") === "Pending").length, color: "from-yellow-400 to-yellow-500" },
          { label: "Paid", value: orders.filter((o) => o.status === "Paid").length, color: "from-green-500 to-green-600" },
          { label: "Delivered", value: orders.filter((o) => o.status === "Delivered").length, color: "from-indigo-500 to-indigo-600" },
        ].map((s) => (
          <div key={s.label} className={`bg-gradient-to-br ${s.color} text-white rounded-xl p-4 shadow-md`}>
            <div className="text-2xl font-black">{s.value}</div>
            <div className="text-xs font-semibold opacity-90 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Search + Filter ── */}
      <div className="flex flex-wrap gap-3 items-center justify-between mb-5">
        <div className="flex items-center gap-2 bg-white border border-gray-200 px-3 py-2 rounded-xl shadow-sm flex-1 min-w-[240px]">
          <FaSearch className="text-gray-400 shrink-0" />
          <input
            type="text"
            placeholder="Search by name, phone, email, order ID..."
            className="outline-none bg-transparent text-sm w-full text-gray-700"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-gray-200 rounded-xl shadow-sm bg-white text-sm font-semibold text-gray-700 cursor-pointer"
        >
          <option value="All">All Status</option>
          <option value="Pending">Pending</option>
          <option value="Paid">Paid</option>
          <option value="Delivered">Delivered</option>
        </select>
      </div>

      {/* ── Table ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 text-sm animate-pulse">Loading orders...</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl shadow-lg border border-gray-100">
            <table className="w-full text-sm text-left text-gray-800">
              <thead>
                <tr className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
                  {["Order ID", "Customer", "Phone", "Total", "Method", "Type", "Status", "Date", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-3 font-semibold text-xs uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {current.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="text-center py-16 text-gray-400">
                      <div className="flex flex-col items-center gap-2">
                        <span className="text-4xl">📭</span>
                        <span className="font-medium">No orders found</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  current.map((o, i) => {
                    const createdAt = o.createdAt?.toDate
                      ? o.createdAt.toDate()
                      : o.createdAt?.seconds
                        ? new Date(o.createdAt.seconds * 1000)
                        : null;
                    const date = createdAt
                      ? createdAt.toLocaleString("en-PK", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })
                      : "—";
                    const sub = num(o.subtotal ?? o.total ?? 0);
                    const del = num(o.deliveryCharge ?? 0);
                    const grand = num(o.grandTotal ?? sub + del);
                    const statusStyles = {
                      Paid: "bg-green-100 text-green-800 border-green-200",
                      Delivered: "bg-blue-100 text-blue-800 border-blue-200",
                      Pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
                    };
                    const st = o.status || "Pending";

                    return (
                      <tr key={o.id} className="hover:bg-blue-50/60 transition-colors duration-150">
                        <td className="px-4 py-3 font-bold text-gray-900 whitespace-nowrap">
                          {o.orderId || `ORD-${String(i + 1).padStart(3, "0")}`}
                        </td>
                        <td className="px-4 py-3 font-medium whitespace-nowrap">
                          {o.customerName || o.name || "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {o.customerPhone || o.phone || "—"}
                        </td>
                        <td className="px-4 py-3 font-bold text-green-700 whitespace-nowrap">
                          Rs. {grand.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {o.paymentMethod || "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {o.deliveryType || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={st}
                            onChange={(e) => handleStatusChange(o.id, e.target.value)}
                            className={`border px-2 py-1 rounded-lg text-xs font-bold cursor-pointer ${statusStyles[st] || statusStyles["Pending"]}`}
                          >
                            <option value="Pending">Pending</option>
                            <option value="Paid">Paid</option>
                            <option value="Delivered">Delivered</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">{date}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2 items-center">
                            <button
                              onClick={() => handleInvoice(o)}
                              disabled={invoiceLoading === o.id}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white rounded-lg shadow-sm transition-all"
                            >
                              {invoiceLoading === o.id ? (
                                <>
                                  <span className="inline-block animate-spin">⏳</span>
                                  Wait...
                                </>
                              ) : (
                                <>
                                  <FaFileInvoice />
                                  Invoice
                                </>
                              )}
                            </button>
                            <button
                              onClick={() => handleDelete(o.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-red-500 hover:bg-red-600 text-white rounded-lg shadow-sm transition-all"
                            >
                              <FaTrash />
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ── */}
          <div className="flex justify-center items-center mt-5 gap-2">
            <button
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              disabled={page === 1}
              className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg disabled:opacity-40 hover:bg-blue-700 transition"
            >
              ← Prev
            </button>
            <div className="flex gap-1">
              {Array.from({ length: Math.min(totalPages, 7) }, (_, idx) => {
                const p = idx + 1;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-9 h-9 text-sm font-bold rounded-lg transition ${page === p
                        ? "bg-blue-600 text-white shadow"
                        : "bg-white text-gray-700 border border-gray-200 hover:bg-blue-50"
                      }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              disabled={page === totalPages}
              className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg disabled:opacity-40 hover:bg-blue-700 transition"
            >
              Next →
            </button>
          </div>

          <p className="text-center text-xs text-gray-400 mt-2">
            Showing {(page - 1) * perPage + 1}–
            {Math.min(page * perPage, filtered.length)} of {filtered.length} orders
          </p>
        </>
      )}

      {/* ═══════════════════════════════════════════ */}
      {/* ── PRINT SETTINGS MODAL (Admin Panel) ── */}
      {/* ═══════════════════════════════════════════ */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">

            {/* Header */}
            <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-5 flex justify-between items-center rounded-t-3xl z-10">
              <div className="flex items-center gap-3">
                <FaCog className="text-2xl" />
                <div>
                  <h3 className="text-xl font-bold">Print Settings - Admin Panel</h3>
                  <p className="text-xs opacity-90">Customize receipt size, fonts & layout</p>
                </div>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="bg-white/20 hover:bg-white/30 p-2 rounded-lg transition"
              >
                <FaTimes />
              </button>
            </div>

            {/* Settings Body */}
            <div className="p-6 space-y-6">

              {/* ── Paper Size Section ── */}
              <Section title="📄 Paper Size & Margins">
                <Field label="Paper Width (mm)">
                  <select
                    value={printSettings.paperWidth}
                    onChange={(e) => updateSetting("paperWidth", Number(e.target.value))}
                    className="input"
                  >
                    <option value={58}>58mm (Small Thermal)</option>
                    <option value={72}>72mm (Medium Thermal)</option>
                    <option value={80}>80mm (Standard Thermal) ⭐</option>
                    <option value={100}>100mm (Wide)</option>
                    <option value={210}>210mm (A4 Size)</option>
                  </select>
                </Field>
                <Field label="Paper Height">
                  <select
                    value={printSettings.paperHeight}
                    onChange={(e) => updateSetting("paperHeight", e.target.value === "auto" ? "auto" : Number(e.target.value))}
                    className="input"
                  >
                    <option value="auto">Auto (Recommended)</option>
                    <option value={150}>150mm</option>
                    <option value={200}>200mm</option>
                    <option value={297}>297mm (A4)</option>
                  </select>
                </Field>
                <Field label="Margin (mm)">
                  <input
                    type="number"
                    min="0"
                    max="20"
                    value={printSettings.margin}
                    onChange={(e) => updateSetting("margin", Number(e.target.value))}
                    className="input"
                  />
                </Field>
                <Field label="Line Spacing">
                  <input
                    type="number"
                    min="1"
                    max="2"
                    step="0.1"
                    value={printSettings.lineSpacing}
                    onChange={(e) => updateSetting("lineSpacing", Number(e.target.value))}
                    className="input"
                  />
                </Field>
              </Section>

              {/* ── Font Size Section ── */}
              <Section title="🔤 Font Sizes (px)">
                <Field label="Store Name">
                  <RangeInput value={printSettings.storeNameSize} min={12} max={28}
                    onChange={(v) => updateSetting("storeNameSize", v)} />
                </Field>
                <Field label="Header Info">
                  <RangeInput value={printSettings.headerInfoSize} min={8} max={16}
                    onChange={(v) => updateSetting("headerInfoSize", v)} />
                </Field>
                <Field label="Receipt Title">
                  <RangeInput value={printSettings.receiptTitleSize} min={10} max={22}
                    onChange={(v) => updateSetting("receiptTitleSize", v)} />
                </Field>
                <Field label="Customer Info">
                  <RangeInput value={printSettings.customerInfoSize} min={8} max={16}
                    onChange={(v) => updateSetting("customerInfoSize", v)} />
                </Field>
                <Field label="Item Name">
                  <RangeInput value={printSettings.itemNameSize} min={9} max={18}
                    onChange={(v) => updateSetting("itemNameSize", v)} />
                </Field>
                <Field label="Qty/Rate">
                  <RangeInput value={printSettings.qtyRateSize} min={9} max={16}
                    onChange={(v) => updateSetting("qtyRateSize", v)} />
                </Field>
                <Field label="Totals">
                  <RangeInput value={printSettings.totalsSize} min={9} max={18}
                    onChange={(v) => updateSetting("totalsSize", v)} />
                </Field>
                <Field label="Grand Total">
                  <RangeInput value={printSettings.grandTotalSize} min={10} max={22}
                    onChange={(v) => updateSetting("grandTotalSize", v)} />
                </Field>
                <Field label="Footer Text">
                  <RangeInput value={printSettings.footerSize} min={7} max={14}
                    onChange={(v) => updateSetting("footerSize", v)} />
                </Field>
              </Section>

              {/* ── Column Widths Section ── */}
              <Section title="📊 Table Column Widths (%)">
                <Field label={`Item Column: ${printSettings.itemColWidth}%`}>
                  <input
                    type="range"
                    min="30"
                    max="70"
                    value={printSettings.itemColWidth}
                    onChange={(e) => updateSetting("itemColWidth", Number(e.target.value))}
                    className="w-full"
                  />
                </Field>
                <Field label={`Qty Column: ${printSettings.qtyColWidth}%`}>
                  <input
                    type="range"
                    min="10"
                    max="25"
                    value={printSettings.qtyColWidth}
                    onChange={(e) => updateSetting("qtyColWidth", Number(e.target.value))}
                    className="w-full"
                  />
                </Field>
                <Field label={`Total Column: ${printSettings.rateColWidth}%`}>
                  <input
                    type="range"
                    min="20"
                    max="45"
                    value={printSettings.rateColWidth}
                    onChange={(e) => updateSetting("rateColWidth", Number(e.target.value))}
                    className="w-full"
                  />
                </Field>
                <div className="col-span-full text-xs text-gray-500 bg-yellow-50 p-2 rounded">
                  💡 Total: {printSettings.itemColWidth + printSettings.qtyColWidth + printSettings.rateColWidth}% (should be 100%)
                </div>
              </Section>

              {/* ── Store Info Section ── */}
              <Section title="🏪 Store Information">
                <Field label="Store Name" full>
                  <input
                    type="text"
                    value={printSettings.storeName}
                    onChange={(e) => updateSetting("storeName", e.target.value)}
                    className="input"
                  />
                </Field>
                <Field label="Store Address" full>
                  <input
                    type="text"
                    value={printSettings.storeAddress}
                    onChange={(e) => updateSetting("storeAddress", e.target.value)}
                    className="input"
                  />
                </Field>
                <Field label="Store Phone">
                  <input
                    type="text"
                    value={printSettings.storePhone}
                    onChange={(e) => updateSetting("storePhone", e.target.value)}
                    className="input"
                  />
                </Field>
                <Field label="Receipt Title">
                  <input
                    type="text"
                    value={printSettings.receiptTitle}
                    onChange={(e) => updateSetting("receiptTitle", e.target.value)}
                    className="input"
                  />
                </Field>
                <Field label="Footer Text" full>
                  <input
                    type="text"
                    value={printSettings.footerText}
                    onChange={(e) => updateSetting("footerText", e.target.value)}
                    className="input"
                  />
                </Field>
              </Section>

              {/* ── Other Options ── */}
              <Section title="⚙️ Other Options">
                <Field label="Font Family">
                  <select
                    value={printSettings.fontFamily}
                    onChange={(e) => updateSetting("fontFamily", e.target.value)}
                    className="input"
                  >
                    <option value="Arial">Arial</option>
                    <option value="Helvetica">Helvetica</option>
                    <option value="Verdana">Verdana</option>
                    <option value="Tahoma">Tahoma</option>
                    <option value="Courier New">Courier New (Monospace)</option>
                    <option value="Georgia">Georgia</option>
                  </select>
                </Field>
                <Field label="Show Barcode">
                  <select
                    value={printSettings.showBarcode}
                    onChange={(e) => updateSetting("showBarcode", e.target.value === "true")}
                    className="input"
                  >
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                </Field>
                <Field label="Barcode Height (px)">
                  <input
                    type="number"
                    min="20"
                    max="80"
                    value={printSettings.barcodeHeight}
                    onChange={(e) => updateSetting("barcodeHeight", Number(e.target.value))}
                    className="input"
                  />
                </Field>
                <Field label="Auto Open Print Dialog">
                  <select
                    value={printSettings.autoOpenPrint}
                    onChange={(e) => updateSetting("autoOpenPrint", e.target.value === "true")}
                    className="input"
                  >
                    <option value="true">Yes</option>
                    <option value="false">No (Manual)</option>
                  </select>
                </Field>
              </Section>
            </div>

            {/* Footer Actions */}
            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 p-4 flex justify-between gap-3 rounded-b-3xl">
              <button
                onClick={handleResetSettings}
                className="flex items-center gap-2 px-5 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-semibold text-sm transition"
              >
                <FaUndo /> Reset Default
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowSettings(false)}
                  className="px-5 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-semibold text-sm transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveSettings}
                  className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-xl font-bold text-sm shadow-lg transition"
                >
                  <FaSave /> Save Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Inline Styles for Custom Classes ── */}
      <style>{`
        .input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 13px;
          background: white;
          transition: all 0.2s;
        }
        .input:focus {
          outline: none;
          border-color: #6366f1;
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }
        .animate-spin-slow {
          animation: spin 3s linear infinite;
        }
      `}</style>
    </div>
  );
}

// ── Reusable Components ──
const Section = ({ title, children }) => (
  <div className="bg-gray-50 rounded-2xl p-5 border border-gray-200">
    <h4 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
      {title}
    </h4>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
  </div>
);

const Field = ({ label, children, full }) => (
  <div className={full ? "sm:col-span-2" : ""}>
    <label className="block text-xs font-semibold text-gray-600 mb-1.5">
      {label}
    </label>
    {children}
  </div>
);

const RangeInput = ({ value, min, max, onChange }) => (
  <div className="flex items-center gap-2">
    <input
      type="range"
      min={min}
      max={max}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="flex-1"
    />
    <input
      type="number"
      min={min}
      max={max}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-16 px-2 py-1 border border-gray-300 rounded text-xs text-center"
    />
  </div>
);