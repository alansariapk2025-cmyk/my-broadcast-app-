/**
 * AuthContext.jsx
 * Firebase Authentication provider for legacy and RBAC users.
 * Detects role from admins/ or users/ collections, refreshes tokens,
 * and signs out suspended accounts automatically.
 */

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { logActivity } from "../utils/activityLogger";

export const PERMISSIONS = {
  SUPER_ADMIN: [
    "dashboard",
    "users",
    "shops",
    "products",
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
    "adminUsers",
    "staffUsers",
    "activityLogs",
  ],
  STAFF: ["staffDashboard", "product", "productList", "category"],
};

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [assignedShopId, setAssignedShopId] = useState(null);
  const [assignedShopName, setAssignedShopName] = useState(null);
  const [userStatus, setUserStatus] = useState(null);
  const [userName, setUserName] = useState("");
  const [permissions, setPermissions] = useState([]);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setAuthLoading(true);
      setAuthError("");

      if (!firebaseUser) {
        resetAuthState();
        setAuthLoading(false);
        return;
      }

      try {
        try {
          await firebaseUser.getIdToken(true);
        } catch (tokenError) {
          console.warn("âš ï¸ Token refresh failed:", tokenError.message);
        }

        setCurrentUser(firebaseUser);

        const adminDoc = await getDoc(doc(db, "admins", firebaseUser.uid));
        if (adminDoc.exists()) {
          const adminData = adminDoc.data();
          const normalizedRole = String(adminData?.role || "").toLowerCase();
          if (normalizedRole === "admin" || normalizedRole === "superadmin") {
            applyLegacyAdmin(firebaseUser, adminData);
            logLogin(firebaseUser, { role: "SUPER_ADMIN" });
            setAuthLoading(false);
            return;
          }
        }

        const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          if (userData?.status === "suspended") {
            setAuthError("Your account has been suspended. Contact the super admin.");
            await firebaseSignOut(auth);
            resetAuthState();
            setAuthLoading(false);
            return;
          }

          applyRBACUser(firebaseUser, userData);
          logLogin(firebaseUser, {
            role: userData.role,
            assignedShopId: userData.assignedShopId || null,
            assignedShopName: userData.assignedShopName || null,
          });
          setAuthLoading(false);
          return;
        }

        setAuthError("This account is not authorized to access the admin panel.");
        await firebaseSignOut(auth);
        resetAuthState();
      } catch (error) {
        console.error("ðŸ”¥ AuthContext error:", error);
        setAuthError("Unable to verify account. Please try again later.");
        resetAuthState();
      }

      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const applyLegacyAdmin = (firebaseUser, adminData) => {
    setUserRole("SUPER_ADMIN");
    setUserName(adminData?.fullName || firebaseUser.displayName || firebaseUser.email || "Super Admin");
    setAssignedShopId(null);
    setAssignedShopName(null);
    setUserStatus("active");
    setPermissions(PERMISSIONS.SUPER_ADMIN);
  };

  const applyRBACUser = (firebaseUser, userData) => {
    const role = userData?.role || "STAFF";
    setUserRole(role);
    setUserName(userData?.name || firebaseUser.displayName || firebaseUser.email || "Staff");
    setUserStatus(userData?.status || "active");
    setAssignedShopId(userData?.assignedShopId || null);
    setAssignedShopName(userData?.assignedShopName || null);
    setPermissions(role === "SUPER_ADMIN" ? PERMISSIONS.SUPER_ADMIN : PERMISSIONS.STAFF);
  };

  const logLogin = async (firebaseUser, meta) => {
    logActivity({
      userId: firebaseUser.uid,
      userEmail: firebaseUser.email,
      userRole: meta.role || "STAFF",
      action: "LOGIN",
      shopId: meta.assignedShopId || "",
      shopName: meta.assignedShopName || "",
      device: "Web Admin Panel",
    }).catch((error) => console.warn("âš ï¸ Login activity failed:", error.message));
  };

  const resetAuthState = () => {
    setCurrentUser(null);
    setUserRole(null);
    setAssignedShopId(null);
    setAssignedShopName(null);
    setUserStatus(null);
    setUserName("");
    setPermissions([]);
  };

  const hasPermission = (tabId) => permissions.includes(tabId);
  const isSuperAdmin = userRole === "SUPER_ADMIN";
  const isStaff = userRole === "STAFF";

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userRole,
        assignedShopId,
        assignedShopName,
        userStatus,
        userName,
        permissions,
        hasPermission,
        isSuperAdmin,
        isStaff,
        authLoading,
        authError,
        signOut: async () => {
          try {
            await firebaseSignOut(auth);
          } catch (error) {
            console.warn("âš ï¸ Sign out failed:", error.message);
          }
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
