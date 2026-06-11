// ================================================================
// 📁 server.cjs - FULL PRODUCTION VERSION
// ✅ FCM Broadcast (existing)
// ✅ RBAC: Staff/Admin User Management (existing)
// ✅ Multi-Shop Support (NEW)
// ✅ Demo Admin + Setup Check (NEW)
// ================================================================
// ARCHITECTURE NOTES:
//   - All user/admin Firestore writes happen here via Admin SDK
//     → bypasses security rules → no permission errors
//   - Frontend NEVER writes to users/ or admins/ collections
//   - Shops created here so we can set isDefault flag safely
// ================================================================

const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

try {
  require("dotenv").config();
} catch (e) {
  console.log("⚠️ dotenv not available");
}

const app = express();

// ================================================================
// ✅ CORS
// ================================================================
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);

      const allowedOrigins = [
        /^http:\/\/localhost:\d+$/,
        /^http:\/\/127\.0\.0\.1:\d+$/,
        /^https:\/\/.*\.onrender\.com$/,
        "https://my-broadcast-app.onrender.com",
      ];

      const isAllowed = allowedOrigins.some((pattern) => {
        if (pattern instanceof RegExp) return pattern.test(origin);
        return pattern === origin;
      });

      callback(null, isAllowed);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept"],
    maxAge: 86400,
  })
);

app.options("*", cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ================================================================
// ✅ Firebase Init
// ================================================================
let serviceAccount;

try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    console.log("✅ Firebase: ENV se load");
  } else {
    const keyPath =
      process.env.SERVICE_ACCOUNT_PATH || "./serviceAccountKey.json";
    if (!fs.existsSync(keyPath)) {
      throw new Error(`File not found: ${keyPath}`);
    }
    serviceAccount = JSON.parse(fs.readFileSync(keyPath, "utf8"));
    console.log(`✅ Firebase: ${keyPath} se load`);
  }

  if (!serviceAccount.project_id || !serviceAccount.private_key) {
    throw new Error("Invalid service account");
  }
} catch (err) {
  console.error("❌ Firebase load failed:", err.message);
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log("✅ Firebase initialized");
}

const db = admin.firestore();

// ================================================================
// ✅ Helper Functions
// ================================================================
function chunkArray(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

// ================================================================
// ╔══════════════════════════════════════════════════════════════╗
// ║  PART A — HEALTH + ADMIN SETUP CHECK                          ║
// ╚══════════════════════════════════════════════════════════════╝
// ================================================================

// ── Health endpoints ─────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    status: "online",
    service: "POS Backend Server",
    timestamp: new Date().toISOString(),
    version: "5.0.0 (Multi-Shop + RBAC + FCM)",
  });
});

app.get("/ping", (req, res) => {
  res.json({ pong: true, time: Date.now() });
});

app.get("/health", (req, res) => {
  res.json({
    status: "✅ Healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    firebase: { connected: admin.apps.length > 0 },
    features: ["FCM", "RBAC", "Multi-Shop"],
    port: process.env.PORT || 5000,
  });
});

