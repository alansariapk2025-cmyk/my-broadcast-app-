import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { collection, getDocs, updateDoc, deleteDoc, doc, writeBatch, serverTimestamp, query, orderBy, limit } from "firebase/firestore";
import { db } from "../firebase";
import toast, { Toaster } from "react-hot-toast";
import { FaEdit, FaSave, FaTimes, FaBox, FaTrash, FaSearch, FaChevronLeft, FaChevronRight, FaFilter, FaSortAmountDown, FaSortAmountUp, FaCheckCircle, FaDownload, FaSync, FaList, FaThLarge, FaImage, FaToggleOn, FaToggleOff, FaChartBar, FaRupeeSign, FaCubes, FaFire, FaFileExcel, FaFileCsv, FaCloudDownloadAlt, FaCloudUploadAlt, FaCheckDouble, FaBan, FaStar, FaRegStar, FaWarehouse, FaExclamationTriangle, FaWifi, FaTag } from "react-icons/fa";
import { Workbook } from "exceljs";
import { saveAs } from "file-saver";
import { useShop } from "../contexts/ShopContext";
import { useAuth } from "../contexts/AuthContext";
import { loadShopCategories, loadAllCategoriesWithShop, buildCategoryShopMap, enrichProductsWithShop } from "../utils/categoryLoader";
import PageShell, { SectionCard } from "./ui/PageShell";
import { resolveShopDisplayName, KNOWN_SHOP_NAMES } from "../constants/shops";
import { Store } from "lucide-react";

const num = v => typeof v === "number" && !isNaN(v) ? v : Number(v) || 0;
const formatPrice = p => `PKR ${num(p).toLocaleString()}`;
const CACHE_KEY = "admin_products_cache_v3";

const StatusBadge = ({ status, onChange, disabled }) => (
  <button
    type="button"
    onClick={() => onChange?.()}
    disabled={disabled}
    className={`theme-badge ${status === "active" ? "theme-badge-success" : "theme-badge-danger"} ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:opacity-90"}`}
  >
    {status === "active" ? <><FaToggleOn className="w-3.5 h-3.5" /> Active</> : <><FaToggleOff className="w-3.5 h-3.5" /> Inactive</>}
  </button>
);

const StockBadge = ({ stock }) => {
  const s = num(stock);
  if (s === 0) return <span className="theme-badge theme-badge-danger"><FaBan className="w-3 h-3" /> Out</span>;
  if (s < 10) return <span className="theme-badge theme-badge-warning"><FaExclamationTriangle className="w-3 h-3" /> {s}</span>;
  return <span className="theme-badge theme-badge-success"><FaWarehouse className="w-3 h-3" /> {s}</span>;
};

