import {
  FaHome, FaBoxOpen, FaList, FaTags, FaClipboardList, FaBell,
  FaMoneyBillWave, FaUsers, FaChartLine,
} from "react-icons/fa";

/** All toggles available for staff accounts */
export const STAFF_PERMISSION_OPTIONS = [
  { id: "staffDashboard", label: "Dashboard", icon: FaHome, group: "General" },
  { id: "product", label: "Add Product", icon: FaBoxOpen, group: "Products" },
  { id: "productList", label: "Product List", icon: FaList, group: "Products" },
  { id: "category", label: "Categories", icon: FaTags, group: "Products" },
  { id: "orders", label: "Orders", icon: FaClipboardList, group: "Sales" },
  { id: "newOrders", label: "New Orders", icon: FaBell, group: "Sales" },
  { id: "payments", label: "Payments", icon: FaMoneyBillWave, group: "Sales" },
  { id: "customers", label: "Customers", icon: FaUsers, group: "Sales" },
  { id: "orderReport", label: "Reports", icon: FaChartLine, group: "Sales" },
];

export const STAFF_PERMISSION_IDS = STAFF_PERMISSION_OPTIONS.map((p) => p.id);

export const DEFAULT_STAFF_PERMISSIONS = [
  "staffDashboard",
  "product",
  "productList",
  "category",
];

export const SUPER_ADMIN_PERMISSIONS = [
  "dashboard",
  "product",
  "productList",
  "priceManagement",
  "flashDeals",
  "category",
  "shop",
  "orders",
  "newOrders",
  "payments",
  "customers",
  "backup",
  "notifications",
  "orderReport",
  "banners",
  "users",
  "permissions",
  "activityLogs",
];

/** Sidebar menu for staff — filtered by assigned permissions */
export const STAFF_SIDEBAR_MENU = STAFF_PERMISSION_OPTIONS.map((p) => ({
  id: p.id,
  label: p.label,
  icon: p.icon,
}));
