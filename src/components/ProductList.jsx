import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { collection, collectionGroup, getDocs, updateDoc, deleteDoc, doc, writeBatch, serverTimestamp, query, orderBy, limit, startAfter } from "firebase/firestore";
import { db } from "../firebase";
import toast, { Toaster } from "react-hot-toast";
import { FaEdit, FaSave, FaTimes, FaBox, FaTrash, FaSearch, FaChevronLeft, FaChevronRight, FaFilter, FaSortAmountDown, FaSortAmountUp, FaCheckCircle, FaDownload, FaSync, FaList, FaThLarge, FaImage, FaToggleOn, FaToggleOff, FaChartBar, FaRupeeSign, FaCubes, FaFire, FaFileExcel, FaFileCsv, FaCloudDownloadAlt, FaCloudUploadAlt, FaCheckDouble, FaBan, FaStar, FaRegStar, FaWarehouse, FaExclamationTriangle, FaWifi, FaTag } from "react-icons/fa";
import { Workbook } from "exceljs";
import { saveAs } from "file-saver";

const num = v => typeof v === "number" && !isNaN(v) ? v : Number(v) || 0;
const formatPrice = p => `PKR ${num(p).toLocaleString()}`;
const CACHE_KEY = "admin_products_cache_v1";

const StatusBadge = ({ status, onChange, disabled }) => (
  <button onClick={() => onChange?.()} disabled={disabled}
    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${status === "active" ? "bg-gradient-to-r from-green-400 to-emerald-500 text-white" : "bg-gradient-to-r from-red-400 to-red-500 text-white"} shadow ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
    {status === "active" ? <><FaToggleOn className="w-3.5 h-3.5" /> Active</> : <><FaToggleOff className="w-3.5 h-3.5" /> Inactive</>}
  </button>
);

const StockBadge = ({ stock }) => {
  const s = num(stock);
  if (s === 0) return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700"><FaBan className="w-3 h-3" /> Out</span>;
  if (s < 10) return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-700"><FaExclamationTriangle className="w-3 h-3" /> {s}</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700"><FaWarehouse className="w-3 h-3" /> {s}</span>;
};

