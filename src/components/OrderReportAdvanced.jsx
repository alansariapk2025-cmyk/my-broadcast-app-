// src/pages/OrderReportAdvanced.jsx
import React, { useEffect, useState, useMemo } from "react";
import { db } from "../firebase";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { Bar, Pie } from "react-chartjs-2";
import "chart.js/auto";
import { saveAs } from "file-saver";
import { Workbook } from "exceljs";
import PageShell, { SectionCard } from "./ui/PageShell";
import { TrendingUp, FileSpreadsheet } from "lucide-react";

const num = (v) =>
  typeof v === "number" && !isNaN(v) ? v : Number(v) || 0;

export default function OrderReportAdvanced() {
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState("");
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [totalProfit, setTotalProfit] = useState(0);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [chartData, setChartData] = useState({});
  const [categoryData, setCategoryData] = useState({});
  const [topProducts, setTopProducts] = useState([]);
  const [timeFilter, setTimeFilter] = useState("daily");

  const [page, setPage] = useState(1);
  const perPage = 10;

  // 🔹 Fetch orders
  useEffect(() => {
    const q = query(
      collection(db, "orders"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setOrders(data);
      },
      (err) => {
        console.warn("Order report listener error:", err);
      }
    );
    return () => unsub();
  }, []);

  // 🔹 Map orders to consistent structure (memoized)
  const mappedOrders = useMemo(
    () =>
      orders.map((o) => {
        const sub = num(o.subtotal ?? o.total ?? 0);
        const del = num(o.deliveryCharge ?? 0);
        const grand = num(o.grandTotal ?? sub + del);

        const date =
          o.createdAt?.toDate?.() ||
          (o.createdAt?.seconds
            ? new Date(o.createdAt.seconds * 1000)
            : new Date());

        const firstItem =
          o.items && o.items.length > 0 ? o.items[0] : null;

        return {
          id: o.orderId || o.id,
          customerName:
            o.customerName || o.name || "Unknown",
          category:
            firstItem?.nameEn ||
            firstItem?.name ||
            "-",
          total: grand,
          cost: sub,
          profit: grand - sub,
          date,
          status: o.status || "Pending",
          deliveryCharge: del,
          paymentMethod: o.paymentMethod || "N/A",
          address:
            o.customerAddress || o.address || "N/A",
          phone:
            o.customerPhone || o.phone || "N/A",
          items: o.items || [],
        };
      }),
    [orders]
  );

  // 🔹 Filter, search & calculate stats
  useEffect(() => {
    const from = fromDate ? new Date(fromDate) : null;
    const to = toDate ? new Date(toDate) : null;

    const filtered = mappedOrders.filter((o) => {
      const term = search.toLowerCase();

      const matchesSearch =
        !term ||
        o.id.toLowerCase().includes(term) ||
        o.customerName.toLowerCase().includes(term) ||
        o.category.toLowerCase().includes(term) ||
        o.phone.toLowerCase().includes(term);

      return (
        matchesSearch &&
        (!from || o.date >= from) &&
        (!to || o.date <= to)
      );
    });

    setFilteredOrders(filtered);

    // Stats & charts
    let earnings = 0;
    let profit = 0;
    const dateMap = {};
    const categoryMap = {};
    const productMap = {};

    filtered.forEach((o) => {
      earnings += o.total;
      profit += o.profit;

      // Chart keys
      let key = "";
      if (timeFilter === "daily")
        key = o.date.toLocaleDateString();
      else if (timeFilter === "weekly") {
        const startOfWeek = new Date(o.date);
        startOfWeek.setDate(
          o.date.getDate() - o.date.getDay()
        );
        key = startOfWeek.toLocaleDateString();
      } else if (timeFilter === "monthly")
        key = `${o.date.getMonth() + 1}-${
          o.date.getFullYear()
        }`;
      else key = `${o.date.getFullYear()}`;

      dateMap[key] = (dateMap[key] || 0) + o.total;

      if (o.category)
        categoryMap[o.category] =
          (categoryMap[o.category] || 0) + o.total;

      // Top products
      o.items.forEach((item) => {
        const name = item.nameEn || item.name || "Item";
        productMap[name] =
          (productMap[name] || 0) +
          num(item.price) * num(item.qty || 1);
      });
    });

    // Charts
    setChartData({
      labels: Object.keys(dateMap),
      datasets: [
        {
          label: "Earnings",
          data: Object.values(dateMap),
          backgroundColor: "rgba(99,102,241,0.7)",
          borderColor: "rgb(99,102,241)",
          borderWidth: 1,
          borderRadius: 6,
        },
      ],
    });

    setCategoryData({
      labels: Object.keys(categoryMap),
      datasets: [
        {
          label: "Category Earnings",
          data: Object.values(categoryMap),
          backgroundColor: [
            "rgba(99,102,241,0.7)",
            "rgba(16,185,129,0.7)",
            "rgba(236,72,153,0.7)",
            "rgba(249,115,22,0.7)",
            "rgba(59,130,246,0.7)",
          ],
        },
      ],
    });

    // Top 5 products
    const top = Object.entries(productMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, total]) => ({ name, total }));
    setTopProducts(top);

    setTotalEarnings(earnings);
    setTotalProfit(profit);
  }, [
    mappedOrders,
    fromDate,
    toDate,
    search,
    timeFilter,
  ]);

  const totalPages =
    Math.ceil(filteredOrders.length / perPage) || 1;
  const currentPageOrders = filteredOrders.slice(
    (page - 1) * perPage,
    page * perPage
  );

  const exportExcel = async () => {
    const wb = new Workbook();
    const ws = wb.addWorksheet("Orders");
    const data = filteredOrders.map((o) => ({
      "Order ID": o.id,
      Customer: o.customerName,
      Category: o.category,
      Total: o.total,
      Cost: o.cost,
      Profit: o.profit,
      Date: o.date.toLocaleString(),
      Status: o.status,
    }));
    if (data.length > 0) {
      ws.columns = Object.keys(data[0]).map(k => ({ header: k, key: k }));
      data.forEach(row => ws.addRow(row));
    }
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], {
      type: "application/octet-stream",
    });
    saveAs(blob, "OrderReport.xlsx");
  };

  return (
    <PageShell
      title="Order Reports"
      subtitle="Advanced analytics, earnings & profit tracking"
      icon={TrendingUp}
      actions={
        <button type="button" onClick={exportExcel} className="theme-btn-primary">
          <FileSpreadsheet className="w-4 h-4" /> Export Excel
        </button>
      }
    >
      <SectionCard title="Overview">
        <div className="flex flex-wrap gap-4 items-end justify-between">
          <input
            type="text"
            placeholder="Search Order ID, Customer, Category..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="theme-input w-full sm:w-72"
          />
          <div className="flex flex-col gap-1 text-right">
            <span className="font-bold text-lg theme-page-title">
              Total Earnings: <span className="theme-highlight">PKR {totalEarnings.toLocaleString()}</span>
            </span>
            <span className="font-bold text-lg theme-page-title">
              Total Profit: <span className="theme-highlight">PKR {totalProfit.toLocaleString()}</span>
            </span>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Filtered Orders">
        <div className="theme-table-wrap">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="p-3 text-left">Order ID</th>
                  <th className="p-3 text-left">Customer</th>
                  <th className="p-3 text-left">Category</th>
                  <th className="p-3 text-left">Total</th>
                  <th className="p-3 text-left">Cost</th>
                  <th className="p-3 text-left">Profit</th>
                  <th className="p-3 text-left">Date</th>
                </tr>
              </thead>
              <tbody>
                {currentPageOrders.map((o) => (
                  <tr key={o.id} className="border-t theme-card-inner hover:bg-blue-500/5">
                    <td className="p-3 font-semibold theme-highlight">{o.id}</td>
                    <td className="p-3 theme-page-title">{o.customerName}</td>
                    <td className="p-3 theme-page-muted">{o.category}</td>
                    <td className="p-3 font-semibold theme-highlight">{o.total}</td>
                    <td className="p-3 theme-page-muted">{o.cost}</td>
                    <td className="p-3 theme-page-title">{o.profit}</td>
                    <td className="p-3 text-xs theme-page-muted">{o.date.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-center mt-4 gap-2">
          <button type="button" onClick={() => setPage((p) => Math.max(p - 1, 1))} disabled={page === 1} className="theme-btn-secondary text-sm disabled:opacity-40">Prev</button>
          <span className="px-3 py-1 font-semibold theme-page-title">Page {page} of {totalPages}</span>
          <button type="button" onClick={() => setPage((p) => Math.min(p + 1, totalPages))} disabled={page === totalPages} className="theme-btn-secondary text-sm disabled:opacity-40">Next</button>
        </div>
      </SectionCard>

      <SectionCard title="Charts & Filters">
        <div className="flex flex-wrap gap-2 mb-4">
          <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} className="theme-input" />
          <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} className="theme-input" />
          <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)} className="theme-select">
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
          <div className="theme-card-inner p-4 rounded-xl">
            <h3 className="font-semibold mb-2 theme-page-title">Earnings Over Time</h3>
            {chartData.labels?.length > 0 ? <Bar data={chartData} /> : <p className="theme-page-muted">No data</p>}
          </div>
          <div className="theme-card-inner p-4 rounded-xl">
            <h3 className="font-semibold mb-2 theme-page-title">Earnings by Category</h3>
            {categoryData.labels?.length > 0 ? <Pie data={categoryData} /> : <p className="theme-page-muted">No data</p>}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Top 5 Best Earning Products">
        <ol className="list-decimal list-inside space-y-1">
          {topProducts.map((p) => (
            <li key={p.name} className="font-semibold theme-page-title">
              {p.name} — <span className="theme-highlight">PKR {p.total.toLocaleString()}</span>
            </li>
          ))}
          {topProducts.length === 0 && <p className="theme-page-muted">No products sold yet</p>}
        </ol>
      </SectionCard>
    </PageShell>
  );
}