export default function ProductList({ assignedShopId = null, isStaff = false }) {
  const { shops, effectiveShopId, viewingAllShops } = useShop();
  const { isSuperAdmin } = useAuth();
  const [allProducts, setAllProducts] = useState([]);
  const [categoriesMap, setCategoriesMap] = useState({});
  const [shopFilter, setShopFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(true);
  const [editProduct, setEditProduct] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [updatingStatus, setUpdatingStatus] = useState(null);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [stockFilter, setStockFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [discountFilter, setDiscountFilter] = useState("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState("desc");
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState("table");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [showStats, setShowStats] = useState(true);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [fullImage, setFullImage] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef(null), searchRef = useRef(null), fetchingRef = useRef(false);

  useEffect(() => {
    if (isStaff && assignedShopId) {
      setShopFilter(assignedShopId);
    } else if (isSuperAdmin) {
      setShopFilter(effectiveShopId || "");
    }
  }, [isStaff, assignedShopId, isSuperAdmin, effectiveShopId]);

  const loadCategoriesForFilter = useCallback(async (filterId) => {
    try {
      const map = {};
      if (filterId) {
        const list = await loadShopCategories(filterId);
        list.forEach((c) => { map[c.id] = { ...c, shopId: c.shopId || filterId }; });
      } else if (isSuperAdmin) {
        const shopNames = { ...KNOWN_SHOP_NAMES };
        shops.forEach((s) => { shopNames[s.id] = s.name || shopNames[s.id]; });
        const list = await loadAllCategoriesWithShop(shopNames);
        list.forEach((c) => { map[c.id] = c; });
      } else if (assignedShopId) {
        const list = await loadShopCategories(assignedShopId);
        list.forEach((c) => { map[c.id] = { ...c, shopId: c.shopId || assignedShopId }; });
      }
      setCategoriesMap(map);
    } catch {
      toast.error("Failed to load categories!");
    }
  }, [isSuperAdmin, assignedShopId, shops]);

  useEffect(() => {
    loadCategoriesForFilter(shopFilter || (isStaff ? assignedShopId : ""));
  }, [shopFilter, loadCategoriesForFilter, isStaff, assignedShopId]);

  const updateCache = (data) => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch (e) { console.warn("Cache save failed", e); }
  };

  const fetchProducts = useCallback(async (force = false) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    try {
      if (!force) {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed.length > 0) {
            setAllProducts(parsed);
            setLoading(false);
            fetchingRef.current = false;
            return;
          }
        }
      }
      const q = query(collection(db, "products"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      const docs = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
          updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null
        };
      });
      setAllProducts(docs);
      updateCache(docs);
      setIsConnected(true);
    } catch (e) {
      console.error(e); setIsConnected(false); toast.error("Failed to load products!");
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) setAllProducts(JSON.parse(cached));
    } finally {
      setLoading(false); fetchingRef.current = false;
    }
  }, []);

  useEffect(() => { fetchProducts(false); }, []);

  useEffect(() => {
    const h = e => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === "Escape") { setEditProduct(null); setFullImage(null); setShowImportModal(false); setShowExportModal(false); }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, []);

  const shopNameMap = useMemo(() => {
    const m = { ...KNOWN_SHOP_NAMES };
    shops.forEach((s) => { m[s.id] = s.name; });
    Object.values(categoriesMap).forEach((c) => {
      if (c.shopId && (c.shopName || c.name)) {
        m[c.shopId] = m[c.shopId] || c.shopName;
      }
    });
    return m;
  }, [shops, categoriesMap]);

  const resolveShopName = useCallback(
    (shopId, existingName) => resolveShopDisplayName(shopId, shopNameMap, existingName),
    [shopNameMap]
  );

  const categoryShopMap = useMemo(() => buildCategoryShopMap(categoriesMap), [categoriesMap]);

  const enrichedProducts = useMemo(() => {
    const withShop = enrichProductsWithShop(allProducts, categoryShopMap);
    return withShop.map((p) => ({
      ...p,
      shopName: resolveShopName(p.shopId, p.shopName),
    }));
  }, [allProducts, categoryShopMap, resolveShopName]);

  const filteredProducts = useMemo(() => {
    let list = [...enrichedProducts];

    if (isStaff && assignedShopId) {
      list = list.filter((p) => p.shopId === assignedShopId);
    } else if (shopFilter) {
      list = list.filter((p) => p.shopId === shopFilter);
    }

    if (selectedCategory) list = list.filter(p => p.category === selectedCategory);
    if (statusFilter) list = list.filter(p => p.status === statusFilter);

    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      list = list.filter(p => (p.nameEn || "").toLowerCase().includes(t) || (p.nameUr || "").toLowerCase().includes(t) || (p.categoryName || "").toLowerCase().includes(t) || (p.sku || "").toLowerCase().includes(t));
    }

    if (stockFilter === "instock") list = list.filter(p => num(p.stock) > 0);
    else if (stockFilter === "outofstock") list = list.filter(p => num(p.stock) === 0);
    else if (stockFilter === "lowstock") list = list.filter(p => num(p.stock) > 0 && num(p.stock) < 10);

    if (discountFilter === "discounted") list = list.filter(p => num(p.discount) > 0);

    list.sort((a, b) => {
      let av, bv;
      if (sortBy === "nameEn") { av = (a.nameEn || "").toLowerCase(); bv = (b.nameEn || "").toLowerCase(); }
      else if (sortBy === "price") { av = num(a.price); bv = num(b.price); }
      else if (sortBy === "stock") { av = num(a.stock); bv = num(b.stock); }
      else { av = new Date(a.createdAt || 0).getTime(); bv = new Date(b.createdAt || 0).getTime(); }
      if (av === bv) return 0;
      return sortOrder === "asc" ? (av < bv ? -1 : 1) : (av > bv ? -1 : 1);
    });

    return list;
  }, [enrichedProducts, selectedCategory, statusFilter, searchTerm, stockFilter, discountFilter, sortBy, sortOrder, isStaff, assignedShopId, shopFilter]);

  const stats = useMemo(() => ({
    total: filteredProducts.length,
    active: filteredProducts.filter(p => p.status === "active").length,
    inactive: filteredProducts.filter(p => p.status !== "active").length,
    lowStock: filteredProducts.filter(p => num(p.stock) > 0 && num(p.stock) < 10).length,
    popular: filteredProducts.filter(p => p.mostPopular).length,
    totalValue: filteredProducts.reduce((s, p) => s + num(p.price) * num(p.stock), 0),
  }), [filteredProducts]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const paginated = filteredProducts.slice((page - 1) * pageSize, page * pageSize);
  const hasFilters = searchTerm || selectedCategory || stockFilter || statusFilter || discountFilter || shopFilter;
  const mainCategories = useMemo(() => Object.values(categoriesMap).filter(c => !c.parentId), [categoriesMap]);

  const editMainCategories = useMemo(() => {
    const sid = editProduct?.shopId || shopFilter || assignedShopId;
    return Object.values(categoriesMap).filter((c) => !c.parentId && (!sid || c.shopId === sid));
  }, [editProduct, categoriesMap, shopFilter, assignedShopId]);

  useEffect(() => { setPage(1); }, [selectedCategory, statusFilter, discountFilter, searchTerm, stockFilter, sortBy, sortOrder, pageSize, shopFilter]);

  const clearFilters = () => {
    setSearchTerm(""); setSelectedCategory(""); setStockFilter(""); setStatusFilter(""); setDiscountFilter("");
    if (isSuperAdmin && !isStaff) setShopFilter(effectiveShopId || "");
    setPage(1);
    toast.success("Filters cleared");
  };

  const handleRefresh = async () => {
    setSelectedProducts([]); await fetchProducts(true);
  };

  const toggleStatus = async (product) => {
    const newStatus = product.status === "active" ? "inactive" : "active";
    setUpdatingStatus(product.id);
    try {
      await updateDoc(doc(db, "products", product.id), { status: newStatus, updatedAt: serverTimestamp() });
      setAllProducts(prev => {
        const next = prev.map(p => p.id === product.id ? { ...p, status: newStatus, updatedAt: new Date().toISOString() } : p);
        updateCache(next); return next;
      });
      toast.success(`"${product.nameEn}" → ${newStatus}`, { duration: 1500 });
    } catch { toast.error("Failed to update!"); }
    finally { setUpdatingStatus(null); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this product?")) return;
    setDeleting(id);
    try {
      await deleteDoc(doc(db, "products", id));
      setAllProducts(prev => {
        const next = prev.filter(p => p.id !== id);
        updateCache(next); return next;
      });
      setSelectedProducts(prev => prev.filter(x => x !== id));
      toast.success("Deleted!");
    } catch { toast.error("Delete failed!"); }
    finally { setDeleting(null); }
  };

  const handleImageSelect = e => {
    const file = e.target.files[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return toast.error("Only JPG, PNG, WEBP!");
    if (file.size > 1024 * 1024) return toast.error("Max 1MB!");
    setImageFile(file); setImagePreview(URL.createObjectURL(file));
  };

  const uploadImage = async () => {
    if (!imageFile) return editProduct?.image || null;
    setUploadingImage(true);
    const fd = new FormData(); fd.append("image", imageFile);
    try {
      const res = await fetch(`https://api.imgbb.com/1/upload?key=${import.meta.env.VITE_IMGBB_API_KEY}`, { method: "POST", body: fd });
      const data = await res.json();
      return data.success ? data.data.url : editProduct?.image || null;
    } catch { toast.error("Upload failed!"); return editProduct?.image || null; }
    finally { setUploadingImage(false); }
  };

  const handleSave = async () => {
    if (!editProduct) return;
    const t = toast.loading("Saving...");
    try {
      const img = await uploadImage();
      const payload = {
        nameEn: editProduct.nameEn || "", nameUr: editProduct.nameUr || "", price: num(editProduct.price), mrpPrice: num(editProduct.mrpPrice),
        discount: num(editProduct.discount), orderLimit: num(editProduct.orderLimit), unit: editProduct.unit || "", stock: num(editProduct.stock),
        status: editProduct.status || "inactive", mostPopular: editProduct.mostPopular === true || editProduct.mostPopular === "yes",
        reselling: editProduct.reselling === true || editProduct.reselling === "yes", category: editProduct.category || "",
        subcategory: editProduct.subcategory || "", description: editProduct.description || "", sku: editProduct.sku || "", image: img,
        shopId: editProduct.shopId || categoryShopMap[editProduct.category] || categoryShopMap[editProduct.subcategory] || null,
        shopName: resolveShopName(
          editProduct.shopId || categoryShopMap[editProduct.category] || categoryShopMap[editProduct.subcategory],
          editProduct.shopName
        ),
        updatedAt: serverTimestamp(),
      };
      await updateDoc(doc(db, "products", editProduct.id), payload);
      setAllProducts(prev => {
        const next = prev.map(p => p.id === editProduct.id ? { ...p, ...payload, updatedAt: new Date().toISOString() } : p);
        updateCache(next); return next;
      });
      toast.success("Saved!", { id: t });
      setEditProduct(null); setImageFile(null); setImagePreview(null);
    } catch { toast.error("Save failed!", { id: t }); }
  };

  const handleBulk = async (action) => {
    if (!selectedProducts.length) return toast.error("Select products!");
    if (!window.confirm(`${action} ${selectedProducts.length} products?`)) return;
    setBulkUpdating(true);
    const t = toast.loading("Processing...");
    try {
      const batch = writeBatch(db);
      selectedProducts.forEach(id => {
        const ref = doc(db, "products", id);
        if (action === "delete") batch.delete(ref);
        else batch.update(ref, { status: action === "activate" ? "active" : "inactive", updatedAt: serverTimestamp() });
      });
      await batch.commit();
      setAllProducts(prev => {
        let next;
        if (action === "delete") next = prev.filter(p => !selectedProducts.includes(p.id));
        else next = prev.map(p => selectedProducts.includes(p.id) ? { ...p, status: action === "activate" ? "active" : "inactive", updatedAt: new Date().toISOString() } : p);
        updateCache(next); return next;
      });
      setSelectedProducts([]);
      toast.success("Done!", { id: t });
    } catch { toast.error("Failed!", { id: t }); }
    finally { setBulkUpdating(false); }
  };

  const exportData = async (type, format) => {
    const data = (type === "all" ? allProducts : filteredProducts).map(p => ({
      "Name (EN)": p.nameEn || "", "Name (UR)": p.nameUr || "", Category: p.categoryName || "", "Price (PKR)": num(p.price), MRP: num(p.mrpPrice),
      "Discount (Rs.)": num(p.discount), Stock: num(p.stock), Unit: p.unit || "", Status: p.status || "inactive", Popular: p.mostPopular ? "Yes" : "No",
      Reselling: p.reselling ? "Yes" : "No", SKU: p.sku || "", Image: p.image || "",
    }));
    const wb = new Workbook();
    const ws = wb.addWorksheet("Products");
    if (data.length > 0) {
      ws.columns = Object.keys(data[0]).map(k => ({ header: k, key: k }));
      data.forEach(row => ws.addRow(row));
    }
    if (format === "csv") {
      const csv = data.map(row => Object.values(row).join(",")).join("\n");
      const headers = Object.keys(data[0] || {}).join(",");
      const csv_content = headers + "\n" + csv;
      const blob = new Blob([csv_content], { type: "text/csv" });
      saveAs(blob, `products_${type}_${new Date().toISOString().split("T")[0]}.csv`);
    } else {
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/octet-stream" });
      saveAs(blob, `products_${type}_${new Date().toISOString().split("T")[0]}.xlsx`);
    }
    toast.success(`Exported ${data.length} products!`); setShowExportModal(false);
  };

  const handleImport = e => {
    const file = e.target.files[0];
    if (!file) return;
    const t = toast.loading("Importing...");
    const reader = new FileReader();
    reader.onload = async evt => {
      try {
        const wb = new Workbook();
        await wb.xlsx.load(evt.target.result);
        const ws = wb.getWorksheet(1);
        const data = [];
        ws.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return;
          const values = row.values.slice(1);
          const headers = ws.getRow(1).values.slice(1);
          const obj = {};
          headers.forEach((h, i) => { obj[h] = values[i]; });
          data.push(obj);
        });
        if (!data.length) return toast.error("No data!", { id: t });
        if (!window.confirm(`Import ${data.length} products?`)) return toast.dismiss(t);
        const batch = writeBatch(db); let count = 0;
        data.forEach(row => {
          const name = row.nameEn || row["Name (EN)"] || "";
          if (name) {
            batch.set(doc(collection(db, "products")), {
              nameEn: name, nameUr: row.nameUr || row["Name (UR)"] || "", categoryName: row.categoryName || row.Category || "",
              price: num(row.price || row["Price (PKR)"]), mrpPrice: num(row.mrpPrice || row.MRP), discount: num(row.discount || row["Discount (Rs.)"] || row["Discount (Off)"]),
              stock: num(row.stock || row.Stock), unit: row.unit || row.Unit || "", status: (row.status || row.Status || "active").toLowerCase(),
              mostPopular: ["yes", "true", "1"].includes(String(row.mostPopular || row.Popular || "").toLowerCase()),
              reselling: ["yes", "true", "1"].includes(String(row.reselling || row.Reselling || "").toLowerCase()),
              sku: row.sku || row.SKU || "", image: row.image || row.Image || "", createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
            }); count++;
          }
        });
        await batch.commit(); toast.success(`Imported ${count}!`, { id: t }); setShowImportModal(false); handleRefresh();
      } catch { toast.error("Import failed!", { id: t }); }
    };
    reader.readAsBinaryString(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const downloadTemplate = async () => {
    const templateData = [{ nameEn: "Product Name", nameUr: "اردو نام", categoryName: "Category", price: 100, mrpPrice: 120, discount: 10, stock: 50, unit: "kg", status: "active", mostPopular: "no", reselling: "no", sku: "SKU001", image: "" }];
    const wb = new Workbook();
    const ws = wb.addWorksheet("Template");
    ws.columns = Object.keys(templateData[0]).map(k => ({ header: k, key: k }));
    templateData.forEach(row => ws.addRow(row));
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/octet-stream" });
    saveAs(blob, "import_template.xlsx");
    toast.success("Template downloaded!");
  };

  const shopFilterLabel = shopFilter ? resolveShopName(shopFilter) : "All Shops";

  if (loading) return (
    <PageShell title="Products" subtitle="Loading..." icon={FaBox}>
      <div className="space-y-4">{[...Array(6)].map((_, i) => <div key={i} className="h-16 theme-card-inner animate-pulse rounded-xl" />)}</div>
    </PageShell>
  );

  return <>
    <Toaster position="top-right" />
    <PageShell
      title="Products"
      subtitle={isStaff ? "Your assigned shop only" : `Showing: ${shopFilterLabel} • Edit enabled for staff & super admin`}
      icon={FaBox}
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`theme-badge ${isConnected ? "theme-badge-success" : "theme-badge-danger"} flex items-center gap-1`}>
            <FaWifi className="w-3 h-3" /> {isConnected ? "Online" : "Offline"}
          </span>
          <button type="button" onClick={handleRefresh} className="theme-btn-secondary text-sm"><FaSync className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Sync</button>
          <button type="button" onClick={() => setShowStats(!showStats)} className="theme-btn-secondary text-sm"><FaChartBar className="w-4 h-4" /></button>
          <button type="button" onClick={() => setShowFilters(!showFilters)} className={`theme-btn-secondary text-sm ${showFilters || hasFilters ? "ring-2 ring-blue-400" : ""}`}><FaFilter className="w-3 h-3" /> Filters</button>
          <button type="button" onClick={() => setShowImportModal(true)} className="theme-btn-primary text-sm"><FaCloudUploadAlt className="w-4 h-4" /> Import</button>
          <button type="button" onClick={() => setShowExportModal(true)} className="theme-btn-secondary text-sm"><FaCloudDownloadAlt className="w-4 h-4" /> Export</button>
        </div>
      }
    >
      {showStats && <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="stat-card p-3 flex items-center gap-3"><FaCubes className="w-5 h-5 theme-highlight" /><div><p className="text-xs font-bold pl-text-muted">Filtered</p><p className="text-xl font-extrabold theme-page-title">{stats.total}</p></div></div>
        <div className="stat-card p-3 flex items-center gap-3"><FaCheckCircle className="w-5 h-5 text-green-400" /><div><p className="text-xs font-bold pl-text-muted">Active</p><p className="text-xl font-extrabold theme-highlight">{stats.active}</p></div></div>
        <div className="stat-card p-3 flex items-center gap-3"><FaBan className="w-5 h-5 text-red-400" /><div><p className="text-xs font-bold pl-text-muted">Inactive</p><p className="text-xl font-extrabold theme-page-title">{stats.inactive}</p></div></div>
        <div className="stat-card p-3 flex items-center gap-3"><FaExclamationTriangle className="w-5 h-5 text-orange-400" /><div><p className="text-xs font-bold pl-text-muted">Low Stock</p><p className="text-xl font-extrabold theme-highlight">{stats.lowStock}</p></div></div>
        <div className="stat-card p-3 flex items-center gap-3"><FaFire className="w-5 h-5 text-purple-400" /><div><p className="text-xs font-bold pl-text-muted">Popular</p><p className="text-xl font-extrabold theme-highlight">{stats.popular}</p></div></div>
        <div className="stat-card p-3 flex items-center gap-3"><FaRupeeSign className="w-5 h-5 theme-highlight" /><div><p className="text-xs font-bold pl-text-muted">Value</p><p className="text-lg font-extrabold theme-highlight">PKR {stats.totalValue.toLocaleString()}</p></div></div>
      </div>}

      <SectionCard title="Search & Filters">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex-1 min-w-[200px] relative">
          <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 theme-page-muted w-4 h-4" />
          <input ref={searchRef} type="text" placeholder="Search products..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="theme-input pl-10 pr-8 font-semibold" />
          {searchTerm && <button type="button" onClick={() => setSearchTerm("")} className="absolute right-2 top-1/2 -translate-y-1/2"><FaTimes className="w-4 h-4 theme-page-muted" /></button>}
        </div>

        {isSuperAdmin && !isStaff && (
          <select
            value={shopFilter}
            onChange={(e) => { setShopFilter(e.target.value); setSelectedCategory(""); }}
            className="theme-select min-w-[180px]"
          >
            <option value="">All Shops</option>
            {shops.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}

        <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} className="theme-select min-w-[160px]">
          <option value="">All Categories</option>
          {mainCategories.map(c => (
            <option key={c.id} value={c.id}>
              {c.name}{!shopFilter && c.shopId ? ` (${resolveShopName(c.shopId, c.shopName)})` : ""}
            </option>
          ))}
        </select>

        <div className="pl-toggle-group">
          {["", "active", "inactive"].map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`pl-toggle-btn ${statusFilter === s ? "is-active" : ""}`}
            >
              {s === "" ? "All" : s === "active" ? `Active (${stats.active})` : `Inactive (${stats.inactive})`}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setDiscountFilter(f => f === "discounted" ? "" : "discounted")}
          className={`pl-toggle-btn ${discountFilter === "discounted" ? "is-active" : ""} flex items-center gap-1 px-3 py-2`}
        >
          <FaTag className="w-4 h-4" /> Discounted
        </button>

        <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="theme-select">
          <option value="createdAt">Date</option><option value="nameEn">Name</option><option value="price">Price</option><option value="stock">Stock</option>
        </select>

        <button type="button" onClick={() => setSortOrder(o => o === "asc" ? "desc" : "asc")} className="theme-btn-secondary p-2.5">{sortOrder === "asc" ? <FaSortAmountUp className="w-4 h-4" /> : <FaSortAmountDown className="w-4 h-4" />}</button>

        <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} className="theme-select">
          <option value={10}>10</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option>
        </select>
      </div>
      </SectionCard>

      {showFilters && (
        <SectionCard title="Advanced Filters">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <select value={stockFilter} onChange={e => setStockFilter(e.target.value)} className="theme-select font-semibold">
            <option value="">All Stock</option>
            <option value="instock">In Stock</option>
            <option value="lowstock">Low Stock</option>
            <option value="outofstock">Out of Stock</option>
          </select>

          <div className="pl-toggle-group col-span-1">
            <button type="button" onClick={() => setDiscountFilter("")} className={`pl-toggle-btn flex-1 ${discountFilter === "" ? "is-active" : ""}`}>All</button>
            <button type="button" onClick={() => setDiscountFilter("discounted")} className={`pl-toggle-btn flex-1 ${discountFilter === "discounted" ? "is-active" : ""}`}>On Sale</button>
          </div>

          {hasFilters && (
            <button type="button" onClick={clearFilters} className="theme-btn-danger text-sm font-bold flex items-center justify-center gap-1">
              <FaTimes className="w-3 h-3" /> Clear All
            </button>
          )}
        </div>
        </SectionCard>
      )}

      {selectedProducts.length > 0 && (
        <div className="theme-stat-accent p-4 flex flex-wrap items-center justify-between gap-3">
          <span className="font-extrabold text-white"><FaCheckDouble className="inline w-4 h-4 mr-2" />{selectedProducts.length} selected</span>
          <div className="flex gap-2 flex-wrap">
            <button type="button" onClick={() => handleBulk("activate")} disabled={bulkUpdating} className="theme-btn-secondary text-xs font-bold bg-white/10 border-white/20 text-white">Activate</button>
            <button type="button" onClick={() => handleBulk("deactivate")} disabled={bulkUpdating} className="theme-btn-secondary text-xs font-bold bg-white/10 border-white/20 text-white">Deactivate</button>
            {!isStaff && <button type="button" onClick={() => handleBulk("delete")} disabled={bulkUpdating} className="theme-btn-danger text-xs font-bold">Delete</button>}
            <button type="button" onClick={() => setSelectedProducts([])} className="theme-btn-secondary text-xs font-bold bg-white/10 border-white/20 text-white">Cancel</button>
          </div>
        </div>
      )}

      <SectionCard title={`Products (${paginated.length} of ${filteredProducts.length})`}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <span className="text-sm font-bold theme-page-title flex items-center gap-1">
            {isSuperAdmin && !isStaff && !shopFilter && <Store className="w-4 h-4 theme-highlight" />}
            {shopFilterLabel}
          </span>
          <div className="flex gap-1 theme-card-inner rounded p-1">
            <button type="button" onClick={() => setViewMode("table")} className={`p-1.5 rounded ${viewMode === "table" ? "theme-btn-primary" : ""}`}><FaList className="w-4 h-4" /></button>
            <button type="button" onClick={() => setViewMode("grid")} className={`p-1.5 rounded ${viewMode === "grid" ? "theme-btn-primary" : ""}`}><FaThLarge className="w-4 h-4" /></button>
          </div>
        </div>

        {viewMode === "table" ? <div className="theme-table-wrap">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="p-3 text-left"><input type="checkbox" checked={selectedProducts.length === paginated.length && paginated.length > 0} onChange={() => setSelectedProducts(selectedProducts.length === paginated.length ? [] : paginated.map(p => p.id))} /></th>
                <th className="p-3 text-left">Image</th>
                <th className="p-3 text-left">Name</th>
                {isSuperAdmin && !isStaff && <th className="p-3 text-left">Shop</th>}
                <th className="p-3 text-left">Category</th>
                <th className="p-3 text-left">Price</th>
                <th className="p-3 text-left">Stock</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-center">Popular</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr><td colSpan={isSuperAdmin && !isStaff ? 10 : 9} className="p-8 text-center">
                  <FaBox className="w-12 h-12 mx-auto mb-2 theme-page-muted opacity-40" />
                  <p className="font-bold theme-page-muted">No products found</p>
                </td></tr>
              ) : paginated.map((p) => (
                <tr
                  key={p.id}
                  className={`${selectedProducts.includes(p.id) ? "pl-row-selected" : ""} ${updatingStatus === p.id ? "animate-pulse opacity-80" : ""}`}
                >
                  <td className="p-3"><input type="checkbox" checked={selectedProducts.includes(p.id)} onChange={() => setSelectedProducts(s => s.includes(p.id) ? s.filter(x => x !== p.id) : [...s, p.id])} /></td>
                  <td className="p-3">
                    {p.image ? (
                      <img src={p.image} alt="" className="w-12 h-12 rounded-lg object-cover cursor-pointer hover:scale-110 transition border border-blue-500/20" onClick={() => setFullImage(p.image)} />
                    ) : (
                      <div className="w-12 h-12 rounded-lg pl-img-placeholder flex items-center justify-center"><FaImage className="w-5 h-5 theme-page-muted" /></div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-extrabold theme-page-title">{p.nameEn || "Unnamed"}</p>
                    {p.nameUr && <p className="text-xs pl-text-muted mt-0.5">{p.nameUr}</p>}
                  </td>
                  {isSuperAdmin && !isStaff && (
                    <td className="px-2 py-3 text-xs">
                      <span className="font-bold theme-highlight">{p.shopName}</span>
                      {p.shopInferred && <span className="block text-[10px] text-amber-400 font-semibold">via category</span>}
                    </td>
                  )}
                  <td className="px-2 py-3 pl-text-muted font-semibold">{p.categoryName || "—"}</td>
                  <td className="px-4 py-3">
                    <span className="pl-price">{formatPrice(p.price)}</span>
                    {num(p.mrpPrice) > num(p.price) && <p className="text-xs pl-text-muted line-through">{formatPrice(p.mrpPrice)}</p>}
                    {num(p.discount) > 0 && <p className="text-xs text-red-400 font-extrabold mt-0.5">Rs. {p.discount} OFF</p>}
                  </td>
                  <td className="p-3"><StockBadge stock={p.stock} /></td>
                  <td className="p-3"><StatusBadge status={p.status} onChange={() => toggleStatus(p)} disabled={updatingStatus === p.id} /></td>
                  <td className="p-3 text-center">{p.mostPopular ? <FaStar className="w-5 h-5 text-yellow-400 mx-auto" /> : <FaRegStar className="w-5 h-5 theme-page-muted mx-auto opacity-50" />}</td>
                  <td className="p-3">
                    <div className="flex justify-center gap-1">
                      <button type="button" onClick={() => { setEditProduct({ ...p }); setImagePreview(p.image); }} className="theme-btn-secondary p-2"><FaEdit className="w-4 h-4" /></button>
                      <button type="button" onClick={() => handleDelete(p.id)} disabled={deleting === p.id} className="theme-btn-danger p-2 disabled:opacity-50">{deleting === p.id ? <FaSync className="w-4 h-4 animate-spin" /> : <FaTrash className="w-4 h-4" />}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div> : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {paginated.length === 0 ? (
            <div className="col-span-full text-center py-8">
              <FaBox className="w-12 h-12 mx-auto mb-2 theme-page-muted opacity-40" />
              <p className="font-bold theme-page-muted">No products</p>
            </div>
          ) : paginated.map(p => (
            <div key={p.id} className={`pl-product-card ${selectedProducts.includes(p.id) ? "is-selected" : ""}`}>
              <div className="relative aspect-square pl-img-placeholder">
                {p.image ? <img src={p.image} alt="" className="w-full h-full object-cover" onClick={() => setFullImage(p.image)} /> : <div className="w-full h-full flex items-center justify-center"><FaImage className="w-12 h-12 theme-page-muted opacity-40" /></div>}
                <div className="absolute top-2 left-2"><StatusBadge status={p.status} onChange={() => toggleStatus(p)} disabled={updatingStatus === p.id} /></div>
                <div className="absolute top-2 right-2"><input type="checkbox" checked={selectedProducts.includes(p.id)} onChange={() => setSelectedProducts(s => s.includes(p.id) ? s.filter(x => x !== p.id) : [...s, p.id])} className="w-5 h-5 accent-blue-500" /></div>
                {num(p.discount) > 0 && <span className="absolute bottom-2 left-2 theme-badge theme-badge-danger">Rs. {p.discount} OFF</span>}
                {p.mostPopular && <div className="absolute bottom-2 right-2 p-1.5 bg-yellow-500 text-white rounded-full shadow-lg"><FaStar className="w-3 h-3" /></div>}
              </div>
              <div className="p-3">
                <h3 className="font-extrabold truncate theme-page-title">{p.nameEn || "Unnamed"}</h3>
                {isSuperAdmin && !isStaff && <span className="theme-badge theme-badge-info text-[10px] mb-1 inline-block font-bold">{p.shopName}</span>}
                <p className="text-xs pl-text-muted mb-2 font-semibold">{p.categoryName || "Uncategorized"}</p>
                <div className="flex items-center justify-between mb-2"><span className="pl-price">{formatPrice(p.price)}</span><StockBadge stock={p.stock} /></div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setEditProduct({ ...p }); setImagePreview(p.image); }} className="theme-btn-primary flex-1 text-sm py-2"><FaEdit className="inline w-3 h-3 mr-1" />Edit</button>
                  <button type="button" onClick={() => handleDelete(p.id)} className="theme-btn-danger p-2"><FaTrash className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>}

        {totalPages > 1 && <div className="mt-4 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm theme-page-muted">Page {page} of {totalPages}</span>
          <div className="flex gap-1">
            <button type="button" onClick={() => setPage(1)} disabled={page === 1} className="theme-btn-secondary text-sm disabled:opacity-50">First</button>
            <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="theme-btn-primary text-sm disabled:opacity-50 flex items-center gap-1"><FaChevronLeft className="w-3 h-3" />Prev</button>
            <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="theme-btn-primary text-sm disabled:opacity-50 flex items-center gap-1">Next<FaChevronRight className="w-3 h-3" /></button>
            <button type="button" onClick={() => setPage(totalPages)} disabled={page === totalPages} className="theme-btn-secondary text-sm disabled:opacity-50">Last</button>
          </div>
        </div>}
      </SectionCard>

      {fullImage && <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4" onClick={() => setFullImage(null)}>
        <img src={fullImage} alt="" className="max-w-full max-h-[90vh] rounded-xl" />
        <button onClick={() => setFullImage(null)} className="absolute top-4 right-4 p-2 bg-red-500 text-white rounded-full"><FaTimes className="w-5 h-5" /></button>
      </div>}
      {editProduct && <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
        <div className="theme-glass rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden border border-white/10">
          <div className="p-4 flex items-center justify-between border-b border-white/10">
            <h2 className="font-bold theme-page-title flex items-center gap-2"><FaEdit /> Edit Product</h2>
            <button type="button" onClick={() => { setEditProduct(null); setImageFile(null); setImagePreview(null); }} className="theme-btn-secondary p-1.5"><FaTimes className="w-5 h-5" /></button>
          </div>

          <div className="p-4 overflow-y-auto max-h-[calc(90vh-120px)] grid grid-cols-1 sm:grid-cols-2 gap-3">

            {/* Name EN */}
            <div>
              <label className="theme-label text-xs mb-1">Name (EN)</label>
              <input type="text" value={editProduct.nameEn || ""} onChange={e => setEditProduct({ ...editProduct, nameEn: e.target.value })} className="theme-input mt-1" />
            </div>

            {/* Name UR */}
            <div>
              <label className="theme-label text-xs mb-1">Name (UR)</label>
              <input type="text" value={editProduct.nameUr || ""} onChange={e => setEditProduct({ ...editProduct, nameUr: e.target.value })} className="w-full p-2 border rounded-lg mt-1 text-right" dir="rtl" />
            </div>

            {/* Category */}
            <div>
              <label className="theme-label text-xs mb-1">Category</label>
              <select value={editProduct.category || ""} onChange={e => {
                const catId = e.target.value;
                const catName = categoriesMap[catId]?.name || "";
                setEditProduct({ ...editProduct, category: catId, categoryName: catName, subcategory: "" });
              }} className="theme-input mt-1">
                <option value="">Select Category</option>
                {editMainCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* Subcategory */}
            <div>
              <label className="theme-label text-xs mb-1">Subcategory</label>
              <select value={editProduct.subcategory || ""} onChange={e => setEditProduct({ ...editProduct, subcategory: e.target.value })} className="theme-input mt-1">
                <option value="">Select Subcategory</option>
                {Object.values(categoriesMap).filter(c => c.parentId === editProduct.category && (!editProduct.shopId || c.shopId === editProduct.shopId)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* Price */}
            <div>
              <label className="theme-label text-xs mb-1">Price (PKR)</label>
              <input type="number" value={editProduct.price || ""} onChange={e => {
                const price = num(e.target.value);
                const mrp = num(editProduct.mrpPrice);
                const autoDiscount = mrp > price ? Math.round(mrp - price) : 0;
                setEditProduct({ ...editProduct, price: e.target.value, discount: autoDiscount });
              }} className="theme-input mt-1" />
            </div>

            {/* MRP */}
            <div>
              <label className="theme-label text-xs mb-1">MRP (PKR)</label>
              <input type="number" value={editProduct.mrpPrice || ""} onChange={e => {
                const mrp = num(e.target.value);
                const price = num(editProduct.price);
                const autoDiscount = mrp > price ? Math.round(mrp - price) : 0;
                setEditProduct({ ...editProduct, mrpPrice: e.target.value, discount: autoDiscount });
              }} className="theme-input mt-1" />
            </div>

            <div className="sm:col-span-2">
              <label className="theme-label text-xs mb-1 flex items-center justify-between">
                <span>Discount (Rs.)</span>
                {num(editProduct.mrpPrice) > num(editProduct.price) && num(editProduct.price) > 0 ? (
                  <span className="theme-badge theme-badge-success text-[10px]">Auto: PKR {num(editProduct.mrpPrice) - num(editProduct.price)}</span>
                ) : (
                  <span className="theme-badge theme-badge-neutral text-[10px]">Manual</span>
                )}
              </label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 pl-text-muted font-bold text-sm">Rs.</span>
                <input
                  type="number"
                  min="0"
                  value={editProduct.discount ?? ""}
                  onChange={e => {
                    const val = Number(e.target.value);
                    setEditProduct({ ...editProduct, discount: val < 0 ? 0 : val });
                  }}
                  className={`theme-input pl-12 pr-20 font-bold ${num(editProduct.discount) > 0 ? "border-red-400/50 text-red-400" : ""}`}
                  placeholder="0"
                />
                {num(editProduct.discount) > 0 && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 theme-badge theme-badge-danger text-[10px]">OFF</span>
                )}
              </div>
              {num(editProduct.price) > 0 && num(editProduct.mrpPrice) > 0 && (
                <div className="mt-2 p-2.5 theme-card-inner">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold">
                    <span className="pl-text-muted">MRP: <strong className="line-through">{formatPrice(editProduct.mrpPrice)}</strong></span>
                    <span className="pl-text-muted">Selling: <strong className="pl-price">{formatPrice(editProduct.price)}</strong></span>
                    {num(editProduct.discount) > 0 ? (
                      <span className="theme-badge theme-badge-danger">Rs. {num(editProduct.discount).toLocaleString()} OFF</span>
                    ) : (
                      <span className="theme-badge theme-badge-neutral">No Discount</span>
                    )}
                  </div>
                </div>
              )}
              <p className="text-xs pl-text-muted mt-1">Auto from MRP − Price, or type manually.</p>
            </div>

            {/* Stock */}
            <div>
              <label className="theme-label text-xs mb-1">Stock</label>
              <input type="number" value={editProduct.stock || ""} onChange={e => setEditProduct({ ...editProduct, stock: e.target.value })} className="theme-input mt-1" />
            </div>

            {/* Unit */}
            <div>
              <label className="theme-label text-xs mb-1">Unit</label>
              <input type="text" value={editProduct.unit || ""} onChange={e => setEditProduct({ ...editProduct, unit: e.target.value })} className="theme-input mt-1" />
            </div>

            {/* Order Limit */}
            <div>
              <label className="theme-label text-xs mb-1">Order Limit</label>
              <input type="number" value={editProduct.orderLimit || ""} onChange={e => setEditProduct({ ...editProduct, orderLimit: e.target.value })} className="theme-input mt-1" />
            </div>

            {/* Status */}
            <div className="theme-card-inner p-3">
              <label className="theme-label text-xs mb-1">Status</label>
              <select value={editProduct.status || "inactive"} onChange={e => setEditProduct({ ...editProduct, status: e.target.value })} className="theme-select mt-1 font-bold">
                <option value="active">🟢 Active</option>
                <option value="inactive">🔴 Inactive</option>
              </select>
            </div>

            {/* Popular */}
            <div>
              <label className="theme-label text-xs mb-1">Popular</label>
              <select value={editProduct.mostPopular ? "yes" : "no"} onChange={e => setEditProduct({ ...editProduct, mostPopular: e.target.value === "yes" })} className="theme-input mt-1">
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>

            {/* Reselling */}
            <div>
              <label className="theme-label text-xs mb-1">Reselling</label>
              <select value={editProduct.reselling ? "yes" : "no"} onChange={e => setEditProduct({ ...editProduct, reselling: e.target.value === "yes" })} className="theme-input mt-1">
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>

            {/* Image */}
            <div className="sm:col-span-2">
              <label className="theme-label text-xs mb-1">Image</label>
              <div className="flex items-center gap-3 mt-1">
                <input type="file" accept="image/*" onChange={handleImageSelect} className="theme-input flex-1 text-sm" />
                {(imagePreview || editProduct.image) && (
                  <img src={imagePreview || editProduct.image} alt="" className="w-16 h-16 rounded-lg object-cover" />
                )}
              </div>
            </div>

            {/* Description */}
            <div className="sm:col-span-2">
              <label className="theme-label text-xs mb-1">Description</label>
              <textarea value={editProduct.description || ""} onChange={e => setEditProduct({ ...editProduct, description: e.target.value })} className="w-full p-2 border rounded-lg mt-1 min-h-[80px]" />
            </div>

          </div>

          {/* Footer */}
          <div className="border-t border-white/10 p-4 flex justify-end gap-2">
            <button type="button" onClick={() => { setEditProduct(null); setImageFile(null); setImagePreview(null); }} className="theme-btn-secondary flex items-center gap-1"><FaTimes /> Cancel</button>
            <button type="button" onClick={handleSave} disabled={uploadingImage} className="theme-btn-primary flex items-center gap-1 disabled:opacity-50">
              {uploadingImage ? <><FaSync className="animate-spin" /> Uploading...</> : <><FaSave /> Save</>}
            </button>
          </div>

        </div>
      </div>}

      {showExportModal && <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
        <div className="theme-glass rounded-xl shadow-2xl w-full max-w-md p-5 border border-blue-500/20">
          <h3 className="font-extrabold theme-page-title text-lg mb-4 flex items-center gap-2"><FaCloudDownloadAlt className="text-blue-400" /> Export</h3>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <button type="button" onClick={() => exportData("filtered", "xlsx")} className="theme-card-inner p-4 text-center hover:border-blue-500/40"><FaFileExcel className="w-8 h-8 text-blue-400 mx-auto mb-1" /><p className="font-bold text-sm theme-page-title">Filtered</p><p className="text-xs pl-text-muted">{filteredProducts.length} items</p></button>
            <button type="button" onClick={() => exportData("all", "xlsx")} className="theme-card-inner p-4 text-center hover:border-blue-500/40"><FaFileExcel className="w-8 h-8 text-green-400 mx-auto mb-1" /><p className="font-bold text-sm theme-page-title">Loaded</p><p className="text-xs pl-text-muted">{allProducts.length} items</p></button>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => exportData("filtered", "csv")} className="theme-btn-secondary flex-1 text-sm font-bold"><FaFileCsv /> CSV</button>
            <button type="button" onClick={() => setShowExportModal(false)} className="theme-btn-secondary px-4 text-sm font-bold">Close</button>
          </div>
        </div>
      </div>}

      {showImportModal && <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
        <div className="theme-glass rounded-xl shadow-2xl w-full max-w-md p-5 border border-blue-500/20">
          <h3 className="font-extrabold theme-page-title text-lg mb-4 flex items-center gap-2"><FaCloudUploadAlt className="text-green-400" /> Import</h3>
          <div className="theme-card-inner p-3 mb-4 text-sm pl-text-muted font-semibold">Upload Excel/CSV file with product data.</div>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleImport} className="theme-input mb-4" />
          <div className="flex gap-2">
            <button type="button" onClick={downloadTemplate} className="theme-btn-secondary flex-1 text-sm font-bold"><FaDownload /> Template</button>
            <button type="button" onClick={() => setShowImportModal(false)} className="theme-btn-secondary px-4 text-sm font-bold">Cancel</button>
          </div>
        </div>
      </div>}
    </PageShell>
  </>;
}