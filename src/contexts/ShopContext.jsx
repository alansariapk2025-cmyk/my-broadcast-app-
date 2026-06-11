import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "./AuthContext";
import { ALL_SHOPS } from "../utils/shopUtils";
import { KNOWN_SHOP_NAMES, PRIMARY_SHOP_ID, PRIMARY_SHOP_NAME } from "../constants/shops";

const ShopContext = createContext(null);

export function ShopProvider({ children }) {
  const { isSuperAdmin, assignedShopId, assignedShopName } = useAuth();
  const [shops, setShops] = useState([]);
  const [shopsLoading, setShopsLoading] = useState(true);
  const [selectedShopId, setSelectedShopId] = useState(ALL_SHOPS);

  const loadShops = useCallback(async () => {
    setShopsLoading(true);
    try {
      const snap = await getDocs(collection(db, "shops"));
      let list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (!list.some((s) => s.id === PRIMARY_SHOP_ID)) {
        list = [{ id: PRIMARY_SHOP_ID, name: PRIMARY_SHOP_NAME, status: "active", _virtual: true }, ...list];
      }
      setShops(list);
    } catch (err) {
      console.error("Failed to load shops:", err);
    } finally {
      setShopsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadShops();
  }, [loadShops]);

  useEffect(() => {
    if (!isSuperAdmin && assignedShopId) {
      setSelectedShopId(assignedShopId);
    }
  }, [isSuperAdmin, assignedShopId]);

  const activeShop = useMemo(() => {
    if (isSuperAdmin) {
      if (!selectedShopId || selectedShopId === ALL_SHOPS) return null;
      return shops.find((s) => s.id === selectedShopId) || null;
    }
    return shops.find((s) => s.id === assignedShopId) || { id: assignedShopId, name: assignedShopName };
  }, [isSuperAdmin, selectedShopId, shops, assignedShopId, assignedShopName]);

  const effectiveShopId = useMemo(() => {
    if (isSuperAdmin) {
      return selectedShopId !== ALL_SHOPS ? selectedShopId : null;
    }
    return assignedShopId || null;
  }, [isSuperAdmin, selectedShopId, assignedShopId]);

  const displayShopName = useMemo(() => {
    if (isSuperAdmin && selectedShopId === ALL_SHOPS) return "All Shops";
    return activeShop?.name || assignedShopName || KNOWN_SHOP_NAMES[PRIMARY_SHOP_ID] || "Shop";
  }, [isSuperAdmin, selectedShopId, activeShop, assignedShopName]);

  const displayShopLogo = activeShop?.logo || activeShop?.logoUrl || null;

  const viewingAllShops = isSuperAdmin && selectedShopId === ALL_SHOPS;

  return (
    <ShopContext.Provider
      value={{
        shops,
        shopsLoading,
        selectedShopId,
        setSelectedShopId,
        effectiveShopId,
        activeShop,
        displayShopName,
        displayShopLogo,
        viewingAllShops,
        refreshShops: loadShops,
        ALL_SHOPS,
      }}
    >
      {children}
    </ShopContext.Provider>
  );
}

export function useShop() {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error("useShop must be used within ShopProvider");
  return ctx;
}
