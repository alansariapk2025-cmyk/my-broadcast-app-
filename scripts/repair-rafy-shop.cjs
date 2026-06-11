/**
 * Restore deleted shop doc + sync shopId/shopName on products & staff users.
 * Run: node scripts/repair-rafy-shop.cjs
 */
const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

const SHOP_ID = process.env.REPAIR_SHOP_ID || "xKUNJfO0kSZK4yCEhh8s";
const SHOP_NAME = process.env.REPAIR_SHOP_NAME || "RAFY ANSARI SHOP";

const keyPath = path.join(__dirname, "..", "serviceAccountKey.json");
if (!fs.existsSync(keyPath)) {
  console.error("❌ serviceAccountKey.json not found at:", keyPath);
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
const db = admin.firestore();

function shopIdFromPath(ref) {
  const parts = ref.path.split("/");
  const i = parts.indexOf("shops");
  return i >= 0 ? parts[i + 1] : null;
}

async function commitBatches(updates) {
  const BATCH = 400;
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = db.batch();
    updates.slice(i, i + BATCH).forEach(({ ref, data }) => batch.update(ref, data));
    await batch.commit();
    console.log(`  ✅ Updated ${Math.min(i + BATCH, updates.length)}/${updates.length}`);
  }
}

async function repair() {
  console.log("\n🔧 Repair shop:", SHOP_NAME, `(${SHOP_ID})\n`);

  // 1) Restore shop document (categories subcollection may still exist)
  await db.collection("shops").doc(SHOP_ID).set(
    {
      name: SHOP_NAME,
      status: "active",
      isDefault: false,
      restoredAt: admin.firestore.FieldValue.serverTimestamp(),
      restoredBy: "repair-rafy-shop-script",
    },
    { merge: true }
  );
  console.log("✅ Shop document restored/updated in shops/", SHOP_ID);

  // 2) Category → shop map
  const catToShop = {};
  const catSnap = await db.collectionGroup("categories").get();
  catSnap.forEach((d) => {
    catToShop[d.id] = shopIdFromPath(d.ref) || d.data().shopId;
  });
  console.log(`📂 Categories indexed: ${Object.keys(catToShop).length}`);

  // 3) Products — set shopId + shopName
  const productsSnap = await db.collection("products").get();
  const productUpdates = [];

  productsSnap.forEach((docSnap) => {
    const p = docSnap.data();
    const fromCat = catToShop[p.category] || catToShop[p.subcategory];
    const sid = p.shopId || fromCat;

    const shouldUsePrimary =
      sid === SHOP_ID ||
      fromCat === SHOP_ID ||
      (!p.shopId && fromCat === SHOP_ID) ||
      (p.shopId === SHOP_ID && p.shopName !== SHOP_NAME) ||
      (fromCat === SHOP_ID && (!p.shopId || p.shopName !== SHOP_NAME));

    if (!shouldUsePrimary && p.shopId !== SHOP_ID) return;

    const targetId = sid === SHOP_ID || fromCat === SHOP_ID ? SHOP_ID : p.shopId;
    if (targetId !== SHOP_ID) return;

    if (p.shopId !== SHOP_ID || p.shopName !== SHOP_NAME) {
      productUpdates.push({
        ref: docSnap.ref,
        data: {
          shopId: SHOP_ID,
          shopName: SHOP_NAME,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      });
    }
  });

  // Also fix products whose category belongs to primary shop but shopId missing
  productsSnap.forEach((docSnap) => {
    const p = docSnap.data();
    if (productUpdates.some((u) => u.ref.id === docSnap.id)) return;
    const fromCat = catToShop[p.category] || catToShop[p.subcategory];
    if (fromCat !== SHOP_ID) return;
    if (p.shopId === SHOP_ID && p.shopName === SHOP_NAME) return;
    productUpdates.push({
      ref: docSnap.ref,
      data: {
        shopId: SHOP_ID,
        shopName: SHOP_NAME,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    });
  });

  console.log(`📦 Products to update: ${productUpdates.length}`);
  if (productUpdates.length) await commitBatches(productUpdates);

  // 4) Staff users assigned to this shop
  const usersSnap = await db.collection("users").where("assignedShopId", "==", SHOP_ID).get();
  const userUpdates = [];
  usersSnap.forEach((d) => {
    if (d.data().assignedShopName !== SHOP_NAME) {
      userUpdates.push({
        ref: d.ref,
        data: {
          assignedShopName: SHOP_NAME,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      });
    }
  });
  console.log(`👤 Staff users to update: ${userUpdates.length}`);
  if (userUpdates.length) await commitBatches(userUpdates);

  console.log("\n✅ Repair complete!\n");
  process.exit(0);
}

repair().catch((err) => {
  console.error("❌ Repair failed:", err);
  process.exit(1);
});
