import React, { useEffect, useState } from "react";
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
import { FaLock } from "react-icons/fa";

const IMGBB_KEY = import.meta.env.VITE_IMGBB_API_KEY || "";

export default function AddCategory({ assignedShopId = null, isStaff = false }) {
  const [shops, setShops] = useState([]);
  const [shopId, setShopId] = useState("");
  const [categories, setCategories] = useState([]);

  const [catName, setCatName] = useState("");
  const [catImageFile, setCatImageFile] = useState(null);
  const [parentForNew, setParentForNew] = useState("");
  const [editingCat, setEditingCat] = useState(null);

  // ✅ New fields
  const [isPopular, setIsPopular] = useState(false);
  const [isReselling, setIsReselling] = useState(false);
  const [isActive, setIsActive] = useState(true); // Enable/Disable Category

  const [expandedCategoryId, setExpandedCategoryId] = useState(null);
  const [loading, setLoading] = useState(false);

  // 🔹 Load Shops
  useEffect(() => {
    const loadShops = async () => {
      try {
        const snap = await getDocs(collection(db, "shops"));
        const s = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setShops(s);
        if (s.length === 1) setShopId(s[0].id);
      } catch (err) {
        console.warn("Failed to load shops:", err);
      }
    };
    loadShops();
  }, []);

  // 🔹 Auto-assign shop for STAFF
  useEffect(() => {
    if (isStaff && assignedShopId) {
      setShopId(assignedShopId);
    }
  }, [isStaff, assignedShopId]);

  // 🔹 Fetch categories
  useEffect(() => {
    if (shopId) fetchCategories();
  }, [shopId]);

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "shops", shopId, "categories"));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setCategories(list);
    } catch (err) {
      console.warn("Failed to load categories:", err);
    } finally {
      setLoading(false);
    }
  };

  // 🔹 Upload to IMGBB
  const uploadToImgbb = async (file) => {
    if (!file) return null;
    const form = new FormData();
    form.append("image", file);
    const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    return data?.data?.url || null;
  };

  // 🔹 Add or Update Category
  const handleAddOrUpdateCategory = async (e) => {
    e.preventDefault();
    if (!shopId) return alert("Select shop first.");
    if (!catName.trim()) return alert("Category name required.");

    setLoading(true);
    try {
      let imageUrl = editingCat?.image || "";
      if (catImageFile) {
        const uploaded = await uploadToImgbb(catImageFile);
        if (!uploaded) {
          alert("Image upload failed.");
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
        updatedAt: Timestamp.now(),
      };

      if (editingCat) {
        await updateDoc(doc(db, "shops", shopId, "categories", editingCat.id), payload);
        await logActivity({
          userId: auth.currentUser?.uid || "",
          userEmail: auth.currentUser?.email || "",
          userRole: isStaff ? "STAFF" : "SUPER_ADMIN",
          action: ACTIONS.CATEGORY_UPDATE,
          entityName: catName.trim(),
          shopId,
        });
        alert("✅ Category updated successfully!");
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
        alert("✅ Category added successfully!");
      }

      resetForm();
      fetchCategories();
    } catch (err) {
      console.error(err);
      alert("❌ Error saving category.");
    } finally {
      setLoading(false);
    }
  };

  // 🔹 Reset Form
  const resetForm = () => {
    setCatName("");
    setCatImageFile(null);
    setParentForNew("");
    setEditingCat(null);
    setIsPopular(false);
    setIsReselling(false);
    setIsActive(true);
  };

  // 🔹 Edit Category
  const handleEditCategory = (cat) => {
    setEditingCat(cat);
    setCatName(cat.name);
    setParentForNew(cat.parentId || "");
    setIsPopular(!!cat.isPopular);
    setIsReselling(!!cat.isReselling);
    setIsActive(cat.isActive !== false); // Default to true if undefined
    setCatImageFile(null);
  };

  // 🔹 Delete Category
  const handleDeleteCategory = async (id) => {
    if (!confirm("Delete this category?")) return;
    try {
      await deleteDoc(doc(db, "shops", shopId, "categories", id));
      fetchCategories();
    } catch (err) {
      console.error("Failed to delete category:", err);
      alert("❌ Unable to delete category. Check permissions.");
    }
  };
  const toggleExpandCategory = (id) => {
    setExpandedCategoryId(expandedCategoryId === id ? null : id);
  };

  const getMainCategories = () => categories.filter((c) => !c.parentId);
  const getSubcategoriesOf = (pid) => categories.filter((c) => c.parentId === pid);

  return (
    <div className="p-6 bg-white/10 backdrop-blur-md rounded-2xl shadow-xl space-y-6 border border-white/20">
      <h2 className="text-2xl font-bold text-gray-900">🏷️ Categories & Subcategories</h2>

      {/* 🔹 Shop Selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Select Shop</label>
        {isStaff ? (
          /* STAFF: locked to assigned shop */
          <div className="w-full p-3 rounded-xl border-2 border-indigo-200 bg-indigo-50 flex items-center gap-2">
            <FaLock className="w-4 h-4 text-indigo-500" />
            <span className="font-semibold text-indigo-700">
              {shops.find((s) => s.id === shopId)?.name || shopId || "Assigned Shop"}
            </span>
            <span className="ml-auto text-xs bg-indigo-200 text-indigo-700 px-2 py-0.5 rounded-full font-bold">LOCKED</span>
          </div>
        ) : (
          /* SUPER_ADMIN: full shop selector */
          <select
            value={shopId}
            onChange={(e) => setShopId(e.target.value)}
            className="w-full p-3 rounded-xl border border-gray-300 bg-white/30"
          >
            <option value="">-- Select Shop --</option>
            {shops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* 🔹 Form */}
      <form onSubmit={handleAddOrUpdateCategory} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input
            value={catName}
            onChange={(e) => setCatName(e.target.value)}
            placeholder="Category name"
            className="w-full p-3 rounded-xl border border-gray-300"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Parent</label>
          <select
            value={parentForNew}
            onChange={(e) => setParentForNew(e.target.value)}
            className="w-full p-3 rounded-xl border border-gray-300"
          >
            <option value="">Main Category</option>
            {getMainCategories().map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Image</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setCatImageFile(e.target.files[0])}
            className="w-full p-2 rounded-xl border border-gray-300"
          />
        </div>

        {/* 🔹 Checkboxes */}
        <div className="flex gap-6 md:col-span-3 flex-wrap">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={isPopular} onChange={(e) => setIsPopular(e.target.checked)} />
            🏆 Most Popular
          </label>

          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={isReselling} onChange={(e) => setIsReselling(e.target.checked)} />
            🔁 Reselling
          </label>

          <label className="flex items-center gap-2 text-sm font-medium text-blue-700 bg-blue-50 px-3 py-1 rounded-full border border-blue-200 cursor-pointer">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="cursor-pointer" />
            {isActive ? "✅ Active" : "❌ Disabled"}
          </label>
        </div>

        <div className="md:col-span-3 flex justify-end gap-3 mt-2">
          {editingCat && (
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 rounded-xl border border-gray-400 text-gray-700"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold"
            disabled={loading}
          >
            {editingCat ? "Update Category" : "Add Category"}
          </button>
        </div>
      </form>

      {/* 🔹 Category List */}
      {loading ? (
        <div>Loading...</div>
      ) : (
        <div className="grid gap-4">
          {getMainCategories().map((main) => (
            <div key={main.id} className="p-4 bg-white/20 rounded-xl border border-white/10">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                  {main.image && <img src={main.image} className="w-12 h-12 rounded-lg object-cover" />}
                  <div>
                    <div className="font-medium text-gray-900 flex gap-2 items-center flex-wrap">
                      {main.name}
                      {main.isPopular && <span className="text-xs bg-yellow-400 text-black px-2 py-0.5 rounded">🏆 Popular</span>}
                      {main.isReselling && <span className="text-xs bg-green-400 text-black px-2 py-0.5 rounded">🔁 Reselling</span>}
                      {main.isActive === false && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded font-bold border border-red-300">❌ Disabled</span>}
                    </div>
                    <div className="text-xs text-gray-600">Main Category</div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button onClick={() => toggleExpandCategory(main.id)} className="px-3 py-1 rounded-lg border">
                    {expandedCategoryId === main.id ? "Hide" : "Subcategories"}
                  </button>
                  <button onClick={() => handleEditCategory(main)} className="text-blue-600">Edit</button>
                  <button onClick={() => handleDeleteCategory(main.id)} className="text-red-600">Delete</button>
                </div>
              </div>

              {/* 🔹 Subcategories */}
              {expandedCategoryId === main.id && (
                <div className="mt-3 ml-10 space-y-2">
                  {getSubcategoriesOf(main.id).map((sub) => (
                    <div key={sub.id} className="flex justify-between items-center bg-white/10 p-3 rounded-lg">
                      <div className="flex items-center gap-3">
                        {sub.image && <img src={sub.image} className="w-10 h-10 rounded-md object-cover" />}
                        <div className="font-medium flex gap-2 items-center flex-wrap">
                          {sub.name}
                          {sub.isPopular && <span className="text-xs bg-yellow-400 text-black px-2 rounded">🏆</span>}
                          {sub.isReselling && <span className="text-xs bg-green-400 text-black px-2 rounded">🔁</span>}
                          {sub.isActive === false && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded font-bold border border-red-300">Disabled</span>}
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <button onClick={() => handleEditCategory(sub)} className="text-blue-600">Edit</button>
                        <button onClick={() => handleDeleteCategory(sub.id)} className="text-red-600">Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
