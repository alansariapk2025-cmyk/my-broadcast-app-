/**
 * server.cjs
 * Production-ready backend for the multi-shop admin panel.
 * Handles Firebase Auth user creation, RBAC Firestore records,
 * demo admin bootstrapping, and secure status updates.
 */

const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

try {
  require("dotenv").config();
} catch (dotenvErr) {
  console.warn("âš ï¸ dotenv not loaded:", dotenvErr.message);
}

const PORT = Number(process.env.PORT || 5000);
const app = express();

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// CORS + request logging
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const allowedOrigins = [
  /^http:\/\/localhost:\d+$/,
  /^http:\/\/127\.0\.0\.1:\d+$/,
  /^https:\/\/.*\.onrender\.com$/,
  "https://my-broadcast-app.onrender.com",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      const allow = allowedOrigins.some((pattern) =>
        pattern instanceof RegExp ? pattern.test(origin) : pattern === origin
      );
      callback(null, allow);
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

app.use((req, res, next) => {
  console.log(
    `âœ… [${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${req.ip}`
  );
  if (req.body && Object.keys(req.body).length) {
    console.log("   body:", JSON.stringify(req.body));
  }
  next();
});

function sendResult(res, { success, data = null, error = null }, status = 200) {
  return res.status(status).json({ success, data, error });
}

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function validateEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateRole(role) {
  return ["STAFF", "SUPER_ADMIN"].includes(role);
}

function validateStatus(status) {
  return ["active", "suspended"].includes(status);
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Firebase initialization
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

let serviceAccount;

try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    console.log("âœ… Firebase service account loaded from env");
  } else {
    const candidatePaths = [];
    if (process.env.SERVICE_ACCOUNT_PATH) {
      candidatePaths.push(process.env.SERVICE_ACCOUNT_PATH);
    }
    candidatePaths.push(path.join(__dirname, "serviceAccountKey.json"));
    candidatePaths.push(path.join(__dirname, "my-app", "serviceAccountKey.json"));
    candidatePaths.push(path.join(__dirname, "..", "my-app", "serviceAccountKey.json"));

    const foundPath = candidatePaths.find((candidate) => fs.existsSync(candidate));
    if (!foundPath) {
      throw new Error(`Service account key not found at any of: ${candidatePaths.join(", ")}`);
    }

    serviceAccount = JSON.parse(fs.readFileSync(foundPath, "utf8"));
    console.log(`✅ Firebase service account loaded from ${foundPath}`);
  }

  if (!serviceAccount.project_id || !serviceAccount.private_key) {
    throw new Error("Invalid Firebase service account payload");
  }
} catch (initError) {
  console.error("âŒ Firebase initialization failed:", initError.message);
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log("âœ… Firebase Admin initialized");
}

const db = admin.firestore();
const auth = admin.auth();

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Helper functions
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function doesAnyAdminExist() {
  const adminSnapshot = await db.collection("admins").limit(10).get();
  return adminSnapshot.docs.some((doc) => {
    const role = doc.data()?.role;
    return role === "admin" || role === "superadmin";
  });
}

async function getShopById(shopId) {
  if (!shopId) return null;
  const shopDoc = await db.collection("shops").doc(shopId).get();
  return shopDoc.exists ? shopDoc.data() : null;
}

function buildUserClaims(userRecord) {
  const claims = {
    role: userRecord.role,
    status: userRecord.status,
  };

  if (userRecord.role === "STAFF") {
    claims.assignedShopId = userRecord.assignedShopId || null;
    claims.assignedShopName = userRecord.assignedShopName || null;
  }

  return claims;
}