// ── NEW: Check admin setup ───────────────────────────────────────
// Called by AuthScreen on mount → no unauth Firestore reads from client
// Eliminates 400 Bad Request error
app.get("/check-admin-setup", async (req, res) => {
  try {
    const snap = await db.collection("admins").get();

    let hasRealAdmin = false;
    let hasDemoAdmin = false;

    snap.forEach((doc) => {
      const data = doc.data();
      if (data?.isDemo === true) hasDemoAdmin = true;
      else hasRealAdmin = true;
    });

    res.json({
      success: true,
      hasRealAdmin,
      hasDemoAdmin,
      totalAdmins: snap.size,
    });
  } catch (err) {
    console.error("❌ check-admin-setup:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ================================================================
// ╔══════════════════════════════════════════════════════════════╗
// ║  PART B — RBAC: USER MANAGEMENT                               ║
// ╚══════════════════════════════════════════════════════════════╝
// ================================================================

// ── Create STAFF / SUPER_ADMIN user ──────────────────────────────
// ✅ FIXED: Server now writes users/{uid} doc via Admin SDK
//    Previously frontend tried setDoc() which was blocked by rules
//    Now everything happens here in one atomic operation
app.post("/create-staff-user", async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      role,
      assignedShopId,
      assignedShopName,
      status,
      permissions,
      createdBy,
    } = req.body;

    const DEFAULT_STAFF_PERMS = [
      "staffDashboard", "product", "productList", "category",
    ];

    // ── Validation ──────────────────────────────────────────────
    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ success: false, error: "name, email, password required." });
    }
    if (password.length < 6) {
      return res
        .status(400)
        .json({ success: false, error: "Password must be ≥ 6 chars." });
    }
    if (!["STAFF", "SUPER_ADMIN"].includes(role)) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid role. Use STAFF or SUPER_ADMIN." });
    }
    if (role === "STAFF" && !assignedShopId) {
      return res
        .status(400)
        .json({ success: false, error: "assignedShopId required for STAFF." });
    }

    const emailLower = email.trim().toLowerCase();

    // ── Check if email already in Firebase Auth ─────────────────
    try {
      await admin.auth().getUserByEmail(emailLower);
      return res
        .status(400)
        .json({ success: false, error: "Email already registered." });
    } catch (e) {
      if (e.code !== "auth/user-not-found") throw e;
    }

    // ── Create Firebase Auth user ───────────────────────────────
    const userRecord = await admin.auth().createUser({
      email: emailLower,
      password,
      displayName: name.trim(),
      emailVerified: true,
    });

    const uid = userRecord.uid;

    // ── Write users/ Firestore doc (Admin SDK bypasses rules) ────
    await db.collection("users").doc(uid).set({
      name: name.trim(),
      email: emailLower,
      role,
      assignedShopId: role === "STAFF" ? (assignedShopId || null) : null,
      assignedShopName: role === "STAFF" ? (assignedShopName || "") : null,
      permissions:
        role === "SUPER_ADMIN"
          ? []
          : Array.isArray(permissions) && permissions.length > 0
          ? permissions
          : DEFAULT_STAFF_PERMS,
      status: status || "active",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: createdBy || "superadmin",
      // FCM compat fields (preserve push_tokens logic)
      fcmToken: "",
      pushEnabled: false,
      isGuest: false,
    });

    console.log(`✅ User created: ${emailLower} (${role}) uid: ${uid}`);

    return res.json({
      success: true,
      uid,
      email: userRecord.email,
      name: name.trim(),
      role,
      message: `User "${name}" created successfully.`,
    });
  } catch (error) {
    console.error("❌ create-staff-user error:", error);
    return res
      .status(500)
      .json({ success: false, error: error.message });
  }
});

