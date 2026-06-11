import { useState, useEffect, useCallback, useMemo } from "react";
import { db } from "../../firebase";
import {
  collection,
  addDoc,
  deleteDoc,
  updateDoc,
  doc,
  getDocs,
} from "firebase/firestore";
import { Store, Plus, Trash2, Edit2, Power, PowerOff, RefreshCw, Search, MapPin, Phone } from "lucide-react";
import { PRIMARY_SHOP_ID, PRIMARY_SHOP_NAME, KNOWN_SHOP_NAMES, resolveShopDisplayName } from "../../constants/shops";
import notify from "../../utils/notify";
import { repairPrimaryShopFull } from "../../utils/repairPrimaryShop";
import { useShop } from "../../contexts/ShopContext";
import PageShell, { SectionCard, FormField } from "../ui/PageShell";

export default function AddShop() {
  const { refreshShops } = useShop();
  const [shopName, setShopName] = useState("");
  const [shopAddress, setShopAddress] = useState("");
  const [shopPhone, setShopPhone] = useState("");
  const [shops, setShops] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const shopsCollection = collection(db, "shops");

  const loadShops = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(shopsCollection);
      let list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (!list.some((s) => s.id === PRIMARY_SHOP_ID)) {
        list = [{ id: PRIMARY_SHOP_ID, name: PRIMARY_SHOP_NAME, status: "active", _needsRestore: true }, ...list];
      }
      setShops(list);
    } catch {
      notify.error("Failed to load shops");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadShops();
  }, [loadShops]);

  const stats = useMemo(() => ({
    total: shops.length,
    active: shops.filter((s) => s.status !== "disabled").length,
    disabled: shops.filter((s) => s.status === "disabled").length,
  }), [shops]);

  const filteredShops = useMemo(() => {
    const q = search.trim().toLowerCase();
    return shops.filter((s) => {
      const matchSearch = !q
        || (s.name || "").toLowerCase().includes(q)
        || (s.phone || "").includes(q)
        || (s.address || "").toLowerCase().includes(q);
      const matchStatus = statusFilter === "all"
        || (statusFilter === "active" && s.status !== "disabled")
        || (statusFilter === "disabled" && s.status === "disabled");
      return matchSearch && matchStatus;
    });
  }, [shops, search, statusFilter]);

  const resetForm = () => {
    setEditingId(null);
    setShopName("");
    setShopAddress("");
    setShopPhone("");
  };

  const handleAddShop = async (e) => {
    e.preventDefault();
    if (!shopName.trim()) {
      notify.warning("Shop name is required");
      return;
    }

    const exists = shops.find(
      (shop) => shop.name.toLowerCase() === shopName.trim().toLowerCase() && shop.id !== editingId
    );
    if (exists) {
      notify.warning("This shop already exists");
      return;
    }

    try {
      if (editingId) {
        await updateDoc(doc(db, "shops", editingId), {
          name: shopName.trim(),
          address: shopAddress.trim(),
          phone: shopPhone.trim(),
          updatedAt: Date.now(),
        });
        notify.success("Shop updated");
      } else {
        await addDoc(shopsCollection, {
          name: shopName.trim(),
          address: shopAddress.trim(),
          phone: shopPhone.trim(),
          status: "active",
          createdAt: Date.now(),
        });
        notify.success("Shop created successfully");
      }
      resetForm();
      loadShops();
    } catch (error) {
      console.error("Error saving shop:", error);
      notify.error("Failed to save shop");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this shop? This cannot be undone.")) return;
    try {
      await deleteDoc(doc(db, "shops", id));
      notify.success("Shop deleted");
      if (editingId === id) resetForm();
      loadShops();
    } catch {
      notify.error("Failed to delete shop");
    }
  };

  const toggleShopStatus = async (shop) => {
    const newStatus = shop.status === "disabled" ? "active" : "disabled";
    try {
      await updateDoc(doc(db, "shops", shop.id), { status: newStatus });
      notify.success(`Shop ${newStatus === "active" ? "enabled" : "disabled"}`);
      loadShops();
    } catch {
      notify.error("Failed to update shop status");
    }
  };

  const startEdit = (shop) => {
    setEditingId(shop.id);
    setShopName(shop.name);
    setShopAddress(shop.address || "");
    setShopPhone(shop.phone || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const [repairing, setRepairing] = useState(false);

  const repairPrimaryShop = async () => {
    if (!window.confirm(`Firebase mein "${PRIMARY_SHOP_NAME}" restore karein?\n\nShop + Products + Categories + Staff names update honge.`)) return;
    setRepairing(true);
    try {
      const result = await repairPrimaryShopFull();
      notify.success(
        `${result.shopName}: ${result.productsUpdated} products, ${result.categoriesUpdated} categories, ${result.usersUpdated} staff updated`
      );
      await refreshShops?.();
      loadShops();
    } catch (err) {
      console.error(err);
      notify.error(err.message || "Sync failed — Super Admin login check karein");
    } finally {
      setRepairing(false);
    }
  };

  const displayShopName = (shop) => resolveShopDisplayName(shop.id, {}, shop.name);

  return (
    <PageShell
      title="Shop Management"
      subtitle="Add, edit and manage shops for multi-tenant POS"
      icon={Store}
      actions={
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={repairPrimaryShop} disabled={repairing} className="theme-btn-primary text-sm">
            {repairing ? "Syncing..." : `Sync ${PRIMARY_SHOP_NAME} (Firebase)`}
          </button>
          <button type="button" onClick={loadShops} className="theme-btn-secondary text-sm">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="stat-card p-4">
          <p className="text-xs theme-page-muted">Total Shops</p>
          <p className="text-2xl font-bold theme-highlight">{stats.total}</p>
        </div>
        <div className="stat-card p-4">
          <p className="text-xs theme-page-muted">Active</p>
          <p className="text-2xl font-bold theme-highlight">{stats.active}</p>
        </div>
        <div className="stat-card p-4">
          <p className="text-xs theme-page-muted">Disabled</p>
          <p className="text-2xl font-bold theme-highlight">{stats.disabled}</p>
        </div>
      </div>

      <SectionCard title={editingId ? "Edit Shop" : "Add Shop"} icon={Plus}>
        <form onSubmit={handleAddShop} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormField label="Shop Name" required>
              <input type="text" placeholder="Shop name" value={shopName} onChange={(e) => setShopName(e.target.value)} className="theme-input" />
            </FormField>
            <FormField label="Address">
              <input type="text" placeholder="Address" value={shopAddress} onChange={(e) => setShopAddress(e.target.value)} className="theme-input" />
            </FormField>
            <FormField label="Phone">
              <input type="text" placeholder="Phone" value={shopPhone} onChange={(e) => setShopPhone(e.target.value)} className="theme-input" />
            </FormField>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="theme-btn-primary">
              <Plus className="w-4 h-4" />
              {editingId ? "Update Shop" : "Add Shop"}
            </button>
            {editingId && (
              <button type="button" onClick={resetForm} className="theme-btn-secondary">Cancel Edit</button>
            )}
          </div>
        </form>
      </SectionCard>

      <SectionCard title="All Shops" icon={Store}>
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 theme-page-muted" />
            <input
              type="text"
              placeholder="Search name, phone, address..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="theme-input pl-10"
            />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="theme-select min-w-[140px]">
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>

        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="p-4">Shop</th>
                <th className="p-4 hidden md:table-cell">Contact</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredShops.map((shop) => (
                <tr key={shop.id} className={`border-t theme-card-inner ${editingId === shop.id ? "ring-1 ring-blue-500/40" : ""}`}>
                  <td className="p-4">
                    <p className="font-medium theme-page-title">{displayShopName(shop)}</p>
                    <p className="text-[10px] theme-page-muted font-mono">{shop.id}</p>
                    <p className="text-xs theme-page-muted flex items-center gap-1 mt-1 md:hidden">
                      <Phone className="w-3 h-3" /> {shop.phone || "—"}
                    </p>
                    {shop.address && (
                      <p className="text-xs theme-page-muted flex items-center gap-1 mt-1">
                        <MapPin className="w-3 h-3 shrink-0" /> {shop.address}
                      </p>
                    )}
                    {shop._needsRestore && (
                      <span className="theme-badge theme-badge-warning text-[10px] mt-1">Firebase mein restore karein — Sync button</span>
                    )}
                  </td>
                  <td className="p-4 hidden md:table-cell theme-page-muted">{shop.phone || "—"}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${shop.status === "disabled" ? "theme-badge theme-badge-danger" : "theme-badge theme-badge-info"}`}>
                      {shop.status === "disabled" ? "Disabled" : "Active"}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-2">
                      <button type="button" onClick={() => toggleShopStatus(shop)} className="theme-btn-secondary p-2" title={shop.status === "disabled" ? "Enable" : "Disable"}>
                        {shop.status === "disabled" ? <Power size={16} /> : <PowerOff size={16} />}
                      </button>
                      <button type="button" onClick={() => startEdit(shop)} className="theme-btn-secondary p-2" title="Edit">
                        <Edit2 size={16} />
                      </button>
                      <button type="button" onClick={() => handleDelete(shop.id)} className="theme-btn-danger p-2" title="Delete">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredShops.length === 0 && !loading && (
                <tr>
                  <td colSpan={4} className="p-8 text-center theme-page-muted">
                    {shops.length === 0 ? "No shops yet. Add your first shop above." : "No shops match your search."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </PageShell>
  );
}
