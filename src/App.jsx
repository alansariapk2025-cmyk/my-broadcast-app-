// src/App.jsx
// ✅ Updated: Uses AuthContext for RBAC + backward compatible with legacy admins/ check
// Adds: STAFF dashboard, ShopUserManager, ActivityLogs, shop-scoped routing

import { useState } from "react";
import { signOut }   from "firebase/auth";
import { auth }      from "./firebase";

// ── Auth Context ─────────────────────────────────────────────────────────────
import { AuthProvider, useAuth } from "./contexts/AuthContext";

// ── Layout ───────────────────────────────────────────────────────────────────
import Sidebar  from "./components/layout/Sidebar";
import Header   from "./components/layout/Header";

// ── Super Admin Screens ──────────────────────────────────────────────────────
import Dashboard             from "./components/dashboard/Dashboard";
import AddProduct            from "./components/AddProduct";
import ProductList           from "./components/ProductList";
import PriceManagement       from "./components/PriceManagement";
import FlashDealsManager     from "./components/FlashDealsManager";
import AddCategory           from "./components/AddCategory";
import AddShop               from "./components/layout/AddShop";
import Orders                from "./components/Orders";
import NewOrders             from "./components/NewOrders";
import Payments              from "./components/Payments";
import Customers             from "./components/Customers";
import Backup                from "./pages/Backup";
import SendNotificationScreen from "./components/SendNotificationScreen";
import OrderReportAdvanced   from "./components/OrderReportAdvanced";
import AdminBanner           from "./components/AdminBanner";
import AdminUsers            from "./components/AdminUsers";

// ── New RBAC Screens ──────────────────────────────────────────────────────────
import ShopUserManager       from "./components/ShopUserManager";
import ActivityLogs          from "./components/ActivityLogs";
import StaffDashboard        from "./components/StaffDashboard";

// ── Auth Screen ───────────────────────────────────────────────────────────────
import AuthScreen from "./components/AuthScreen";

// ─────────────────────────────────────────────────────────────────────────────
// Inner App (consumes AuthContext)
// ─────────────────────────────────────────────────────────────────────────────
function AppInner() {
  const {
    currentUser,
    userRole,
    isSuperAdmin,
    isStaff,
    assignedShopId,
    assignedShopName,
    userName,
    authLoading,
    authError,
    hasPermission,
  } = useAuth();

  // Default tab depends on role
  const defaultTab = isStaff ? "staffDashboard" : "dashboard";
  const [activeTab, setActiveTab] = useState(defaultTab);

  // ── Loading ──────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-lg font-semibold text-gray-700">⏳ Checking login status...</p>
        </div>
      </div>
    );
  }

  // ── Auth Error (suspended, unauthorized) ──────────────────────────
  if (authError && !currentUser) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 p-6">
        <div className="max-w-md w-full rounded-2xl border border-red-200 bg-white p-8 text-center shadow-xl">
          <span className="text-5xl">⚠️</span>
          <h1 className="text-xl font-bold text-red-700 mt-4 mb-2">Account Issue</h1>
          <p className="text-gray-600 mb-6">{authError}</p>
          <button
            onClick={() => signOut(auth)}
            className="w-full rounded-xl bg-red-600 px-4 py-3 text-white font-semibold hover:bg-red-700 transition"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  // ── Not Logged In → Show Login ─────────────────────────────────────
  if (!currentUser) return <AuthScreen />;

  // ── No Role (edge case) ────────────────────────────────────────────
  if (!userRole) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 p-6">
        <div className="max-w-lg w-full rounded-2xl border border-red-200 bg-white p-8 text-center shadow-xl">
          <span className="text-4xl">🚫</span>
          <h1 className="text-2xl font-bold text-red-600 mb-3 mt-4">Access Denied</h1>
          <p className="text-gray-600 mb-2">This account is not registered as an admin or staff.</p>
          <p className="text-sm text-gray-500 mb-6">Contact the super-admin to get access.</p>
          <p className="text-xs bg-gray-50 rounded-lg p-3 mb-6 text-gray-500">
            Email: {currentUser.email}
          </p>
          <button
            onClick={() => signOut(auth)}
            className="w-full rounded-xl bg-red-600 px-4 py-3 text-white font-semibold hover:bg-red-700 transition"
          >
            Sign Out &amp; Try Another Account
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // Tab Navigation helper — safe tab switch with permission check
  // ─────────────────────────────────────────────────────────────────
  const handleTabChange = (tabId) => {
    if (hasPermission(tabId)) {
      setActiveTab(tabId);
    }
    // If no permission, silently ignore (security via Firestore rules also enforced)
  };

  // ─────────────────────────────────────────────────────────────────
  // Screen Renderer
  // ─────────────────────────────────────────────────────────────────
  const renderScreen = () => {
    // ── STAFF screens ───────────────────────────────────────────────
    if (isStaff) {
      switch (activeTab) {
        case "staffDashboard": return <StaffDashboard onNavigate={handleTabChange} />;
        case "product":        return <AddProduct  assignedShopId={assignedShopId} isStaff={isStaff} />;
        case "productList":    return <ProductList assignedShopId={assignedShopId} isStaff={isStaff} />;
        case "category":       return <AddCategory assignedShopId={assignedShopId} isStaff={isStaff} />;
        default:               return <StaffDashboard onNavigate={handleTabChange} />;
      }
    }

    // ── SUPER_ADMIN screens (all original + new ones) ───────────────
    switch (activeTab) {
      case "dashboard":       return <Dashboard />;
      case "product":         return <AddProduct />;
      case "productList":     return <ProductList />;
      case "priceManagement": return <PriceManagement />;
      case "flashDeals":      return <FlashDealsManager />;
      case "category":        return <AddCategory />;
      case "shop":            return <AddShop />;
      case "orders":          return <Orders onNavigate={handleTabChange} />;
      case "newOrders":       return <NewOrders onNavigate={handleTabChange} />;
      case "payments":        return <Payments />;
      case "customers":       return <Customers />;
      case "backup":          return <Backup />;
      case "notifications":   return <SendNotificationScreen />;
      case "orderReport":     return <OrderReportAdvanced />;
      case "banners":         return <AdminBanner />;
      case "adminUsers":      return <AdminUsers isSuperAdmin={isSuperAdmin} currentUser={currentUser} />;
      // ── NEW screens ───────────────────────────────────────────────
      case "staffUsers":      return <ShopUserManager />;
      case "activityLogs":    return <ActivityLogs />;
      default:                return <Dashboard />;
    }
  };

  // ─────────────────────────────────────────────────────────────────
  // Render Layout
  // ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <Sidebar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        isAdmin={isSuperAdmin}
        isSuperAdmin={isSuperAdmin}
        userRole={userRole}
        assignedShopName={assignedShopName}
      />
      <div className="flex-1 flex flex-col">
        <Header
          activeTab={activeTab}
          setActiveTab={handleTabChange}
          user={currentUser}
          onLogout={() => signOut(auth)}
          isSuperAdmin={isSuperAdmin}
          userName={userName}
        />
        <main className="flex-1 p-6 overflow-y-auto">
          {renderScreen()}
        </main>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Root App wraps everything in AuthProvider
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}