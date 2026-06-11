/**
 * Shop-scoped data helpers for multi-tenant Firestore queries.
 */

export const ALL_SHOPS = "all";

export function filterByShop(items, shopId, field = "shopId") {
  if (!shopId || shopId === ALL_SHOPS) return items;
  return items.filter((item) => item[field] === shopId);
}

export function getEffectiveShopId({ isSuperAdmin, selectedShopId, assignedShopId }) {
  if (isSuperAdmin) {
    return selectedShopId && selectedShopId !== ALL_SHOPS ? selectedShopId : null;
  }
  return assignedShopId || null;
}

export function shopQueryLabel(isSuperAdmin, selectedShopId, assignedShopName) {
  if (!isSuperAdmin) return assignedShopName || "My Shop";
  if (!selectedShopId || selectedShopId === ALL_SHOPS) return "All Shops";
  return assignedShopName || "Selected Shop";
}
