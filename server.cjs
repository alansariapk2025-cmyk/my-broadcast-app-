const express = require("express");
const admin = require("firebase-admin");
const axios = require("axios");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// ============================================
// ✅ FIREBASE INITIALIZE (ONCE)
// ============================================
let serviceAccount;

try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    console.log("✅ Firebase: ENV se load hua");
  } else {
    serviceAccount = JSON.parse(
      fs.readFileSync("./serviceAccountKey.json", "utf8")
    );
    console.log("✅ Firebase: File se load hua");
  }
} catch (err) {
  console.error("❌ Firebase load failed:", err.message);
  process.exit(1);
}

// ✅ Sirf ek baar initialize
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log("✅ Firebase Admin initialized");
}

const db = admin.firestore();

// ============================================
// ✅ HELPERS
// ============================================

// Array ko chunks me todna
function chunkArray(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

// Duplicate tokens remove karna
function removeDuplicateTokens(users) {
  const seen = new Set();
  return users.filter((user) => {
    if (seen.has(user.token)) return false;
    seen.add(user.token);
    return true;
  });
}

// ============================================
// ✅ SERVE FRONTEND (dist folder)
// ============================================
const distPath = path.join(__dirname, "dist");

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  console.log("✅ Frontend: dist/ serve ho raha hai");
} else {
  // Root folder me index.html check karo
  const rootIndex = path.join(__dirname, "index.html");
  if (fs.existsSync(rootIndex)) {
    app.use(express.static(__dirname));
    console.log("✅ Frontend: root index.html serve ho raha hai");
  } else {
    console.log("⚠️ Frontend files nahi mili");
  }
}

// ============================================
// ✅ HEALTH CHECK
// ============================================
app.get("/health", (req, res) => {
  res.json({
    status: "✅ Server Live",
    time: new Date().toISOString(),
    firebase: admin.apps.length > 0 ? "Connected" : "Disconnected",
    frontend: fs.existsSync(distPath) ? "dist/ ready" : "dist/ missing",
    port: process.env.PORT || 5000,
  });
});

// ============================================
// ✅ SEND BROADCAST (Main Route)
// ============================================
app.post("/send-broadcast", async (req, res) => {
  try {
    const { title, body, link } = req.body;

    // Validation
    if (!title || !body) {
      return res.status(400).json({
        error: "Title aur body required hai",
      });
    }

    console.log("🚀 Broadcast started:", { title, body, link });

    let users = [];

    // ✅ push_tokens collection se fetch
    try {
      const pushTokensSnapshot = await db
        .collection("push_tokens")
        .where("pushEnabled", "==", true)
        .get();

      pushTokensSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.expoPushToken && data.expoPushToken.trim() !== "") {
          users.push({
            id: doc.id,
            token: data.expoPushToken.trim(),
            collection: "push_tokens",
          });
        }
      });

      console.log(`📱 push_tokens se: ${users.length} tokens`);
    } catch (e) {
      console.log("⚠️ push_tokens collection nahi mili:", e.message);
    }

    // ✅ users collection se fetch
    try {
      const usersSnapshot = await db
        .collection("users")
        .where("pushEnabled", "==", true)
        .get();

      usersSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.expoPushToken && data.expoPushToken.trim() !== "") {
          users.push({
            id: doc.id,
            token: data.expoPushToken.trim(),
            collection: "users",
          });
        }
      });

      console.log(`📱 Total (before dedup): ${users.length} tokens`);
    } catch (e) {
      console.log("⚠️ users collection nahi mili:", e.message);
    }

    // ✅ Duplicates remove karo
    users = removeDuplicateTokens(users);
    console.log(`✅ Unique tokens: ${users.length}`);

    if (users.length === 0) {
      return res.json({
        success: true,
        totalTokens: 0,
        message: "Koi valid token nahi mila",
      });
    }

    // ✅ Chunks me bhejo (100 per chunk - Expo limit)
    const chunks = chunkArray(users, 100);
    let totalSent = 0;
    let invalidTokensRemoved = 0;
    let failedCount = 0;

    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];

      const messages = chunk.map((user) => ({
        to: user.token,
        sound: "default",
        title,
        body,
        data: { link: link || "/home" },
      }));

      try {
        // ✅ Expo Push API call
        const response = await axios.post(
          "https://exp.host/--/api/v2/push/send",
          messages,
          {
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              "Accept-Encoding": "gzip, deflate",
            },
            timeout: 30000, // 30 second timeout
          }
        );

        const results = response.data.data;

        console.log(
          `📦 Chunk ${ci + 1}/${chunks.length}: ${chunk.length} messages sent`
        );

        // ✅ Invalid tokens handle karo
        for (let j = 0; j < results.length; j++) {
          if (results[j].status === "error") {
            const errorType = results[j].details?.error;
            console.log(`❌ Token error: ${errorType} for ${chunk[j].token.substring(0, 20)}...`);

            if (errorType === "DeviceNotRegistered") {
              // Invalid token Firestore se remove karo
              try {
                await db
                  .collection(chunk[j].collection)
                  .doc(chunk[j].id)
                  .update({
                    expoPushToken: admin.firestore.FieldValue.delete(),
                    pushEnabled: false,
                  });
                invalidTokensRemoved++;
                console.log(`🗑️ Invalid token removed: doc ${chunk[j].id}`);
              } catch (updateErr) {
                console.error("❌ Token remove error:", updateErr.message);
              }
            }
          }
        }

        totalSent += messages.length;

      } catch (chunkError) {
        console.error(`❌ Chunk ${ci + 1} error:`, chunkError.message);
        failedCount += chunk.length;
      }

      // ✅ Chunks ke beech thoda wait (rate limiting avoid)
      if (ci < chunks.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    // ✅ History Firestore me save karo
    try {
      await db.collection("notification_history").add({
        title,
        body,
        link: link || null,
        totalSent,
        invalidTokensRemoved,
        failedCount,
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log("📝 History saved");
    } catch (histErr) {
      console.error("❌ History save error:", histErr.message);
    }

    console.log(
      `✅ Broadcast complete: ${totalSent} sent, ${invalidTokensRemoved} invalid removed, ${failedCount} failed`
    );

    return res.json({
      success: true,
      totalTokens: totalSent,
      invalidTokensRemoved,
      failedCount,
      chunks: chunks.length,
    });

  } catch (error) {
    console.error("❌ Broadcast error:", error);
    return res.status(500).json({
      error: error.message,
    });
  }
});

