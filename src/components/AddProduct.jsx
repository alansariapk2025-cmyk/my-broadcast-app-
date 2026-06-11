// src/components/AddProduct.jsx
import { useState, useEffect, useCallback, useRef } from "react";
import { db, auth } from "../firebase";
import { collection, addDoc, getDocs, query, where, serverTimestamp } from "firebase/firestore";
import toast, { Toaster } from "react-hot-toast";
import { FaBox, FaSave, FaImage, FaTimes, FaPercent, FaCalculator, FaSearch, FaCheckCircle, FaExclamationTriangle, FaSync, FaShieldAlt, FaCopy, FaRandom, FaLock } from "react-icons/fa";
import { logActivity, ACTIONS } from "../utils/activityLogger";
import { useShop } from "../contexts/ShopContext";
import { loadShopCategories, getMainCategories, getSubcategories } from "../utils/categoryLoader";
import { KNOWN_SHOP_NAMES, resolveShopDisplayName } from "../constants/shops";
import PageShell from "./ui/PageShell";

// Helpers
const num = (v) => (typeof v === "number" && !isNaN(v) ? v : Number(v) || 0);
const formatPrice = (p) => `Rs. ${num(p).toLocaleString()}`;

// Generate SKU
const generateSKU = (name = "", category = "") => {
  const prefix = (category || "PRD").substring(0, 3).toUpperCase();
  const namePart = (name || "XXX").substring(0, 3).toUpperCase().replace(/[^A-Z]/g, "X");
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  const timestamp = Date.now().toString().slice(-4);
  return `${prefix}-${namePart}-${random}${timestamp}`;
};

