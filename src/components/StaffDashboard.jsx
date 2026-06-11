/**
 * StaffDashboard.jsx
 * Staff landing page with shop-scoped counts and quick actions.
 */

import { useEffect, useState } from "react";
import { collection, getDocs, orderBy, query, where, limit } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import {
  AlertTriangle,
  Package,
  FolderTree,
  Plus,
  LayoutGrid,
  Clock,
} from "lucide-react";
import PageShell, { SectionCard } from "./ui/PageShell";

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
      <div className="theme-page-root min-h-[60vh] flex items-center justify-center">
        <div className="theme-card theme-glass p-10 text-center max-w-md">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold theme-page-title">No Shop Assigned</h2>
          <p className="mt-3 text-sm theme-page-muted">Contact your super admin to assign a shop to your account.</p>
        </div>
      </div>
    );
  }

  const formatDate = (date) =>
    date.toLocaleDateString("en-PK", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const formatTime = (date) =>
    date.toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" });

  const quickActions = [
    { label: "Add Product", id: "product", icon: Plus },
    { label: "View Products", id: "productList", icon: Package },
    { label: "Add Category", id: "category", icon: Plus },
    { label: "View Categories", id: "category", icon: FolderTree },
  ];

  return (
    <PageShell
      title={`Welcome, ${userName || "Team Member"}`}
      subtitle={`${assignedShopName || "Assigned Shop"} · Staff workspace`}
      icon={LayoutGrid}
      actions={
        <div className="theme-card-inner rounded-xl px-4 py-2 text-right">
          <p className="text-xs theme-page-muted flex items-center gap-1 justify-end">
            <Clock className="w-3 h-3" /> Live clock
          </p>
          <p className="text-2xl font-semibold theme-page-title">{formatTime(currentTime)}</p>
          <p className="text-xs theme-page-muted">{formatDate(currentTime)}</p>
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <button
          type="button"
          onClick={() => onNavigate?.("productList")}
          className="stat-card p-6 text-left transition hover:-translate-y-0.5 hover:border-blue-500/40"
        >
          <Package className="w-8 h-8 text-blue-500 mb-3" />
          <p className="text-3xl font-bold theme-page-title">{loading ? "—" : stats.products}</p>
          <p className="mt-1 text-sm theme-page-muted">Products in shop</p>
        </button>
        <button
          type="button"
          onClick={() => onNavigate?.("category")}
          className="stat-card p-6 text-left transition hover:-translate-y-0.5 hover:border-blue-500/40"
        >
          <FolderTree className="w-8 h-8 text-blue-500 mb-3" />
          <p className="text-3xl font-bold theme-page-title">{loading ? "—" : stats.categories}</p>
          <p className="mt-1 text-sm theme-page-muted">Categories in shop</p>
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <SectionCard title="Recent Products" icon={Package}>
          <p className="text-sm theme-page-muted -mt-2 mb-4">Latest items from your assigned shop.</p>
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, index) => (
                <div key={index} className="h-16 rounded-xl theme-card-inner animate-pulse" />
              ))}
            </div>
          ) : recentProducts.length === 0 ? (
            <div className="rounded-xl border border-dashed theme-card-inner p-6 text-center theme-page-muted">
              No products found for this shop yet.
            </div>
          ) : (
            <div className="space-y-3">
              {recentProducts.map((product) => (
                <div key={product.id} className="theme-card-inner rounded-xl p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold theme-page-title">{product.name || "Unnamed product"}</p>
                      <p className="mt-1 text-sm theme-page-muted">Rs. {product.price ?? "—"}</p>
                    </div>
                    <span className="rounded-lg theme-card-inner px-3 py-1 text-xs theme-page-muted">
                      {product.categoryName || "Uncategorized"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Quick Actions" icon={LayoutGrid}>
          <div className="grid gap-3">
            {quickActions.map((tile) => {
              const Icon = tile.icon;
              return (
                <button
                  key={`${tile.id}-${tile.label}`}
                  type="button"
                  onClick={() => onNavigate?.(tile.id)}
                  className="theme-card-inner flex items-center gap-3 rounded-xl px-4 py-4 text-left transition hover:border-blue-500/40 hover:bg-blue-500/5"
                >
                  <Icon className="w-5 h-5 text-blue-500 shrink-0" />
                  <span className="text-sm font-semibold theme-page-title">{tile.label}</span>
                </button>
              );
            })}
          </div>
        </SectionCard>
      </div>
    </PageShell>
  );
}
