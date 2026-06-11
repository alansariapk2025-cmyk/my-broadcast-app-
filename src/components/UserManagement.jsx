import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Users, UserPlus, Mail, Lock, Store, Shield, Trash2, RefreshCw,
  CheckCircle2, XCircle, AlertCircle, Loader2, Pencil, Search, X, KeyRound,
} from "lucide-react";
import { auth } from "../firebase";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import PageShell, { FormField, SectionCard } from "./ui/PageShell";
import notify from "../utils/notify";
import { logActivity, ACTIONS } from "../utils/activityLogger";
import { DEFAULT_STAFF_PERMISSIONS } from "../constants/permissions";

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || "http://localhost:5000";

const EMPTY_FORM = {
  name: "",
  email: "",
  password: "",
  role: "STAFF",
  assignedShopId: "",
  status: "active",
};

function validatePassword(pw, required = false) {
  if (!pw) return required ? "Password is required" : null;
  if (pw.length < 8) return "Minimum 8 characters";
  if (!/[A-Za-z]/.test(pw)) return "Include at least one letter";
  if (!/[0-9]/.test(pw)) return "Include at least one number";
  return null;
}

export default function UserManagement() {
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [formErrors, setFormErrors] = useState({});
  const [emailStatus, setEmailStatus] = useState(null);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [creating, setCreating] = useState(false);
  const [users, setUsers] = useState([]);
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingUid, setProcessingUid] = useState("");
  const [search, setSearch] = useState("");
  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", role: "STAFF", assignedShopId: "", status: "active", password: "", confirmPassword: "" });
  const [editErrors, setEditErrors] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersSnap, shopsSnap] = await Promise.all([
        getDocs(collection(db, "users")),
        getDocs(collection(db, "shops")),
      ]);
      setUsers(
        usersSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      );
      setShops(shopsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch {
      notify.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.name || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q) ||
        (u.assignedShopName || "").toLowerCase().includes(q)
    );
  }, [users, search]);

  const stats = useMemo(
    () => ({
      total: users.length,
      staff: users.filter((u) => u.role === "STAFF").length,
      admin: users.filter((u) => u.role === "SUPER_ADMIN").length,
      suspended: users.filter((u) => u.status === "suspended").length,
    }),
    [users]
  );

  const checkEmailDuplicate = async (email) => {
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailStatus(null);
      return;
    }
    setCheckingEmail(true);
    try {
      if (users.some((u) => u.email?.toLowerCase() === trimmed)) {
        setEmailStatus("duplicate");
        return;
      }
      const res = await fetch(`${BACKEND_URL}/check-email-exists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json();
      setEmailStatus(data.exists ? "duplicate" : "available");
    } catch {
      setEmailStatus(null);
    } finally {
      setCheckingEmail(false);
    }
  };

  const validateCreate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = "Name is required";
    if (!form.email.trim()) errs.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.email = "Invalid email";
    else if (emailStatus === "duplicate") errs.email = "Email already registered";
    const pwErr = validatePassword(form.password, true);
    if (pwErr) errs.password = pwErr;
    if (form.role === "STAFF" && !form.assignedShopId) errs.shop = "Shop required for staff";
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!validateCreate()) {
      notify.warning("Fix form errors");
      return;
    }
    setCreating(true);
    const shop = shops.find((s) => s.id === form.assignedShopId);
    try {
      const res = await fetch(`${BACKEND_URL}/create-staff-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password,
          role: form.role,
          assignedShopId: form.role === "STAFF" ? form.assignedShopId : null,
          assignedShopName: form.role === "STAFF" ? shop?.name || "" : null,
          permissions: form.role === "STAFF" ? DEFAULT_STAFF_PERMISSIONS : undefined,
          status: form.status,
          createdBy: auth.currentUser?.uid || "super_admin",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Create failed");

      notify.success(`User "${form.name}" created`);
      setForm({ ...EMPTY_FORM });
      setEmailStatus(null);
      loadData();
    } catch (err) {
      notify.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (user) => {
    setEditUser(user);
    setEditForm({
      name: user.name || "",
      role: user.role || "STAFF",
      assignedShopId: user.assignedShopId || "",
      status: user.status || "active",
      password: "",
      confirmPassword: "",
    });
    setEditErrors({});
  };

  const closeEdit = () => {
    setEditUser(null);
    setEditForm({ name: "", role: "STAFF", assignedShopId: "", status: "active", password: "", confirmPassword: "" });
    setEditErrors({});
  };

  const validateEdit = () => {
    const errs = {};
    if (!editForm.name.trim()) errs.name = "Name required";
    if (editForm.role === "STAFF" && !editForm.assignedShopId) errs.shop = "Shop required";
    const pwErr = validatePassword(editForm.password, false);
    if (pwErr) errs.password = pwErr;
    if (editForm.password && editForm.password !== editForm.confirmPassword) {
      errs.confirmPassword = "Passwords do not match";
    }
    setEditErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const saveEdit = async () => {
    if (!editUser || !validateEdit()) return;
    const isMe = editUser.email === auth.currentUser?.email;
    if (isMe && editForm.role !== editUser.role) {
      notify.error("You cannot change your own role");
      return;
    }
    setSavingEdit(true);
    const shop = shops.find((s) => s.id === editForm.assignedShopId);
    try {
      const res = await fetch(`${BACKEND_URL}/update-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: editUser.id,
          name: editForm.name.trim(),
          role: editForm.role,
          assignedShopId: editForm.role === "STAFF" ? editForm.assignedShopId : null,
          assignedShopName: editForm.role === "STAFF" ? shop?.name || "" : null,
          status: editForm.status,
          password: editForm.password || undefined,
          updatedBy: auth.currentUser?.uid || "super_admin",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Update failed");

      notify.success("User updated");
      logActivity({
        userId: auth.currentUser?.uid || "",
        userEmail: auth.currentUser?.email || "",
        userRole: "SUPER_ADMIN",
        action: ACTIONS.UPDATE,
        entityId: editUser.id,
        entityName: editForm.name.trim(),
        shopId: editForm.assignedShopId || "",
      }).catch(() => {});
      closeEdit();
      loadData();
    } catch (err) {
      notify.error(err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  const toggleStatus = async (user) => {
    const newStatus = user.status === "active" ? "suspended" : "active";
    if (!window.confirm(`Set ${user.name} to ${newStatus}?`)) return;
    setProcessingUid(user.id);
    try {
      const res = await fetch(`${BACKEND_URL}/update-user-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.id, status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error);
      notify.success(`User ${newStatus === "active" ? "activated" : "suspended"}`);
      loadData();
    } catch (err) {
      notify.error(err.message);
    } finally {
      setProcessingUid("");
    }
  };

  const deleteUser = async (user) => {
    if (user.email === auth.currentUser?.email) {
      notify.error("You cannot delete your own account");
      return;
    }
    if (!window.confirm(`Delete ${user.name} permanently?`)) return;
    setProcessingUid(user.id);
    try {
      const res = await fetch(`${BACKEND_URL}/delete-auth-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error);
      notify.success("User deleted");
      loadData();
    } catch (err) {
      notify.error(err.message);
    } finally {
      setProcessingUid("");
    }
  };

  return (
    <PageShell
      title="User Management"
      subtitle="Create, edit & secure staff accounts — strong passwords enforced"
      icon={Users}
      actions={
        <button type="button" onClick={loadData} className="theme-btn-secondary text-sm">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="stat-card p-4"><p className="text-xs theme-page-muted">Total</p><p className="text-2xl font-bold theme-highlight">{stats.total}</p></div>
        <div className="stat-card p-4"><p className="text-xs theme-page-muted">Staff</p><p className="text-2xl font-bold theme-page-title">{stats.staff}</p></div>
        <div className="stat-card p-4"><p className="text-xs theme-page-muted">Super Admin</p><p className="text-2xl font-bold theme-page-title">{stats.admin}</p></div>
        <div className="stat-card p-4"><p className="text-xs theme-page-muted">Suspended</p><p className="text-2xl font-bold text-red-400">{stats.suspended}</p></div>
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <SectionCard title="Add New User" className="xl:col-span-2">
          <form onSubmit={handleCreate} className="space-y-4">
            <FormField label="Full Name" required error={formErrors.name}>
              <input className="theme-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ali Ahmed" />
            </FormField>

            <FormField label="Email" required error={formErrors.email}>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 theme-page-muted" />
                <input
                  type="email"
                  className="theme-input pl-10 pr-10"
                  value={form.email}
                  onChange={(e) => { setForm({ ...form, email: e.target.value }); setEmailStatus(null); }}
                  onBlur={(e) => checkEmailDuplicate(e.target.value)}
                  placeholder="user@example.com"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2">
                  {checkingEmail && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                  {!checkingEmail && emailStatus === "available" && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                  {!checkingEmail && emailStatus === "duplicate" && <XCircle className="w-4 h-4 text-red-500" />}
                </span>
              </div>
            </FormField>

            <FormField label="Password" required error={formErrors.password} hint="Min 8 chars, letter + number">
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 theme-page-muted" />
                <input type="password" className="theme-input pl-10" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Secure password" />
              </div>
            </FormField>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Role">
                <select className="theme-select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value, assignedShopId: "" })}>
                  <option value="STAFF">Staff</option>
                  <option value="SUPER_ADMIN">Super Admin</option>
                </select>
              </FormField>
              <FormField label="Status">
                <select className="theme-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
              </FormField>
            </div>

            {form.role === "STAFF" && (
              <FormField label="Assigned Shop" required error={formErrors.shop}>
                <select className="theme-select" value={form.assignedShopId} onChange={(e) => setForm({ ...form, assignedShopId: e.target.value })}>
                  <option value="">Select shop</option>
                  {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </FormField>
            )}

            <button type="submit" disabled={creating || emailStatus === "duplicate"} className="theme-btn-primary w-full justify-center">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              {creating ? "Creating..." : "Create User"}
            </button>
          </form>
        </SectionCard>

        <SectionCard title="All Users" className="xl:col-span-3">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 theme-page-muted" />
            <input type="text" placeholder="Search name, email, shop..." value={search} onChange={(e) => setSearch(e.target.value)} className="theme-input pl-10" />
          </div>

          {loading ? (
            <div className="py-16 text-center theme-page-muted"><Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-blue-500" />Loading...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-16 text-center theme-page-muted">No users found</div>
          ) : (
            <div className="space-y-3 max-h-[640px] overflow-y-auto pr-1">
              {filteredUsers.map((user) => {
                const isMe = user.email === auth.currentUser?.email;
                const isActive = user.status === "active";
                return (
                  <div key={user.id} className="theme-card-inner p-4 flex flex-wrap gap-3 justify-between items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-extrabold theme-page-title">{user.name || "Unnamed"}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${user.role === "SUPER_ADMIN" ? "bg-violet-500/20 text-violet-300" : "bg-blue-500/20 text-blue-300"}`}>
                          {user.role === "SUPER_ADMIN" ? "Super Admin" : "Staff"}
                        </span>
                        {isMe && <span className="theme-badge text-[10px]">You</span>}
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${isActive ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                          {isActive ? "Active" : "Suspended"}
                        </span>
                      </div>
                      <p className="text-sm theme-page-muted mt-1">{user.email}</p>
                      {user.assignedShopName && (
                        <p className="text-xs text-blue-400 mt-1 flex items-center gap-1 font-semibold">
                          <Store className="w-3 h-3" /> {user.assignedShopName}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => openEdit(user)} className="theme-btn-secondary text-xs">
                        <Pencil className="w-3 h-3" /> Edit
                      </button>
                      {!isMe && (
                        <>
                          <button type="button" disabled={processingUid === user.id} onClick={() => toggleStatus(user)} className="theme-btn-secondary text-xs">
                            {isActive ? "Suspend" : "Activate"}
                          </button>
                          <button type="button" disabled={processingUid === user.id} onClick={() => deleteUser(user)} className="theme-btn-danger text-xs">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>

      {editUser && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="theme-glass rounded-xl w-full max-w-lg border border-blue-500/20 shadow-2xl">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="font-extrabold theme-page-title flex items-center gap-2">
                <Pencil className="w-5 h-5 text-blue-400" /> Edit User
              </h3>
              <button type="button" onClick={closeEdit} className="theme-btn-secondary p-2"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
              <p className="text-sm theme-page-muted">{editUser.email}</p>

              <FormField label="Full Name" required error={editErrors.name}>
                <input className="theme-input" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </FormField>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Role">
                  <select
                    className="theme-select"
                    value={editForm.role}
                    disabled={editUser.email === auth.currentUser?.email}
                    onChange={(e) => setEditForm({ ...editForm, role: e.target.value, assignedShopId: "" })}
                  >
                    <option value="STAFF">Staff</option>
                    <option value="SUPER_ADMIN">Super Admin</option>
                  </select>
                </FormField>
                <FormField label="Status">
                  <select className="theme-select" value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </FormField>
              </div>

              {editForm.role === "STAFF" && (
                <FormField label="Assigned Shop" required error={editErrors.shop}>
                  <select className="theme-select" value={editForm.assignedShopId} onChange={(e) => setEditForm({ ...editForm, assignedShopId: e.target.value })}>
                    <option value="">Select shop</option>
                    {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </FormField>
              )}

              <div className="theme-card-inner p-3 space-y-3">
                <p className="text-xs font-bold theme-page-title flex items-center gap-1"><KeyRound className="w-3 h-3" /> Reset Password (optional)</p>
                <FormField label="New Password" error={editErrors.password} hint="Leave blank to keep current">
                  <input type="password" className="theme-input" value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} placeholder="Min 8, letter + number" />
                </FormField>
                <FormField label="Confirm Password" error={editErrors.confirmPassword}>
                  <input type="password" className="theme-input" value={editForm.confirmPassword} onChange={(e) => setEditForm({ ...editForm, confirmPassword: e.target.value })} />
                </FormField>
              </div>
            </div>
            <div className="p-4 border-t border-white/10 flex justify-end gap-2">
              <button type="button" onClick={closeEdit} className="theme-btn-secondary">Cancel</button>
              <button type="button" onClick={saveEdit} disabled={savingEdit} className="theme-btn-primary">
                {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