// Debounce Hook
function useDebounce(value, delay = 500) {
  const [d, setD] = useState(value);
  useEffect(() => { const t = setTimeout(() => setD(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return d;
}

// PKR Icon
const PKRIcon = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 32 32" className={className} fill="none">
    <circle cx="16" cy="16" r="14" fill="url(#pkrG)" stroke="#059669" strokeWidth="2"/>
    <text x="16" y="21" textAnchor="middle" fontSize="12" fontWeight="bold" fill="white">Rs</text>
    <defs><linearGradient id="pkrG" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#22c55e"/><stop offset="100%" stopColor="#047857"/></linearGradient></defs>
  </svg>
);

export default function AddProduct({ assignedShopId = null, isStaff = false }) {
  const { effectiveShopId, viewingAllShops } = useShop();

  // Product State
  const [product, setProduct] = useState({
    nameEn: "", nameUr: "", sku: "", description: "",
    costPrice: "", price: "", mrpPrice: "", margin: 10,
    unit: "Kg", minQty: 1, orderLimit: 10, discount: "", stock: "",
    status: "active", shopId: "", category: "", subcategory: "",
    isPopular: false, isReselling: false, isFeatured: false,
  });

  // Data States
  const [shops, setShops] = useState([]);
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [allCategories, setAllCategories] = useState([]);
  
  // Image States
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  
  // Validation States
  const [isDuplicateChecking, setIsDuplicateChecking] = useState(false);
  const [duplicateStatus, setDuplicateStatus] = useState(null); // null, 'checking', 'unique', 'duplicate'
  const [duplicateProducts, setDuplicateProducts] = useState([]);
  const [errors, setErrors] = useState({});
  
  // UI States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  const fileInputRef = useRef(null);
  const debouncedName = useDebounce(product.nameEn, 600);

  const MAX_SIZE = 1 * 1024 * 1024; // 1MB
  const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
  const MARGIN_PRESETS = [5, 10, 15, 20, 25, 30];
  const UNITS = ["Kg", "Gram", "Litre", "ML", "Dozen", "Packet", "Piece", "Box", "Bundle"];

  // Fetch Shops (STAFF: only their shop; SUPER_ADMIN: all shops)
  useEffect(() => {
    getDocs(collection(db, "shops")).then((snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setShops(list.map((s) => ({ ...s, name: resolveShopDisplayName(s.id, {}, s.name) })));
    }).catch(() => toast.error("Failed to load shops!"));
  }, []);

  // Auto-assign shop for STAFF or Super Admin (header shop filter)
  useEffect(() => {
    if (isStaff && assignedShopId) {
      handleShopChange(assignedShopId);
      return;
    }
    if (!isStaff && effectiveShopId && product.shopId !== effectiveShopId) {
      handleShopChange(effectiveShopId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStaff, assignedShopId, effectiveShopId]);

  // Auto-select when only one shop exists
  useEffect(() => {
    if (isStaff || product.shopId || shops.length !== 1) return;
    handleShopChange(shops[0].id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shops, isStaff]);

  // Check Duplicate Product
  useEffect(() => {
    if (!debouncedName || debouncedName.length < 3) {
      setDuplicateStatus(null);
      setDuplicateProducts([]);
      return;
    }

    const checkDuplicate = async () => {
      setDuplicateStatus("checking");
      setIsDuplicateChecking(true);
      
      try {
        const snap = await getDocs(collection(db, "products"));
        const searchTerm = debouncedName.toLowerCase().trim();
        
        const matches = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((p) => {
            const name = (p.nameEn || "").toLowerCase();
            const sku = (p.sku || "").toLowerCase();
            return name.includes(searchTerm) || name === searchTerm || searchTerm.includes(name) || sku === searchTerm;
          })
          .slice(0, 5);

        if (matches.length > 0) {
          setDuplicateStatus("duplicate");
          setDuplicateProducts(matches);
        } else {
          setDuplicateStatus("unique");
          setDuplicateProducts([]);
        }
      } catch (err) {
        console.error("Duplicate check error:", err);
        setDuplicateStatus(null);
      } finally {
        setIsDuplicateChecking(false);
      }
    };

    checkDuplicate();
  }, [debouncedName]);

  // Calculate Selling Price from Cost + Margin
  const calculateSellingPrice = useCallback((costPrice, margin) => {
    const cost = num(costPrice);
    const marginPercent = num(margin);
    if (cost <= 0) return 0;
    return Math.round(cost + (cost * marginPercent / 100));
  }, []);

  // Calculate Margin from Cost + Selling Price
  const calculateMargin = useCallback((costPrice, sellingPrice) => {
    const cost = num(costPrice);
    const sell = num(sellingPrice);
    if (cost <= 0 || sell <= 0) return 0;
    return Math.round(((sell - cost) / cost) * 100 * 10) / 10;
  }, []);

  // Handle Cost Price Change
  const handleCostPriceChange = (value) => {
    const cost = num(value);
    const sellingPrice = calculateSellingPrice(cost, product.margin);
    setProduct((prev) => ({
      ...prev,
      costPrice: value,
      price: sellingPrice > 0 ? sellingPrice.toString() : "",
    }));
  };

  // Handle Margin Change
  const handleMarginChange = (margin) => {
    const sellingPrice = calculateSellingPrice(product.costPrice, margin);
    setProduct((prev) => ({
      ...prev,
      margin: margin,
      price: sellingPrice > 0 ? sellingPrice.toString() : "",
    }));
  };

  // Handle Selling Price Change (reverse calculate margin and auto discount)
  const handlePriceChange = (value) => {
    const margin = calculateMargin(product.costPrice, value);
    const price = num(value);
    const mrp = num(product.mrpPrice);
    
    const autoDiscount = mrp > price ? Math.round(mrp - price) : 0;

    setProduct((prev) => ({
      ...prev,
      price: value,
      margin: margin > 0 ? margin : prev.margin,
      discount: autoDiscount,
    }));
  };

  // Handle MRP Change (auto discount)
  const handleMrpChange = (value) => {
    const mrp = num(value);
    const price = num(product.price);
    
    const autoDiscount = mrp > price ? Math.round(mrp - price) : 0;

    setProduct((prev) => ({
      ...prev,
      mrpPrice: value,
      discount: autoDiscount,
    }));
  };

  // Handle Shop Change
  const handleShopChange = async (shopId) => {
    setProduct((prev) => ({ ...prev, shopId, category: "", subcategory: "" }));
    setCategories([]);
    setSubcategories([]);
    setAllCategories([]);

    if (!shopId) return;

    try {
      const cats = await loadShopCategories(shopId);
      setAllCategories(cats);
      setCategories(getMainCategories(cats));
      if (cats.length === 0) {
        toast.error("No categories found for this shop. Add categories first.");
      }
    } catch {
      toast.error("Failed to load categories!");
    }
  };

  // Handle Category Change
  const handleCategoryChange = (categoryId) => {
    setProduct((prev) => ({ ...prev, category: categoryId, subcategory: "" }));
    setSubcategories(getSubcategories(allCategories, categoryId));
    
    // Auto-generate SKU
    const cat = allCategories.find((c) => c.id === categoryId);
    if (!product.sku && product.nameEn) {
      setProduct((prev) => ({ ...prev, sku: generateSKU(product.nameEn, cat?.name) }));
    }
  };

  // Handle Generic Change
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setProduct((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
    
    // Clear error when field is edited
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  // Generate Random SKU
  const generateRandomSKU = () => {
    const cat = allCategories.find((c) => c.id === product.category);
    const sku = generateSKU(product.nameEn, cat?.name);
    setProduct((prev) => ({ ...prev, sku }));
    toast.success("SKU generated!");
  };

  // Handle Image Select
  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_SIZE) {
      toast.error("Image too large! Max 1MB allowed.");
      return;
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error("Only JPG, PNG, WEBP allowed!");
      return;
    }

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    toast.success("Image selected!");
  };

  // Remove Image
  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Upload Image
  const uploadImage = async () => {
    if (!imageFile) return null;
    setIsUploading(true);

    try {
      const apiKey = import.meta.env.VITE_IMGBB_API_KEY;
      const form = new FormData();
      form.append("image", imageFile);

      const res = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();

      if (data.success) {
        return data.data.url;
      }
      throw new Error("Upload failed");
    } catch {
      toast.error("Image upload failed!");
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  // Validate Form
  const validateForm = () => {
    const newErrors = {};

    if (!product.nameEn.trim()) newErrors.nameEn = "Product name is required";
    if (!product.shopId) newErrors.shopId = "Select a shop";
    if (!product.category) newErrors.category = "Select a category";
    if (!product.price || num(product.price) <= 0) newErrors.price = "Enter valid price";
    if (!imageFile && !imagePreview) newErrors.image = "Product image is required";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle Submit
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error("Please fix the errors!");
      return;
    }

    // Duplicate warning (optional - can still proceed)
    if (duplicateStatus === "duplicate") {
      const proceed = window.confirm(
        `⚠️ Similar products found!\n\nDo you still want to add this product?`
      );
      if (!proceed) return;
    }

    setIsSubmitting(true);
    const t = toast.loading("Adding product...");

    try {
      const imageUrl = await uploadImage();
      if (!imageUrl) {
        toast.error("Image upload failed!", { id: t });
        setIsSubmitting(false);
        return;
      }

      const cat = allCategories.find((c) => c.id === product.category);
      const sub = allCategories.find((s) => s.id === product.subcategory);

      await addDoc(collection(db, "products"), {
        nameEn: product.nameEn.trim(),
        nameUr: product.nameUr.trim(),
        sku: product.sku || generateSKU(product.nameEn, cat?.name),
        description: product.description.trim(),
        image: imageUrl,
        costPrice: num(product.costPrice),
        price: num(product.price),
        mrpPrice: num(product.mrpPrice) || num(product.price),
        margin: num(product.margin),
        discount: num(product.discount),
        stock: parseInt(product.stock) || 0,
        unit: product.unit,
        minQty: parseInt(product.minQty) || 1,
        orderLimit: parseInt(product.orderLimit) || 10,
        status: product.status,
        shopId: product.shopId,
        shopName: resolveShopDisplayName(product.shopId, {}, shops.find((s) => s.id === product.shopId)?.name),
        category: product.category,
        subcategory: product.subcategory || "",
        categoryName: cat?.name || "Uncategorized",
        subcategoryName: sub?.name || "",
        mostPopular: product.isPopular,
        reselling: product.isReselling,
        featured: product.isFeatured,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Log activity
      await logActivity({
        userId:     auth.currentUser?.uid || "",
        userEmail:  auth.currentUser?.email || "",
        userRole:   isStaff ? "STAFF" : "SUPER_ADMIN",
        action:     ACTIONS.PRODUCT_ADD,
        entityName: product.nameEn.trim(),
        shopId:     product.shopId,
      });

      toast.success("Product added successfully!", { id: t });

      // Reset Form — keep shopId locked for STAFF
      setProduct({
        nameEn: "", nameUr: "", sku: "", description: "",
        costPrice: "", price: "", mrpPrice: "", margin: 10,
        unit: "Kg", minQty: 1, orderLimit: 10, discount: "", stock: "",
        status: "active",
        shopId: isStaff && assignedShopId ? assignedShopId : "",
        category: "", subcategory: "",
        isPopular: false, isReselling: false, isFeatured: false,
      });
      // Re-load categories for STAFF locked shop
      if (isStaff && assignedShopId) {
        handleShopChange(assignedShopId);
      }
      setImageFile(null);
      setImagePreview(null);
      setCategories([]);
      setSubcategories([]);
      setDuplicateStatus(null);
      setDuplicateProducts([]);
      setErrors({});

    } catch (err) {
      console.error("Submit error:", err);
      toast.error("Failed to add product!", { id: t });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Profit Info
  const profitAmount = num(product.price) - num(product.costPrice);
  const profitPercent = num(product.margin);

  return (
    <>
      <Toaster position="top-right" />

      <PageShell title="Add New Product" subtitle="Fill in the details to add a new product" icon={FaBox}>
        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Main Form */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left Column - Main Details */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Basic Info Card */}
              <div className="theme-card theme-glass p-5">
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                  📝 Basic Information
                </h3>
                
                <div className="space-y-4">
                  {/* Product Name with Duplicate Check */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      Product Name (English) <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        name="nameEn"
                        value={product.nameEn}
                        onChange={handleChange}
                        placeholder="Enter product name"
                        className={`w-full p-3 pr-12 rounded-xl border-2 bg-white/80 backdrop-blur-sm outline-none transition-all ${
                          errors.nameEn ? "border-red-400 focus:border-red-500" :
                          duplicateStatus === "duplicate" ? "border-yellow-400 focus:border-yellow-500" :
                          duplicateStatus === "unique" ? "border-green-400 focus:border-green-500" :
                          "border-gray-200 focus:border-blue-500"
                        }`}
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {isDuplicateChecking && <FaSync className="w-4 h-4 text-blue-500 animate-spin" />}
                        {duplicateStatus === "unique" && <FaCheckCircle className="w-5 h-5 text-green-500" />}
                        {duplicateStatus === "duplicate" && <FaExclamationTriangle className="w-5 h-5 text-yellow-500" />}
                      </div>
                    </div>
                    {errors.nameEn && <p className="text-red-500 text-xs mt-1">{errors.nameEn}</p>}
                    
                    {/* Duplicate Warning */}
                    {duplicateStatus === "duplicate" && duplicateProducts.length > 0 && (
                      <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-xl">
                        <p className="text-yellow-700 text-sm font-semibold mb-2">
                          ⚠️ Similar products found:
                        </p>
                        <div className="space-y-1">
                          {duplicateProducts.map((p) => (
                            <div key={p.id} className="flex items-center justify-between text-xs bg-white p-2 rounded-lg">
                              <span className="font-medium">{p.nameEn}</span>
                              <span className="text-gray-500">{formatPrice(p.price)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {duplicateStatus === "unique" && (
                      <p className="text-green-600 text-xs mt-1 flex items-center gap-1">
                        <FaShieldAlt className="w-3 h-3" /> Product name is unique
                      </p>
                    )}
                  </div>

                  {/* Urdu Name */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Product Name (Urdu)</label>
                    <input
                      name="nameUr"
                      value={product.nameUr}
                      onChange={handleChange}
                      placeholder="اردو نام"
                      dir="rtl"
                      className="w-full p-3 rounded-xl border-2 border-gray-200 bg-white/80 backdrop-blur-sm outline-none focus:border-blue-500 transition"
                    />
                  </div>

                  {/* SKU */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">SKU Code</label>
                    <div className="flex gap-2">
                      <input
                        name="sku"
                        value={product.sku}
                        onChange={handleChange}
                        placeholder="PRD-XXX-0000"
                        className="flex-1 p-3 rounded-xl border-2 border-gray-200 bg-white/80 backdrop-blur-sm outline-none focus:border-blue-500 transition font-mono"
                      />
                      <button
                        type="button"
                        onClick={generateRandomSKU}
                        className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-semibold hover:shadow-lg transition flex items-center gap-2"
                      >
                        <FaRandom className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Description</label>
                    <textarea
                      name="description"
                      value={product.description}
                      onChange={handleChange}
                      placeholder="Product description..."
                      rows={3}
                      className="w-full p-3 rounded-xl border-2 border-gray-200 bg-white/80 backdrop-blur-sm outline-none focus:border-blue-500 transition resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* Pricing Card - MARGIN CALCULATOR */}
              <div className="theme-card theme-glass p-5">
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <PKRIcon className="w-5 h-5" /> Pricing & Margin Calculator
                </h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  
                  {/* Cost Price */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      Cost Price (PKR)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-semibold">Rs</span>
                      <input
                        type="number"
                        value={product.costPrice}
                        onChange={(e) => handleCostPriceChange(e.target.value)}
                        placeholder="0"
                        min="0"
                        className="w-full p-3 pl-10 rounded-xl border-2 border-gray-200 bg-white/80 backdrop-blur-sm outline-none focus:border-blue-500 transition font-semibold"
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Your buying price</p>
                  </div>

                  {/* Margin */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      Margin (%)
                    </label>
                    <div className="relative">
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"><FaPercent className="w-3 h-3" /></span>
                      <input
                        type="number"
                        value={product.margin}
                        onChange={(e) => handleMarginChange(e.target.value)}
                        placeholder="10"
                        min="0"
                        max="100"
                        className="w-full p-3 pr-10 rounded-xl border-2 border-gray-200 bg-white/80 backdrop-blur-sm outline-none focus:border-blue-500 transition font-semibold"
                      />
                    </div>
                    {/* Quick Margin Buttons */}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {MARGIN_PRESETS.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => handleMarginChange(m)}
                          className={`px-2 py-1 rounded-lg text-xs font-semibold transition ${
                            num(product.margin) === m
                              ? "bg-blue-500 text-white"
                              : "bg-gray-100 text-gray-600 hover:bg-blue-100"
                          }`}
                        >
                          {m}%
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Selling Price */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      Selling Price (PKR) <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-semibold">Rs</span>
                      <input
                        type="number"
                        name="price"
                        value={product.price}
                        onChange={(e) => handlePriceChange(e.target.value)}
                        placeholder="0"
                        min="0"
                        className={`w-full p-3 pl-10 rounded-xl border-2 bg-white/80 backdrop-blur-sm outline-none transition font-bold text-green-600 ${
                          errors.price ? "border-red-400" : "border-gray-200 focus:border-green-500"
                        }`}
                      />
                    </div>
                    {errors.price && <p className="text-red-500 text-xs mt-1">{errors.price}</p>}
                  </div>

                  {/* MRP Price */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">MRP Price</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">Rs</span>
                      <input
                        type="number"
                        name="mrpPrice"
                        value={product.mrpPrice}
                        onChange={(e) => handleMrpChange(e.target.value)}
                        placeholder="0"
                        min="0"
                        className="w-full p-3 pl-10 rounded-xl border-2 border-gray-200 bg-white/80 backdrop-blur-sm outline-none focus:border-blue-500 transition"
                      />
                    </div>
                  </div>

                  {/* Discount */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Discount (Rs.)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-semibold mt-0.5">Rs</span>
                      <input
                        type="number"
                        name="discount"
                        value={product.discount === 0 ? 0 : (product.discount || "")}
                        onChange={handleChange}
                        placeholder="0"
                        className="w-full p-3 pl-10 rounded-xl border-2 border-gray-200 bg-white/80 backdrop-blur-sm outline-none focus:border-blue-500 transition"
                      />
                    </div>
                  </div>
                </div>

                {/* Profit Summary Box */}
                {num(product.costPrice) > 0 && num(product.price) > 0 && (
                  <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-3">
                        <FaCalculator className="w-5 h-5 text-green-600" />
                        <span className="font-semibold text-gray-700">Profit Summary:</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <p className="text-xs text-gray-500">Profit</p>
                          <p className={`font-bold text-lg ${profitAmount >= 0 ? "text-green-600" : "text-red-600"}`}>
                            Rs. {profitAmount.toLocaleString()}
                          </p>
                        </div>
                        <div className="text-center px-4 border-l border-green-200">
                          <p className="text-xs text-gray-500">Margin</p>
                          <p className={`font-bold text-lg ${profitPercent >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {profitPercent}%
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Inventory Card */}
              <div className="theme-card theme-glass p-5">
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                  📦 Inventory & Stock
                </h3>
                
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Stock Qty</label>
                    <input
                      type="number"
                      name="stock"
                      value={product.stock}
                      onChange={handleChange}
                      placeholder="0"
                      min="0"
                      className="w-full p-3 rounded-xl border-2 border-gray-200 bg-white/80 backdrop-blur-sm outline-none focus:border-blue-500 transition"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Unit</label>
                    <select
                      name="unit"
                      value={product.unit}
                      onChange={handleChange}
                      className="w-full p-3 rounded-xl border-2 border-gray-200 bg-white/80 backdrop-blur-sm outline-none focus:border-blue-500 transition"
                    >
                      {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Min Qty</label>
                    <input
                      type="number"
                      name="minQty"
                      value={product.minQty}
                      onChange={handleChange}
                      placeholder="1"
                      min="1"
                      className="w-full p-3 rounded-xl border-2 border-gray-200 bg-white/80 backdrop-blur-sm outline-none focus:border-blue-500 transition"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Order Limit</label>
                    <input
                      type="number"
                      name="orderLimit"
                      value={product.orderLimit}
                      onChange={handleChange}
                      placeholder="10"
                      min="1"
                      className="w-full p-3 rounded-xl border-2 border-gray-200 bg-white/80 backdrop-blur-sm outline-none focus:border-blue-500 transition"
                    />
                  </div>
                </div>
              </div>

              {/* Category Card */}
              <div className="theme-card theme-glass p-5">
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                  🏷️ Category & Shop
                </h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      Shop <span className="text-red-500">*</span>
                    </label>
                    {isStaff ? (
                      /* STAFF: locked to assigned shop */
                      <div className="w-full p-3 rounded-xl border-2 border-indigo-200 bg-indigo-50 flex items-center gap-2">
                        <FaLock className="w-4 h-4 text-indigo-500" />
                        <span className="font-semibold text-indigo-700">
                          {shops.find((s) => s.id === assignedShopId)?.name || assignedShopId || "Assigned Shop"}
                        </span>
                        <span className="ml-auto text-xs bg-indigo-200 text-indigo-700 px-2 py-0.5 rounded-full font-bold">LOCKED</span>
                      </div>
                    ) : (
                      <>
                        <select
                          value={product.shopId}
                          onChange={(e) => handleShopChange(e.target.value)}
                          className={`w-full p-3 theme-input ${
                            errors.shopId ? "border-red-400" : ""
                          }`}
                        >
                          <option value="">Select Shop</option>
                          {shops.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                        {viewingAllShops && !product.shopId && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                            Select a shop from header or dropdown to load categories.
                          </p>
                        )}
                      </>
                    )}
                    {errors.shopId && <p className="text-red-500 text-xs mt-1">{errors.shopId}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      Category <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={product.category}
                      onChange={(e) => handleCategoryChange(e.target.value)}
                      disabled={!product.shopId}
                      className={`w-full p-3 theme-input disabled:opacity-50 ${
                        errors.category ? "border-red-400" : ""
                      }`}
                    >
                      <option value="">
                        {!product.shopId
                          ? "Select shop first"
                          : categories.length === 0
                          ? "No categories — add in Categories page"
                          : "Select Category"}
                      </option>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    {errors.category && <p className="text-red-500 text-xs mt-1">{errors.category}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Subcategory</label>
                    <select
                      name="subcategory"
                      value={product.subcategory}
                      onChange={handleChange}
                      disabled={!product.category || subcategories.length === 0}
                      className="w-full p-3 rounded-xl border-2 border-gray-200 bg-white/80 backdrop-blur-sm outline-none focus:border-blue-500 transition disabled:opacity-50"
                    >
                      <option value="">Select Subcategory</option>
                      {subcategories.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column - Image & Options */}
            <div className="space-y-6">
              
              {/* Image Upload Card */}
              <div className="theme-card theme-glass p-5">
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <FaImage className="text-blue-500" /> Product Image
                </h3>
                
                <div className={`relative border-2 border-dashed rounded-xl p-4 text-center transition ${
                  errors.image ? "border-red-400 bg-red-50" : "border-gray-300 hover:border-blue-500"
                }`}>
                  {imagePreview ? (
                    <div className="relative">
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="w-full h-48 object-cover rounded-xl"
                      />
                      <button
                        type="button"
                        onClick={removeImage}
                        className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition"
                      >
                        <FaTimes className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="cursor-pointer block">
                      <div className="py-8">
                        <FaImage className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 font-medium">Click to upload image</p>
                        <p className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP • Max 1MB</p>
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleImageSelect}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
                {errors.image && <p className="text-red-500 text-xs mt-2">{errors.image}</p>}
              </div>

              {/* Status Card */}
              <div className="theme-card theme-glass p-5">
                <h3 className="text-lg font-bold text-gray-800 mb-4">⚙️ Status & Options</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Product Status</label>
                    <select
                      name="status"
                      value={product.status}
                      onChange={handleChange}
                      className="w-full p-3 rounded-xl border-2 border-gray-200 bg-white/80 backdrop-blur-sm outline-none focus:border-blue-500 transition"
                    >
                      <option value="active">🟢 Active</option>
                      <option value="inactive">🔴 Inactive</option>
                    </select>
                  </div>

                  <div className="space-y-3 pt-2">
                    <label className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 cursor-pointer hover:shadow-md transition">
                      <input
                        type="checkbox"
                        name="isPopular"
                        checked={product.isPopular}
                        onChange={handleChange}
                        className="w-5 h-5 rounded text-yellow-500"
                      />
                      <div>
                        <p className="font-semibold text-gray-800">🏆 Most Popular</p>
                        <p className="text-xs text-gray-500">Show in popular section</p>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 cursor-pointer hover:shadow-md transition">
                      <input
                        type="checkbox"
                        name="isReselling"
                        checked={product.isReselling}
                        onChange={handleChange}
                        className="w-5 h-5 rounded text-purple-500"
                      />
                      <div>
                        <p className="font-semibold text-gray-800">🔁 Reselling</p>
                        <p className="text-xs text-gray-500">Available for resellers</p>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 cursor-pointer hover:shadow-md transition">
                      <input
                        type="checkbox"
                        name="isFeatured"
                        checked={product.isFeatured}
                        onChange={handleChange}
                        className="w-5 h-5 rounded text-blue-500"
                      />
                      <div>
                        <p className="font-semibold text-gray-800">⭐ Featured</p>
                        <p className="text-xs text-gray-500">Show on homepage</p>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting || isUploading}
                className="w-full py-4 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 text-white rounded-xl font-bold text-lg shadow-xl hover:shadow-2xl transition disabled:opacity-50 flex items-center justify-center gap-3"
              >
                {isSubmitting || isUploading ? (
                  <>
                    <FaSync className="w-5 h-5 animate-spin" />
                    {isUploading ? "Uploading Image..." : "Adding Product..."}
                  </>
                ) : (
                  <>
                    <FaSave className="w-5 h-5" />
                    Add Product
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </PageShell>
    </>
  );
}