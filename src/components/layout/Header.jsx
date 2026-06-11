import { useEffect, useState, useRef, useCallback } from "react";
import {
  Bell, Trash2, LogOut, User, Menu, RefreshCw, Store, Crown, ChevronDown,
  Sun, Moon, ShieldAlert,
} from "lucide-react";
import { db } from "../../firebase";
import {
  collection, getDocs, updateDoc, doc, deleteDoc, query, orderBy, limit,
} from "firebase/firestore";
import { useShop } from "../../contexts/ShopContext";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../contexts/ThemeContext";
import notify from "../../utils/notify";

export default function Header({
  user,
  onLogout,
  isSuperAdmin,
  userName,
  roleLabel,
  onMenuToggle,
  onRefresh,
}) {
  const { assignedShopName } = useAuth();
  const {
    shops,
    selectedShopId,
    setSelectedShopId,
    displayShopName,
    displayShopLogo,
    effectiveShopId,
    ALL_SHOPS,
  } = useShop();

  const { theme, toggleTheme, isDark } = useTheme();

  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showShopPicker, setShowShopPicker] = useState(false);
  const [loadingNotifs, setLoadingNotifs] = useState(false);

  const notifRef = useRef(null);
  const profileRef = useRef(null);
  const shopRef = useRef(null);

  const shopIdForNotifs = effectiveShopId || (shops[0]?.id ?? null);
  const panelShopName = isSuperAdmin
    ? (selectedShopId === ALL_SHOPS ? "All Shops Overview" : displayShopName)
    : (assignedShopName || displayShopName || "Your Shop");

  const fetchNotifications = useCallback(async () => {
    if (!shopIdForNotifs) return;
    setLoadingNotifs(true);
    try {
      const q = query(
        collection(db, "shops", shopIdForNotifs, "notifications"),
        orderBy("createdAt", "desc"),
        limit(15)
      );
      const snap = await getDocs(q);
      setNotifications(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.warn("Notifications fetch error:", err);
    } finally {
      setLoadingNotifs(false);
    }
  }, [shopIdForNotifs]);

  useEffect(() => {
    fetchNotifications();
    const timer = setInterval(fetchNotifications, 180_000);
    return () => clearInterval(timer);
  }, [fetchNotifications]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (!notifRef.current?.contains(event.target)) setShowNotifications(false);
      if (!profileRef.current?.contains(event.target)) setShowProfileMenu(false);
      if (!shopRef.current?.contains(event.target)) setShowShopPicker(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleNotiClick = async (noti) => {
    if (!shopIdForNotifs) return;
    try {
      await updateDoc(
        doc(db, "shops", shopIdForNotifs, "notifications", noti.id),
        { read: true }
      );
      setNotifications((prev) =>
        prev.map((n) => (n.id === noti.id ? { ...n, read: true } : n))
      );
    } catch {
      notify.error("Failed to mark notification as read");
    }
    setShowNotifications(false);
  };

  const handleDeleteNoti = async (notiId) => {
    if (!shopIdForNotifs) return;
    try {
      await deleteDoc(doc(db, "shops", shopIdForNotifs, "notifications", notiId));
      setNotifications((prev) => prev.filter((n) => n.id !== notiId));
      notify.success("Notification removed");
    } catch {
      notify.error("Failed to delete notification");
    }
  };

  const displayName = userName || user?.displayName || user?.email?.split("@")[0] || "User";
  const initials = displayName.charAt(0).toUpperCase();
  const unreadCount = notifications.filter((n) => !n.read).length;
  const fraudAlerts = notifications.filter(
    (n) => !n.read && (n.type === "fraud" || n.type === "security" || n.severity === "high")
  );

  return (
    <header className="theme-header sticky top-0 z-30 shadow-md border-b border-blue-500/10">
      {fraudAlerts.length > 0 && (
        <div className="bg-gradient-to-r from-red-600/90 to-orange-600/90 text-white px-4 py-1.5 flex items-center justify-center gap-2 text-xs font-bold tracking-wide">
          <ShieldAlert className="w-4 h-4 shrink-0 animate-pulse" />
          {fraudAlerts.length} security alert{fraudAlerts.length > 1 ? "s" : ""} — check notifications
        </div>
      )}

      <div className="flex justify-between items-center px-4 py-3 gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            type="button"
            onClick={onMenuToggle}
            className="lg:hidden p-2 rounded-xl hover:bg-blue-500/10 text-blue-600 dark:text-blue-400"
            aria-label="Toggle menu"
          >
            <Menu size={22} />
          </button>

          <div className="flex items-center gap-3 min-w-0">
            {displayShopLogo ? (
              <img
                src={displayShopLogo}
                alt=""
                className="w-10 h-10 rounded-xl object-cover border-2 border-blue-500/30 shadow-lg shadow-blue-500/10"
              />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/20">
                <Store className="w-5 h-5 text-white" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.2em] font-extrabold text-blue-500/80 dark:text-blue-400/80">
                Admin Panel
              </p>
              <h1 className="text-base sm:text-lg font-extrabold theme-page-title truncate leading-tight">
                {panelShopName}
              </h1>
              <p className="text-xs font-bold theme-highlight flex items-center gap-1.5 truncate">
                {isSuperAdmin ? (
                  <>
                    <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="truncate">{displayName}</span>
                    <span className="theme-page-muted font-semibold">· Super Admin</span>
                  </>
                ) : (
                  <>
                    <User className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{displayName}</span>
                    <span className="theme-page-muted font-semibold">· {roleLabel}</span>
                  </>
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {isSuperAdmin && (
            <div className="relative hidden md:block" ref={shopRef}>
              <button
                type="button"
                onClick={() => setShowShopPicker(!showShopPicker)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl theme-card text-sm font-semibold hover:border-blue-400/40 transition"
              >
                <Store className="w-4 h-4 text-blue-500" />
                <span className="max-w-[100px] truncate">
                  {selectedShopId === ALL_SHOPS ? "All Shops" : displayShopName}
                </span>
                <ChevronDown className="w-4 h-4 theme-page-muted" />
              </button>
              {showShopPicker && (
                <div className="absolute right-0 mt-2 w-56 theme-glass border border-blue-500/20 rounded-xl shadow-2xl py-1 z-50 max-h-64 overflow-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedShopId(ALL_SHOPS);
                      setShowShopPicker(false);
                    }}
                    className={`w-full text-left px-4 py-2.5 text-sm font-medium hover:bg-blue-500/10 ${
                      selectedShopId === ALL_SHOPS ? "text-blue-400 bg-blue-500/10" : "theme-page-title"
                    }`}
                  >
                    All Shops
                  </button>
                  {shops.map((shop) => (
                    <button
                      key={shop.id}
                      type="button"
                      onClick={() => {
                        setSelectedShopId(shop.id);
                        setShowShopPicker(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 text-sm font-medium hover:bg-blue-500/10 truncate ${
                        selectedShopId === shop.id ? "text-blue-400 bg-blue-500/10" : "theme-page-title"
                      }`}
                    >
                      {shop.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={toggleTheme}
            className="p-2 rounded-xl hover:bg-blue-500/10 text-blue-600 dark:text-blue-400 transition"
            title={isDark ? "Light mode" : "Dark mode"}
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="p-2 rounded-xl hover:bg-blue-500/10 theme-page-muted hover:text-blue-500 transition hidden sm:block"
              title="Refresh page data"
            >
              <RefreshCw size={18} />
            </button>
          )}

          <div className="relative" ref={notifRef}>
            <button
              type="button"
              onClick={() => {
                setShowNotifications(!showNotifications);
                if (!showNotifications) fetchNotifications();
              }}
              className="relative p-2 rounded-xl hover:bg-blue-500/10 theme-page-muted hover:text-blue-500 transition"
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] min-w-[18px] h-[18px] flex items-center justify-center rounded-full font-extrabold shadow-lg shadow-red-500/40">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 theme-glass border border-blue-500/20 shadow-2xl rounded-xl p-3 text-sm z-50 max-h-80 overflow-auto">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-extrabold theme-page-title">Alerts</p>
                  {loadingNotifs && <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />}
                </div>
                <ul className="space-y-1">
                  {notifications.length > 0 ? (
                    notifications.map((n) => (
                      <li
                        key={n.id}
                        className={`flex justify-between items-start p-2.5 rounded-xl hover:bg-blue-500/5 ${
                          !n.read ? "bg-blue-500/10 border-l-2 border-blue-500" : "theme-card-inner"
                        }`}
                      >
                        <div onClick={() => handleNotiClick(n)} className="flex-1 cursor-pointer min-w-0">
                          <p className="font-bold theme-page-title text-sm truncate">{n.title}</p>
                          {n.body && <p className="text-xs theme-page-muted mt-0.5 line-clamp-2">{n.body}</p>}
                          {(n.type === "fraud" || n.type === "security") && (
                            <span className="inline-block mt-1 theme-badge theme-badge-danger text-[10px]">Security</span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteNoti(n.id)}
                          className="ml-2 text-red-400 hover:text-red-300 p-1 shrink-0"
                        >
                          <Trash2 size={14} />
                        </button>
                      </li>
                    ))
                  ) : (
                    <li className="theme-page-muted text-center py-6 text-sm">No alerts</li>
                  )}
                </ul>
              </div>
            )}
          </div>

          <div className="relative" ref={profileRef}>
            <button
              type="button"
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white flex items-center justify-center font-extrabold text-sm hover:ring-2 hover:ring-blue-400/50 transition shadow-lg shadow-blue-500/20"
            >
              {initials}
            </button>

            {showProfileMenu && (
              <div className="absolute right-0 mt-2 w-56 theme-glass border border-blue-500/20 shadow-2xl rounded-xl py-1 text-sm z-50">
                <div className="px-4 py-3 border-b border-white/10">
                  <p className="font-extrabold theme-page-title truncate">{displayName}</p>
                  <p className="text-xs theme-page-muted mt-0.5 truncate">{user?.email}</p>
                  <p className="text-xs font-bold text-blue-400 mt-1">{roleLabel}</p>
                  {!isSuperAdmin && assignedShopName && (
                    <p className="text-xs theme-page-muted mt-1 flex items-center gap-1 truncate">
                      <Store className="w-3 h-3 shrink-0" /> {assignedShopName}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-red-400 hover:bg-red-500/10 transition font-semibold"
                  onClick={() => {
                    setShowProfileMenu(false);
                    onLogout?.();
                  }}
                >
                  <LogOut size={16} />
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
