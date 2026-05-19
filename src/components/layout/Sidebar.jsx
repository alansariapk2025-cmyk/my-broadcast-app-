// src/components/layout/Sidebar.jsx
// ✅ RBAC-aware sidebar — shows menu items based on role
// Backward compatible: existing isAdmin/isSuperAdmin props still work

import React from "react";
import {
  FaHome, FaBoxOpen, FaList, FaTags, FaStore,
  FaClipboardList, FaMoneyBillWave, FaUsers, FaBell,
  FaDatabase, FaChartLine, FaImage, FaBolt,
  FaUserShield, FaHistory, FaUserCog,
} from "react-icons/fa";

// ── Menu Definitions ─────────────────────────────────────────────────────────

const SUPER_ADMIN_MENU = [
  { id: "dashboard",       label: "Dashboard",        icon: <FaHome /> },
  { id: "product",         label: "Add Product",       icon: <FaBoxOpen /> },
  { id: "productList",     label: "Product List",      icon: <FaList /> },
  { id: "priceManagement", label: "Price Management",  icon: <FaMoneyBillWave />, badge: "💰" },
  { id: "flashDeals",      label: "Flash Deals",       icon: <FaBolt />,          badge: "⚡" },
  { id: "category",        label: "Categories",        icon: <FaTags /> },
  { id: "shop",            label: "Shops",             icon: <FaStore /> },
  { id: "orders",          label: "Orders",            icon: <FaClipboardList /> },
  { id: "newOrders",       label: "New Orders",        icon: <FaBell /> },
  { id: "payments",        label: "Payments",          icon: <FaMoneyBillWave /> },
  { id: "customers",       label: "Customers",         icon: <FaUsers /> },
  { id: "orderReport",     label: "Order Report",      icon: <FaChartLine /> },
  { id: "notifications",   label: "Send Notification", icon: <FaBell /> },
  { id: "backup",          label: "Backup",            icon: <FaDatabase /> },
  { id: "banners",         label: "Banners",           icon: <FaImage /> },
  { id: "adminUsers",      label: "Admin Users",       icon: <FaUserShield /> },
  { id: "staffUsers",      label: "Staff Users",       icon: <FaUserCog /> },
  { id: "activityLogs",    label: "Activity Logs",     icon: <FaHistory /> },
];

const STAFF_MENU = [
  { id: "staffDashboard",  label: "My Dashboard",      icon: <FaHome /> },
  { id: "product",         label: "Add Product",       icon: <FaBoxOpen /> },
  { id: "productList",     label: "Product List",      icon: <FaList /> },
  { id: "category",        label: "Categories",        icon: <FaTags /> },
];

// ─────────────────────────────────────────────────────────────────────────────

export default function Sidebar({
  activeTab,
  onTabChange,
  isAdmin,        // legacy prop — kept for backward compat
  isSuperAdmin,   // legacy prop — kept for backward compat
  userRole,       // new: "SUPER_ADMIN" | "STAFF" | null
  assignedShopName,
}) {
  // Determine which menu to render
  // New role-based logic takes precedence; falls back to legacy isAdmin check
  const isStaffRole    = userRole === "STAFF";
  const isSuperRole    = userRole === "SUPER_ADMIN" || isSuperAdmin || isAdmin;
  const menuItems      = isStaffRole ? STAFF_MENU : SUPER_ADMIN_MENU;

  return (
    <aside className="w-64 bg-gradient-to-b from-blue-700 to-blue-900 text-white flex flex-col shadow-lg min-h-screen">

      {/* ── Logo ──────────────────────────────────────────────────── */}
      <div className="text-center py-6 border-b border-blue-600 px-4">
        <h1 className="text-2xl font-bold">🛒 Admin Panel</h1>
        <p className="text-sm text-blue-200 mt-1">Grocery Wholesale</p>

        {/* Role Badge */}
        <div className="mt-3">
          {isStaffRole ? (
            <span className="inline-block px-3 py-1 bg-blue-500/50 text-blue-100 text-xs font-semibold rounded-full">
              👤 STAFF
            </span>
          ) : (
            <span className="inline-block px-3 py-1 bg-purple-500/50 text-purple-100 text-xs font-semibold rounded-full">
              👑 SUPER ADMIN
            </span>
          )}
        </div>

        {/* Assigned Shop for STAFF */}
        {isStaffRole && assignedShopName && (
          <div className="mt-2 px-3 py-1.5 bg-blue-800/60 rounded-xl text-xs text-blue-200">
            🏬 {assignedShopName}
          </div>
        )}
      </div>

      {/* ── Navigation ────────────────────────────────────────────── */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={`flex items-center gap-3 w-full px-4 py-2.5 rounded-lg transition-all ${
              activeTab === item.id
                ? "bg-blue-500 text-white shadow-md"
                : "hover:bg-blue-600 text-blue-100"
            }`}
          >
            <span className="text-lg">{item.icon}</span>
            <span className="font-medium flex-1 text-left">{item.label}</span>
            {/* Badge */}
            {item.badge && activeTab !== item.id && (
              <span className={`px-1.5 py-0.5 text-white text-xs rounded-full ${
                item.badge === "⚡" ? "bg-orange-500" : "bg-green-500"
              }`}>
                {item.badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* ── Footer ────────────────────────────────────────────────── */}
      <footer className="p-4 text-center text-sm text-blue-200 border-t border-blue-600">
        © 2025-2026 Ansari Grocery
      </footer>
    </aside>
  );
}