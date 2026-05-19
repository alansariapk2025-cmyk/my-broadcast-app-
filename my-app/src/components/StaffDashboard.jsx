/**
 * StaffDashboard.jsx
 * Staff landing page with shop-scoped counts and quick actions.
 */

import { useEffect, useState } from "react";
import { collection, getDocs, orderBy, query, where, limit } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";

export default function StaffDashboard({ onNavigate }) {
  const { assignedShopId, assignedShopName, userName } = useAuth();
  const [stats, setStats] = useState({ products: 0, categories: 0 });
  const [recentProducts, setRecentProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!assignedShopId) {
      setLoading(false);
      return;
    }

    const loadData = async () => {
      setLoading(true);
      try {
        const productsQuery = query(collection(db, "products"), where("shopId", "==", assignedShopId));
        const categoriesQuery = query(collection(db, "categories"), where("shopId", "==", assignedShopId));

        const [productSnap, categorySnap] = await Promise.all([
          getDocs(productsQuery),
          getDocs(categoriesQuery),
        ]);

        let recentSnap;
        try {
          recentSnap = await getDocs(
            query(
              collection(db, "products"),
              where("shopId", "==", assignedShopId),
              orderBy("createdAt", "desc"),
              limit(5)
            )
          );
        } catch (orderError) {
          console.warn("CreatedAt ordering failed, falling back:", orderError.message);
          recentSnap = await getDocs(
            query(collection(db, "products"), where("shopId", "==", assignedShopId), limit(5))
          );
        }

        setStats({ products: productSnap.size, categories: categorySnap.size });

        const recent = recentSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        recent.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setRecentProducts(recent);
      } catch (error) {
        console.error("StaffDashboard load error:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [assignedShopId]);

  if (!assignedShopId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="rounded-3xl bg-white p-10 shadow-xl border border-slate-200 text-center">
          <div className="mb-4 text-5xl">⚠️</div>
          <h2 className="text-2xl font-semibold">No Shop Assigned</h2>
          <p className="mt-3 text-sm text-slate-500">Your account does not have an assigned shop. Contact your super admin to finish setup.</p>
        </div>
      </div>
    );
  }

  const formatDate = (date) =>
    date.toLocaleDateString("en-PK", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const formatTime = (date) =>
    date.toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" });

  const quickActions = [
    { label: "Add Product", id: "product", icon: "➕", color: "from-blue-500 to-blue-600" },
    { label: "View Products", id: "productList", icon: "📦", color: "from-indigo-500 to-indigo-600" },
    { label: "Add Category", id: "category", icon: "➕", color: "from-teal-500 to-emerald-500" },
    { label: "View Categories", id: "category", icon: "📁", color: "from-slate-500 to-slate-600" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-[32px] bg-gradient-to-r from-blue-600 to-indigo-700 p-8 text-white shadow-2xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-blue-200">Staff Dashboard</p>
              <h1 className="mt-3 text-3xl font-bold">Welcome, {userName || "Team Member"}</h1>
              <p className="mt-2 text-sm text-blue-100">Assigned shop: {assignedShopName || assignedShopId}</p>
            </div>
            <div className="rounded-3xl bg-white/10 p-4 text-right">
              <p className="text-xs text-blue-100">Live clock</p>
              <p className="mt-2 text-3xl font-semibold">{formatTime(currentTime)}</p>
              <p className="text-xs text-blue-200">{formatDate(currentTime)}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <button
            type="button"
            onClick={() => onNavigate?.("productList")}
            className="rounded-3xl bg-gradient-to-br from-blue-500 to-indigo-600 p-6 text-left text-white shadow-xl transition hover:-translate-y-0.5"
          >
            <p className="text-4xl">📦</p>
            <p className="mt-4 text-3xl font-bold">{loading ? "—" : stats.products}</p>
            <p className="mt-2 text-sm text-blue-100">Products in shop</p>
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.("category")}
            className="rounded-3xl bg-gradient-to-br from-teal-500 to-emerald-500 p-6 text-left text-white shadow-xl transition hover:-translate-y-0.5"
          >
            <p className="text-4xl">🗂️</p>
            <p className="mt-4 text-3xl font-bold">{loading ? "—" : stats.categories}</p>
            <p className="mt-2 text-sm text-teal-100">Categories in shop</p>
          </button>
        </div>

        <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
          <div className="rounded-3xl bg-white p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Recent Products</h2>
                <p className="mt-1 text-sm text-slate-500">Latest items from your assigned shop.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Top 5</span>
            </div>

            {loading ? (
              <div className="mt-6 space-y-3">
                {[...Array(3)].map((_, index) => (
                  <div key={index} className="h-16 rounded-3xl bg-slate-100 animate-pulse" />
                ))}
              </div>
            ) : recentProducts.length === 0 ? (
              <div className="mt-6 rounded-3xl border border-dashed border-slate-200 p-6 text-center text-slate-500">
                No products found for this shop yet.
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                {recentProducts.map((product) => (
                  <div key={product.id} className="rounded-3xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-slate-900">{product.name || "Unnamed product"}</p>
                        <p className="mt-1 text-sm text-slate-500">Rs. {product.price ?? "—"}</p>
                      </div>
                      <span className="rounded-2xl bg-slate-100 px-3 py-1 text-xs text-slate-700">
                        {product.categoryName || "Uncategorized"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-xl border border-slate-200">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">Quick Actions</h2>
            <div className="grid gap-3">
              {quickActions.map((tile) => (
                <button
                  key={tile.id}
                  type="button"
                  onClick={() => onNavigate?.(tile.id)}
                  className={`rounded-3xl px-4 py-5 text-left text-white shadow-lg bg-gradient-to-r ${tile.color} transition hover:-translate-y-0.5`}
                >
                  <p className="text-2xl">{tile.icon}</p>
                  <p className="mt-3 text-sm font-semibold">{tile.label}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
