// src/utils/activityLogger.js
// ✅ Utility to log user actions to Firestore activityLogs collection
// Used by: AuthContext (login), AddProduct, AddCategory, ShopUserManager

import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

/**
 * Log an activity to Firestore
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.userEmail
 * @param {string} params.userRole   - "SUPER_ADMIN" | "STAFF"
 * @param {string} params.action     - "LOGIN" | "PRODUCT_ADD" | "CATEGORY_ADD" | "INVOICE_CREATE" | "UPDATE" | "DELETE" | "USER_CREATE" | "USER_DELETE"
 * @param {string} [params.entityId]
 * @param {string} [params.entityName]
 * @param {string} [params.shopId]
 * @param {string} [params.shopName]
 * @param {string} [params.device]
 * @param {object} [params.details]
 */
export async function logActivity({
  userId,
  userEmail,
  userRole,
  action,
  entityId = "",
  entityName = "",
  shopId = "",
  shopName = "",
  device = "Web Admin Panel",
  details = {},
}) {
  try {
    await addDoc(collection(db, "activityLogs"), {
      userId,
      userEmail,
      userRole,
      action,
      entityId,
      entityName,
      shopId,
      shopName,
      device,
      details,
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    // Non-critical — log to console but don't throw
    console.warn("⚠️ Activity log failed (non-critical):", err.message);
  }
}

/** Predefined action constants */
export const ACTIONS = {
  LOGIN:          "LOGIN",
  LOGOUT:         "LOGOUT",
  PRODUCT_ADD:    "PRODUCT_ADD",
  PRODUCT_UPDATE: "PRODUCT_UPDATE",
  PRODUCT_DELETE: "PRODUCT_DELETE",
  CATEGORY_ADD:   "CATEGORY_ADD",
  CATEGORY_UPDATE:"CATEGORY_UPDATE",
  CATEGORY_DELETE:"CATEGORY_DELETE",
  INVOICE_CREATE: "INVOICE_CREATE",
  USER_CREATE:    "USER_CREATE",
  USER_DELETE:    "USER_DELETE",
  USER_SUSPEND:   "USER_SUSPEND",
  USER_ACTIVATE:  "USER_ACTIVATE",
  SHOP_CREATE:    "SHOP_CREATE",
  SHOP_DELETE:    "SHOP_DELETE",
};