// ============================================
// ✅ PUSH STATS
// ============================================
app.get("/push-stats", async (req, res) => {
  try {
    const pushTokensSnap = await db.collection("push_tokens").get();
    const usersSnap = await db.collection("users").get();

    let enabledPushTokens = 0;
    let guestTokens = 0;
    let userTokens = 0;

    pushTokensSnap.forEach((doc) => {
      const data = doc.data();
      if (data.pushEnabled === true && data.expoPushToken) {
        enabledPushTokens++;
        if (data.isGuest === true) guestTokens++;
        else userTokens++;
      }
    });

    // Notification history
    const historySnap = await db
      .collection("notification_history")
      .orderBy("sentAt", "desc")
      .limit(5)
      .get();

    const recentHistory = [];
    historySnap.forEach((doc) => {
      recentHistory.push({ id: doc.id, ...doc.data() });
    });

    res.json({
      success: true,
      stats: {
        totalPushTokenRecords: pushTokensSnap.size,
        enabledPushTokens,
        guestTokens,
        userTokens,
        totalUsers: usersSnap.size,
      },
      recentBroadcasts: recentHistory,
    });

  } catch (error) {
    console.error("❌ Push stats error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ✅ NOTIFICATION HISTORY
// ============================================
app.get("/notification-history", async (req, res) => {
  try {
    const snap = await db
      .collection("notification_history")
      .orderBy("sentAt", "desc")
      .limit(20)
      .get();

    const history = [];
    snap.forEach((doc) => {
      history.push({ id: doc.id, ...doc.data() });
    });

    res.json({ success: true, history });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ✅ INIT DEMO ADMIN
// ============================================
app.post("/init-demo-admin", async (req, res) => {
  try {
    const demoEmail = "demo.admin@ansari.com";
    const demoPassword = "Demo1234";
    const demoName = "Demo Admin";

    let userRecord;
    try {
      userRecord = await admin.auth().getUserByEmail(demoEmail);
      console.log("✅ Demo admin already exists");
    } catch {
      userRecord = null;
    }

    if (!userRecord) {
      userRecord = await admin.auth().createUser({
        email: demoEmail,
        password: demoPassword,
        displayName: demoName,
      });
      console.log("✅ Demo admin created");
    }

    await db.collection("admins").doc(userRecord.uid).set(
      {
        uid: userRecord.uid,
        fullName: demoName,
        email: demoEmail,
        role: "admin",
        isDemo: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    res.json({
      success: true,
      email: demoEmail,
      password: demoPassword,
    });

  } catch (error) {
    console.error("❌ Init demo admin error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ✅ CREATE ADMIN
// ============================================
app.post("/create-admin", async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    if (!fullName || !email || !password || password.length < 6) {
      return res.status(400).json({
        error: "fullName, email, password (min 6 chars) required",
      });
    }

    // ✅ User create karo Firebase Auth me
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: fullName,
    });

    // ✅ Firestore me save karo
    await db.collection("admins").doc(userRecord.uid).set({
      uid: userRecord.uid,
      fullName,
      email,
      role: "admin",
      isDemo: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // ✅ Demo admin delete karo (agar real admin ban gaya)
    const demoEmail = "demo.admin@ansari.com";
    if (email !== demoEmail) {
      try {
        const demoUser = await admin.auth().getUserByEmail(demoEmail);
        if (demoUser) {
          await admin.auth().deleteUser(demoUser.uid);
          await db.collection("admins").doc(demoUser.uid).delete();
          console.log("🗑️ Demo admin deleted");
        }
      } catch (e) {
        // Demo user nahi tha - ignore
      }
    }

    res.json({
      success: true,
      uid: userRecord.uid,
      email: userRecord.email,
      fullName: userRecord.displayName,
    });

  } catch (error) {
    console.error("❌ Create admin error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ✅ SPA CATCH-ALL (Frontend React Router)
// ============================================
app.get("*", (req, res) => {
  // API routes
  if (
    req.path.startsWith("/send-broadcast") ||
    req.path.startsWith("/push-stats") ||
    req.path.startsWith("/health") ||
    req.path.startsWith("/create-admin") ||
    req.path.startsWith("/init-demo-admin") ||
    req.path.startsWith("/notification-history")
  ) {
    return res.status(404).json({ error: "Route not found" });
  }

  // Frontend serve
  const distIndex = path.join(__dirname, "dist", "index.html");
  const rootIndex = path.join(__dirname, "index.html");

  if (fs.existsSync(distIndex)) {
    res.sendFile(distIndex);
  } else if (fs.existsSync(rootIndex)) {
    res.sendFile(rootIndex);
  } else {
    res.status(404).send(`
      <h2>⚠️ Frontend not found</h2>
      <p>Run: <code>npm run build</code></p>
    `);
  }
});

// ============================================
// ✅ START SERVER
// ============================================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server: http://localhost:${PORT}`);
  console.log(`❤️  Health: http://localhost:${PORT}/health`);
  console.log(`📊 Stats:  http://localhost:${PORT}/push-stats`);
});