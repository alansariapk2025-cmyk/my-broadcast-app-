import { useCallback, useEffect, useMemo, useState } from "react";
import { db, auth } from "../firebase";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { logActivity, ACTIONS } from "../utils/activityLogger";
import { FaLock, FaTags } from "react-icons/fa";
import { Search, RefreshCw } from "lucide-react";
import PageShell, { SectionCard, FormField } from "./ui/PageShell";
import { useShop } from "../contexts/ShopContext";
import { useAuth } from "../contexts/AuthContext";
import { loadShopCategories, loadAllCategoriesWithShop } from "../utils/categoryLoader";
import { KNOWN_SHOP_NAMES, resolveShopDisplayName, PRIMARY_SHOP_NAME, PRIMARY_SHOP_ID } from "../constants/shops";
import { repairPrimaryShopFull } from "../utils/repairPrimaryShop";
import notify from "../utils/notify";

const IMGBB_KEY = import.meta.env.VITE_IMGBB_API_KEY || "";

export default function AddCategory({ assignedShopId = null, isStaff = false }) {
  const { shops: ctxShops, effectiveShopId } = useShop();
  const { isSuperAdmin, assignedShopName } = useAuth();
  const [shops, setShops] = useState([]);
  const [shopId, setShopId] = useState("");
  const [filterShopId, setFilterShopId] = useState("");
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState("");

  const [catName, setCatName] = useState("");
  const [catImageFile, setCatImageFile] = useState(null);
  const [parentForNew, setParentForNew] = useState("");
  const [editingCat, setEditingCat] = useState(null);
  const [isPopular, setIsPopular] = useState(false);
  const [isReselling, setIsReselling] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [expandedCategoryKey, setExpandedCategoryKey] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadShops = async () => {
      try {
        const snap = await getDocs(collection(db, "shops"));
        const s = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setShops(s.length ? s : [{ id: PRIMARY_SHOP_ID, name: PRIMARY_SHOP_NAME, status: "active" }, ...ctxShops]);
        if (s.length === 1 && !isStaff) setShopId(s[0].id);
      } catch {
        setShops(ctxShops);
      }
    };
    loadShops();
  }, [ctxShops, isStaff]);

  useEffect(() => {
    if (isStaff && assignedShopId) {
      setShopId(assignedShopId);
      setFilterShopId(assignedShopId);
    } else if (isSuperAdmin) {
      setFilterShopId(effectiveShopId || "");
      if (effectiveShopId && !shopId) setShopId(effectiveShopId);
    }
  }, [isStaff, assignedShopId, isSuperAdmin, effectiveShopId]);

  const shopNameMap = useMemo(() => {
    const m = { ...KNOWN_SHOP_NAMES };
    shops.forEach((s) => { m[s.id] = s.name; });
    return m;
  }, [shops]);

  const getShopLabel = (shopId, fallback) =>
    resolveShopDisplayName(shopId, shopNameMap, fallback);

  const fetchListCategories = useCallback(async () => {
    setLoading(true);
    try {
      if (isStaff && assignedShopId) {
        const list = await loadShopCategories(assignedShopId);
        setCategories(list.map((c) => ({ ...c, shopId: assignedShopId })));
        return;
      }
      if (filterShopId) {
        const list = await loadShopCategories(filterShopId);
        setCategories(list.map((c) => ({ ...c, shopId: c.shopId || filterShopId })));
        return;
      }
      const shopList = shops.length ? shops : ctxShops;
      const nameMap = { ...KNOWN_SHOP_NAMES };
      shopList.forEach((s) => { nameMap[s.id] = s.name || nameMap[s.id]; });
      const all = await loadAllCategoriesWithShop(nameMap);
      setCategories(all);
    } catch (err) {
      console.warn("Failed to load categories:", err);
      notify.error("Failed to load categories");
    } finally {
      setLoading(false);
    }
  }, [isStaff, assignedShopId, filterShopId, shops, ctxShops]);

  useEffect(() => {
    if (shops.length || ctxShops.length || isStaff) fetchListCategories();
  }, [fetchListCategories, shops.length, ctxShops.length, isStaff]);

  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => (c.name || "").toLowerCase().includes(q));
  }, [categories, search]);

  const stats = useMemo(() => ({
    total: filteredList.length,
    main: filteredList.filter((c) => !c.parentId).length,
    sub: filteredList.filter((c) => c.parentId).length,
    active: filteredList.filter((c) => c.isActive !== false).length,
  }), [filteredList]);

  const uploadToImgbb = async (file) => {
    if (!file) return null;
    const form = new FormData();
    form.append("image", file);
    const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, { method: "POST", body: form });
    const data = await res.json();
    return data?.data?.url || null;
  };

  const handleAddOrUpdateCategory = async (e) => {
    e.preventDefault();
    if (!shopId) return notify.warning("Select shop first.");
    if (!catName.trim()) return notify.warning("Category name required.");

    setLoading(true);
    try {
      let imageUrl = editingCat?.image || "";
      if (catImageFile) {
        const uploaded = await uploadToImgbb(catImageFile);
        if (!uploaded) {
          notify.error("Image upload failed.");
          setLoading(false);
          return;
        }
        imageUrl = uploaded;
      }

      const payload = {
        name: catName.trim(),
        image: imageUrl,
        parentId: parentForNew || null,
        isPopular,
        isReselling,
        isActive,
        shopId: targetShopId,
        shopName: getShopLabel(targetShopId),
        updatedAt: Timestamp.now(),
      };

      const targetShopId = editingCat?.shopId || shopId;

      if (editingCat) {
        await updateDoc(doc(db, "shops", targetShopId, "categories", editingCat.id), payload);
        await logActivity({
          userId: auth.currentUser?.uid || "",
          userEmail: auth.currentUser?.email || "",
          userRole: isStaff ? "STAFF" : "SUPER_ADMIN",
          action: ACTIONS.CATEGORY_UPDATE,
          entityName: catName.trim(),
          shopId: targetShopId,
        });
        notify.success("Category updated!");
      } else {
        await addDoc(collection(db, "shops", shopId, "categories"), {
          ...payload,
          createdAt: Timestamp.now(),
        });
        await logActivity({
          userId: auth.currentUser?.uid || "",
          userEmail: auth.currentUser?.email || "",
          userRole: isStaff ? "STAFF" : "SUPER_ADMIN",
          action: ACTIONS.CATEGORY_ADD,
          entityName: catName.trim(),
          shopId,
        });
        notify.success("Category added!");
      }

      resetForm();
      fetchListCategories();
    } catch (err) {
      console.error(err);
      notify.error("Error saving category.");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setCatName("");
    setCatImageFile(null);
    setParentForNew("");
    setEditingCat(null);
    setIsPopular(false);
    setIsReselling(false);
    setIsActive(true);
  };

  const handleEditCategory = (cat) => {
    if (cat.shopId) setShopId(cat.shopId);
    setEditingCat(cat);
    setCatName(cat.name);
    setParentForNew(cat.parentId || "");
    setIsPopular(!!cat.isPopular);
    setIsReselling(!!cat.isReselling);
    setIsActive(cat.isActive !== false);
    setCatImageFile(null);
  };

  const handleDeleteCategory = async (cat) => {
    const id = typeof cat === "string" ? cat : cat.id;
    const sid = typeof cat === "object" ? cat.shopId : shopId;
    if (!sid || !window.confirm("Delete this category?")) return;
    try {
      await deleteDoc(doc(db, "shops", sid, "categories", id));
      notify.success("Category deleted");
      fetchListCategories();
    } catch (err) {
      console.error(err);
      notify.error("Unable to delete category.");
    }
  };

  const getMainCategories = () => filteredList.filter((c) => !c.parentId);
  const getSubcategoriesOf = (pid) => filteredList.filter((c) => c.parentId === pid);
  const formMainCategories = categories.filter((c) => !c.parentId && (!shopId || c.shopId === shopId));

  return (
    <PageShell
      title="Categories & Subcategories"
      subtitle={isStaff ? "Manage categories for your assigned shop" : "All shops by default — filter by shop"}
      icon={FaTags}
      actions={
        <div className="flex gap-2">
          {isSuperAdmin && !isStaff && (
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm(`Firebase sync: ${PRIMARY_SHOP_NAME}?`)) return;
                setLoading(true);
                try {
                  const r = await repairPrimaryShopFull();
                  notify.success(`${r.productsUpdated} products, ${r.categoriesUpdated} categories updated`);
                  fetchListCategories();
                } catch (e) {
                  notify.error(e.message);
                } finally {
                  setLoading(false);
                }
              }}
              className="theme-btn-primary text-sm"
            >
              Sync {PRIMARY_SHOP_NAME}
            </button>
          )}
          <button type="button" onClick={fetchListCategories} className="theme-btn-secondary text-sm">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="stat-card p-4"><p className="text-xs theme-page-muted">Total</p><p className="text-2xl font-bold theme-highlight">{stats.total}</p></div>
        <div className="stat-card p-4"><p className="text-xs theme-page-muted">Main</p><p className="text-2xl font-bold theme-highlight">{stats.main}</p></div>
        <div className="stat-card p-4"><p className="text-xs theme-page-muted">Sub</p><p className="text-2xl font-bold theme-highlight">{stats.sub}</p></div>
        <div className="stat-card p-4"><p className="text-xs theme-page-muted">Active</p><p className="text-2xl font-bold theme-highlight">{stats.active}</p></div>
      </div>

      <SectionCard title={editingCat ? "Edit Category" : "Add Category"}>
        <div className="mb-4">
          <FormField label="Shop for Add/Edit" required>
            {isStaff ? (
              <div className="theme-card-inner w-full p-3 flex items-center gap-2">
                <FaLock className="w-4 h-4 text-blue-500" />
                <span className="font-semibold theme-page-title">
                  {getShopLabel(shopId, assignedShopName || PRIMARY_SHOP_NAME)}
                </span>
                <span className="ml-auto text-xs theme-badge theme-badge-info">LOCKED</span>
              </div>
            ) : (
              <select value={shopId} onChange={(e) => setShopId(e.target.value)} className="theme-select w-full">
                <option value="">-- Select Shop --</option>
                {shops.map((s) => (
                  <option key={s.id} value={s.id}>{getShopLabel(s.id, s.name)}</option>
                ))}
              </select>
            )}
          </FormField>
        </div>

        <form onSubmit={handleAddOrUpdateCategory} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <FormField label="Name" required>
            <input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="Category name" className="theme-input" />
          </FormField>
          <FormField label="Parent">
            <select value={parentForNew} onChange={(e) => setParentForNew(e.target.value)} className="theme-select">
              <option value="">Main Category</option>
              {formMainCategories.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Image">
            <input type="file" accept="image/*" onChange={(e) => setCatImageFile(e.target.files?.[0])} className="theme-input" />
          </FormField>

          <div className="flex gap-4 md:col-span-3 flex-wrap">
            <label className="flex items-center gap-2 text-sm theme-page-title cursor-pointer">
              <input type="checkbox" checked={isPopular} onChange={(e) => setIsPopular(e.target.checked)} />
              Popular
            </label>
            <label className="flex items-center gap-2 text-sm theme-page-title cursor-pointer">
              <input type="checkbox" checked={isReselling} onChange={(e) => setIsReselling(e.target.checked)} />
              Reselling
            </label>
            <label className="flex items-center gap-2 text-sm theme-page-title cursor-pointer">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              {isActive ? "Active" : "Disabled"}
            </label>
          </div>

          <div className="md:col-span-3 flex justify-end gap-3">
            {editingCat && <button type="button" onClick={resetForm} className="theme-btn-secondary">Cancel</button>}
            <button type="submit" className="theme-btn-primary" disabled={loading}>
              {editingCat ? "Update Category" : "Add Category"}
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Category List">
        <div className="flex flex-wrap gap-3 mb-4">
          {isSuperAdmin && !isStaff && (
            <select
              value={filterShopId}
              onChange={(e) => setFilterShopId(e.target.value)}
              className="theme-select min-w-[180px]"
            >
              <option value="">All Shops</option>
              {shops.map((s) => (
                <option key={s.id} value={s.id}>{getShopLabel(s.id, s.name)}</option>
              ))}
            </select>
          )}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 theme-page-muted" />
            <input
              type="text"
              placeholder="Search categories..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="theme-input pl-10"
            />
          </div>
        </div>

        {loading ? (
          <div className="theme-page-muted text-center py-8">Loading...</div>
        ) : getMainCategories().length === 0 ? (
          <div className="theme-page-muted text-center py-8">No categories found.</div>
        ) : (
          <div className="grid gap-4">
            {getMainCategories().map((main) => (
              <div key={`${main.shopId}-${main.id}`} className="theme-card-inner p-4">
                <div className="flex flex-wrap justify-between items-center gap-3">
                  <div className="flex items-center gap-4">
                    {main.image && <img src={main.image} alt="" className="w-12 h-12 rounded-lg object-cover" />}
                    <div>
                      <div className="font-medium theme-page-title flex gap-2 items-center flex-wrap">
                        {main.name}
                        {!filterShopId && main.shopId && (
                          <span className="theme-badge theme-badge-info font-bold">{getShopLabel(main.shopId, main.shopName)}</span>
                        )}
                        {main.isPopular && <span className="theme-badge theme-badge-warning">Popular</span>}
                        {main.isReselling && <span className="theme-badge theme-badge-success">Reselling</span>}
                        {main.isActive === false && <span className="theme-badge theme-badge-danger">Disabled</span>}
                      </div>
                      <p className="text-xs theme-page-muted">
                        Main Category
                        {!filterShopId && main.shopId && ` · ${getShopLabel(main.shopId, main.shopName)}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setExpandedCategoryKey(expandedCategoryKey === `${main.shopId}-${main.id}` ? null : `${main.shopId}-${main.id}`)} className="theme-btn-secondary text-xs">
                      {expandedCategoryKey === `${main.shopId}-${main.id}` ? "Hide" : "Subcategories"}
                    </button>
                    <button type="button" onClick={() => handleEditCategory(main)} className="theme-btn-secondary text-xs">Edit</button>
                    <button type="button" onClick={() => handleDeleteCategory(main)} className="theme-btn-danger text-xs">Delete</button>
                  </div>
                </div>

                {expandedCategoryKey === `${main.shopId}-${main.id}` && (
                  <div className="mt-3 ml-4 sm:ml-10 space-y-2">
                    {getSubcategoriesOf(main.id).map((sub) => (
                      <div key={`${sub.shopId}-${sub.id}`} className="theme-card-inner flex flex-wrap justify-between items-center gap-2 p-3">
                        <div className="flex items-center gap-3">
                          {sub.image && <img src={sub.image} alt="" className="w-10 h-10 rounded-md object-cover" />}
                          <div>
                            <p className="font-medium theme-page-title flex gap-2 flex-wrap">{sub.name}</p>
                            {sub.isActive === false && <span className="theme-badge theme-badge-danger text-[10px]">Disabled</span>}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => handleEditCategory(sub)} className="theme-btn-secondary text-xs">Edit</button>
                          <button type="button" onClick={() => handleDeleteCategory(sub)} className="theme-btn-danger text-xs">Delete</button>
                        </div>
                      </div>
                    ))}
                    {getSubcategoriesOf(main.id).length === 0 && (
                      <p className="text-xs theme-page-muted py-2">No subcategories.</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </PageShell>
  );
}
