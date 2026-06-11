import { collection, collectionGroup, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { KNOWN_SHOP_NAMES } from "../constants/shops";

/** Extract shop id from paths like shops/{shopId}/categories/{catId} */
export function shopIdFromDocRef(docRef) {
  if (!docRef?.path) return null;
  const parts = docRef.path.split("/");
  const idx = parts.indexOf("shops");
  if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  return null;
}

/** One collectionGroup read — all categories with shopId (Spark-friendly vs N shop loops). */
export async function loadAllCategoriesWithShop(shopNameMap = {}) {
  const byId = new Map();

  try {
    const snap = await getDocs(collectionGroup(db, "categories"));
    snap.docs.forEach((d) => {
      const shopId = shopIdFromDocRef(d.ref) || d.data().shopId || null;
      byId.set(d.id, {
        id: d.id,
        ...d.data(),
        shopId,
        shopName: shopNameMap[shopId] || KNOWN_SHOP_NAMES[shopId] || d.data().shopName || "",
      });
    });
  } catch (err) {
    console.warn("collectionGroup categories failed:", err.message);
  }

  if (byId.size === 0 && Object.keys(shopNameMap).length > 0) {
    for (const shopId of Object.keys(shopNameMap)) {
      const list = await loadShopCategories(shopId);
      list.forEach((c) => {
        byId.set(c.id, {
          ...c,
          shopId: c.shopId || shopId,
          shopName: shopNameMap[shopId] || KNOWN_SHOP_NAMES[shopId] || "",
        });
      });
    }
  }

  if (byId.size === 0) {
    try {
      const topSnap = await getDocs(collection(db, "categories"));
      topSnap.docs.forEach((d) => {
        byId.set(d.id, { id: d.id, ...d.data(), shopId: d.data().shopId || null });
      });
    } catch (err) {
      console.warn("Top-level categories load failed:", err.message);
    }
  }

  return Array.from(byId.values());
}

export function buildCategoryShopMap(categories) {
  const map = {};
  (Array.isArray(categories) ? categories : Object.values(categories)).forEach((c) => {
    if (c?.id && c?.shopId) map[c.id] = c.shopId;
  });
  return map;
}

/** Resolve shopId on products missing it — uses category / subcategory id. */
export function enrichProductsWithShop(products, categoryShopMap) {
  if (!categoryShopMap || !Object.keys(categoryShopMap).length) return products;
  return products.map((p) => {
    if (p.shopId) return p;
    const resolved =
      categoryShopMap[p.category] ||
      categoryShopMap[p.subcategory] ||
      null;
    if (!resolved) return p;
    return { ...p, shopId: resolved, shopInferred: true };
  });
}

/**
 * Load categories for a shop — subcollection first, then top-level fallback.
 */
export async function loadShopCategories(shopId) {
  if (!shopId) return [];

  const map = new Map();

  try {
    const subSnap = await getDocs(collection(db, "shops", shopId, "categories"));
    subSnap.docs.forEach((d) =>
      map.set(d.id, { id: d.id, ...d.data(), shopId: shopIdFromDocRef(d.ref) || shopId })
    );
  } catch (err) {
    console.warn("Subcollection categories load failed:", err.message);
  }

  if (map.size === 0) {
    try {
      const topSnap = await getDocs(
        query(collection(db, "categories"), where("shopId", "==", shopId))
      );
      topSnap.docs.forEach((d) => map.set(d.id, { id: d.id, ...d.data() }));
    } catch (err) {
      console.warn("Top-level categories load failed:", err.message);
    }
  }

  return Array.from(map.values());
}

export function getMainCategories(categories) {
  return categories.filter((c) => !c.parentId);
}

export function getSubcategories(categories, parentId) {
  return categories.filter((c) => c.parentId === parentId);
}