async function linkExistingAuthUserByEmail(email, userProps, userDocPayload) {
  try {
    const existingUser = await auth.getUserByEmail(email);
    const userDocRef = db.collection("users").doc(existingUser.uid);
    const userDocSnapshot = await userDocRef.get();

    if (userDocSnapshot.exists) {
      return { alreadyLinked: true, uid: existingUser.uid };
    }

    await auth.updateUser(existingUser.uid, {
      displayName: userProps.displayName,
      disabled: userProps.disabled,
    });

    await auth.setCustomUserClaims(existingUser.uid, userProps.customClaims);
    await userDocRef.set(userDocPayload);

    return {
      linked: true,
      uid: existingUser.uid,
      userDoc: userDocPayload,
    };
  } catch (error) {
    return { error };
  }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Serve static frontend when available
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const distPath = path.join(__dirname, "dist");
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  console.log("âœ… Serving static dist folder");
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Routes
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

app.get("/", (req, res) => {
  return sendResult(res, {
    success: true,
    data: {
      service: "Admin RBAC API",
      status: "online",
      timestamp: new Date().toISOString(),
      port: PORT,
    },
  });
});

// Simple ping endpoint for health checks (matches my-app/server.cjs)
app.get("/ping", (req, res) => {
  return res.json({ pong: true, time: Date.now() });
});

app.get("/check-admin-setup", async (req, res) => {
  try {
    const [adminDocs, superAdminUsers, demoAdmins] = await Promise.all([
      db.collection("admins").limit(10).get(),
      db.collection("users").where("role", "==", "SUPER_ADMIN").limit(1).get(),
      db.collection("admins").where("isDemo", "==", true).limit(1).get(),
    ]);

    const hasLegacyAdmin = adminDocs.docs.some((doc) => {
      const role = doc.data()?.role;
      return role === "admin" || role === "superadmin";
    });

    return sendResult(res, {
      success: true,
      data: {
        hasLegacyAdmin,
        hasModernAdmin: superAdminUsers.size > 0,
        hasDemoAdmin: demoAdmins.size > 0,
        hasRealAdmin: hasLegacyAdmin || superAdminUsers.size > 0,
      },
    });
  } catch (error) {
    console.error("âŒ /check-admin-setup error:", error);
    return sendResult(res, {
      success: false,
      error: "Unable to verify admin setup status.",
    }, 500);
  }
});

app.post("/init-demo-admin", async (req, res) => {
  const demoEmail = "demo.admin@ansari.com";
  const demoPassword = "Demo1234";
  const demoFullName = "Demo Super Admin";

  try {
    const anyAdmin = await doesAnyAdminExist();
    const modernSuperAdmin = await db
      .collection("users")
      .where("role", "==", "SUPER_ADMIN")
      .limit(1)
      .get();

    if (anyAdmin || modernSuperAdmin.size > 0) {
      return sendResult(res, {
        success: false,
        error: "Admin setup already exists. Demo admin is not required.",
      }, 409);
    }

    const userRecord = await auth.createUser({
      email: demoEmail,
      password: demoPassword,
      displayName: demoFullName,
      disabled: false,
    });

    await auth.setCustomUserClaims(userRecord.uid, {
      role: "SUPER_ADMIN",
      status: "active",
    });

    await db.collection("admins").doc(userRecord.uid).set({
      fullName: demoFullName,
      email: demoEmail,
      role: "superadmin",
      isDemo: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`âœ… Demo admin created: ${userRecord.uid}`);

    return sendResult(res, {
      success: true,
      data: {
        uid: userRecord.uid,
        email: demoEmail,
        password: demoPassword,
      },
    });
  } catch (error) {
    console.error("âŒ /init-demo-admin failed:", error);
    if (error.code === "auth/email-already-exists") {
      return sendResult(res, {
        success: true,
        data: {
          email: demoEmail,
          password: demoPassword,
          hint: "Demo admin already exists in Auth.",
        },
      });
    }
    return sendResult(res, {
      success: false,
      error: "Unable to initialize demo admin.",
    }, 500);
  }
});

app.post("/create-staff-user", async (req, res) => {
  try {
    const rawName = req.body.name;
    const rawEmail = normalizeEmail(req.body.email);
    const password = req.body.password;
    const role = req.body.role;
    const assignedShopId = req.body.assignedShopId || null;
    let assignedShopName = req.body.assignedShopName || null;
    const status = req.body.status || "active";
    const createdBy = req.body.createdBy || "system";

    const name = typeof rawName === "string" ? rawName.trim() : "";

    if (!name) {
      return sendResult(res, {
        success: false,
        error: "Name is required.",
      }, 400);
    }

    if (!validateEmail(rawEmail)) {
      return sendResult(res, {
        success: false,
        error: "Valid email is required.",
      }, 400);
    }

    if (!password || password.length < 6) {
      return sendResult(res, {
        success: false,
        error: "Password must be at least 6 characters.",
      }, 400);
    }

    if (!validateRole(role)) {
      return sendResult(res, {
        success: false,
        error: "Role must be STAFF or SUPER_ADMIN.",
      }, 400);
    }

    if (!validateStatus(status)) {
      return sendResult(res, {
        success: false,
        error: "Status must be active or suspended.",
      }, 400);
    }

    if (role === "STAFF") {
      if (!assignedShopId) {
        return sendResult(res, {
          success: false,
          error: "Staff users must be assigned to a shop.",
        }, 400);
      }

      const shop = await getShopById(assignedShopId);
      if (!shop) {
        return sendResult(res, {
          success: false,
          error: "Assigned shop not found.",
        }, 400);
      }
      assignedShopName = assignedShopName || shop.name || null;
    }

    const userClaims = buildUserClaims({
      role,
      status,
      assignedShopId,
      assignedShopName,
    });

    const userRecord = await auth.createUser({
      email: rawEmail,
      password,
      displayName: name,
      disabled: status === "suspended",
    });

    await auth.setCustomUserClaims(userRecord.uid, userClaims);

    const userDoc = {
      name,
      email: rawEmail,
      role,
      assignedShopId: role === "STAFF" ? assignedShopId : null,
      assignedShopName: role === "STAFF" ? assignedShopName : null,
      status,
      createdBy,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection("users").doc(userRecord.uid).set(userDoc);

    console.log(`âœ… Staff user created: ${userRecord.uid}`);

    return sendResult(res, {
      success: true,
      data: {
        uid: userRecord.uid,
        user: userDoc,
      },
    });
  } catch (error) {
    console.error("âŒ /create-staff-user error:", error);
    if (error.code === "auth/email-already-exists") {
      const fallback = await linkExistingAuthUserByEmail(rawEmail, {
        displayName: name,
        disabled: status === "suspended",
        createdBy,
        customClaims: userClaims,
      }, {
        name,
        email: rawEmail,
        role,
        assignedShopId: role === "STAFF" ? assignedShopId : null,
        assignedShopName: role === "STAFF" ? assignedShopName : null,
        status,
        createdBy,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      if (fallback.error) {
        console.error("❌ Existing auth link failed:", fallback.error);
        return sendResult(res, {
          success: false,
          error: "Email already exists in Auth, and could not be linked to a Firestore user.",
        }, 400);
      }

      if (fallback.alreadyLinked) {
        return sendResult(res, {
          success: false,
          error: "Email already exists and is already linked to a user record.",
        }, 400);
      }

      return sendResult(res, {
        success: true,
        data: {
          uid: fallback.uid,
          user: fallback.userDoc,
          existingAuth: true,
        },
      });
    }

    return sendResult(res, {
      success: false,
      error: "Failed to create staff user.",
    }, 500);
  }
});

app.post("/delete-auth-user", async (req, res) => {
  try {
    const uid = typeof req.body.uid === "string" ? req.body.uid.trim() : "";
    if (!uid) {
      return sendResult(res, {
        success: false,
        error: "User UID is required.",
      }, 400);
    }

    const userDocRef = db.collection("users").doc(uid);
    const userDocPromise = userDocRef.get();
    const deleteAuthPromise = auth.deleteUser(uid).catch((deleteError) => {
      if (deleteError.code === "auth/user-not-found") {
        return null;
      }
      throw deleteError;
    });

    const [userDoc] = await Promise.all([userDocPromise, deleteAuthPromise]);

    if (userDoc.exists) {
      await userDocRef.delete();
    }

    console.log(`âœ… Deleted auth user and Firestore doc for uid: ${uid}`);

    return sendResult(res, {
      success: true,
      data: { uid },
    });
  } catch (error) {
    console.error("âŒ /delete-auth-user error:", error);
    if (error.code === "auth/user-not-found") {
      return sendResult(res, {
        success: false,
        error: "User does not exist in Authentication.",
      }, 404);
    }
    return sendResult(res, {
      success: false,
      error: "Failed to delete user.",
    }, 500);
  }
});

app.post("/update-user-status", async (req, res) => {
  try {
    const uid = typeof req.body.uid === "string" ? req.body.uid.trim() : "";
    const status = typeof req.body.status === "string" ? req.body.status.trim() : "";

    if (!uid || !validateStatus(status)) {
      return sendResult(res, {
        success: false,
        error: "Valid uid and status are required.",
      }, 400);
    }

    const userDocRef = db.collection("users").doc(uid);
    const snapshot = await userDocRef.get();

    if (!snapshot.exists) {
      return sendResult(res, {
        success: false,
        error: "Firestore user document not found.",
      }, 404);
    }

    const userData = snapshot.data();
    const updatedUser = {
      ...userData,
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await userDocRef.update({
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await auth.updateUser(uid, { disabled: status === "suspended" });
    await auth.setCustomUserClaims(uid, buildUserClaims(updatedUser));

    console.log(`âœ… User status updated (${uid}) -> ${status}`);

    return sendResult(res, {
      success: true,
      data: { uid, status },
    });
  } catch (error) {
    console.error("âŒ /update-user-status error:", error);
    return sendResult(res, {
      success: false,
      error: "Unable to update user status.",
    }, 500);
  }
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Catch-all and error handling
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

app.use((req, res) => {
  return sendResult(res, {
    success: false,
    error: "Endpoint not found.",
  }, 404);
});

app.use((err, req, res, next) => {
  console.error("ðŸ”¥ Unexpected server error:", err);
  return sendResult(res, {
    success: false,
    error: "Unexpected server error.",
  }, 500);
});

app.listen(PORT, () => {
  console.log(`âœ… Server running on port ${PORT}`);
});
