import { useState, useEffect } from "react";
import { signOut } from "firebase/auth";
import { Loader2, ShieldAlert, Ban } from "lucide-react";
import { auth } from "./firebase";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ShopProvider, useShop } from "./contexts/ShopContext";
import Sidebar from "./components/layout/Sidebar";
import Header from "./components/layout/Header";
import Dashboard from "./components/dashboard/Dashboard";
import AddProduct from "./components/AddProduct";
import ProductList from "./components/ProductList";
import PriceManagement from "./components/PriceManagement";
import FlashDealsManager from "./components/FlashDealsManager";
import AddCategory from "./components/AddCategory";
import AddShop from "./components/layout/AddShop";
import Orders from "./components/Orders";
import NewOrders from "./components/NewOrders";
import Payments from "./components/Payments";
import Customers from "./components/Customers";
import Backup from "./pages/Backup";
import SendNotificationScreen from "./components/SendNotificationScreen";
import OrderReportAdvanced from "./components/OrderReportAdvanced";
import AdminBanner from "./components/AdminBanner";
import UserManagement from "./components/UserManagement";
import StaffPermissions from "./components/StaffPermissions";
import ActivityLogs from "./components/ActivityLogs";
import StaffDashboard from "./components/StaffDashboard";
import AuthScreen from "./components/AuthScreen";

function AppInner() {
  const {
    currentUser,
    userRole,
    isSuperAdmin,
    isStaff,
    assignedShopId,
    assignedShopName,
    userName,
    roleLabel,
    authLoading,
    authError,
    hasPermission,
    permissions,
  } = useAuth();

  const { displayShopName } = useShop();
  const homeTab = isStaff
    ? permissions.includes("staffDashboard")
      ? "staffDashboard"
      : permissions[0] || "staffDashboard"
    : "dashboard";
  const [activeTab, setActiveTab] = useState(homeTab);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setActiveTab(homeTab);
  }, [homeTab]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center theme-main">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="theme-page-muted font-medium">Verifying session...</p>
        </div>
      </div>
    );
  }

  if (authError && !currentUser) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center theme-main p-6">
        <div className="theme-card max-w-md w-full p-8 text-center">
          <ShieldAlert className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-red-400 mb-2">Account Issue</h1>
          <p className="theme-page-muted mb-6">{authError}</p>
          <button onClick={() => signOut(auth)} className="theme-btn-danger w-full py-3">
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  if (!currentUser) return <AuthScreen />;

  if (!userRole) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center theme-main p-6">
        <div className="theme-card max-w-lg w-full p-8 text-center">
          <Ban className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-red-400 mb-3">Access Denied</h1>
          <p className="theme-page-muted mb-6">Contact the super admin to get access.</p>
          <button onClick={() => signOut(auth)} className="theme-btn-danger w-full py-3">
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  const handleTabChange = (tabId) => {
    if (hasPermission(tabId)) setActiveTab(tabId);
  };

  const handleRefresh = () => setRefreshKey((k) => k + 1);
  const key = refreshKey;
  const staffMode = isStaff;

  const renderScreen = () => {
    switch (activeTab) {
      case "dashboard":
        return <Dashboard key={key} />;
      case "staffDashboard":
        return <StaffDashboard key={key} onNavigate={handleTabChange} />;
      case "product":
        return (
          <AddProduct
            key={key}
            assignedShopId={assignedShopId}
            isStaff={staffMode}
          />
        );
      case "productList":
        return (
          <ProductList
            key={key}
            assignedShopId={assignedShopId}
            isStaff={staffMode}
          />
        );
      case "priceManagement":
        return <PriceManagement key={key} />;
      case "flashDeals":
        return <FlashDealsManager key={key} />;
      case "category":
        return (
          <AddCategory
            key={key}
            assignedShopId={assignedShopId}
            isStaff={staffMode}
          />
        );
      case "shop":
        return <AddShop key={key} />;
      case "orders":
        return <Orders key={key} onNavigate={handleTabChange} assignedShopId={assignedShopId} />;
      case "newOrders":
        return <NewOrders key={key} onNavigate={handleTabChange} assignedShopId={assignedShopId} />;
      case "payments":
        return <Payments key={key} assignedShopId={assignedShopId} />;
      case "customers":
        return <Customers key={key} assignedShopId={assignedShopId} />;
      case "backup":
        return <Backup key={key} />;
      case "notifications":
        return <SendNotificationScreen key={key} />;
      case "orderReport":
        return <OrderReportAdvanced key={key} assignedShopId={assignedShopId} />;
      case "banners":
        return <AdminBanner key={key} />;
      case "users":
        return <UserManagement key={key} />;
      case "permissions":
        return <StaffPermissions key={key} />;
      case "activityLogs":
        return <ActivityLogs key={key} />;
      default:
        return staffMode ? (
          <StaffDashboard key={key} onNavigate={handleTabChange} />
        ) : (
          <Dashboard key={key} />
        );
    }
  };

  return (
    <div className="flex min-h-screen theme-main">
      <Sidebar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        isSuperAdmin={isSuperAdmin}
        userRole={userRole}
        roleLabel={roleLabel}
        assignedShopName={assignedShopName}
        displayShopName={displayShopName}
        permissions={permissions}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          user={currentUser}
          onLogout={() => signOut(auth)}
          isSuperAdmin={isSuperAdmin}
          userName={userName}
          roleLabel={roleLabel}
          onMenuToggle={() => setMobileOpen((o) => !o)}
          onRefresh={handleRefresh}
        />
        <main className="flex-1 p-4 sm:p-6 overflow-y-auto theme-main">
          {renderScreen()}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ShopProvider>
          <AppInner />
        </ShopProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
