import {
  FaHome, FaBoxOpen, FaList, FaTags, FaStore,
  FaClipboardList, FaMoneyBillWave, FaUsers, FaBell,
  FaDatabase, FaChartLine, FaImage, FaBolt,
  FaUserShield, FaHistory, FaKey, FaCrown,
} from "react-icons/fa";
import { Store, Shield, User } from "lucide-react";
import { STAFF_SIDEBAR_MENU } from "../../constants/permissions";

const SUPER_ADMIN_MENU = [
  { id: "dashboard", label: "Dashboard", icon: FaHome },
  { id: "product", label: "Add Product", icon: FaBoxOpen },
  { id: "productList", label: "Product List", icon: FaList },
  { id: "priceManagement", label: "Price Management", icon: FaMoneyBillWave },
  { id: "flashDeals", label: "Flash Deals", icon: FaBolt },
  { id: "category", label: "Categories", icon: FaTags },
  { id: "shop", label: "Shops", icon: FaStore },
  { id: "orders", label: "Orders", icon: FaClipboardList },
  { id: "newOrders", label: "New Orders", icon: FaBell },
  { id: "payments", label: "Payments", icon: FaMoneyBillWave },
  { id: "customers", label: "Customers", icon: FaUsers },
  { id: "orderReport", label: "Order Report", icon: FaChartLine },
  { id: "notifications", label: "Notifications", icon: FaBell },
  { id: "backup", label: "Backup", icon: FaDatabase },
  { id: "banners", label: "Banners", icon: FaImage },
  { id: "users", label: "User Management", icon: FaUserShield },
  { id: "permissions", label: "Staff Permissions", icon: FaKey },
  { id: "activityLogs", label: "Activity Logs", icon: FaHistory },
];

export default function Sidebar({
  activeTab,
  onTabChange,
  isSuperAdmin,
  userRole,
  roleLabel,
  assignedShopName,
  displayShopName,
  permissions = [],
  mobileOpen,
  onMobileClose,
}) {
  const isStaffRole = userRole === "STAFF";
  const menuItems = isStaffRole
    ? STAFF_SIDEBAR_MENU.filter((item) => permissions.includes(item.id))
    : SUPER_ADMIN_MENU;

  const sidebarContent = (
    <>
      <div className="text-center py-6 border-b border-white/10 px-4">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shadow-lg backdrop-blur-sm">
            <Store className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold text-white">POS Admin</h1>
        </div>
        <p className="text-xs opacity-80">Multi-Shop Platform</p>

        <div className="mt-4">
          {isSuperAdmin ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/15 text-white text-xs font-semibold rounded-full border border-white/20">
              <FaCrown className="w-3 h-3" />
              Super Admin
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 text-white/90 text-xs font-semibold rounded-full border border-white/15">
              <User className="w-3 h-3" />
              {roleLabel || "Staff"}
            </span>
          )}
        </div>

        {(displayShopName || assignedShopName) && !isSuperAdmin && (
          <div className="mt-3 px-3 py-2 bg-white/10 rounded-xl text-xs text-white/90 border border-white/10 flex items-center justify-center gap-1.5">
            <Store className="w-3 h-3 shrink-0" />
            <span className="truncate">{assignedShopName || displayShopName}</span>
          </div>
        )}
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {menuItems.length === 0 ? (
          <p className="text-white/50 text-xs text-center px-4 py-6">No pages assigned. Contact super admin.</p>
        ) : (
          menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onTabChange(item.id);
                  onMobileClose?.();
                }}
                className={`flex items-center gap-3 w-full px-4 py-2.5 rounded-lg transition-all text-sm ${
                  isActive
                    ? "nav-item-active"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-left">{item.label}</span>
              </button>
            );
          })
        )}
      </nav>

      <footer className="p-4 text-center text-xs text-white/50 border-t border-white/10">
        <Shield className="w-3 h-3 inline mr-1" />
        Secure Multi-Tenant POS
      </footer>
    </>
  );

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={onMobileClose} aria-hidden />
      )}
      <aside
        className={`theme-sidebar fixed lg:static inset-y-0 left-0 z-50 w-64 flex flex-col shadow-2xl min-h-screen border-r transform transition-transform duration-200 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