export default function ProductList() {
  const [allProducts, setAllProducts] = useState([]);
  const [categoriesMap, setCategoriesMap] = useState({});
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
    getDocs(collectionGroup(db, "categories")).then(snap => {
      const map = {}; snap.forEach(d => map[d.id] = { id: d.id, ...d.data() }); setCategoriesMap(map);
    }).catch(() => toast.error("Failed to load categories!"));
  }, []);

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

  const filteredProducts = useMemo(() => {
    let list = [...allProducts];

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
  }, [allProducts, selectedCategory, statusFilter, searchTerm, stockFilter, discountFilter, sortBy, sortOrder]);

  const stats = useMemo(() => ({
    total: filteredProducts.length,
    active: allProducts.filter(p => p.status === "active").length,
    inactive: allProducts.filter(p => p.status !== "active").length,
    lowStock: filteredProducts.filter(p => num(p.stock) > 0 && num(p.stock) < 10).length,
    popular: filteredProducts.filter(p => p.mostPopular).length,
    totalValue: filteredProducts.reduce((s, p) => s + num(p.price) * num(p.stock), 0),
  }), [filteredProducts, allProducts]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const paginated = filteredProducts.slice((page - 1) * pageSize, page * pageSize);
  const hasFilters = searchTerm || selectedCategory || stockFilter || statusFilter || discountFilter;
  const mainCategories = useMemo(() => Object.values(categoriesMap).filter(c => !c.parentId), [categoriesMap]);

  useEffect(() => { setPage(1); }, [selectedCategory, statusFilter, discountFilter, searchTerm, stockFilter, sortBy, sortOrder, pageSize]);

  const clearFilters = () => {
    setSearchTerm(""); setSelectedCategory(""); setStockFilter(""); setStatusFilter(""); setDiscountFilter(""); setPage(1);
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
        subcategory: editProduct.subcategory || "", description: editProduct.description || "", sku: editProduct.sku || "", image: img, updatedAt: serverTimestamp(),
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

  if (loading) return <div className="p-6 space-y-4">{[...Array(6)].map((_, i) => <div key={i} className="h-16 bg-gradient-to-r from-blue-100 to-purple-100 animate-pulse rounded-xl" />)}</div>;

  return <>
    <Toaster position="top-right" />
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent flex items-center gap-2"><FaBox className="text-blue-600" /> Products</h1>
          <p className="text-gray-500 text-sm">Index-free mode • local filters • low reads</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${isConnected ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
            <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`} />
            <FaWifi className="w-3 h-3" /> {isConnected ? "Connected" : "Offline"}
          </div>
          <button onClick={handleRefresh} className="flex items-center gap-1.5 px-3 py-2 bg-white rounded-lg font-semibold text-sm shadow"><FaSync className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Sync Data</button>
          <button onClick={() => setShowStats(!showStats)} className={`p-2 rounded-lg ${showStats ? "bg-blue-500 text-white" : "bg-white"} shadow`}><FaChartBar className="w-4 h-4" /></button>
          <button onClick={() => setShowFilters(!showFilters)} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold text-sm ${showFilters || hasFilters ? "bg-blue-500 text-white" : "bg-white"} shadow`}><FaFilter className="w-3 h-3" /> Filters</button>
          <button onClick={() => setShowImportModal(true)} className="flex items-center gap-1.5 px-3 py-2 bg-green-500 text-white rounded-lg font-semibold text-sm shadow"><FaCloudUploadAlt className="w-4 h-4" /> Import</button>
          <button onClick={() => setShowExportModal(true)} className="flex items-center gap-1.5 px-3 py-2 bg-purple-500 text-white rounded-lg font-semibold text-sm shadow"><FaCloudDownloadAlt className="w-4 h-4" /> Export</button>
        </div>
      </div>

      {showStats && <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <div className="bg-white rounded-xl p-3 shadow flex items-center gap-3"><div className="p-2 bg-blue-100 rounded-lg"><FaCubes className="w-4 h-4 text-blue-600" /></div><div><p className="text-xs text-gray-500">Loaded</p><p className="font-bold">{allProducts.length}</p></div></div>
        <div className="bg-gradient-to-r from-green-500 to-emerald-500 rounded-xl p-3 shadow text-white flex items-center gap-3"><div className="p-2 bg-white/20 rounded-lg"><FaCheckCircle className="w-4 h-4" /></div><div><p className="text-xs opacity-80">Active</p><p className="font-bold">{stats.active}</p></div></div>
        <div className="bg-gradient-to-r from-red-500 to-rose-500 rounded-xl p-3 shadow text-white flex items-center gap-3"><div className="p-2 bg-white/20 rounded-lg"><FaBan className="w-4 h-4" /></div><div><p className="text-xs opacity-80">Inactive</p><p className="font-bold">{stats.inactive}</p></div></div>
        <div className="bg-white rounded-xl p-3 shadow flex items-center gap-3"><div className="p-2 bg-orange-100 rounded-lg"><FaExclamationTriangle className="w-4 h-4 text-orange-600" /></div><div><p className="text-xs text-gray-500">Low Stock</p><p className="font-bold text-orange-600">{stats.lowStock}</p></div></div>
        <div className="bg-white rounded-xl p-3 shadow flex items-center gap-3"><div className="p-2 bg-purple-100 rounded-lg"><FaFire className="w-4 h-4 text-purple-600" /></div><div><p className="text-xs text-gray-500">Popular</p><p className="font-bold text-purple-600">{stats.popular}</p></div></div>
        <div className="bg-gradient-to-r from-indigo-500 to-purple-500 rounded-xl p-3 shadow text-white flex items-center gap-3"><div className="p-2 bg-white/20 rounded-lg"><FaRupeeSign className="w-4 h-4" /></div><div><p className="text-xs opacity-80">Value</p><p className="font-bold text-sm">PKR {stats.totalValue.toLocaleString()}</p></div></div>
      </div>}

      <div className="bg-white rounded-xl shadow p-4 mb-4 flex flex-wrap gap-3 items-center">
        <div className="flex-1 min-w-[200px] relative">
          <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input ref={searchRef} type="text" placeholder="Search in loaded products..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-10 pr-8 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          {searchTerm && <button onClick={() => setSearchTerm("")} className="absolute right-2 top-1/2 -translate-y-1/2"><FaTimes className="w-4 h-4 text-gray-400" /></button>}
        </div>

        <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} className="p-2.5 border rounded-lg text-sm">
          <option value="">All Categories</option>
          {mainCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {["", "active", "inactive"].map(s => <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 rounded text-xs font-semibold ${statusFilter === s ? (s === "active" ? "bg-green-500 text-white" : s === "inactive" ? "bg-red-500 text-white" : "bg-white shadow") : "text-gray-600"}`}>{s === "" ? "All" : s === "active" ? `🟢 Active (${stats.active})` : `🔴 Inactive (${stats.inactive})`}</button>)}
        </div>

        <button onClick={() => setDiscountFilter(f => f === "discounted" ? "" : "discounted")} className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-semibold ${discountFilter === "discounted" ? "bg-red-500 text-white" : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"}`}>
          <FaTag className="w-4 h-4" /> Discounted
        </button>

        <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="p-2.5 border rounded-lg text-sm">
          <option value="createdAt">Date</option><option value="nameEn">Name</option><option value="price">Price</option><option value="stock">Stock</option>
        </select>

        <button onClick={() => setSortOrder(o => o === "asc" ? "desc" : "asc")} className="p-2.5 bg-gray-100 rounded-lg">{sortOrder === "asc" ? <FaSortAmountUp className="w-4 h-4" /> : <FaSortAmountDown className="w-4 h-4" />}</button>

        <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} className="p-2.5 border rounded-lg text-sm">
          <option value={10}>10</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option>
        </select>
      </div>

      {showFilters && (
        <div className="bg-white rounded-xl shadow p-4 mb-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <select value={stockFilter} onChange={e => setStockFilter(e.target.value)} className="p-2 border rounded-lg text-sm">
            <option value="">All Stock</option>
            <option value="instock">In Stock</option>
            <option value="lowstock">Low Stock</option>
            <option value="outofstock">Out of Stock</option>
          </select>

          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setDiscountFilter("")}
              className={`flex-1 py-1.5 rounded text-xs font-semibold transition ${discountFilter === "" ? "bg-white shadow text-gray-700" : "text-gray-500 hover:text-gray-700"}`}
            >
              All
            </button>
            <button
              onClick={() => setDiscountFilter("discounted")}
              className={`flex-1 py-1.5 rounded text-xs font-semibold transition ${discountFilter === "discounted" ? "bg-red-500 text-white shadow" : "text-gray-500 hover:text-gray-700"}`}
            >
              🏷️ On Sale
            </button>
          </div>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="p-2 bg-red-50 text-red-600 rounded-lg text-sm font-semibold flex items-center justify-center gap-1 hover:bg-red-100 transition"
            >
              <FaTimes className="w-3 h-3" /> Clear All
            </button>
          )}
        </div>
      )}

      {selectedProducts.length > 0 && <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-4 mb-4 text-white flex flex-wrap items-center justify-between gap-3">
        <span className="font-bold"><FaCheckDouble className="inline w-4 h-4 mr-2" />{selectedProducts.length} selected</span>
        <div className="flex gap-2">
          <button onClick={() => handleBulk("activate")} disabled={bulkUpdating} className="px-3 py-1.5 bg-green-500 rounded-lg text-sm font-semibold">Activate</button>
          <button onClick={() => handleBulk("deactivate")} disabled={bulkUpdating} className="px-3 py-1.5 bg-orange-500 rounded-lg text-sm font-semibold">Deactivate</button>
          <button onClick={() => handleBulk("delete")} disabled={bulkUpdating} className="px-3 py-1.5 bg-red-500 rounded-lg text-sm font-semibold">Delete</button>
          <button onClick={() => setSelectedProducts([])} className="px-3 py-1.5 bg-white/20 rounded-lg text-sm font-semibold">Cancel</button>
        </div>
      </div>}

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-gray-600">Showing {paginated.length} of {filteredProducts.length}</span>
          <div className="flex gap-1 bg-gray-100 rounded p-1">
            <button onClick={() => setViewMode("table")} className={`p-1.5 rounded ${viewMode === "table" ? "bg-white shadow" : ""}`}><FaList className="w-4 h-4" /></button>
            <button onClick={() => setViewMode("grid")} className={`p-1.5 rounded ${viewMode === "grid" ? "bg-white shadow" : ""}`}><FaThLarge className="w-4 h-4" /></button>
          </div>
        </div>

        {viewMode === "table" ? <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
              <tr>
                <th className="p-3 text-left"><input type="checkbox" checked={selectedProducts.length === paginated.length && paginated.length > 0} onChange={() => setSelectedProducts(selectedProducts.length === paginated.length ? [] : paginated.map(p => p.id))} /></th>
                <th className="p-3 text-left">Image</th>
                <th className="p-3 text-left">Name</th>
                <th className="p-3 text-left">Category</th>
                <th className="p-3 text-left">Price</th>
                <th className="p-3 text-left">Stock</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-center">Popular</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? <tr><td colSpan={9} className="p-8 text-center text-gray-500"><FaBox className="w-12 h-12 mx-auto mb-2 text-gray-300" />No products found</td></tr>
                : paginated.map((p, i) => <tr key={p.id} className={`border-b hover:bg-blue-50/50 ${selectedProducts.includes(p.id) ? "bg-blue-50" : i % 2 ? "bg-gray-50/50" : ""} ${updatingStatus === p.id ? "animate-pulse bg-yellow-50" : ""}`}>
                  <td className="p-3"><input type="checkbox" checked={selectedProducts.includes(p.id)} onChange={() => setSelectedProducts(s => s.includes(p.id) ? s.filter(x => x !== p.id) : [...s, p.id])} /></td>
                  <td className="p-3">{p.image ? <img src={p.image} alt="" className="w-12 h-12 rounded-lg object-cover cursor-pointer hover:scale-110 transition" onClick={() => setFullImage(p.image)} /> : <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center"><FaImage className="w-5 h-5 text-gray-400" /></div>}</td>
                  <td className="p-3"><p className="font-semibold">{p.nameEn || "Unnamed"}</p>{p.nameUr && <p className="text-xs text-gray-500">{p.nameUr}</p>}</td>
                  <td className="p-3 text-gray-600">{p.categoryName || "-"}</td>
                  <td className="p-3">
                    <span className="font-bold text-green-600">{formatPrice(p.price)}</span>
                    {num(p.mrpPrice) > num(p.price) && <p className="text-xs text-gray-400 line-through">{formatPrice(p.mrpPrice)}</p>}
                    {num(p.discount) > 0 && <p className="text-xs text-red-500 font-bold mt-0.5">Rs. {p.discount} OFF</p>}
                  </td>
                  <td className="p-3"><StockBadge stock={p.stock} /></td>
                  <td className="p-3"><StatusBadge status={p.status} onChange={() => toggleStatus(p)} disabled={updatingStatus === p.id} /></td>
                  <td className="p-3 text-center">{p.mostPopular ? <FaStar className="w-5 h-5 text-yellow-500 mx-auto" /> : <FaRegStar className="w-5 h-5 text-gray-300 mx-auto" />}</td>
                  <td className="p-3"><div className="flex justify-center gap-1">
                    <button onClick={() => { setEditProduct({ ...p }); setImagePreview(p.image); }} className="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200"><FaEdit className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(p.id)} disabled={deleting === p.id} className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 disabled:opacity-50">{deleting === p.id ? <FaSync className="w-4 h-4 animate-spin" /> : <FaTrash className="w-4 h-4" />}</button>
                  </div></td>
                </tr>)}
            </tbody>
          </table>
        </div> : <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {paginated.length === 0 ? <div className="col-span-full text-center py-8 text-gray-500"><FaBox className="w-12 h-12 mx-auto mb-2 text-gray-300" />No products</div>
            : paginated.map(p => <div key={p.id} className={`bg-white rounded-xl border-2 overflow-hidden shadow hover:shadow-lg transition ${selectedProducts.includes(p.id) ? "border-blue-500" : "border-gray-100"}`}>
              <div className="relative aspect-square bg-gray-100">
                {p.image ? <img src={p.image} alt="" className="w-full h-full object-cover" onClick={() => setFullImage(p.image)} /> : <div className="w-full h-full flex items-center justify-center"><FaImage className="w-12 h-12 text-gray-300" /></div>}
                <div className="absolute top-2 left-2"><StatusBadge status={p.status} onChange={() => toggleStatus(p)} disabled={updatingStatus === p.id} /></div>
                <div className="absolute top-2 right-2"><input type="checkbox" checked={selectedProducts.includes(p.id)} onChange={() => setSelectedProducts(s => s.includes(p.id) ? s.filter(x => x !== p.id) : [...s, p.id])} className="w-5 h-5" /></div>
                {num(p.discount) > 0 && <span className="absolute bottom-2 left-2 px-2 py-1 bg-red-500 text-white text-xs font-bold rounded">Rs. {p.discount} OFF</span>}
                {p.mostPopular && <div className="absolute bottom-2 right-2 p-1.5 bg-yellow-500 text-white rounded-full"><FaStar className="w-3 h-3" /></div>}
              </div>
              <div className="p-3">
                <h3 className="font-bold truncate">{p.nameEn || "Unnamed"}</h3>
                <p className="text-xs text-gray-500 mb-2">{p.categoryName || "Uncategorized"}</p>
                <div className="flex items-center justify-between mb-2"><span className="font-bold text-green-600">{formatPrice(p.price)}</span><StockBadge stock={p.stock} /></div>
                <div className="flex gap-2">
                  <button onClick={() => { setEditProduct({ ...p }); setImagePreview(p.image); }} className="flex-1 py-2 bg-blue-500 text-white rounded-lg text-sm font-semibold"><FaEdit className="inline w-3 h-3 mr-1" />Edit</button>
                  <button onClick={() => handleDelete(p.id)} className="p-2 bg-red-100 text-red-600 rounded-lg"><FaTrash className="w-4 h-4" /></button>
                </div>
              </div>
            </div>)}
        </div>}

        {totalPages > 1 && <div className="px-4 py-3 bg-gray-50 border-t flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-gray-600">Page {page} of {totalPages}</span>
          <div className="flex gap-1">
            <button onClick={() => setPage(1)} disabled={page === 1} className="px-3 py-1.5 bg-white border rounded text-sm disabled:opacity-50">First</button>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 bg-blue-500 text-white rounded text-sm disabled:opacity-50 flex items-center gap-1"><FaChevronLeft className="w-3 h-3" />Prev</button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 bg-blue-500 text-white rounded text-sm disabled:opacity-50 flex items-center gap-1">Next<FaChevronRight className="w-3 h-3" /></button>
            <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="px-3 py-1.5 bg-white border rounded text-sm disabled:opacity-50">Last</button>
          </div>
        </div>}
      </div>

      {fullImage && <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4" onClick={() => setFullImage(null)}>
        <img src={fullImage} alt="" className="max-w-full max-h-[90vh] rounded-xl" />
        <button onClick={() => setFullImage(null)} className="absolute top-4 right-4 p-2 bg-red-500 text-white rounded-full"><FaTimes className="w-5 h-5" /></button>
      </div>}
      {editProduct && <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 flex items-center justify-between">
            <h2 className="font-bold flex items-center gap-2"><FaEdit /> Edit Product</h2>
            <button onClick={() => { setEditProduct(null); setImageFile(null); setImagePreview(null); }} className="p-1.5 hover:bg-white/20 rounded"><FaTimes className="w-5 h-5" /></button>
          </div>

          <div className="p-4 overflow-y-auto max-h-[calc(90vh-120px)] grid grid-cols-1 sm:grid-cols-2 gap-3">

            {/* Name EN */}
            <div>
              <label className="text-xs font-semibold text-gray-600">Name (EN)</label>
              <input type="text" value={editProduct.nameEn || ""} onChange={e => setEditProduct({ ...editProduct, nameEn: e.target.value })} className="w-full p-2 border rounded-lg mt-1" />
            </div>

            {/* Name UR */}
            <div>
              <label className="text-xs font-semibold text-gray-600">Name (UR)</label>
              <input type="text" value={editProduct.nameUr || ""} onChange={e => setEditProduct({ ...editProduct, nameUr: e.target.value })} className="w-full p-2 border rounded-lg mt-1 text-right" dir="rtl" />
            </div>

            {/* Category */}
            <div>
              <label className="text-xs font-semibold text-gray-600">Category</label>
              <select value={editProduct.category || ""} onChange={e => {
                const catId = e.target.value;
                const catName = categoriesMap[catId]?.name || "";
                setEditProduct({ ...editProduct, category: catId, categoryName: catName, subcategory: "" });
              }} className="w-full p-2 border rounded-lg mt-1">
                <option value="">Select Category</option>
                {mainCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* Subcategory */}
            <div>
              <label className="text-xs font-semibold text-gray-600">Subcategory</label>
              <select value={editProduct.subcategory || ""} onChange={e => setEditProduct({ ...editProduct, subcategory: e.target.value })} className="w-full p-2 border rounded-lg mt-1">
                <option value="">Select Subcategory</option>
                {Object.values(categoriesMap).filter(c => c.parentId === editProduct.category).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* Price */}
            <div>
              <label className="text-xs font-semibold text-gray-600">Price (PKR)</label>
              <input type="number" value={editProduct.price || ""} onChange={e => {
                const price = num(e.target.value);
                const mrp = num(editProduct.mrpPrice);
                const autoDiscount = mrp > price ? Math.round(mrp - price) : 0;
                setEditProduct({ ...editProduct, price: e.target.value, discount: autoDiscount });
              }} className="w-full p-2 border rounded-lg mt-1" />
            </div>

            {/* MRP */}
            <div>
              <label className="text-xs font-semibold text-gray-600">MRP (PKR)</label>
              <input type="number" value={editProduct.mrpPrice || ""} onChange={e => {
                const mrp = num(e.target.value);
                const price = num(editProduct.price);
                const autoDiscount = mrp > price ? Math.round(mrp - price) : 0;
                setEditProduct({ ...editProduct, mrpPrice: e.target.value, discount: autoDiscount });
              }} className="w-full p-2 border rounded-lg mt-1" />
            </div>

            {/* ✅ DISCOUNT - Updated Field */}
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-gray-600 flex items-center justify-between">
                <span>Discount (Rs.)</span>
                {num(editProduct.mrpPrice) > num(editProduct.price) && num(editProduct.price) > 0 ? (
                  <span className="text-xs font-normal text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                    ✓ Auto: PKR {num(editProduct.mrpPrice) - num(editProduct.price)} (MRP − Price)
                  </span>
                ) : (
                  <span className="text-xs font-normal text-gray-400 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
                    Manual override
                  </span>
                )}
              </label>

              {/* Input with Rs. prefix */}
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-sm">Rs.</span>
                <input
                  type="number"
                  min="0"
                  value={editProduct.discount ?? ""}
                  onChange={e => {
                    const val = Number(e.target.value);
                    setEditProduct({ ...editProduct, discount: val < 0 ? 0 : val });
                  }}
                  className={`w-full pl-12 pr-20 py-2 border-2 rounded-lg outline-none transition font-semibold
              ${num(editProduct.discount) > 0
                      ? "border-red-300 bg-red-50 focus:border-red-400 focus:ring-2 focus:ring-red-100 text-red-600"
                      : "border-gray-200 bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 text-gray-700"
                    }`}
                  placeholder="0"
                />
                {num(editProduct.discount) > 0 && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-0.5 bg-red-500 text-white text-xs font-bold rounded-full">
                    OFF
                  </span>
                )}
              </div>

              {/* Price breakdown */}
              {num(editProduct.price) > 0 && num(editProduct.mrpPrice) > 0 && (
                <div className="mt-2 p-2.5 bg-gradient-to-r from-gray-50 to-blue-50 border border-gray-200 rounded-lg">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-gray-500">
                      MRP: <strong className="line-through text-gray-600">PKR {num(editProduct.mrpPrice).toLocaleString()}</strong>
                    </span>
                    <span className="text-gray-400 font-bold">−</span>
                    <span className="text-gray-500">
                      Selling: <strong className="text-green-600">PKR {num(editProduct.price).toLocaleString()}</strong>
                    </span>
                    <span className="text-gray-400 font-bold">=</span>
                    {num(editProduct.discount) > 0 ? (
                      <span className="px-2 py-0.5 bg-red-100 text-red-600 font-bold rounded-md">
                        Rs. {num(editProduct.discount).toLocaleString()} OFF
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-md">No Discount</span>
                    )}
                  </div>
                  {num(editProduct.discount) > 0 && (
                    <p className="text-xs text-green-600 font-semibold mt-1 text-right">
                      🎉 Customer saves: PKR {num(editProduct.discount).toLocaleString()}
                    </p>
                  )}
                </div>
              )}
              <p className="text-xs text-gray-400 mt-1">Auto-calculated from MRP − Price. You can also type manually.</p>
            </div>

            {/* Stock */}
            <div>
              <label className="text-xs font-semibold text-gray-600">Stock</label>
              <input type="number" value={editProduct.stock || ""} onChange={e => setEditProduct({ ...editProduct, stock: e.target.value })} className="w-full p-2 border rounded-lg mt-1" />
            </div>

            {/* Unit */}
            <div>
              <label className="text-xs font-semibold text-gray-600">Unit</label>
              <input type="text" value={editProduct.unit || ""} onChange={e => setEditProduct({ ...editProduct, unit: e.target.value })} className="w-full p-2 border rounded-lg mt-1" />
            </div>

            {/* Order Limit */}
            <div>
              <label className="text-xs font-semibold text-gray-600">Order Limit</label>
              <input type="number" value={editProduct.orderLimit || ""} onChange={e => setEditProduct({ ...editProduct, orderLimit: e.target.value })} className="w-full p-2 border rounded-lg mt-1" />
            </div>

            {/* Status */}
            <div className="bg-yellow-50 p-3 rounded-lg border-2 border-yellow-200">
              <label className="text-xs font-semibold text-gray-600">Status</label>
              <select value={editProduct.status || "inactive"} onChange={e => setEditProduct({ ...editProduct, status: e.target.value })} className="w-full p-2 border rounded-lg mt-1 font-bold">
                <option value="active">🟢 Active</option>
                <option value="inactive">🔴 Inactive</option>
              </select>
            </div>

            {/* Popular */}
            <div>
              <label className="text-xs font-semibold text-gray-600">Popular</label>
              <select value={editProduct.mostPopular ? "yes" : "no"} onChange={e => setEditProduct({ ...editProduct, mostPopular: e.target.value === "yes" })} className="w-full p-2 border rounded-lg mt-1">
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>

            {/* Reselling */}
            <div>
              <label className="text-xs font-semibold text-gray-600">Reselling</label>
              <select value={editProduct.reselling ? "yes" : "no"} onChange={e => setEditProduct({ ...editProduct, reselling: e.target.value === "yes" })} className="w-full p-2 border rounded-lg mt-1">
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>

            {/* Image */}
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-gray-600">Image</label>
              <div className="flex items-center gap-3 mt-1">
                <input type="file" accept="image/*" onChange={handleImageSelect} className="flex-1 p-2 border-2 border-dashed rounded-lg text-sm" />
                {(imagePreview || editProduct.image) && (
                  <img src={imagePreview || editProduct.image} alt="" className="w-16 h-16 rounded-lg object-cover" />
                )}
              </div>
            </div>

            {/* Description */}
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-gray-600">Description</label>
              <textarea value={editProduct.description || ""} onChange={e => setEditProduct({ ...editProduct, description: e.target.value })} className="w-full p-2 border rounded-lg mt-1 min-h-[80px]" />
            </div>

          </div>

          {/* Footer */}
          <div className="border-t p-4 bg-gray-50 flex justify-end gap-2">
            <button onClick={() => { setEditProduct(null); setImageFile(null); setImagePreview(null); }} className="px-4 py-2 bg-gray-200 rounded-lg font-semibold flex items-center gap-1"><FaTimes /> Cancel</button>
            <button onClick={handleSave} disabled={uploadingImage} className="px-4 py-2 bg-blue-500 text-white rounded-lg font-semibold flex items-center gap-1 disabled:opacity-50">
              {uploadingImage ? <><FaSync className="animate-spin" /> Uploading...</> : <><FaSave /> Save</>}
            </button>
          </div>

        </div>
      </div>}

      {showExportModal && <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><FaCloudDownloadAlt className="text-purple-500" /> Export</h3>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <button onClick={() => exportData("filtered", "xlsx")} className="p-4 border-2 border-blue-500 bg-blue-50 rounded-xl text-center hover:bg-blue-100"><FaFileExcel className="w-8 h-8 text-blue-600 mx-auto mb-1" /><p className="font-semibold text-sm">Filtered</p><p className="text-xs text-gray-500">{filteredProducts.length} items</p></button>
            <button onClick={() => exportData("all", "xlsx")} className="p-4 border-2 border-green-500 bg-green-50 rounded-xl text-center hover:bg-green-100"><FaFileExcel className="w-8 h-8 text-green-600 mx-auto mb-1" /><p className="font-semibold text-sm">Loaded</p><p className="text-xs text-gray-500">{allProducts.length} items</p></button>
          </div>
          <div className="flex gap-2">
            <button onClick={() => exportData("filtered", "csv")} className="flex-1 py-2 bg-gray-100 rounded-lg font-semibold text-sm flex items-center justify-center gap-1"><FaFileCsv /> CSV</button>
            <button onClick={() => setShowExportModal(false)} className="px-4 py-2 bg-gray-200 rounded-lg font-semibold text-sm">Close</button>
          </div>
        </div>
      </div>}

      {showImportModal && <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><FaCloudUploadAlt className="text-green-500" /> Import</h3>
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 mb-4 text-sm text-blue-700">Upload Excel/CSV file with product data.</div>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleImport} className="w-full p-3 border-2 border-dashed rounded-lg mb-4" />
          <div className="flex gap-2">
            <button onClick={downloadTemplate} className="flex-1 py-2 bg-purple-100 text-purple-700 rounded-lg font-semibold text-sm flex items-center justify-center gap-1"><FaDownload /> Template</button>
            <button onClick={() => setShowImportModal(false)} className="px-4 py-2 bg-gray-200 rounded-lg font-semibold text-sm">Cancel</button>
          </div>
        </div>
      </div>}
    </div>
  </>;
}