// ================================================================
// server/middleware/authMiddleware.js
// ================================================================
// Features:
// - Extract JWT token from Authorization header
// - Decode and verify JWT signature
// - Extract shop_id and user information
// - Check shop status and trial expiry
// - Handle Super Admin bypass
// - Attach context to request for database queries
// ================================================================

const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');

/**
 * Middleware: Extract JWT and add auth context to request
 * Usage: app.use(extractAuthContext())
 */
async function extractAuthContext(req, res, next) {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token = public route
      req.authContext = {
        authenticated: false,
        user_id: null,
        shop_id: null,
        is_super_admin: false,
      };
      return next();
    }

    const idToken = authHeader.substring(7); // Remove "Bearer "

    // Verify Firebase ID token
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (error) {
      console.error('❌ Invalid token:', error.message);
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN',
      });
    }

    // decodedToken contains: uid, email, custom claims, etc.
    const firebaseUid = decodedToken.uid;
    const userEmail = decodedToken.email;

    // Custom claims may contain shop_id and role (set during token generation)
    const customShopId = decodedToken.shop_id;
    const customRole = decodedToken.role;
    const customIsSuperAdmin = decodedToken.is_super_admin || false;

    // ================================================================
    // 🔐 IMPORTANT: Never trust frontend-sent shop_id
    // Always look it up from database or custom claims
    // ================================================================

    req.authContext = {
      authenticated: true,
      firebase_uid: firebaseUid,
      email: userEmail,
      shop_id: customShopId, // From custom claims (set server-side at login)
      user_id: null, // Will be looked up from DB
      role: customRole,
      is_super_admin: customIsSuperAdmin,
      token: idToken,
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Authentication error',
      code: 'AUTH_ERROR',
    });
  }
}

/**
 * Middleware: Verify user exists in database and set user_id
 * Usage: app.use(requireAuth()) - after extractAuthContext()
 */
function requireAuth() {
  return async (req, res, next) => {
    if (!req.authContext.authenticated) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'NOT_AUTHENTICATED',
      });
    }

    // Look up user in database to get user_id and verify permissions
    const { pool } = require('../db/pool');

    try {
      const result = await pool.query(
        `
        SELECT id, shop_id, role, status, permissions
        FROM users
        WHERE firebase_uid = $1
        `,
        [req.authContext.firebase_uid]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'User not found in database',
          code: 'USER_NOT_FOUND',
        });
      }

      const user = result.rows[0];

      // Check user status
      if (user.status === 'suspended') {
        return res.status(403).json({
          success: false,
          error: 'Your account has been suspended',
          code: 'ACCOUNT_SUSPENDED',
        });
      }

      if (user.status === 'inactive') {
        return res.status(403).json({
          success: false,
          error: 'Your account is inactive',
          code: 'ACCOUNT_INACTIVE',
        });
      }

      // Update shop_id if not set in custom claims
      if (!req.authContext.shop_id) {
        req.authContext.shop_id = user.shop_id;
      }

      // Set user_id for database context
      req.authContext.user_id = user.id;
      req.authContext.role = user.role;
      req.authContext.permissions = user.permissions || [];

      next();
    } catch (error) {
      console.error('User lookup error:', error.message);
      return res.status(500).json({
        success: false,
        error: 'Failed to verify user',
        code: 'USER_LOOKUP_ERROR',
      });
    }
  };
}

/**
 * Middleware: Verify shop status and permissions
 * Usage: app.use(requireShop()) - after requireAuth()
 */
