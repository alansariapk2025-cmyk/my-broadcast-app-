// src/pages/Payments.jsx
import React, { useEffect, useState, useMemo } from "react";
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
import { FaTrash, FaFileInvoice, FaSearch } from "react-icons/fa";
import jsPDF from "jspdf";
import "jspdf-autotable";
import JsBarcode from "jsbarcode";
import html2canvas from "html2canvas";

const num = (v) =>
  typeof v === "number" && !isNaN(v) ? v : Number(v) || 0;

export default function Payments() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [invoiceLoading, setInvoiceLoading] = useState(null);
  const perPage = 15;

  useEffect(() => {
    const q = query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(200));
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

  useEffect(() => {
    setPage(1);
  }, [statusFilter, searchTerm]);

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this order?")) return;
    try {
      await deleteDoc(doc(db, "orders", id));
    } catch (err) {
      console.error("Error deleting order:", err);
    }
  };

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

  const handleInvoice = async (order) => {
    setInvoiceLoading(order.id);

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

      // ── Barcode Generation ──
      let barcodeDataUrl = "";
      try {
        const bCanvas = document.createElement("canvas");
        JsBarcode(bCanvas, order.orderId || "000", {
          format: "CODE128",
          width: 2,
          height: 50,
          displayValue: false,
          background: "#ffffff",
          lineColor: "#000000",
          margin: 0,
        });
        barcodeDataUrl = bCanvas.toDataURL("image/png");
      } catch (e) {
        console.warn("Barcode error:", e);
      }

      // ── Items Rows ──
      const itemsRowsHTML = items
        .map((item) => {
          const price = num(item?.price || 0);
          const qty = num(item?.qty || 0);
          const itemName = item?.nameEn || item?.nameUrdu || item?.name || "-";
          const isUrduItem = !!item?.nameUrdu;
          const itemAlign = isUrduItem ? "right" : "left";
          const itemDirection = isUrduItem ? "rtl" : "ltr";

          return `
            <tr style="border-bottom: 1px dashed #ccc;">
              <td class="item-cell" style="
                vertical-align: top;
                font-size: 12px;
                color: #000;
                width: 58%;
                line-height: 1.3;
                direction: ${itemDirection};
                text-align: ${itemAlign};
              ">
                ${itemName}
              </td>
              <td class="qty-cell" style="
                text-align: right;
                vertical-align: top;
                font-size: 11px;
                color: #000;
                width: 16%;
              ">${qty}</td>
              <td class="rate-cell" style="
                text-align: right;
                vertical-align: top;
                font-size: 11px;
                color: #000;
                width: 26%;
              ">${price.toLocaleString()}</td>
            </tr>`;
        })
        .join("");

      // ── Invoice HTML ──
      const invoiceHTML = `
        <div style="width: 320px; padding: 10px; background: #ffffff; color: #000000; font-family: Arial, sans-serif; box-sizing: border-box; margin: 0 auto;">
          
          <!-- STORE HEADER -->
          <div style="text-align: center; padding-bottom: 10px;">
            <div style="font-size: 18px; font-weight: bold; letter-spacing: 0.5px; margin: 0 0 5px 0; text-transform: uppercase;">
              ANSARI TRADERS
            </div>
            <div style="font-size: 11px; color: #222; margin: 3px 0;">Korangi, Karachi - Pakistan</div>
            <div style="font-size: 11px; color: #222; margin: 3px 0;">Phone: 0213-5041666</div>
            <div style="font-size: 15px; font-weight: bold; margin-top: 8px;">SALE RECEIPT</div>
          </div>

          <!-- DIVIDER -->
          <div style="border-top: 1px solid #000; margin: 8px 0;"></div>

          <!-- ORDER DETAILS -->
          <div style="font-size: 11px; color: #000; line-height: 1.6; text-align: left;">
            <div>Invoice: ${order.orderId || "000"}</div>
            <div>Customer: ${order.customerName || "-"}</div>
            ${order.customerAddress ? `<div>Address: ${order.customerAddress}</div>` : ""}
            <div>Phone: ${order.customerPhone || "-"}</div>
            <div>Payment: ${order.paymentMethod || "-"}</div>
            <div>Type: ${order.deliveryType || "-"}</div>
            <div>Time: ${dateStr}</div>
          </div>

          <!-- DIVIDER -->
          <div style="border-top: 1px solid #000; margin: 8px 0;"></div>

          <!-- ITEMS TABLE -->
          <table style="width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 10px;">
            <thead>
              <tr style="border-bottom: 1px solid #000;">
                <th style="padding: 4px 0; text-align: left; font-size: 11px; font-weight: bold; width: 58%;">Item</th>
                <th style="padding: 4px 0; text-align: right; font-size: 11px; font-weight: bold; width: 16%;">Qty</th>
                <th style="padding: 4px 0; text-align: right; font-size: 11px; font-weight: bold; width: 26%;">Rate</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRowsHTML}
            </tbody>
          </table>

          <!-- TOTALS -->
          <div style="margin-top: 10px;">
            <table style="width: 100%; font-size: 11px; border-collapse: collapse;">
              <tbody>
                <tr>
                  <td style="padding: 3px 0; text-align: right; width: 70%;">Subtotal:</td>
                  <td style="padding: 3px 0; text-align: right; font-weight: bold;">${sub.toLocaleString()}</td>
                </tr>
                <tr>
                  <td style="padding: 3px 0; text-align: right;">Delivery:</td>
                  <td style="padding: 3px 0; text-align: right; font-weight: bold;">${del.toLocaleString()}</td>
                </tr>
                <tr>
                  <td style="padding: 5px 0; text-align: right; font-size: 13px; font-weight: bold; border-top: 1px solid #000;">Grand Total:</td>
                  <td style="padding: 5px 0; text-align: right; font-size: 13px; font-weight: bold; border-top: 1px solid #000;">${grand.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- BARCODE -->
          ${barcodeDataUrl
          ? `
          <div style="text-align: center; margin-top: 15px;">
            <img src="${barcodeDataUrl}" style="height: 35px; max-width: 100%; display: block; margin: 0 auto;" />
            <div style="font-size: 9px; color: #000; letter-spacing: 1px; margin-top: 4px;">${order.orderId || "000"}</div>
          </div>`
          : ""
        }

          <!-- FOOTER -->
          <div style="text-align: center; margin-top: 15px;">
            <div style="font-size: 10px; color: #000;">Thank you for shopping with us!</div>
          </div>
        </div>
      `;

      const printWindow = window.open("", "", "height=900,width=800");
      printWindow.document.write("<html><head><title>Invoice</title>");
      printWindow.document.write(
        "<link href='https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;700&display=swap' rel='stylesheet'>"
      );
      printWindow.document.write("<style>");
      printWindow.document.write(
        "@page { size: auto; margin: 5mm; } body { font-family: Arial, sans-serif; margin: 0; padding: 0; background: #fff; color: #000; }"
      );
      printWindow.document.write(
        "table { width: 100%; border-collapse: collapse; table-layout: fixed; } th, td { padding: 4px 2px; }"
      );
      printWindow.document.write(
        "th { font-size: 11px; font-weight: bold; } td { font-size: 11px; }"
      );
      printWindow.document.write(
        ".item-cell { word-break: break-word; white-space: normal; } .qty-cell, .rate-cell { white-space: nowrap; }"
      );
      printWindow.document.write("</style>");
      printWindow.document.write("</head><body>");
      printWindow.document.write(invoiceHTML);
      printWindow.document.write("</body></html>");
      printWindow.document.close();

      // Wait for fonts to load before printing
      setTimeout(() => {
        printWindow.print();
      }, 500);

    } catch (err) {
      console.error("Invoice error:", err);
      alert("Invoice error: " + err.message);
    } finally {
      setInvoiceLoading(null);
    }
  };

  return (
    <div className="p-6 bg-gradient-to-br from-slate-50 to-blue-50 rounded-2xl shadow-2xl w-full max-w-7xl mx-auto overflow-auto border border-blue-200">

      {/* ── Page Title ── */}
      <div className="text-center mb-8">
        <h2 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-indigo-700 tracking-tight">
          Orders & Payments
        </h2>
        <p className="text-gray-500 text-sm mt-1">
          Manage all customer orders and invoices
        </p>
      </div>

      {/* ── Stats Bar ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          {
            label: "Total Orders",
            value: orders.length,
            color: "from-blue-500 to-blue-600",
          },
          {
            label: "Pending",
            value: orders.filter(
              (o) => (o.status || "Pending") === "Pending"
            ).length,
            color: "from-yellow-400 to-yellow-500",
          },
          {
            label: "Paid",
            value: orders.filter((o) => o.status === "Paid").length,
            color: "from-green-500 to-green-600",
          },
          {
            label: "Delivered",
            value: orders.filter((o) => o.status === "Delivered").length,
            color: "from-indigo-500 to-indigo-600",
          },
        ].map((s) => (
          <div
            key={s.label}
            className={`bg-gradient-to-br ${s.color} text-white rounded-xl p-4 shadow-md`}
          >
            <div className="text-2xl font-black">{s.value}</div>
            <div className="text-xs font-semibold opacity-90 mt-1">
              {s.label}
            </div>
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
          <p className="text-gray-500 text-sm animate-pulse">
            Loading orders...
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl shadow-lg border border-gray-100">
            <table className="w-full text-sm text-left text-gray-800">
              <thead>
                <tr className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
                  {[
                    "Order ID",
                    "Customer",
                    "Phone",
                    "Total",
                    "Method",
                    "Type",
                    "Status",
                    "Date",
                    "Actions",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 font-semibold text-xs uppercase tracking-wider whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {current.length === 0 ? (
                  <tr>
                    <td
                      colSpan="9"
                      className="text-center py-16 text-gray-400"
                    >
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
                      Delivered:
                        "bg-blue-100 text-blue-800 border-blue-200",
                      Pending:
                        "bg-yellow-100 text-yellow-800 border-yellow-200",
                    };
                    const st = o.status || "Pending";

                    return (
                      <tr
                        key={o.id}
                        className="hover:bg-blue-50/60 transition-colors duration-150"
                      >
                        <td className="px-4 py-3 font-bold text-gray-900 whitespace-nowrap">
                          {o.orderId ||
                            `ORD-${String(i + 1).padStart(3, "0")}`}
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
                            onChange={(e) =>
                              handleStatusChange(o.id, e.target.value)
                            }
                            className={`border px-2 py-1 rounded-lg text-xs font-bold cursor-pointer ${statusStyles[st] || statusStyles["Pending"]
                              }`}
                          >
                            <option value="Pending">Pending</option>
                            <option value="Paid">Paid</option>
                            <option value="Delivered">Delivered</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                          {date}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2 items-center">
                            <button
                              onClick={() => handleInvoice(o)}
                              disabled={invoiceLoading === o.id}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white rounded-lg shadow-sm transition-all"
                            >
                              {invoiceLoading === o.id ? (
                                <>
                                  <span className="inline-block animate-spin">
                                    ⏳
                                  </span>
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
            {Math.min(page * perPage, filtered.length)} of {filtered.length}{" "}
            orders
          </p>
        </>
      )}
    </div>
  );
}