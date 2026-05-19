// scripts/migrate-shopid.cjs
// ✅ ONE-TIME migration script
// Run: node scripts/migrate-shopid.cjs
//
// What it does:
//   1. Creates "default_shop" in shops/ if it doesn't exist
//   2. Assigns shopId: "default_shop" to all products that have no shopId
//   3. NO data is deleted or modified beyond adding the shopId field
//
// SAFE to run multiple times — idempotent.

const admin = require('firebase-admin');
const path  = require('path');
const fs    = require('fs');

// ── Load service account ──────────────────────────────────────────
const keyPath = path.join(__dirname, '..', 'serviceAccountKey.json');
if (!fs.existsSync(keyPath)) {
  console.error('❌ serviceAccountKey.json not found at:', keyPath);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(keyPath)),
});

const db = admin.firestore();

async function migrate() {
  console.log('\n' + '='.repeat(60));
  console.log('🔄 Multi-Shop POS — ShopId Migration Script');
  console.log('='.repeat(60));
  console.log('ℹ️  This script is SAFE and ADDITIVE — no data will be deleted.\n');

  // ──────────────────────────────────────────────────────────────
  // Step 1: Ensure default_shop exists
  // ──────────────────────────────────────────────────────────────
  console.log('📌 Step 1: Checking default_shop...');
  const defaultShopRef = db.collection('shops').doc('default_shop');
  const defaultShop    = await defaultShopRef.get();

  if (!defaultShop.exists) {
    await defaultShopRef.set({
      name:      'Default Shop',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      isActive:  true,
      createdBy: 'migration_script',
    });
    console.log('  ✅ Created: shops/default_shop');
  } else {
    console.log('  ✅ Already exists: shops/default_shop →', defaultShop.data().name);
  }

  // ──────────────────────────────────────────────────────────────
  // Step 2: Migrate products missing shopId
  // ──────────────────────────────────────────────────────────────
  console.log('\n📌 Step 2: Migrating products without shopId...');
  const productsSnap = await db.collection('products').get();
  console.log(`  Found ${productsSnap.size} total products.`);

  const toMigrate = productsSnap.docs.filter((d) => !d.data().shopId);
  console.log(`  Products missing shopId: ${toMigrate.length}`);

  if (toMigrate.length === 0) {
    console.log('  ✅ All products already have shopId — nothing to do.');
  } else {
    // Batch update (max 500 per batch)
    const BATCH_SIZE = 400;
    let totalMigrated = 0;

    for (let i = 0; i < toMigrate.length; i += BATCH_SIZE) {
      const chunk = toMigrate.slice(i, i + BATCH_SIZE);
      const batch = db.batch();

      chunk.forEach((d) => {
        batch.update(d.ref, { shopId: 'default_shop' });
      });

      await batch.commit();
      totalMigrated += chunk.length;
      console.log(`  ✅ Migrated batch: ${totalMigrated}/${toMigrate.length}`);
    }

    console.log(`  ✅ Done — ${totalMigrated} products now have shopId: "default_shop"`);
  }

  // ──────────────────────────────────────────────────────────────
  // Step 3: Categories (already shop-scoped as subcollections)
  // ──────────────────────────────────────────────────────────────
  console.log('\n📌 Step 3: Categories...');
  console.log('  ✅ Categories are already shop-scoped (shops/{shopId}/categories subcollection).');
  console.log('     No migration needed.');

  // ──────────────────────────────────────────────────────────────
  // Step 4: Summary
  // ──────────────────────────────────────────────────────────────
  const verifySnap = await db.collection('products')
    .where('shopId', '==', 'default_shop')
    .get();

  console.log('\n' + '='.repeat(60));
  console.log('📊 Migration Summary');
  console.log('='.repeat(60));
  console.log(`  Total products:              ${productsSnap.size}`);
  console.log(`  Products migrated:           ${toMigrate.length}`);
  console.log(`  Products with default_shop:  ${verifySnap.size}`);
  console.log(`  Data loss:                   NONE`);
  console.log('\n✅ Migration complete! Safe to run again anytime.');
  console.log('='.repeat(60) + '\n');

  process.exit(0);
}

migrate().catch((err) => {
  console.error('\n❌ Migration failed:', err.message);
  console.error(err);
  process.exit(1);
});
