import { useCallback, useEffect, useMemo, useState } from "react";
import { Shield, Store, Save, RefreshCw, Loader2, ToggleLeft, ToggleRight } from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import { db, auth } from "../firebase";
import PageShell from "./ui/PageShell";
import notify from "../utils/notify";
import {
  STAFF_PERMISSION_OPTIONS,
  STAFF_PERMISSION_IDS,
  DEFAULT_STAFF_PERMISSIONS,
} from "../constants/permissions";
import { logActivity } from "../utils/activityLogger";

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || "http://localhost:5000";

export default function StaffPermissions() {
  const [staffUsers, setStaffUsers] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadStaff = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "users"));
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((u) => u.role === "STAFF")
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setStaffUsers(list);
      if (!selectedId && list.length > 0) setSelectedId(list[0].id);
    } catch {
      notify.error("Failed to load staff");
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  const selectedUser = useMemo(
    () => staffUsers.find((u) => u.id === selectedId),
    [staffUsers, selectedId]
  );

  useEffect(() => {
    if (selectedUser) {
      const perms = Array.isArray(selectedUser.permissions) && selectedUser.permissions.length > 0
        ? selectedUser.permissions
        : DEFAULT_STAFF_PERMISSIONS;
      setPermissions([...perms]);
    }
  }, [selectedUser]);

  const togglePermission = (id) => {
    setPermissions((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const grouped = useMemo(() => {
    const map = {};
    STAFF_PERMISSION_OPTIONS.forEach((opt) => {
      if (!map[opt.group]) map[opt.group] = [];
      map[opt.group].push(opt);
    });
    return map;
  }, []);

  const savePermissions = async () => {
    if (!selectedUser) return;
    if (permissions.length === 0) {
      notify.warning("Staff must have at least one permission");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${BACKEND_URL}/update-user-permissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: selectedUser.id, permissions }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error);

      notify.success(`Permissions updated for ${selectedUser.name}`);
      setStaffUsers((prev) =>
        prev.map((u) => (u.id === selectedUser.id ? { ...u, permissions: [...permissions] } : u))
      );
      logActivity({
        userId: auth.currentUser?.uid || "",
        userEmail: auth.currentUser?.email || "",
        userRole: "SUPER_ADMIN",
        action: "PERMISSIONS_UPDATE",
        entityId: selectedUser.id,
        entityName: selectedUser.name,
        shopId: selectedUser.assignedShopId || "",
        shopName: selectedUser.assignedShopName || "",
      }).catch(() => {});
    } catch (err) {
      notify.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const selectAll = () => setPermissions([...STAFF_PERMISSION_IDS]);
  const resetDefault = () => setPermissions([...DEFAULT_STAFF_PERMISSIONS]);

  return (
    <PageShell
      title="Staff Permissions"
      subtitle="Turn pages on/off for each staff member individually"
      icon={Shield}
      actions={
        <button type="button" onClick={loadStaff} className="theme-btn-secondary">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="theme-card p-5 lg:col-span-1">
          <h3 className="font-semibold theme-page-title mb-4">Select Staff</h3>
          {loading ? (
            <Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" />
          ) : staffUsers.length === 0 ? (
            <p className="theme-page-muted text-sm">No staff users. Create staff in User Management first.</p>
          ) : (
            <ul className="space-y-2 max-h-96 overflow-y-auto">
              {staffUsers.map((user) => (
                <li key={user.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(user.id)}
                    className={`w-full text-left p-3 rounded-xl transition border ${
                      selectedId === user.id
                        ? "border-blue-500 bg-blue-500/10"
                        : "border-transparent theme-card-inner hover:border-blue-500/30"
                    }`}
                  >
                    <p className="font-medium theme-page-title text-sm">{user.name}</p>
                    <p className="text-xs theme-page-muted">{user.email}</p>
                    {user.assignedShopName && (
                      <p className="text-xs text-blue-400 mt-1 flex items-center gap-1">
                        <Store className="w-3 h-3" /> {user.assignedShopName}
                      </p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="theme-card p-5 lg:col-span-2">
          {!selectedUser ? (
            <p className="theme-page-muted text-center py-12">Select a staff member</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <div>
                  <h3 className="font-semibold theme-page-title">{selectedUser.name}</h3>
                  <p className="text-sm theme-page-muted">{selectedUser.email}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={selectAll} className="theme-btn-secondary text-xs">Enable All</button>
                  <button type="button" onClick={resetDefault} className="theme-btn-secondary text-xs">Reset Default</button>
                  <button type="button" onClick={savePermissions} disabled={saving} className="theme-btn-primary text-xs">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save
                  </button>
                </div>
              </div>

              {Object.entries(grouped).map(([group, items]) => (
                <div key={group} className="mb-6">
                  <h4 className="text-xs font-bold uppercase tracking-wider theme-page-muted mb-3">{group}</h4>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {items.map(({ id, label, icon: Icon }) => {
                      const enabled = permissions.includes(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => togglePermission(id)}
                          className={`flex items-center justify-between p-3 rounded-xl border transition ${
                            enabled
                              ? "border-blue-500/50 bg-blue-500/10"
                              : "theme-card-inner border-transparent opacity-70"
                          }`}
                        >
                          <span className="flex items-center gap-2 text-sm theme-page-title">
                            <Icon className="w-4 h-4 text-blue-500" />
                            {label}
                          </span>
                          {enabled ? (
                            <ToggleRight className="w-6 h-6 text-blue-500" />
                          ) : (
                            <ToggleLeft className="w-6 h-6 theme-page-muted" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </PageShell>
  );
}
