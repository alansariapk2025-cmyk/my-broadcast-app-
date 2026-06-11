import {
  collection,
  collectionGroup,
  doc,
  getDocs,
  query,
  setDoc,
  writeBatch,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { PRIMARY_SHOP_ID, PRIMARY_SHOP_NAME } from "../constants/shops";
import { shopIdFromDocRef } from "./categoryLoader";

const BATCH_SIZE = 400;

async function commitUpdates(updates) {
  let done = 0;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    updates.slice(i, i + BATCH_SIZE).forEach(({ ref, data }) => batch.update(ref, data));
    await batch.commit();
    done += Math.min(BATCH_SIZE, updates.length - i);
  }
  return done;
}

/**
 * Full sync: shops doc + products shopName + category shopName + staff assignedShopName.
 * Uses client Firestore (Super Admin rules). Spark-friendly: run manually only.
 */
export async function repairPrimaryShopFull() {
  await setDoc(
    doc(db, "shops", PRIMARY_SHOP_ID),
    {
      name: PRIMARY_SHOP_NAME,
      status: "active",
      isDefault: false,
      restoredAt: serverTimestamp(),
      restoredBy: "admin-panel-client",
    },
    { merge: true }
  );

  const catToShop = {};
  const categoryUpdates = [];
  const catSnap = await getDocs(collectionGroup(db, "categories"));

  catSnap.forEach((d) => {
    const sid = shopIdFromDocRef(d.ref) || d.data().shopId;
    catToShop[d.id] = sid;
    if (sid === PRIMARY_SHOP_ID) {
      const data = d.data();
      if (data.shopName !== PRIMARY_SHOP_NAME || data.shopId !== PRIMARY_SHOP_ID) {
        categoryUpdates.push({
          ref: d.ref,
          data: {
            shopId: PRIMARY_SHOP_ID,
            shopName: PRIMARY_SHOP_NAME,
            updatedAt: serverTimestamp(),
          },
        });
      }
    }
  });

  const productsSnap = await getDocs(collection(db, "products"));
  const productUpdates = [];
  const seenProducts = new Set();

  productsSnap.forEach((d) => {
    const p = d.data();
    const fromCat = catToShop[p.category] || catToShop[p.subcategory];
    const belongs = p.shopId === PRIMARY_SHOP_ID || fromCat === PRIMARY_SHOP_ID;
    if (!belongs || seenProducts.has(d.id)) return;
    if (p.shopId === PRIMARY_SHOP_ID && p.shopName === PRIMARY_SHOP_NAME) return;

    seenProducts.add(d.id);
    productUpdates.push({
      ref: d.ref,
      data: {
        shopId: PRIMARY_SHOP_ID,
        shopName: PRIMARY_SHOP_NAME,
        updatedAt: serverTimestamp(),
      },
    });
  });

  let usersUpdated = 0;
  try {
    const usersSnap = await getDocs(
      query(collection(db, "users"), where("assignedShopId", "==", PRIMARY_SHOP_ID))
    );
    const userUpdates = [];
    usersSnap.forEach((d) => {
      if (d.data().assignedShopName !== PRIMARY_SHOP_NAME) {
        userUpdates.push({
          ref: d.ref,
          data: {
            assignedShopName: PRIMARY_SHOP_NAME,
            updatedAt: serverTimestamp(),
          },
        });
      }
    });
    usersUpdated = await commitUpdates(userUpdates);
  } catch {
    /* index may be missing — skip users */
  }

  const categoriesUpdated = await commitUpdates(categoryUpdates);
  const productsUpdated = await commitUpdates(productUpdates);

  return {
    shopId: PRIMARY_SHOP_ID,
    shopName: PRIMARY_SHOP_NAME,
    categoriesUpdated,
    productsUpdated,
    usersUpdated,
  };
}

/** Ensure shop document exists (single write). */
export async function ensurePrimaryShopDoc() {
  await setDoc(
    doc(db, "shops", PRIMARY_SHOP_ID),
    { name: PRIMARY_SHOP_NAME, status: "active", updatedAt: serverTimestamp() },
    { merge: true }
  );
}
