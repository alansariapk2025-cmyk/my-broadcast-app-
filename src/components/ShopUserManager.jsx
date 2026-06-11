/**
 * ShopUserManager.jsx
 * Super admin user management screen with real-time user sync,
 * optimistic UI updates, and staff/shop assignment.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { auth, db } from "../firebase";
import { collection, doc, getDocs } from "firebase/firestore";
import { logActivity, ACTIONS } from "../utils/activityLogger";
import notify from "../utils/notify";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || "http://localhost:5000";

export default function ShopUserManager() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "STAFF",
    assignedShopId: "",
    status: "active",
  });
  const [formError, setFormError] = useState("");
  const [formMsg, setFormMsg] = useState("");
  const [creating, setCreating] = useState(false);
  const [processingUid, setProcessingUid] = useState("");
  const [staffUsers, setStaffUsers] = useState([]);
  const [shops, setShops] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingShops, setLoadingShops] = useState(true);
  const successTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const loadShops = async () => {
      setLoadingShops(true);
      try {
        const snapshot = await getDocs(collection(db, "shops"));
        const shopList = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setShops(shopList);
      } catch (error) {
        console.error("âŒ Failed to load shops:", error);
      } finally {
        setLoadingShops(false);
      }
    };

    loadShops();
  }, []);

  useEffect(() => {
    const loadUsers = async () => {
      setLoadingUsers(true);
      try {
        const snapshot = await getDocs(collection(db, "users"));
        const users = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((user) => user.role === "STAFF" || user.role === "SUPER_ADMIN")
          .sort((a, b) => {
            const aTs = a.createdAt?.seconds || a.createdAt?._seconds || 0;
            const bTs = b.createdAt?.seconds || b.createdAt?._seconds || 0;
            return bTs - aTs;
          });
        setStaffUsers(users);
      } catch {
        notify.error("Failed to load users");
      } finally {
        setLoadingUsers(false);
      }
    };
    loadUsers();
    const timer = setInterval(loadUsers, 120000);
    return () => clearInterval(timer);
  }, []);

  const validateForm = useCallback(() => {
    if (!form.name.trim()) return "Name is required.";
    if (!form.email.trim()) return "Email is required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return "Please enter a valid email.";
    if (form.password.length < 6) return "Password must be at least 6 characters.";
    if (form.role === "STAFF" && !form.assignedShopId) {
      return "Please assign a shop for STAFF users.";
    }

    const normalizedEmail = form.email.trim().toLowerCase();
    if (staffUsers.some((user) => user.email?.toLowerCase() === normalizedEmail)) {
      return "A user with this email already exists.";
    }

    return null;
  }, [form, staffUsers]);

  const resetForm = () => {
    setForm({
      name: "",
      email: "",
      password: "",
      role: "STAFF",
      assignedShopId: "",
      status: "active",
    });
    setFormError("");
  };

  const showSuccessMessage = (text) => {
    setFormMsg(text);
    setFormError("");
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
    }
    successTimerRef.current = window.setTimeout(() => setFormMsg(""), 4000);
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    setFormError("");
    setFormMsg("");

    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setCreating(true);
    const normalizedEmail = form.email.trim().toLowerCase();
    const shop = shops.find((item) => item.id === form.assignedShopId) || {};
    const tempId = `temp-${Date.now()}`;
    const optimisticUser = {
      id: tempId,
      name: form.name.trim(),
      email: normalizedEmail,
      role: form.role,
      assignedShopId: form.role === "STAFF" ? form.assignedShopId : null,
      assignedShopName: form.role === "STAFF" ? shop.name || "" : null,
      status: form.status,
      createdAt: { seconds: Date.now() / 1000 },
      optimistic: true,
    };

    setStaffUsers((prevUsers) => [optimisticUser, ...prevUsers]);

    try {
      const response = await fetch(`${BACKEND_URL}/create-staff-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: normalizedEmail,
          password: form.password,
          role: form.role,
          assignedShopId: form.role === "STAFF" ? form.assignedShopId : null,
          assignedShopName: form.role === "STAFF" ? shop.name || null : null,
          status: form.status,
          createdBy: auth.currentUser?.uid || "super_admin",
        }),
      });

      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || `Server responded ${response.status}`);
      }

      showSuccessMessage(`User ${form.name.trim()} created successfully.`);
      resetForm();
      setStaffUsers((prevUsers) => prevUsers.filter((user) => user.id !== tempId));

      logActivity({
        userId: auth.currentUser?.uid || "",
        userEmail: auth.currentUser?.email || "",
        userRole: "SUPER_ADMIN",
        action: ACTIONS.USER_CREATE,
        entityId: payload.uid,
        entityName: form.name.trim(),
        shopId: form.assignedShopId || "",
        shopName: shop.name || "",
      }).catch((error) => console.warn("âš ï¸ Activity log failed:", error.message));
    } catch (error) {
      console.error("âŒ Create user failed:", error);
      setFormError(error.message || "Unable to create user.");
      setStaffUsers((prevUsers) => prevUsers.filter((user) => user.id !== tempId));
    } finally {
      setCreating(false);
    }
  };

  const toggleStatus = async (user) => {
    const newStatus = user.status === "active" ? "suspended" : "active";
    if (!window.confirm(`Change status for ${user.name} to ${newStatus}?`)) return;
    setProcessingUid(user.id);
    setStaffUsers((prevUsers) =>
      prevUsers.map((item) =>
        item.id === user.id ? { ...item, status: newStatus } : item
      )
    );

    try {
      const response = await fetch(`${BACKEND_URL}/update-user-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.id, status: newStatus }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Failed to update status.");
      }

      logActivity({
        userId: auth.currentUser?.uid || "",
        userEmail: auth.currentUser?.email || "",
        userRole: "SUPER_ADMIN",
        action: newStatus === "suspended" ? ACTIONS.USER_SUSPEND : ACTIONS.USER_ACTIVATE,
        entityId: user.id,
        entityName: user.name,
        shopId: user.assignedShopId || "",
        shopName: user.assignedShopName || "",
      }).catch(console.warn);
    } catch (error) {
      console.error("âŒ Toggle status failed:", error);
      alert(error.message || "Unable to update status.");
      setStaffUsers((prevUsers) =>
        prevUsers.map((item) =>
          item.id === user.id ? { ...item, status: user.status } : item
        )
      );
    } finally {
      setProcessingUid("");
    }
  };

  const deleteUser = async (user) => {
    if (user.email === auth.currentUser?.email) {
      alert("You cannot delete your own account.");
      return;
    }

    if (!window.confirm(`Delete ${user.name} (${user.email}) permanently?`)) {
      return;
    }

    setProcessingUid(user.id);
    setStaffUsers((prevUsers) => prevUsers.filter((item) => item.id !== user.id));

    try {
      const response = await fetch(`${BACKEND_URL}/delete-auth-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.id }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Failed to delete user.");
      }

      logActivity({
        userId: auth.currentUser?.uid || "",
        userEmail: auth.currentUser?.email || "",
        userRole: "SUPER_ADMIN",
        action: ACTIONS.USER_DELETE,
        entityId: user.id,
        entityName: user.name,
        shopId: user.assignedShopId || "",
        shopName: user.assignedShopName || "",
      }).catch(console.warn);
    } catch (error) {
      console.error("âŒ Delete user failed:", error);
      alert(error.message || "Unable to delete user.");
    } finally {
      setProcessingUid("");
    }
  };

  const selectedShopName = (shopId) => shops.find((shop) => shop.id === shopId)?.name || "";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-[32px] bg-gradient-to-r from-indigo-600 to-blue-600 p-6 text-white shadow-2xl">
          <h1 className="text-3xl font-bold">Staff User Manager</h1>
          <p className="mt-2 text-slate-100">Create users, assign shops, and manage active/suspended access with instant updates.</p>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[32px] bg-white p-6 shadow-xl border border-slate-200">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">Add a New User</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Full Name *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  disabled={creating}
                  placeholder="Ali Ahmed"
                  className="w-full rounded-3xl border border-slate-300 px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Email *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  disabled={creating}
                  placeholder="ali@example.com"
                  className="w-full rounded-3xl border border-slate-300 px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Password *</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  disabled={creating}
                  placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                  className="w-full rounded-3xl border border-slate-300 px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Role *</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value, assignedShopId: "" })}
                    disabled={creating}
                    className="w-full rounded-3xl border border-slate-300 px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100"
                  >
                    <option value="STAFF">Staff</option>
                    <option value="SUPER_ADMIN">Super Admin</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    disabled={creating}
                    className="w-full rounded-3xl border border-slate-300 px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100"
                  >
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
              </div>

              {form.role === "STAFF" && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Assigned Shop *</label>
                  <select
                    value={form.assignedShopId}
                    onChange={(e) => setForm({ ...form, assignedShopId: e.target.value })}
                    disabled={creating || loadingShops}
                    className="w-full rounded-3xl border border-slate-300 px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100"
                  >
                    <option value="">{loadingShops ? "Loading shops..." : "Select a shop"}</option>
                    {shops.map((shop) => (
                      <option key={shop.id} value={shop.id}>
                        {shop.name}
                      </option>
                    ))}
                  </select>
                  {!loadingShops && shops.length === 0 && (
                    <p className="mt-2 text-xs text-amber-700">No shops available. Create a shop first.</p>
                  )}
                </div>
              )}

              {formError && (
                <div className="rounded-3xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
                  {formError}
                </div>
              )}
              {formMsg && (
                <div className="rounded-3xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
                  {formMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={creating}
                className="w-full rounded-3xl bg-gradient-to-r from-indigo-600 to-blue-600 py-3 text-sm font-semibold text-white shadow-lg transition hover:brightness-110 disabled:opacity-70"
              >
                {creating ? "Creating user..." : "Create User"}
              </button>
            </form>
          </div>

          <div className="rounded-[32px] bg-white p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Live User List</h2>
                <p className="text-sm text-slate-500">Auto-updated from Firestore.</p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                <span className="h-2 w-2 rounded-full bg-emerald-700 animate-pulse" />
                Real-time
              </div>
            </div>

            {loadingUsers ? (
              <div className="rounded-3xl border border-slate-200 p-10 text-center text-slate-400">
                <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-500" />
                Loading users...
              </div>
            ) : staffUsers.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-300 p-10 text-center text-slate-400">
                <p className="text-3xl">ðŸ‘¥</p>
                <p className="mt-3">No users created yet.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[620px] overflow-y-auto pr-2">
                {staffUsers.map((user) => {
                  const isMe = user.email === auth.currentUser?.email;
                  const shopName = user.assignedShopName || selectedShopName(user.assignedShopId);
                  const isActive = user.status === "active";

                  return (
                    <div
                      key={user.id}
                      className={`rounded-3xl border p-4 shadow-sm transition ${
                        isMe ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900 truncate">{user.name || "Unnamed"}</p>
                            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${user.role === "SUPER_ADMIN" ? "bg-violet-100 text-violet-700" : "bg-sky-100 text-sky-700"}`}>
                              {user.role}
                            </span>
                            {isMe && (
                              <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">YOU</span>
                            )}
                            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${isActive ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                              {isActive ? "Active" : "Suspended"}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-slate-500">{user.email}</p>
                          {shopName && <p className="mt-1 text-xs text-indigo-600">ðŸ¬ {shopName}</p>}
                        </div>

                        {!isMe && (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={processingUid === user.id}
                              onClick={() => toggleStatus(user)}
                              className={`rounded-2xl px-4 py-2 text-xs font-semibold transition ${
                                isActive
                                  ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                                  : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                              } ${processingUid === user.id ? "opacity-70 cursor-not-allowed" : ""}`}
                            >
                              {processingUid === user.id ? "Processing..." : isActive ? "Suspend" : "Activate"}
                            </button>
                            <button
                              type="button"
                              disabled={processingUid === user.id}
                              onClick={() => deleteUser(user)}
                              className="rounded-2xl bg-rose-100 px-4 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-200 transition disabled:opacity-70"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl bg-white p-6 shadow-xl border border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900 mb-3">SUPER_ADMIN vs STAFF</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl bg-violet-50 p-4 border border-violet-100">
                <p className="font-semibold text-violet-800 mb-2">SUPER_ADMIN</p>
                <ul className="space-y-1 text-sm text-violet-700">
                  <li>Full system access</li>
                  <li>Manage shops, products, orders, and users</li>
                  <li>View activity logs and reports</li>
                </ul>
              </div>
              <div className="rounded-3xl bg-sky-50 p-4 border border-sky-100">
                <p className="font-semibold text-sky-800 mb-2">STAFF</p>
                <ul className="space-y-1 text-sm text-sky-700">
                  <li>Access assigned shop only</li>
                  <li>Manage products and categories</li>
                  <li>No user or shop management</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-xl border border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900 mb-3">Safety Tips</h3>
            <ul className="space-y-3 text-sm text-slate-600">
              <li>Use suspended status for temporary access lockout instead of deleting users.</li>
              <li>Keep email addresses unique across staff and admin accounts.</li>
              <li>All actions are logged automatically in the audit trail.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
