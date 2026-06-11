import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { collection, collectionGroup, getDocs, updateDoc, doc, serverTimestamp, query, orderBy, limit, startAfter } from "firebase/firestore";
import { db } from "../firebase";
import { FaSearch, FaSave, FaSync, FaCheckCircle, FaTimes, FaChevronDown, FaChevronLeft, FaChevronRight, FaLock, FaFilter, FaFileExcel, FaFileImport, FaDownload, FaSortAmountDown, FaSortAmountUp, FaPercent, FaCalculator } from "react-icons/fa";
import PageShell, { SectionCard } from "./ui/PageShell";
import toast, { Toaster } from "react-hot-toast";
import * as Excel from "exceljs";
import { saveAs } from "file-saver";

const num = (v) => (typeof v === "number" && !isNaN(v) ? v : Number(v) || 0);
const formatPrice = (p) => `PKR ${num(p).toLocaleString()}`;
const FETCH_LIMIT = 25;
const MARGIN_PRESETS = [5, 10, 15, 20, 25, 30];

const PKRIcon = ({ className = "w-5 h-5" }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
    <text x="7" y="16" fontSize="10" fontWeight="bold" fill="currentColor">₨</text>
  </svg>
);

function useDebounce(value, delay = 300) {
  const [d, setD] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setD(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return d;
}

export default function PriceManagement() {
  const [products, setProducts] = useState([]);
  const [categoriesMap, setCategoriesMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState("");

  const [selectedCategory, setSelectedCategory] = useState("");
  const [liveStatusFilter, setLiveStatusFilter] = useState("");
  const [priceFilter, setPriceFilter] = useState("all");
  const [changeFilter, setChangeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState("desc");
  const [showFilters, setShowFilters] = useState(false);

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);

  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(new Set());
  const [savedIds, setSavedIds] = useState(new Set());

  const [showImport, setShowImport] = useState(false);
  const fileRef = useRef(null);

  const debouncedSearch = useDebounce(search);
  const isFetching = useRef(false);
  const productIdsRef = useRef(new Set());

  useEffect(() => {
    getDocs(collectionGroup(db, "categories"))
      .then((snap) => {
        const map = {};
        snap.forEach((d) => (map[d.id] = { id: d.id, ...d.data() }));
        setCategoriesMap(map);
      })
      .catch(() => {});
  }, []);

  const fetchProducts = useCallback(async (isLoadMore = false) => {
    if (isFetching.current) return;
    isFetching.current = true;
    if (isLoadMore) setLoadingMore(true);
    else {
      setLoading(true);
      productIdsRef.current.clear();
    }

    try {
      const constraints = [orderBy("createdAt", "desc"), limit(FETCH_LIMIT)];
      if (isLoadMore && lastDoc) constraints.push(startAfter(lastDoc));
      const snap = await getDocs(query(collection(db, "products"), ...constraints));

      const newLastDoc = snap.docs[snap.docs.length - 1] || null;
      const uniqueProducts = [];

      snap.docs.forEach((d) => {
        if (!productIdsRef.current.has(d.id)) {
          productIdsRef.current.add(d.id);
          uniqueProducts.push({ id: d.id, ...d.data() });
        }
      });

      setProducts((prev) => (isLoadMore ? [...prev, ...uniqueProducts] : uniqueProducts));
      setLastDoc(newLastDoc);
      setHasMore(snap.docs.length === FETCH_LIMIT);
    } catch {
      toast.error("Failed to load!");
    } finally {
      setLoading(false);
      setLoadingMore(false);
      isFetching.current = false;
    }
  }, [lastDoc]);

  useEffect(() => {
    fetchProducts(false);
  }, []);

  const filtered = useMemo(() => {
    let list = [...products];

    if (selectedCategory) list = list.filter((p) => p.category === selectedCategory);
    if (liveStatusFilter) list = list.filter((p) => p.status === liveStatusFilter);

    if (debouncedSearch) {
      const t = debouncedSearch.toLowerCase();
      list = list.filter(
        (p) =>
          (p.nameEn || "").toLowerCase().includes(t) ||
          (p.nameUr || "").toLowerCase().includes(t) ||
          (p.sku || "").toLowerCase().includes(t) ||
          (p.categoryName || "").toLowerCase().includes(t)
      );
    }

    if (priceFilter === "low") list = list.filter((p) => num(p.price) < 500);
    else if (priceFilter === "medium") list = list.filter((p) => num(p.price) >= 500 && num(p.price) < 2000);
    else if (priceFilter === "high") list = list.filter((p) => num(p.price) >= 2000);

    if (changeFilter === "changed") list = list.filter((p) => p.oldPrice && p.oldPrice !== p.price);
    else if (changeFilter === "unchanged") list = list.filter((p) => !p.oldPrice || p.oldPrice === p.price);

    list.sort((a, b) => {
      let av, bv;
      if (sortBy === "name") {
        av = (a.nameEn || "").toLowerCase();
        bv = (b.nameEn || "").toLowerCase();
      } else if (sortBy === "price") {
        av = num(a.price);
        bv = num(b.price);
      } else if (sortBy === "margin") {
        av = num(a.margin);
        bv = num(b.margin);
      } else {
        av = a.createdAt?.toDate?.()?.getTime() || 0;
        bv = b.createdAt?.toDate?.()?.getTime() || 0;
      }
      if (av === bv) return 0;
      return sortOrder === "asc" ? (av < bv ? -1 : 1) : av > bv ? -1 : 1;
    });

    return list;
  }, [products, selectedCategory, liveStatusFilter, debouncedSearch, priceFilter, changeFilter, sortBy, sortOrder]);

  const totalPages = Math.ceil(filtered.length / perPage) || 1;
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, selectedCategory, liveStatusFilter, priceFilter, changeFilter, sortBy, perPage, sortOrder]);

  const stats = useMemo(() => ({
    total: products.length,
    filtered: filtered.length,
    pending: Object.entries(drafts).filter(([id, val]) => {
      const p = products.find((x) => x.id === id);
      if (!p) return false;
      return (
        (val.price !== "" && num(val.price) !== num(p.price)) ||
        (val.costPrice !== "" && num(val.costPrice) !== num(p.costPrice)) ||
        (val.margin !== "" && num(val.margin) !== num(p.margin))
      );
    }).length,
    saved: savedIds.size,
    changed: products.filter((p) => p.oldPrice && p.oldPrice !== p.price).length,
    active: products.filter((p) => p.status === "active").length,
    inactive: products.filter((p) => p.status !== "active").length,
  }), [products, filtered, drafts, savedIds]);

  const mainCategories = useMemo(
    () => Object.values(categoriesMap).filter((c) => !c.parentId),
    [categoriesMap]
  );

  const calculateSellingPrice = useCallback((costPrice, margin) => {
    const cost = num(costPrice);
    const marginPercent = num(margin);
    if (cost <= 0) return 0;
    return Math.round(cost + (cost * marginPercent / 100));
  }, []);

  const calculateMargin = useCallback((costPrice, sellingPrice) => {
    const cost = num(costPrice);
    const sell = num(sellingPrice);
    if (cost <= 0 || sell <= 0) return 0;
    return Math.round((((sell - cost) / cost) * 100) * 10) / 10;
  }, []);

  const getDraft = useCallback((p) => {
    const d = drafts[p.id] || {};
    return {
      costPrice: d.costPrice ?? (p.costPrice ?? ""),
      margin: d.margin ?? (p.margin ?? 10),
      price: d.price ?? (p.price ?? ""),
    };
  }, [drafts]);

  const handleCostChange = useCallback((product, value) => {
    if (saving.has(product.id)) return;
    const current = getDraft(product);
    const newSell = calculateSellingPrice(value, current.margin);
    setDrafts((prev) => ({
      ...prev,
      [product.id]: {
        ...prev[product.id],
        costPrice: value,
        price: newSell > 0 ? String(newSell) : "",
      },
    }));
  }, [saving, getDraft, calculateSellingPrice]);

  const handleMarginChange = useCallback((product, value) => {
    if (saving.has(product.id)) return;
    const current = getDraft(product);
    const newSell = calculateSellingPrice(current.costPrice, value);
    setDrafts((prev) => ({
      ...prev,
      [product.id]: {
        ...prev[product.id],
        margin: value,
        price: newSell > 0 ? String(newSell) : "",
      },
    }));
  }, [saving, getDraft, calculateSellingPrice]);

  const handlePriceChange = useCallback((product, value) => {
    if (saving.has(product.id)) return;
    const current = getDraft(product);
    const newMargin = calculateMargin(current.costPrice, value);
    setDrafts((prev) => ({
      ...prev,
      [product.id]: {
        ...prev[product.id],
        price: value,
        margin: newMargin > 0 ? newMargin : current.margin,
      },
    }));
  }, [saving, getDraft, calculateMargin]);

  const savePrice = useCallback(async (product) => {
    const d = drafts[product.id] || {};
    const nextPrice = d.price === "" || d.price === undefined ? num(product.price) : num(d.price);
    const nextCost = d.costPrice === "" || d.costPrice === undefined ? num(product.costPrice) : num(d.costPrice);
    const nextMargin = d.margin === "" || d.margin === undefined ? num(product.margin) : num(d.margin);

    const changed =
      nextPrice !== num(product.price) ||
      nextCost !== num(product.costPrice) ||
      nextMargin !== num(product.margin);

    if (!changed) return toast.error("No changes to save!");
    if (nextPrice <= 0) return toast.error("Enter valid price!");
    if (saving.has(product.id)) return;

    setSaving((prev) => new Set(prev).add(product.id));
    const oldPrice = num(product.price);
    const oldCost = num(product.costPrice);
    const oldMargin = num(product.margin);

    setProducts((prev) =>
      prev.map((p) =>
        p.id === product.id
          ? { ...p, price: nextPrice, costPrice: nextCost, margin: nextMargin, oldPrice, updatedAt: new Date() }
          : p
      )
    );

    try {
      await updateDoc(doc(db, "products", product.id), {
        price: nextPrice,
        costPrice: nextCost,
        margin: nextMargin,
        oldPrice,
        updatedAt: serverTimestamp(),
      });

      setDrafts((prev) => {
        const u = { ...prev };
        delete u[product.id];
        return u;
      });

      setSavedIds((prev) => new Set(prev).add(product.id));
      toast.success(
        <span>
          <b>{product.nameEn}</b>: {formatPrice(oldPrice)} → <span className="text-green-500">{formatPrice(nextPrice)}</span>
        </span>
      );
    } catch {
      setProducts((prev) =>
        prev.map((p) =>
          p.id === product.id
            ? { ...p, price: oldPrice, costPrice: oldCost, margin: oldMargin }
            : p
        )
      );
      toast.error("Failed!");
    } finally {
      setSaving((prev) => {
        const u = new Set(prev);
        u.delete(product.id);
        return u;
      });
    }
  }, [drafts, saving]);

  const clearAll = () => {
    setDrafts({});
    toast.success("Cleared!");
  };

  const handleRefresh = () => {
    setDrafts({});
    setSavedIds(new Set());
    productIdsRef.current.clear();
    setLastDoc(null);
    setHasMore(true);
    setPage(1);
    fetchProducts(false);
  };

  const exportData = async (type) => {
    const data = (type === "all" ? products : filtered).map((p, i) => ({
      "S.No": i + 1,
      "Name (EN)": p.nameEn || "",
      "Name (UR)": p.nameUr || "",
      Category: p.categoryName || "",
      SKU: p.sku || "",
      "Cost Price": num(p.costPrice || 0),
      Margin: num(p.margin || 0),
      "Current Price": num(p.price),
      "Old Price": num(p.oldPrice || 0),
      Status: p.status || "active",
      Stock: num(p.stock || 0),
    }));
    const wb = new Excel.Workbook();
    const ws = wb.addWorksheet("Prices");
    if (data.length > 0) {
      ws.columns = Object.keys(data[0]).map(k => ({ header: k, key: k }));
      data.forEach(row => ws.addRow(row));
    }
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/octet-stream" });
    saveAs(blob, `prices_${type}_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast.success(`Exported ${data.length} products!`);
  };

  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const t = toast.loading("Importing...");
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb = new Excel.Workbook();
        await wb.xlsx.load(evt.target?.result);
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
        let updated = 0;
        for (const row of data) {
          const sku = row.SKU || row.sku;
          const newPriceVal = num(row["New Price"] || row.newPrice || row["Current Price"]);
          if (sku && newPriceVal > 0) {
            const product = products.find((p) => p.sku === sku);
            if (product && newPriceVal !== num(product.price)) {
              await updateDoc(doc(db, "products", product.id), {
                price: newPriceVal,
                oldPrice: num(product.price),
                updatedAt: serverTimestamp(),
              });
              updated++;
            }
          }
        }
        toast.success(`Updated ${updated} prices!`, { id: t });
        handleRefresh();
      } catch {
        toast.error("Import failed!", { id: t });
      }
    };
    reader.readAsArrayBuffer(file);
    if (fileRef.current) fileRef.current.value = "";
    setShowImport(false);
  };

  const downloadTemplate = async () => {
    const templateData = [
      { SKU: "PROD001", "New Price": 500 },
      { SKU: "PROD002", "New Price": 1200 }
    ];
    const wb = new Excel.Workbook();
    const ws = wb.addWorksheet("Template");
    ws.columns = Object.keys(templateData[0]).map(k => ({ header: k, key: k }));
    templateData.forEach(row => ws.addRow(row));
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/octet-stream" });
    saveAs(blob, "price_update_template.xlsx");
    toast.success("Template downloaded!");
  };

  if (loading && !products.length) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 font-semibold">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Toaster position="top-right" />
      <PageShell
        title="Price Management"
        subtitle={`${stats.total} loaded • ${stats.pending} pending • ${stats.saved} saved`}
        icon={PKRIcon}
        actions={
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={handleRefresh} className="theme-btn-secondary p-2.5">
              <FaSync className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button type="button" onClick={() => setShowFilters(!showFilters)} className={showFilters ? "theme-btn-primary" : "theme-btn-secondary"}>
              <FaFilter className="w-4 h-4" /> Filters
            </button>
            <button type="button" onClick={() => exportData("filtered")} className="theme-btn-primary">
              <FaFileExcel className="w-4 h-4" /> Export
            </button>
            <button type="button" onClick={() => setShowImport(true)} className="theme-btn-secondary">
              <FaFileImport className="w-4 h-4" /> Import
            </button>
            {stats.pending > 0 && (
              <button type="button" onClick={clearAll} className="theme-btn-danger">
                <FaTimes className="w-4 h-4" /> Clear ({stats.pending})
              </button>
            )}
          </div>
        }
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {[
            { label: "Loaded", value: stats.total },
            { label: "Filtered", value: stats.filtered },
            { label: "Pending", value: stats.pending },
            { label: "Saved", value: stats.saved },
            { label: "Active", value: stats.active },
            { label: "Inactive", value: stats.inactive },
          ].map((s) => (
            <div key={s.label} className="stat-card p-4">
              <p className="text-xs theme-page-muted font-medium">{s.label}</p>
              <p className="text-2xl font-bold theme-highlight">{s.value}</p>
            </div>
          ))}
        </div>

        <SectionCard title="Search Products">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex-1 min-w-[200px] relative">
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 theme-page-muted" />
              <input
                type="text"
                placeholder="Search in loaded products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="theme-input w-full pl-10 pr-10 py-2.5"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <FaTimes className="w-4 h-4 text-gray-400" />
                </button>
              )}
            </div>

            <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="theme-select">
              <option value="">All Categories</option>
              {mainCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              {["", "active", "inactive"].map((s) => (
                <button
                  key={s}
                  onClick={() => setLiveStatusFilter(s)}
                  className={`px-3 py-1.5 rounded text-xs font-semibold ${liveStatusFilter === s ? (s === "active" ? "bg-green-500 text-white" : s === "inactive" ? "bg-red-500 text-white" : "bg-white shadow") : "text-gray-600"}`}
                >
                  {s === "" ? "All" : s === "active" ? "🟢 Active" : "🔴 Inactive"}
                </button>
              ))}
            </div>

            <select value={perPage} onChange={(e) => setPerPage(Number(e.target.value))} className="theme-select">
              <option value={10}>10/page</option>
              <option value={25}>25/page</option>
              <option value={50}>50/page</option>
              <option value={100}>100/page</option>
            </select>

            <button onClick={() => setSortOrder((o) => o === "asc" ? "desc" : "asc")} className="p-2.5 bg-white/80 rounded-xl hover:bg-white transition">
              {sortOrder === "asc" ? <FaSortAmountUp className="w-4 h-4 text-blue-600" /> : <FaSortAmountDown className="w-4 h-4 text-blue-600" />}
            </button>
          </div>

          {showFilters && (
            <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <select value={priceFilter} onChange={(e) => setPriceFilter(e.target.value)} className="theme-select">
                <option value="all">All Prices</option>
                <option value="low">Under PKR 500</option>
                <option value="medium">PKR 500-2000</option>
                <option value="high">Above PKR 2000</option>
              </select>

              <select value={changeFilter} onChange={(e) => setChangeFilter(e.target.value)} className="theme-select">
                <option value="all">All Changed Status</option>
                <option value="changed">Price Changed</option>
                <option value="unchanged">Unchanged</option>
              </select>

              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="theme-select">
                <option value="createdAt">Newest</option>
                <option value="price">Price</option>
                <option value="margin">Margin</option>
                <option value="name">Name</option>
              </select>

              <button
                onClick={() => {
                  setPriceFilter("all");
                  setChangeFilter("all");
                  setSortBy("createdAt");
                  setSearch("");
                  setSelectedCategory("");
                  setLiveStatusFilter("");
                }}
                className="p-2.5 bg-red-50 text-red-600 rounded-xl text-sm font-semibold hover:bg-red-100"
              >
                <FaTimes className="inline w-3 h-3 mr-1" /> Clear Filters
              </button>
            </div>
          )}
        </SectionCard>

        <div className="theme-table-wrap">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="p-3 text-center w-14">S.No</th>
                  <th className="p-3 text-left">Product</th>
                  <th className="p-3 text-center">Cost</th>
                  <th className="p-3 text-center">Margin</th>
                  <th className="p-3 text-center">Current</th>
                  <th className="p-3 text-center">Old</th>
                  <th className="p-3 text-center">Calculator</th>
                  <th className="p-3 text-center w-24">Action</th>
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-12 text-center text-gray-500">
                      <FaSearch className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p className="font-semibold">No products found</p>
                    </td>
                  </tr>
                ) : paginated.map((p, i) => {
                  const idx = (page - 1) * perPage + i + 1;
                  const isSaving = saving.has(p.id);
                  const wasSaved = savedIds.has(p.id);
                  const draft = getDraft(p);

                  const hasChange =
                    num(draft.price) !== num(p.price) ||
                    num(draft.costPrice) !== num(p.costPrice) ||
                    num(draft.margin) !== num(p.margin);

                  const profitAmount = num(draft.price) - num(draft.costPrice);

                  return (
                    <tr key={p.id} className={`border-b border-gray-100 transition-all ${isSaving ? "bg-blue-50 animate-pulse" : wasSaved ? "bg-green-50/50" : hasChange ? "bg-yellow-50/50" : i % 2 ? "bg-white/30" : "bg-white/50"} hover:bg-blue-50/50`}>
                      <td className="p-3 text-center font-bold text-gray-500">{idx}</td>

                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          {p.image ? (
                            <img src={p.image} alt="" className="w-10 h-10 rounded-lg object-cover border shadow" loading="lazy" />
                          ) : (
                            <div className="w-10 h-10 bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg flex items-center justify-center text-xs text-gray-400 border">N/A</div>
                          )}
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-800 truncate">{p.nameEn || "Unnamed"}</p>
                            <p className="text-xs text-gray-500 truncate">{p.categoryName || "—"} • {p.sku || "No SKU"}</p>
                            {wasSaved && <span className="inline-flex items-center gap-1 text-xs text-green-600 font-semibold"><FaCheckCircle className="w-3 h-3" /> Updated</span>}
                          </div>
                        </div>
                      </td>

                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center bg-white/80 border rounded-lg overflow-hidden">
                          <span className="px-2 text-gray-400 text-xs bg-gray-50">PKR</span>
                          <input
                            type="number"
                            min="0"
                            value={draft.costPrice}
                            onChange={(e) => handleCostChange(p, e.target.value)}
                            disabled={isSaving}
                            className="w-20 p-2 text-center font-semibold outline-none"
                          />
                        </div>
                      </td>

                      <td className="p-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <div className="flex items-center bg-white/80 border rounded-lg overflow-hidden">
                            <input
                              type="number"
                              min="0"
                              value={draft.margin}
                              onChange={(e) => handleMarginChange(p, e.target.value)}
                              disabled={isSaving}
                              className="w-16 p-2 text-center font-semibold outline-none"
                            />
                            <span className="px-2 text-gray-400 text-xs bg-gray-50">
                              <FaPercent className="w-3 h-3" />
                            </span>
                          </div>
                          <div className="flex flex-wrap justify-center gap-1">
                            {MARGIN_PRESETS.slice(0, 3).map((m) => (
                              <button
                                key={m}
                                onClick={() => handleMarginChange(p, m)}
                                disabled={isSaving}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${num(draft.margin) === m ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-600"}`}
                              >
                                {m}%
                              </button>
                            ))}
                          </div>
                        </div>
                      </td>

                      <td className="p-3 text-center">
                        <div className="inline-flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-lg font-bold text-sm shadow">
                          <PKRIcon className="w-3.5 h-3.5" /> {num(p.price).toLocaleString()}
                        </div>
                      </td>

                      <td className="p-3 text-center">
                        {p.oldPrice && p.oldPrice !== p.price ? (
                          <span className="text-gray-400 line-through text-sm">{formatPrice(p.oldPrice)}</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>

                      <td className="p-3 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <div className="flex items-center bg-white/80 border-2 rounded-lg overflow-hidden">
                            <span className="px-2 text-gray-400 text-sm bg-gray-50">PKR</span>
                            <input
                              type="number"
                              min="1"
                              value={draft.price}
                              onChange={(e) => handlePriceChange(p, e.target.value)}
                              disabled={isSaving}
                              className={`w-24 p-2 text-center font-semibold outline-none ${hasChange ? "bg-yellow-50" : ""}`}
                            />
                          </div>

                          <div className="text-xs">
                            <div className="flex items-center justify-center gap-1 text-gray-600">
                              <FaCalculator className="w-3 h-3" />
                              <span>Profit: </span>
                              <span className={profitAmount >= 0 ? "text-green-600 font-bold" : "text-red-500 font-bold"}>
                                {profitAmount.toLocaleString()}
                              </span>
                            </div>
                            {hasChange && (
                              <p className={`font-semibold ${num(draft.price) > num(p.price) ? "text-green-600" : "text-red-500"}`}>
                                {num(draft.price) > num(p.price) ? "↑" : "↓"} {Math.abs(num(draft.price) - num(p.price)).toLocaleString()}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="p-3 text-center">
                        <button
                          onClick={() => savePrice(p)}
                          disabled={isSaving || !hasChange}
                          className={`px-3 py-2 rounded-lg font-semibold text-xs transition-all flex items-center justify-center gap-1 mx-auto min-w-[70px] shadow ${isSaving ? "bg-blue-100 text-blue-600" : hasChange ? "bg-gradient-to-r from-blue-500 to-indigo-500 text-white hover:shadow-lg" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
                        >
                          {isSaving ? <><FaSync className="w-3 h-3 animate-spin" /> Saving</> : hasChange ? <><FaSave className="w-3 h-3" /> Save</> : <><FaLock className="w-3 h-3" /> Save</>}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="p-4 border-t border-gray-200 bg-white/50 flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm text-gray-600">Page {page} of {totalPages} • {filtered.length} products</span>
              <div className="flex gap-1">
                <button onClick={() => setPage(1)} disabled={page === 1} className="px-3 py-1.5 bg-white border rounded-lg text-sm disabled:opacity-50 hover:bg-gray-50">First</button>
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-lg text-sm disabled:opacity-50 flex items-center gap-1"><FaChevronLeft className="w-3 h-3" /> Prev</button>
                <span className="px-4 py-1.5 bg-white border rounded-lg font-semibold text-sm">{page}</span>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-lg text-sm disabled:opacity-50 flex items-center gap-1">Next <FaChevronRight className="w-3 h-3" /></button>
                <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="px-3 py-1.5 bg-white border rounded-lg text-sm disabled:opacity-50 hover:bg-gray-50">Last</button>
              </div>
            </div>
          )}

          {hasMore && (
            <div className="p-4 border-t border-gray-200 bg-white/50">
              <button onClick={() => fetchProducts(true)} disabled={loadingMore} className="w-full py-3 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 text-white rounded-xl font-semibold hover:shadow-lg transition disabled:opacity-50 flex items-center justify-center gap-2">
                {loadingMore ? <><FaSync className="w-4 h-4 animate-spin" /> Loading...</> : <><FaChevronDown className="w-4 h-4" /> Load More Products</>}
              </button>
            </div>
          )}

          {!hasMore && products.length > 0 && (
            <div className="p-4 border-t text-center bg-green-50/50">
              <FaCheckCircle className="inline w-5 h-5 mr-2 text-green-500" />
              <span className="text-green-700 font-semibold">All {products.length} products loaded</span>
            </div>
          )}
        </div>

        {stats.pending > 0 && (
          <div className="fixed bottom-6 right-6 px-4 py-3 theme-stat-accent shadow-2xl flex items-center gap-3">
            <span className="font-bold">{stats.pending} unsaved changes</span>
          </div>
        )}

        {showImport && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="theme-card theme-glass w-full max-w-md p-6">
              <h3 className="text-xl font-bold mb-4 theme-page-title flex items-center gap-2"><FaFileImport className="text-blue-500" /> Import Prices</h3>
              <div className="p-3 theme-card-inner rounded-xl text-sm theme-page-muted mb-4">Upload Excel with <b>SKU</b> and <b>New Price</b> columns</div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleImport} className="theme-input w-full mb-4 border-dashed" />
              <div className="flex gap-2">
                <button type="button" onClick={downloadTemplate} className="theme-btn-secondary flex-1"><FaDownload /> Template</button>
                <button type="button" onClick={() => setShowImport(false)} className="theme-btn-primary">Cancel</button>
              </div>
            </div>
          </div>
        )}
      </PageShell>
    </>
  );
}