/**
 * AuthContext — Super Admin + Staff with custom permissions.
 */

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { logActivity } from "../utils/activityLogger";
import {
  DEFAULT_STAFF_PERMISSIONS,
  SUPER_ADMIN_PERMISSIONS,
} from "../constants/permissions";

export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  STAFF: "STAFF",
};

export const PERMISSIONS = {
  SUPER_ADMIN: SUPER_ADMIN_PERMISSIONS,
  STAFF: DEFAULT_STAFF_PERMISSIONS,
};

const AuthContext = createContext(null);

function normalizeRole(role) {
  if (role === ROLES.SUPER_ADMIN) return ROLES.SUPER_ADMIN;
  return ROLES.STAFF;
}

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
          console.warn("Token refresh failed:", tokenError.message);
        }

        setCurrentUser(firebaseUser);

        const adminDoc = await getDoc(doc(db, "admins", firebaseUser.uid));
        if (adminDoc.exists()) {
          const adminData = adminDoc.data();
          const normalizedRole = String(adminData?.role || "").toLowerCase();
          if (normalizedRole === "admin" || normalizedRole === "superadmin") {
            applyLegacyAdmin(firebaseUser, adminData);
            logLogin(firebaseUser, { role: ROLES.SUPER_ADMIN });
            setAuthLoading(false);
            return;
          }
        }

        const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          if (userData?.status === "suspended" || userData?.status === "disabled") {
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
        console.error("AuthContext error:", error);
        setAuthError("Unable to verify account. Please try again later.");
        resetAuthState();
      }

      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const applyLegacyAdmin = (firebaseUser, adminData) => {
    setUserRole(ROLES.SUPER_ADMIN);
    setUserName(adminData?.fullName || firebaseUser.displayName || firebaseUser.email || "Super Admin");
    setAssignedShopId(null);
    setAssignedShopName(null);
    setUserStatus("active");
    setPermissions(SUPER_ADMIN_PERMISSIONS);
  };

  const applyRBACUser = (firebaseUser, userData) => {
    const role = normalizeRole(userData?.role);
    setUserRole(role);
    setUserName(userData?.name || firebaseUser.displayName || firebaseUser.email || "Staff");
    setUserStatus(userData?.status || "active");
    setAssignedShopId(userData?.assignedShopId || null);
    setAssignedShopName(userData?.assignedShopName || null);

    if (role === ROLES.SUPER_ADMIN) {
      setPermissions(SUPER_ADMIN_PERMISSIONS);
    } else if (Array.isArray(userData?.permissions) && userData.permissions.length > 0) {
      setPermissions(userData.permissions);
    } else {
      setPermissions(DEFAULT_STAFF_PERMISSIONS);
    }
  };

  const logLogin = async (firebaseUser, meta) => {
    logActivity({
      userId: firebaseUser.uid,
      userEmail: firebaseUser.email,
      userRole: meta.role || ROLES.STAFF,
      action: "LOGIN",
      shopId: meta.assignedShopId || "",
      shopName: meta.assignedShopName || "",
      device: "Web Admin Panel",
    }).catch((error) => console.warn("Login activity failed:", error.message));
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
  const isSuperAdmin = userRole === ROLES.SUPER_ADMIN;
  const isStaff = userRole === ROLES.STAFF;
  const roleLabel = isSuperAdmin ? "Super Admin" : "Staff";

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userRole,
        roleLabel,
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
            console.warn("Sign out failed:", error.message);
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
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