function requireShop() {
  return async (req, res, next) => {
    if (!req.authContext.authenticated) {
      return next(); // Skip if not authenticated
    }

    if (!req.authContext.shop_id) {
      return res.status(400).json({
        success: false,
        error: 'Shop not assigned',
        code: 'NO_SHOP_ASSIGNED',
      });
    }

    const { pool } = require('../db/pool');

    try {
      const result = await pool.query(
        `
        SELECT id, status, plan, trial_expires_at, subscription_expires_at
        FROM shops
        WHERE id = $1
        `,
        [req.authContext.shop_id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Shop not found',
          code: 'SHOP_NOT_FOUND',
        });
      }

      const shop = result.rows[0];

      // Check shop status
      if (shop.status === 'suspended') {
        return res.status(403).json({
          success: false,
          error: 'Shop has been suspended',
          code: 'SHOP_SUSPENDED',
        });
      }

      if (shop.status === 'inactive') {
        return res.status(403).json({
          success: false,
          error: 'Shop is inactive',
          code: 'SHOP_INACTIVE',
        });
      }

      // Check trial expiry
      if (shop.status === 'trial' && shop.trial_expires_at) {
        if (new Date() > new Date(shop.trial_expires_at)) {
          return res.status(403).json({
            success: false,
            error: 'Trial period has expired',
            code: 'TRIAL_EXPIRED',
          });
        }
      }

      // Check subscription expiry
      if (shop.subscription_expires_at) {
        if (new Date() > new Date(shop.subscription_expires_at)) {
          return res.status(403).json({
            success: false,
            error: 'Subscription has expired',
            code: 'SUBSCRIPTION_EXPIRED',
          });
        }
      }

      req.authContext.shop = shop;
      next();
    } catch (error) {
      console.error('Shop lookup error:', error.message);
      return res.status(500).json({
        success: false,
        error: 'Failed to verify shop',
        code: 'SHOP_LOOKUP_ERROR',
      });
    }
  };
}

/**
 * Middleware: Check if user has permission
 * Usage: app.use(requirePermission('products.create'))
 */
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.authContext.authenticated) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'NOT_AUTHENTICATED',
      });
    }

    // Super admin always has permission
    if (req.authContext.is_super_admin) {
      return next();
    }

    // Check if user has permission
    const userPermissions = req.authContext.permissions || [];
    if (!userPermissions.includes(permission)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        code: 'PERMISSION_DENIED',
        required: permission,
      });
    }

    next();
  };
}

/**
 * Middleware: Require Super Admin role
 * Usage: app.use(requireSuperAdmin())
 */
function requireSuperAdmin() {
  return (req, res, next) => {
    if (!req.authContext.authenticated) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'NOT_AUTHENTICATED',
      });
    }

    if (!req.authContext.is_super_admin) {
      return res.status(403).json({
        success: false,
        error: 'Super admin access required',
        code: 'SUPER_ADMIN_REQUIRED',
      });
    }

    next();
  };
}

// ================================================================
// 🔐 CONTEXT HELPERS
// ================================================================

/**
 * Get database context from request
 * Used to pass to db.query() and db.transaction()
 */
function getDbContext(req) {
  return {
    shop_id: req.authContext.shop_id,
    user_id: req.authContext.user_id,
    is_super_admin: req.authContext.is_super_admin || false,
  };
}

/**
 * Verify shop_id matches request context
 * Used to prevent tampering
 */
function verifyShopOwnership(req, shopId) {
  if (!shopId) {
    throw new Error('Shop ID not provided');
  }

  // Super admin can access any shop
  if (req.authContext.is_super_admin) {
    return true;
  }

  // Check if shop_id matches user's assigned shop
  if (shopId.toString() !== req.authContext.shop_id.toString()) {
    throw new Error('Unauthorized: You don\'t have access to this shop');
  }

  return true;
}

/**
 * Verify entity belongs to user's shop
 * Used in routes to prevent cross-shop access
 */
async function verifyEntityOwnership(req, entityShopId) {
  if (!entityShopId) {
    throw new Error('Entity shop_id not provided');
  }

  // Super admin bypass
  if (req.authContext.is_super_admin) {
    return true;
  }

  if (entityShopId.toString() !== req.authContext.shop_id.toString()) {
    throw new Error(
      'Unauthorized: This entity belongs to another shop'
    );
  }

  return true;
}

// ================================================================
// EXPORTS
// ================================================================
module.exports = {
  extractAuthContext,
  requireAuth,
  requireShop,
  requirePermission,
  requireSuperAdmin,
  getDbContext,
  verifyShopOwnership,
  verifyEntityOwnership,
};