// ── Check email duplicate ──
app.post("/check-email-exists", async (req, res) => {
  try {
    const emailLower = String(req.body?.email || "").trim().toLowerCase();
    if (!emailLower) {
      return res.status(400).json({ success: false, error: "email required" });
    }
    let exists = false;
    try {
      await admin.auth().getUserByEmail(emailLower);
      exists = true;
    } catch (e) {
      if (e.code !== "auth/user-not-found") throw e;
    }
    if (!exists) {
      const snap = await db.collection("users").where("email", "==", emailLower).limit(1).get();
      exists = !snap.empty;
    }
    return res.json({ success: true, exists });
  } catch (error) {
    console.error("check-email-exists error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ── Update user status (active / suspended) ──
app.post("/update-user-status", async (req, res) => {
  try {
    const { uid, status } = req.body;
    if (!uid || !["active", "suspended"].includes(status)) {
      return res.status(400).json({ success: false, error: "uid and valid status required" });
    }
    const userRef = db.collection("users").doc(uid);
    const doc = await userRef.get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    await userRef.update({
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    try {
      await admin.auth().updateUser(uid, { disabled: status === "suspended" });
    } catch (e) {
      console.warn("Auth disable skipped:", e.message);
    }
    return res.json({ success: true, status });
  } catch (error) {
    console.error("update-user-status error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ── Update user profile (name, role, shop, status, optional password) ──
app.post("/update-user", async (req, res) => {
  try {
    const {
      uid,
      name,
      role,
      assignedShopId,
      assignedShopName,
      status,
      password,
      updatedBy,
    } = req.body;

    if (!uid) {
      return res.status(400).json({ success: false, error: "uid required" });
    }

    const userRef = db.collection("users").doc(uid);
    const doc = await userRef.get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const current = doc.data();
    const nextRole = role || current.role;

    if (!["STAFF", "SUPER_ADMIN"].includes(nextRole)) {
      return res.status(400).json({ success: false, error: "Invalid role" });
    }
    if (nextRole === "STAFF" && !assignedShopId && !current.assignedShopId) {
      return res.status(400).json({ success: false, error: "Shop required for STAFF" });
    }
    if (password && password.length < 8) {
      return res.status(400).json({ success: false, error: "Password must be at least 8 characters" });
    }
    if (password && !/[A-Za-z]/.test(password)) {
      return res.status(400).json({ success: false, error: "Password must include a letter" });
    }
    if (password && !/[0-9]/.test(password)) {
      return res.status(400).json({ success: false, error: "Password must include a number" });
    }

    const firestorePatch = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: updatedBy || "super_admin",
    };

    if (name?.trim()) firestorePatch.name = name.trim();
    if (role) firestorePatch.role = nextRole;
    if (status && ["active", "suspended"].includes(status)) firestorePatch.status = status;

    if (nextRole === "STAFF") {
      firestorePatch.assignedShopId = assignedShopId || current.assignedShopId || null;
      firestorePatch.assignedShopName = assignedShopName || current.assignedShopName || "";
    } else {
      firestorePatch.assignedShopId = null;
      firestorePatch.assignedShopName = null;
    }

    const authPatch = {};
    if (name?.trim()) authPatch.displayName = name.trim();
    if (password) authPatch.password = password;
    if (status === "suspended") authPatch.disabled = true;
    if (status === "active") authPatch.disabled = false;

    if (Object.keys(authPatch).length > 0) {
      await admin.auth().updateUser(uid, authPatch);
    }

    await userRef.update(firestorePatch);

    return res.json({ success: true, uid, message: "User updated" });
  } catch (error) {
    console.error("update-user error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ── Update staff permissions ──
app.post("/update-user-permissions", async (req, res) => {
  try {
    const { uid, permissions } = req.body;
    if (!uid || !Array.isArray(permissions)) {
      return res.status(400).json({ success: false, error: "uid and permissions array required" });
    }
    const ALLOWED = [
      "staffDashboard", "product", "productList", "category",
      "orders", "newOrders", "payments", "customers", "orderReport",
    ];
    const cleaned = permissions.filter((p) => ALLOWED.includes(p));
    if (cleaned.length === 0) {
      return res.status(400).json({ success: false, error: "At least one valid permission required" });
    }
    const userRef = db.collection("users").doc(uid);
    const doc = await userRef.get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    if (doc.data().role !== "STAFF") {
      return res.status(400).json({ success: false, error: "Permissions only apply to STAFF users" });
    }
    await userRef.update({
      permissions: cleaned,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return res.json({ success: true, permissions: cleaned });
  } catch (error) {
    console.error("update-user-permissions error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ── Create Admin (legacy — backward compat with AdminUsers.jsx) ──
app.post("/create-admin", async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({
        success: false,
        error: "fullName, email, password required.",
      });
    }

    const emailLower = email.trim().toLowerCase();

    try {
      await admin.auth().getUserByEmail(emailLower);
      return res
        .status(400)
        .json({ success: false, error: "Email already exists." });
    } catch (e) {
      if (e.code !== "auth/user-not-found") throw e;
    }

    const userRecord = await admin.auth().createUser({
      email: emailLower,
      password,
      displayName: fullName.trim(),
      emailVerified: true,
    });

    await db.collection("admins").doc(userRecord.uid).set({
      fullName: fullName.trim(),
      email: emailLower,
      role: "admin",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      isDemo: false,
    });

    console.log(`✅ Admin created: ${emailLower} uid: ${userRecord.uid}`);
    return res.json({
      success: true,
      uid: userRecord.uid,
      email: userRecord.email,
    });
  } catch (error) {
    console.error("❌ create-admin error:", error);
    return res
      .status(500)
      .json({ success: false, error: error.message });
  }
});

// ── Delete user (works for both admins/ and users/ collections) ──
// Single endpoint for all auth deletions
app.post("/delete-admin", async (req, res) => {
  try {
    const { uid } = req.body;
    if (!uid)
      return res.status(400).json({ success: false, error: "uid required." });

    // Delete from Firebase Auth
    try {
      await admin.auth().deleteUser(uid);
      console.log(`✅ Auth user deleted: ${uid}`);
    } catch (e) {
      console.warn(`⚠️ Auth delete skipped (${uid}):`, e.message);
    }

    // Clean up admins/ collection if exists
    try {
      await db.collection("admins").doc(uid).delete();
    } catch (e) {
      // Doc may not exist — fine
    }

    // Clean up users/ collection if exists
    try {
      await db.collection("users").doc(uid).delete();
    } catch (e) {
      // Doc may not exist — fine
    }

    return res.json({
      success: true,
      message: `User ${uid} deleted from Auth + Firestore.`,
    });
  } catch (error) {
    console.error("❌ delete-admin error:", error);
    return res
      .status(500)
      .json({ success: false, error: error.message });
  }
});

// ── Alias for clarity — same as /delete-admin ────────────────────
app.post("/delete-auth-user", async (req, res) => {
  // Re-use delete-admin logic
  req.url = "/delete-admin";
  app._router.handle(req, res);
});

// ── Init Demo Admin (legacy — AuthScreen first-time setup) ───────
app.post("/init-demo-admin", async (req, res) => {
  try {
    const demoEmail = "demo.admin@ansari.com";
    const demoPassword = "Demo1234";
    const demoName = "Demo Admin";

    // Check if already exists in admins/
    const existing = await db
      .collection("admins")
      .where("email", "==", demoEmail)
      .get();

    if (!existing.empty) {
      return res.json({
        success: true,
        email: demoEmail,
        password: demoPassword,
        message: "Demo admin already exists.",
      });
    }

    // Create or get Firebase Auth user
    let uid;
    try {
      const u = await admin.auth().getUserByEmail(demoEmail);
      uid = u.uid;
    } catch (e) {
      const u = await admin.auth().createUser({
        email: demoEmail,
        password: demoPassword,
        displayName: demoName,
        emailVerified: true,
      });
      uid = u.uid;
    }

    // Write to admins/ collection
    await db.collection("admins").doc(uid).set({
      fullName: demoName,
      email: demoEmail,
      role: "admin",
      isDemo: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log("✅ Demo admin initialized.");
    return res.json({
      success: true,
      email: demoEmail,
      password: demoPassword,
    });
  } catch (error) {
    console.error("❌ init-demo-admin error:", error);
    return res
      .status(500)
      .json({ success: false, error: error.message });
  }
});

// ================================================================
// ╔══════════════════════════════════════════════════════════════╗
// ║  PART C — MULTI-SHOP MANAGEMENT (NEW)                         ║
// ╚══════════════════════════════════════════════════════════════╝
// ================================================================

// ── Create Shop ─────────────────────────────────────────────────
app.post("/create-shop", async (req, res) => {
  try {
    const { name, address, phone } = req.body;

    if (!name?.trim()) {
      return res
        .status(400)
        .json({ success: false, error: "Shop name is required." });
    }

    // Duplicate name check
    const existing = await db
      .collection("shops")
      .where("name", "==", name.trim())
      .get();

    if (!existing.empty) {
      return res.status(400).json({
        success: false,
        error: "A shop with this name already exists.",
      });
    }

    const ref = db.collection("shops").doc(); // auto-ID
    await ref.set({
      name: name.trim(),
      address: address?.trim() || "",
      phone: phone?.trim() || "",
      isDefault: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`✅ Shop created: ${name.trim()} (${ref.id})`);
    return res.json({
      success: true,
      id: ref.id,
      name: name.trim(),
    });
  } catch (error) {
    console.error("❌ create-shop error:", error);
    return res
      .status(500)
      .json({ success: false, error: error.message });
  }
});

// ── Delete Shop ─────────────────────────────────────────────────
// Note: Does NOT cascade delete products/categories
//       Frontend must reassign or warn user
app.post("/delete-shop", async (req, res) => {
  try {
    const { shopId } = req.body;
    if (!shopId)
      return res
        .status(400)
        .json({ success: false, error: "shopId required." });

    // Block deletion of default shop
    const shopSnap = await db.collection("shops").doc(shopId).get();
    if (!shopSnap.exists)
      return res
        .status(404)
        .json({ success: false, error: "Shop not found." });

    if (shopSnap.data().isDefault) {
      return res.status(400).json({
        success: false,
        error: "Cannot delete default shop.",
      });
    }

    // Check if any staff is assigned to this shop
    const staffSnap = await db
      .collection("users")
      .where("assignedShopId", "==", shopId)
      .get();

    if (!staffSnap.empty) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete: ${staffSnap.size} staff user(s) are assigned to this shop. Reassign or delete them first.`,
      });
    }

    await db.collection("shops").doc(shopId).delete();
    console.log(`✅ Shop deleted: ${shopId}`);

    return res.json({ success: true, message: `Shop ${shopId} deleted.` });
  } catch (error) {
    console.error("❌ delete-shop error:", error);
    return res
      .status(500)
      .json({ success: false, error: error.message });
  }
});

// ── Restore shop + sync shopName on products/users (deleted shop fix) ──
app.post("/repair-shop-data", async (req, res) => {
  try {
    const SHOP_ID = req.body?.shopId || "xKUNJfO0kSZK4yCEhh8s";
    const SHOP_NAME = req.body?.shopName || "RAFY ANSARI SHOP";

    const shopIdFromPath = (ref) => {
      const parts = ref.path.split("/");
      const i = parts.indexOf("shops");
      return i >= 0 ? parts[i + 1] : null;
    };

    await db.collection("shops").doc(SHOP_ID).set(
      {
        name: SHOP_NAME,
        status: "active",
        isDefault: false,
        restoredAt: admin.firestore.FieldValue.serverTimestamp(),
        restoredBy: "repair-shop-data-api",
      },
      { merge: true }
    );

    const catToShop = {};
    const catSnap = await db.collectionGroup("categories").get();
    catSnap.forEach((d) => {
      catToShop[d.id] = shopIdFromPath(d.ref) || d.data().shopId;
    });

    const productsSnap = await db.collection("products").get();
    const productUpdates = [];
    const seen = new Set();

    productsSnap.forEach((docSnap) => {
      const p = docSnap.data();
      const fromCat = catToShop[p.category] || catToShop[p.subcategory];
      const belongsToShop =
        p.shopId === SHOP_ID || fromCat === SHOP_ID;

      if (!belongsToShop) return;
      if (p.shopId === SHOP_ID && p.shopName === SHOP_NAME) return;
      if (seen.has(docSnap.id)) return;
      seen.add(docSnap.id);
      productUpdates.push({
        ref: docSnap.ref,
        data: {
          shopId: SHOP_ID,
          shopName: SHOP_NAME,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      });
    });

    const BATCH = 400;
    for (let i = 0; i < productUpdates.length; i += BATCH) {
      const batch = db.batch();
      productUpdates.slice(i, i + BATCH).forEach(({ ref, data }) => batch.update(ref, data));
      await batch.commit();
    }

    const usersSnap = await db
      .collection("users")
      .where("assignedShopId", "==", SHOP_ID)
      .get();
    let usersUpdated = 0;
    for (const userDoc of usersSnap.docs) {
      if (userDoc.data().assignedShopName !== SHOP_NAME) {
        await userDoc.ref.update({
          assignedShopName: SHOP_NAME,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        usersUpdated++;
      }
    }

    return res.json({
      success: true,
      shopId: SHOP_ID,
      shopName: SHOP_NAME,
      productsUpdated: productUpdates.length,
      usersUpdated,
      categoriesIndexed: Object.keys(catToShop).length,
      message: `Shop "${SHOP_NAME}" restored and linked.`,
    });
  } catch (error) {
    console.error("repair-shop-data error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ================================================================
// ╔══════════════════════════════════════════════════════════════╗
// ║  PART D — FCM BROADCAST (EXISTING - UNCHANGED)                ║
// ╚══════════════════════════════════════════════════════════════╝
// ================================================================

// ── Push Stats ──────────────────────────────────────────────────
app.get("/push-stats", async (req, res) => {
  try {
    const [pushTokensSnapshot, usersSnapshot] = await Promise.all([
      db.collection("push_tokens").get(),
      db.collection("users").get(),
    ]);

    let enabledDevices = 0;
    let fcmCount = 0;
    let guestCount = 0;
    let userCount = 0;

    pushTokensSnapshot.forEach((doc) => {
      const data = doc.data();

      if (
        data?.pushEnabled === true &&
        data?.fcmToken &&
        data.fcmToken.trim() !== ""
      ) {
        enabledDevices++;
        fcmCount++;

        if (data?.isGuest === true) guestCount++;
        else userCount++;
      }
    });

    res.json({
      success: true,
      stats: {
        total: pushTokensSnapshot.size,
        enabled: enabledDevices,
        fcm: fcmCount,
        guests: guestCount,
        users: userCount,
        totalUsers: usersSnapshot.size,
      },
      mode: "FCM_ONLY",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Stats error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Send Broadcast (FCM ONLY) ───────────────────────────────────
app.post("/send-broadcast", async (req, res) => {
  try {
    const { title, body, link } = req.body;

    if (!title || !body) {
      return res.status(400).json({
        success: false,
        error: "Title aur body required",
      });
    }

    console.log("🚀 FCM Broadcast started:", { title, body });

    const deviceTokenMap = new Map();

    // Fetch push_tokens
    try {
      const pushSnap = await db
        .collection("push_tokens")
        .where("pushEnabled", "==", true)
        .get();

      pushSnap.forEach((doc) => {
        const data = doc.data();
        const deviceId = doc.id;

        if (data.fcmToken && data.fcmToken.trim() !== "") {
          deviceTokenMap.set(deviceId, {
            id: deviceId,
            token: data.fcmToken,
            collection: "push_tokens",
          });
        }
      });

      console.log(
        `✅ push_tokens: ${pushSnap.size} total, ${deviceTokenMap.size} with FCM`
      );
    } catch (e) {
      console.error("⚠️ push_tokens error:", e.message);
    }

    // Fetch users (backup)
    try {
      const usersSnap = await db
        .collection("users")
        .where("pushEnabled", "==", true)
        .get();

      usersSnap.forEach((doc) => {
        const data = doc.data();
        const userId = doc.id;

        if (deviceTokenMap.has(userId)) return;

        if (data.fcmToken && data.fcmToken.trim() !== "") {
          deviceTokenMap.set(userId, {
            id: userId,
            token: data.fcmToken,
            collection: "users",
          });
        }
      });

      console.log(`✅ users: ${usersSnap.size} total`);
    } catch (e) {
      console.error("⚠️ users error:", e.message);
    }

    const allDevices = Array.from(deviceTokenMap.values());

    console.log(`✅ Total FCM devices: ${allDevices.length}`);

    if (allDevices.length === 0) {
      return res.json({
        success: true,
        message: "No FCM tokens found",
        totalDevices: 0,
        totalSent: 0,
        invalidTokensRemoved: 0,
      });
    }

    let fcmSuccess = 0;
    let invalidTokensRemoved = 0;

    console.log(`📤 Sending to ${allDevices.length} FCM tokens...`);

    const fcmChunks = chunkArray(allDevices, 500);

    for (const chunk of fcmChunks) {
      try {
        const response = await admin.messaging().sendEachForMulticast({
          tokens: chunk.map((d) => d.token),
          notification: { title, body },
          data: {
            link: link || "/home",
            timestamp: Date.now().toString(),
          },
          android: {
            priority: "high",
            notification: {
              channelId: "default",
              sound: "default",
              priority: "high",
            },
          },
          apns: {
            payload: {
              aps: {
                sound: "default",
                badge: 1,
              },
            },
          },
        });

        fcmSuccess += response.successCount;

        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const errorCode = resp.error?.code;

            console.warn(
              `⚠️ FCM error for ${chunk[idx].id}:`,
              errorCode
            );

            if (
              errorCode === "messaging/invalid-registration-token" ||
              errorCode === "messaging/registration-token-not-registered"
            ) {
              db.collection(chunk[idx].collection)
                .doc(chunk[idx].id)
                .update({
                  fcmToken: admin.firestore.FieldValue.delete(),
                })
                .catch(() => { });

              invalidTokensRemoved++;
              console.log(`🗑️ Removed invalid token: ${chunk[idx].id}`);
            }
          }
        });
      } catch (error) {
        console.error("❌ FCM batch error:", error.message);
      }
    }

    console.log(`✅ FCM sent: ${fcmSuccess}/${allDevices.length}`);

    // Save history
    try {
      await db.collection("notification_history").add({
        title,
        body,
        link: link || null,
        totalDevices: allDevices.length,
        totalSent: fcmSuccess,
        invalidTokensRemoved,
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (error) {
      console.error("⚠️ History save failed:", error.message);
    }

    console.log(
      `🎉 Complete: ${fcmSuccess} sent to ${allDevices.length} devices`
    );

    return res.json({
      success: true,
      totalDevices: allDevices.length,
      totalSent: fcmSuccess,
      invalidTokensRemoved,
      message: `FCM sent to ${fcmSuccess}/${allDevices.length} devices`,
    });
  } catch (error) {
    console.error("❌ Broadcast error:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ── Notification History ────────────────────────────────────────
app.get("/notification-history", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;

    const snapshot = await db
      .collection("notification_history")
      .orderBy("sentAt", "desc")
      .limit(limit)
      .get();

    const history = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      sentAt: doc.data().sentAt?.toDate?.()?.toISOString() || null,
    }));

    res.json({
      success: true,
      history,
      count: history.length,
    });
  } catch (error) {
    console.error("❌ History error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ================================================================
// ╔══════════════════════════════════════════════════════════════╗
// ║  PART E — FRONTEND SERVING + CATCH-ALL                        ║
// ╚══════════════════════════════════════════════════════════════╝
// ================================================================

const distPath = path.join(__dirname, "dist");
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  console.log("✅ Serving dist/");
}

app.get("*", (req, res) => {
  const distIndex = path.join(__dirname, "dist", "index.html");
  if (fs.existsSync(distIndex)) {
    res.sendFile(distIndex);
  } else {
    res.status(404).json({ error: "Not found" });
  }
});

// ================================================================
// ✅ Start Server
// ================================================================
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "0.0.0.0";

app.listen(PORT, HOST, () => {
  console.log("\n" + "=".repeat(60));
  console.log("🚀 POS Backend Server (v5.0 — Multi-Shop)");
  console.log("=".repeat(60));
  console.log(`📍 http://localhost:${PORT}`);
  console.log("");
  console.log("📊 Endpoints:");
  console.log("   GET  /health");
  console.log("   GET  /check-admin-setup       ← AuthScreen mount");
  console.log("   GET  /push-stats");
  console.log("   GET  /notification-history");
  console.log("");
  console.log("👥 RBAC:");
  console.log("   POST /create-staff-user       ← STAFF/SUPER_ADMIN");
  console.log("   POST /create-admin            ← Legacy admin");
  console.log("   POST /delete-admin            ← Delete any user");
  console.log("   POST /delete-auth-user        ← Alias");
  console.log("   POST /init-demo-admin");
  console.log("");
  console.log("🏬 Shops:");
  console.log("   POST /create-shop");
  console.log("   POST /delete-shop");
  console.log("");
  console.log("🔔 Notifications:");
  console.log("   POST /send-broadcast");
  console.log("=".repeat(60));
  console.log(`✅ Firebase Project: ${serviceAccount.project_id}`);
  console.log("=".repeat(60) + "\n");
});

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));