import { useEffect, useMemo, useState, useCallback } from "react";
import { db } from "../../firebase";
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import {
  Users, ReceiptText, Wallet, Store, Package, Tags,
  TrendingUp, AlertTriangle, RefreshCw, ShieldAlert, UserX,
} from "lucide-react";
import { Bar } from "react-chartjs-2";
import "chart.js/auto";
import { useShop } from "../../contexts/ShopContext";
import { useAuth } from "../../contexts/AuthContext";
import { filterByShop } from "../../utils/shopUtils";
import notify from "../../utils/notify";
import PageShell, { SectionCard } from "../ui/PageShell";

export default function Dashboard() {
  const { effectiveShopId, viewingAllShops, displayShopName } = useShop();
  const { isSuperAdmin } = useAuth();

  const [summary, setSummary] = useState({
    totalOrders: 0,
    totalPayments: 0,
    totalCustomers: 0,
    totalShops: 0,
    totalProducts: 0,
    totalCategories: 0,
    todaySales: 0,
    monthlySales: 0,
    lowStock: 0,
  });
  const [latestOrders, setLatestOrders] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);
  const [chartData, setChartData] = useState(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersSnap, productsSnap, shopsSnap, usersSnap] = await Promise.all([
        getDocs(query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(500))),
        getDocs(collection(db, "products")),
        getDocs(collection(db, "shops")),
        getDocs(collection(db, "users")),
      ]);

      let orders = ordersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      let products = productsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      if (effectiveShopId) {
        orders = filterByShop(orders, effectiveShopId);
        products = filterByShop(products, effectiveShopId);
      }

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      let totalPayments = 0;
      let todaySales = 0;
      let monthlySales = 0;
      const customerSet = new Set();

      orders.forEach((o) => {
        const total = o.grandTotal ?? o.total ?? 0;
        totalPayments += total;
        const created = o.createdAt?.toDate?.() || new Date(o.createdAt || 0);
        if (created >= todayStart) todaySales += total;
        if (created >= monthStart) monthlySales += total;
        const key = o.userId || o.email || o.customerPhone || o.phone;
        if (key) customerSet.add(key);
      });

      const lowStock = products.filter((p) => (p.stock ?? p.quantity ?? 0) < 10).length;

      let catCount = 0;
      const shopDocs = viewingAllShops
        ? shopsSnap.docs
        : shopsSnap.docs.filter((d) => d.id === effectiveShopId);

      await Promise.all(
        shopDocs.map(async (shopDoc) => {
          const catSnap = await getDocs(collection(db, "shops", shopDoc.id, "categories"));
          catCount += catSnap.size;
        })
      );

      setSummary({
        totalOrders: orders.length,
        totalPayments,
        totalCustomers: customerSet.size,
        totalShops: viewingAllShops ? shopsSnap.size : 1,
        totalProducts: products.length,
        totalCategories: catCount,
        todaySales,
        monthlySales,
        lowStock,
      });

      const recent = orders.slice(0, 5).map((d) => ({
        id: d.id,
        customerName: d.customerName || d.name || d.userName || "Unknown",
        total: d.grandTotal ?? d.total ?? 0,
        status: d.status || "Pending",
        createdAt: d.createdAt?.toDate?.() || new Date(),
      }));
      setLatestOrders(recent);

      setAdminUsers(
        usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
      );

      const filteredForChart = orders.filter((o) => {
        const d = o.createdAt?.toDate?.();
        if (!d) return false;
        const from = fromDate ? new Date(fromDate) : null;
        const to = toDate ? new Date(toDate + "T23:59:59") : null;
        return (!from || d >= from) && (!to || d <= to);
      });

      const dateMap = {};
      filteredForChart.forEach((o) => {
        const date = (o.createdAt?.toDate?.() || new Date()).toLocaleDateString();
        dateMap[date] = (dateMap[date] || 0) + (o.grandTotal ?? o.total ?? 0);
      });

      setChartData({
        labels: Object.keys(dateMap),
        datasets: [{
          label: "Revenue (PKR)",
          data: Object.values(dateMap),
          backgroundColor: "rgba(59, 130, 246, 0.5)",
          borderColor: "rgb(59, 130, 246)",
          borderWidth: 2,
          borderRadius: 8,
        }],
      });
    } catch (err) {
      console.error("Dashboard load error:", err);
      notify.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, [effectiveShopId, viewingAllShops, fromDate, toDate]);

  useEffect(() => {
    loadDashboard();
    const timer = setInterval(loadDashboard, 120_000);
    return () => clearInterval(timer);
  }, [loadDashboard]);

  const statCards = useMemo(() => {
    if (isSuperAdmin && viewingAllShops) {
      return [
        { icon: Store, label: "Total Shops", value: summary.totalShops, color: "text-blue-500" },
        { icon: Package, label: "Total Products", value: summary.totalProducts, color: "text-blue-500" },
        { icon: Tags, label: "Categories", value: summary.totalCategories, color: "text-blue-500" },
        { icon: Users, label: "Customers", value: summary.totalCustomers, color: "text-blue-500" },
        { icon: ReceiptText, label: "Total Orders", value: summary.totalOrders, color: "text-blue-500" },
        { icon: Wallet, label: "Total Revenue", value: `PKR ${summary.totalPayments.toLocaleString()}`, color: "text-blue-500" },
      ];
    }
    return [
      { icon: TrendingUp, label: "Today's Sales", value: `PKR ${summary.todaySales.toLocaleString()}`, color: "text-blue-500" },
      { icon: Wallet, label: "Monthly Sales", value: `PKR ${summary.monthlySales.toLocaleString()}`, color: "text-blue-500" },
      { icon: ReceiptText, label: "Orders", value: summary.totalOrders, color: "text-blue-500" },
      { icon: Package, label: "Products", value: summary.totalProducts, color: "text-blue-500" },
      { icon: AlertTriangle, label: "Low Stock", value: summary.lowStock, color: "text-red-400" },
      { icon: Users, label: "Customers", value: summary.totalCustomers, color: "text-blue-500" },
    ];
  }, [summary, isSuperAdmin, viewingAllShops]);

  const securityAlerts = useMemo(() => {
    const alerts = [];
    const suspended = adminUsers.filter((u) => u.status === "suspended");
    if (suspended.length > 0) {
      alerts.push({
        id: "suspended",
        severity: "high",
        icon: UserX,
        title: `${suspended.length} suspended account(s)`,
        detail: "Review User Management and reactivate or remove.",
      });
    }
    const staffNoShop = adminUsers.filter((u) => u.role === "STAFF" && !u.assignedShopId);
    if (staffNoShop.length > 0) {
      alerts.push({
        id: "no-shop",
        severity: "high",
        icon: ShieldAlert,
        title: `${staffNoShop.length} staff without shop`,
        detail: "Assign a shop to prevent access issues.",
      });
    }
    if (summary.lowStock > 0) {
      alerts.push({
        id: "low-stock",
        severity: summary.lowStock >= 10 ? "high" : "medium",
        icon: AlertTriangle,
        title: `${summary.lowStock} low-stock product(s)`,
        detail: "Stock below 10 units — restock soon.",
      });
    }
    const bigOrders = latestOrders.filter((o) => o.total >= 100000);
    if (bigOrders.length > 0) {
      alerts.push({
        id: "big-order",
        severity: "medium",
        icon: ShieldAlert,
        title: `${bigOrders.length} high-value recent order(s)`,
        detail: "Orders over PKR 100,000 — verify if needed.",
      });
    }
    return alerts;
  }, [adminUsers, summary.lowStock, latestOrders]);

  return (
    <PageShell
      title="Dashboard"
      subtitle={`${displayShopName} · Live overview`}
      icon={TrendingUp}
      actions={
        <button type="button" onClick={loadDashboard} disabled={loading} className="theme-btn-secondary text-sm">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      }
    >
      {securityAlerts.length > 0 && (
        <SectionCard title="Security & Fraud Alerts" icon={ShieldAlert} className="border-red-500/20">
          <div className="space-y-2">
            {securityAlerts.map((alert) => {
              const Icon = alert.icon;
              return (
                <div
                  key={alert.id}
                  className={`theme-card-inner p-4 flex gap-3 items-start ${
                    alert.severity === "high" ? "border-red-500/40" : "border-amber-500/30"
                  }`}
                >
                  <div className={`p-2 rounded-xl shrink-0 ${alert.severity === "high" ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400"}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-extrabold theme-page-title">{alert.title}</p>
                    <p className="text-sm theme-page-muted mt-0.5">{alert.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="stat-card p-5 flex items-center gap-4">
            <div className={`p-3 rounded-xl bg-blue-500/10 ${color}`}>
              <Icon size={24} />
            </div>
            <div>
              <p className="text-2xl font-bold theme-page-title">{value}</p>
              <p className="text-sm theme-page-muted">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <SectionCard title="Recent Orders" icon={ReceiptText}>
        <ul className="space-y-2">
          {latestOrders.map((o) => (
            <li
              key={o.id}
              className="flex justify-between items-center p-3 rounded-xl theme-card-inner hover:border-blue-500/30 transition"
            >
              <div>
                <p className="font-medium theme-page-title">{o.customerName}</p>
                <p className="text-xs theme-page-muted">{o.createdAt.toLocaleString()}</p>
                <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs bg-blue-500/10 text-blue-400">
                  {o.status}
                </span>
              </div>
              <span className="font-bold text-blue-500">PKR {o.total.toLocaleString()}</span>
            </li>
          ))}
          {latestOrders.length === 0 && (
            <p className="theme-page-muted text-sm text-center py-6">No orders yet.</p>
          )}
        </ul>
      </SectionCard>

      <SectionCard title="Sales Chart" icon={TrendingUp}>
        <div className="flex flex-wrap gap-3 mb-4">
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="theme-input" />
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="theme-input" />
        </div>
        {chartData?.labels?.length > 0 ? (
          <Bar
            data={chartData}
            options={{
              responsive: true,
              plugins: { legend: { labels: { color: "var(--text-muted)" } } },
              scales: {
                x: { ticks: { color: "var(--text-muted)" }, grid: { color: "rgba(59,130,246,0.08)" } },
                y: { ticks: { color: "var(--text-muted)" }, grid: { color: "rgba(59,130,246,0.08)" } },
              },
            }}
          />
        ) : (
          <p className="theme-page-muted text-sm text-center py-8">No chart data for selected range.</p>
        )}
      </SectionCard>
    </PageShell>
  );
}
