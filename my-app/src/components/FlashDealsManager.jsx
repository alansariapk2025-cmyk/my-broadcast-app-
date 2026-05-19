// my-app/src/components/FlashDealsManager.jsx
import React, { useState, useEffect } from "react";
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  getDocs,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  FiStar, FiHeart, FiGift, FiShoppingCart, FiShoppingBag,
  FiAward, FiTag, FiCalendar, FiEdit2, FiTrash2, FiPlus, FiX,
  FiSearch, FiCheck, FiSave, FiInfo, FiPackage, FiClock,
  FiAlertCircle, FiTrendingUp, FiZap, FiSettings, FiLayers,
} from "react-icons/fi";
import {
  IoFlashOutline, IoSnowOutline, IoSunnyOutline, IoMoonOutline,
  IoFlameOutline, IoPawOutline, IoFlagOutline, IoDiamondOutline,
  IoRibbonOutline, IoHappyOutline, IoRocketOutline, IoStorefrontOutline,
  IoThunderstormOutline, IoSparklesOutline, IoPricetagOutline,
  IoMegaphoneOutline, IoBusinessOutline,
} from "react-icons/io5";

const SHOP_ID = "xKUNJfO0kSZK4yCEhh8s";

// ✅ Icons Library (React Icons)
const IONICONS_OPTIONS = [
  { name: "flash",        Icon: IoFlashOutline },
  { name: "star",         Icon: FiStar },
  { name: "heart",        Icon: FiHeart },
  { name: "flame",        Icon: IoFlameOutline },
  { name: "snow",         Icon: IoSnowOutline },
  { name: "sunny",        Icon: IoSunnyOutline },
  { name: "moon",         Icon: IoMoonOutline },
  { name: "paw",          Icon: IoPawOutline },
  { name: "flag",         Icon: IoFlagOutline },
  { name: "gift",         Icon: FiGift },
  { name: "cart",         Icon: FiShoppingCart },
  { name: "bag",          Icon: FiShoppingBag },
  { name: "diamond",      Icon: IoDiamondOutline },
  { name: "trophy",       Icon: FiAward },
  { name: "ribbon",       Icon: IoRibbonOutline },
  { name: "happy",        Icon: IoHappyOutline },
  { name: "rocket",       Icon: IoRocketOutline },
  { name: "storefront",   Icon: IoStorefrontOutline },
  { name: "thunderstorm", Icon: IoThunderstormOutline },
  { name: "sparkles",     Icon: IoSparklesOutline },
  { name: "tag",          Icon: FiTag },
  { name: "pricetag",     Icon: IoPricetagOutline },
  { name: "megaphone",    Icon: IoMegaphoneOutline },
  { name: "calendar",     Icon: FiCalendar },
  { name: "business",     Icon: IoBusinessOutline },
];

const PRESET_THEMES = [
  { name: "Bakra Eid",        iconName: "paw",        color: "#16a34a" },
  { name: "Eid ul Fitr",      iconName: "moon",       color: "#8b5cf6" },
  { name: "Muharram",         iconName: "business",   color: "#1e40af" },
  { name: "Ramadan",          iconName: "star",       color: "#f59e0b" },
  { name: "Independence Day", iconName: "flag",       color: "#16a34a" },
  { name: "Winter Sale",      iconName: "snow",       color: "#0ea5e9" },
  { name: "Summer Special",   iconName: "sunny",      color: "#eab308" },
  { name: "Mega Sale",        iconName: "flame",      color: "#ef4444" },
  { name: "Weekend Deals",    iconName: "happy",      color: "#ec4899" },
  { name: "Flash Deals",      iconName: "flash",      color: "#f97316" },
];

// ─── Helpers ────────────────────────────────────────────────────────────────
const toDatetimeLocal = (ts) => {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const fromDatetimeLocal = (str) => (str ? new Date(str) : null);

const getIconComponent = (iconName, size = 18, color = "#374151") => {
  const found = IONICONS_OPTIONS.find((i) => i.name === iconName);
  const IconComp = found?.Icon || IoFlashOutline;
  return <IconComp size={size} color={color} />;
};

// ─── Discount Calculator ─────────────────────────────────────────────────────
const calcFinalPrice = (product, offerType, offerValue) => {
  const mrp = Number(product.mrpPrice || product.price || 0);
  const price = Number(product.price || 0);
  const val = Number(offerValue || 0);

  if (offerType === "flat_off") return Math.max(0, price - val);
  if (offerType === "percent_off") return Math.max(0, Math.round(price - (price * val) / 100));
  if (offerType === "custom_sale") return Math.max(0, val);
  if (offerType === "mrp_off") return Math.max(0, mrp - val);
  return price;
};

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function FlashDealsManager() {
  const [sessions, setSessions] = useState([]);
  const [products, setProducts] = useState([]);
  const [editingSession, setEditingSession] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [searchProduct, setSearchProduct] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "shops", SHOP_ID, "flashDealSessions"), orderBy("order", "asc")),
      (snap) => {
        setSessions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => { console.error(err); setLoading(false); }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    getDocs(collection(db, "products")).then((snap) => {
      setProducts(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }))
          .filter((p) => p.status === "active")
      );
    }).catch(console.error);
  }, []);

  const createSession = async (data) => {
    const id = `session-${Date.now()}`;
    await setDoc(doc(db, "shops", SHOP_ID, "flashDealSessions", id), {
      name: data.name || "New Session",
      iconName: data.iconName || "flash",
      active: true,
      order: sessions.length + 1,
      productIds: [],
      offers: {},
      themeColor: data.themeColor || "#ef4444",
      subtitle: data.subtitle || "",
      startDate: data.startDate || null,
      endDate: data.endDate || null,
      createdAt: serverTimestamp(),
    });
    setShowCreate(false);
  };

  const updateSession = async (id, data) =>
    updateDoc(doc(db, "shops", SHOP_ID, "flashDealSessions", id), data);

  const deleteSession = async (id) => {
    if (!window.confirm("Delete this session permanently?")) return;
    await deleteDoc(doc(db, "shops", SHOP_ID, "flashDealSessions", id));
  };

  const toggleProduct = async (sessionId, productId) => {
    const s = sessions.find((x) => x.id === sessionId);
    if (!s) return;
    const has = (s.productIds || []).includes(productId);
    const productIds = has
      ? s.productIds.filter((x) => x !== productId)
      : [...(s.productIds || []), productId];
    const offers = { ...(s.offers || {}) };
    if (has) delete offers[productId];

    await updateSession(sessionId, { productIds, offers });
    setEditingSession((prev) => (prev ? { ...prev, productIds, offers } : prev));
  };

  const updateOffer = async (sessionId, productId, offerData) => {
    const s = sessions.find((x) => x.id === sessionId);
    if (!s) return;
    const offers = { ...(s.offers || {}), [productId]: offerData };
    await updateSession(sessionId, { offers });
    setEditingSession((prev) => (prev ? { ...prev, offers } : prev));
  };

  const removeOffer = async (sessionId, productId) => {
    const s = sessions.find((x) => x.id === sessionId);
    if (!s) return;
    const offers = { ...(s.offers || {}) };
    delete offers[productId];
    await updateSession(sessionId, { offers });
    setEditingSession((prev) => (prev ? { ...prev, offers } : prev));
  };

  const filteredProducts = products.filter((p) =>
    (p.nameEn || "").toLowerCase().includes(searchProduct.toLowerCase())
  );

  if (loading) {
    return (
      <div style={S.loadingContainer}>
        <div style={S.loadingSpinner}>
          <IoFlashOutline size={48} color="#f59e0b" />
        </div>
        <p style={S.loadingText}>Loading Flash Deals...</p>
      </div>
    );
  }

  return (
    <>
      <style>{globalCSS}</style>
      <div style={S.container}>
        {/* HEADER */}
        <div style={S.headerCard}>
          <div style={S.headerLeft}>
            <div style={S.headerIconWrap}>
              <IoFlashOutline size={28} color="#fff" />
            </div>
            <div>
              <h1 style={S.title}>Flash Deals Manager</h1>
              <p style={S.subtitleText}>Manage time-limited offers & sessions</p>
            </div>
          </div>
          <button style={S.createBtn} onClick={() => setShowCreate(true)}>
            <FiPlus size={18} />
            Create New Session
          </button>
        </div>

        {/* INFO BAR */}
        <div style={S.infoBox}>
          <FiInfo size={18} color="#3b82f6" style={{ flexShrink: 0 }} />
          <div>
            <strong style={{ color: "#1e40af" }}>How it works: </strong>
            <span style={{ color: "#1e3a8a" }}>
              Create sessions → Add products → Set offers → Set date range → Toggle Active. Real-time updates!
            </span>
          </div>
        </div>

        {/* STATS ROW */}
        <div style={S.statsRow}>
          <StatCard icon={<FiLayers size={22} color="#fff" />} label="Total Sessions" value={sessions.length} gradient="linear-gradient(135deg, #667eea 0%, #764ba2 100%)" />
          <StatCard icon={<FiCheck size={22} color="#fff" />} label="Active" value={sessions.filter(s => s.active).length} gradient="linear-gradient(135deg, #11998e 0%, #38ef7d 100%)" />
          <StatCard icon={<FiPackage size={22} color="#fff" />} label="Total Products" value={sessions.reduce((sum, s) => sum + (s.productIds?.length || 0), 0)} gradient="linear-gradient(135deg, #f093fb 0%, #f5576c 100%)" />
          <StatCard icon={<FiTag size={22} color="#fff" />} label="Active Offers" value={sessions.reduce((sum, s) => sum + Object.keys(s.offers || {}).length, 0)} gradient="linear-gradient(135deg, #fa709a 0%, #fee140 100%)" />
        </div>

        {/* SESSIONS GRID */}
        <div style={S.sessionsGrid}>
          {sessions.length === 0 ? (
            <div style={S.empty}>
              <FiPackage size={64} color="#cbd5e1" />
              <h3 style={{ color: "#475569", marginTop: 12 }}>No sessions yet</h3>
              <p style={{ color: "#94a3b8" }}>Click "Create New Session" to start!</p>
            </div>
          ) : (
            sessions.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                products={products}
                onEdit={() => setEditingSession(s)}
                onDelete={() => deleteSession(s.id)}
                onToggleActive={(val) => updateSession(s.id, { active: val })}
              />
            ))
          )}
        </div>

        {/* MODALS */}
        {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreate={createSession} />}
        {editingSession && (
          <EditModal
            session={editingSession}
            products={filteredProducts}
            allProducts={products}
            searchProduct={searchProduct}
            setSearchProduct={setSearchProduct}
            onClose={() => { setEditingSession(null); setSearchProduct(""); }}
            onUpdate={(data) => updateSession(editingSession.id, data)}
            onToggleProduct={(pid) => toggleProduct(editingSession.id, pid)}
            onUpdateOffer={(pid, offer) => updateOffer(editingSession.id, pid, offer)}
            onRemoveOffer={(pid) => removeOffer(editingSession.id, pid)}
          />
        )}
      </div>
    </>
  );
}

// ============================================================
// STAT CARD
// ============================================================
function StatCard({ icon, label, value, gradient }) {
  return (
    <div style={{ ...S.statCard, background: gradient }}>
      <div style={S.statCardIcon}>{icon}</div>
      <div>
        <div style={S.statCardValue}>{value}</div>
        <div style={S.statCardLabel}>{label}</div>
      </div>
    </div>
  );
}

// ============================================================
// SESSION CARD - GLASS EFFECT + PRODUCTS LIST
// ============================================================
function SessionCard({ session, products, onEdit, onDelete, onToggleActive }) {
  const selectedProducts = products.filter((p) =>
    (session.productIds || []).includes(p.id)
  );
  const offersCount = Object.keys(session.offers || {}).length;
  const themeColor = session.themeColor || "#ef4444";

  const now = Date.now();
  const expired = session.endDate?.toMillis ? session.endDate.toMillis() < now : false;
  const notStarted = session.startDate?.toMillis ? session.startDate.toMillis() > now : false;
  const statusColor = expired ? "#ef4444" : notStarted ? "#f59e0b" : session.active ? "#16a34a" : "#6b7280";
  const StatusIcon = expired ? FiClock : notStarted ? FiClock : session.active ? FiCheck : FiX;
  const statusLabel = expired ? "Expired" : notStarted ? "Scheduled" : session.active ? "Active" : "Inactive";

  return (
    <div
      className="session-card-glass"
      style={{
        ...S.sessionCard,
        background: `linear-gradient(135deg, ${themeColor}18 0%, rgba(255,255,255,0.85) 100%)`,
        borderLeft: `4px solid ${themeColor}`,
      }}
    >
      {/* HEADER */}
      <div style={S.sessionHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
          <div style={{ ...S.sessionIconBox, background: `linear-gradient(135deg, ${themeColor}, ${themeColor}dd)` }}>
            {getIconComponent(session.iconName, 22, "#fff")}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={S.sessionName}>{session.name}</h2>
            <span style={{ ...S.iconBadge, color: themeColor, background: themeColor + "15" }}>
              {session.iconName || "flash"}
            </span>
          </div>
        </div>

        <label style={S.toggleWrap}>
          <div
            style={{
              ...S.toggleSwitch,
              backgroundColor: session.active ? themeColor : "#cbd5e1",
            }}
            onClick={() => onToggleActive(!session.active)}
          >
            <div style={{ ...S.toggleThumb, transform: session.active ? "translateX(20px)" : "translateX(0)" }} />
          </div>
          <span style={{ color: statusColor, fontWeight: 700, fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
            <StatusIcon size={11} /> {statusLabel}
          </span>
        </label>
      </div>

      {session.subtitle && <p style={S.subtitle}>{session.subtitle}</p>}

      {/* DATE RANGE */}
      {(session.startDate || session.endDate) && (
        <div style={S.dateBadge}>
          <FiCalendar size={12} color="#92400e" />
          <span>
            {session.startDate
              ? new Date(session.startDate.toMillis?.() || session.startDate).toLocaleDateString()
              : "Now"}
            {" → "}
            {session.endDate
              ? new Date(session.endDate.toMillis?.() || session.endDate).toLocaleDateString()
              : "No end"}
          </span>
        </div>
      )}

      {/* STATS */}
      <div style={S.stats}>
        <span style={S.statBadge}>
          <FiPackage size={11} /> {session.productIds?.length || 0} products
        </span>
        <span style={S.statBadge}>
          <FiTag size={11} /> {offersCount} offers
        </span>
        <span style={S.statBadge}>
          <FiInfo size={11} /> #{session.order}
        </span>
      </div>

      {/* PRODUCTS LIST WITH OFFERS */}
      {selectedProducts.length > 0 && (
        <div style={S.productsListContainer}>
          <div style={S.productsListHeader}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <FiShoppingBag size={13} color={themeColor} />
              <strong style={{ color: "#1e293b", fontSize: 12 }}>Products with Offers</strong>
            </span>
            <span style={{ ...S.productsCountBadge, background: themeColor + "20", color: themeColor }}>
              {selectedProducts.length} items
            </span>
          </div>

          <div style={S.productsListBody} className="custom-scroll">
            {selectedProducts.map((p) => {
              const offer = session.offers?.[p.id];
              const savings = offer ? Math.round(p.price - offer.finalPrice) : 0;
              return (
                <div key={p.id} style={S.productListItem} className="product-list-item">
                  <img src={p.image} alt={p.nameEn} style={S.productListImg} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={S.productListName}>{p.nameEn}</div>
                    <div style={S.productListPriceRow}>
                      {offer ? (
                        <>
                          <span style={S.productListMrp}>Rs {p.price}</span>
                          <span style={{ ...S.productListFinalPrice, color: themeColor }}>
                            Rs {offer.finalPrice}
                          </span>
                          {savings > 0 && (
                            <span style={{ ...S.productListOfferBadge, background: themeColor }}>
                              <FiTrendingUp size={9} /> Save Rs {savings}
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <span style={S.productListPriceNoOffer}>Rs {p.price}</span>
                          <span style={S.productListNoOfferBadge}>
                            <FiAlertCircle size={9} /> No offer
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ACTION BUTTONS */}
      <div style={S.btnGroup}>
        <button
          style={{ ...S.editBtn, background: `linear-gradient(135deg, ${themeColor}, ${themeColor}cc)` }}
          onClick={onEdit}
          className="btn-hover"
        >
          <FiEdit2 size={14} /> Edit & Manage
        </button>
        <button style={S.deleteBtn} onClick={onDelete} className="btn-hover">
          <FiTrash2 size={14} />
        </button>
      </div>
    </div>
  );
}

// ============================================================
// CREATE MODAL
// ============================================================
function CreateModal({ onClose, onCreate }) {
  const [name, setName] = useState("");
  const [iconName, setIconName] = useState("flash");
  const [themeColor, setThemeColor] = useState("#ef4444");
  const [subtitle, setSubtitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showIconDD, setShowIconDD] = useState(false);

  const usePreset = (p) => {
    setName(p.name);
    setIconName(p.iconName);
    setThemeColor(p.color);
  };

  return (
    <div style={S.modalBg} onClick={onClose} className="modal-fade-in">
      <div style={S.modal} onClick={(e) => e.stopPropagation()} className="modal-slide-in">
        <div style={S.modalHeader}>
          <h2 style={S.modalTitle}>
            <IoSparklesOutline size={22} color="#f59e0b" /> Create New Session
          </h2>
          <button style={S.closeX} onClick={onClose}>
            <FiX size={22} />
          </button>
        </div>

        {/* Presets */}
        <div style={S.field}>
          <label style={S.label}>
            <FiLayers size={13} /> Quick Templates:
          </label>
          <div style={S.presetGrid}>
            {PRESET_THEMES.map((p) => (
              <button
                key={p.name}
                style={{ ...S.presetBtn, background: `linear-gradient(135deg, ${p.color}, ${p.color}cc)` }}
                onClick={() => usePreset(p)}
                className="btn-hover"
              >
                {getIconComponent(p.iconName, 14, "#fff")} {p.name}
              </button>
            ))}
          </div>
        </div>

        <div style={S.field}>
          <label style={S.label}>Session Name:</label>
          <input style={S.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Bakra Eid Special" />
        </div>

        {/* Icon Dropdown */}
        <div style={S.field}>
          <label style={S.label}>App Icon:</label>
          <div style={{ position: "relative" }}>
            <button style={{ ...S.iconDropBtn, borderColor: themeColor }} onClick={() => setShowIconDD(!showIconDD)}>
              <span style={S.iconDropEmoji}>{getIconComponent(iconName, 22, themeColor)}</span>
              <span style={S.iconDropName}>{iconName}</span>
              <FiX size={12} style={{ transform: showIconDD ? "rotate(45deg)" : "none", transition: "transform 0.2s" }} />
            </button>
            {showIconDD && (
              <div style={S.iconDropdown} className="custom-scroll">
                {IONICONS_OPTIONS.map((ic) => (
                  <button
                    key={ic.name}
                    style={{
                      ...S.iconDropItem,
                      backgroundColor: iconName === ic.name ? themeColor + "22" : "transparent",
                      fontWeight: iconName === ic.name ? 700 : 400,
                    }}
                    onClick={() => { setIconName(ic.name); setShowIconDD(false); }}
                  >
                    {getIconComponent(ic.name, 20, iconName === ic.name ? themeColor : "#374151")}
                    <span style={{ fontSize: 10, color: "#374151", marginTop: 2 }}>{ic.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={S.field}>
          <label style={S.label}>Subtitle:</label>
          <input style={S.input} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Limited time offers!" />
        </div>

        <div style={S.field}>
          <label style={S.label}>Theme Color:</label>
          <input type="color" style={{ ...S.input, height: 50, padding: 4, cursor: "pointer" }} value={themeColor} onChange={(e) => setThemeColor(e.target.value)} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={S.field}>
            <label style={S.label}><FiCalendar size={13} /> Start:</label>
            <input type="datetime-local" style={S.input} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div style={S.field}>
            <label style={S.label}><FiClock size={13} /> End:</label>
            <input type="datetime-local" style={S.input} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <small style={{ color: "#6b7280", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
          <FiInfo size={11} /> Leave empty = always active when toggled ON
        </small>

        <div style={S.modalActions}>
          <button style={S.cancelBtn} onClick={onClose} className="btn-hover">Cancel</button>
          <button
            style={{ ...S.saveBtn, background: `linear-gradient(135deg, ${themeColor}, ${themeColor}cc)` }}
            onClick={() => {
              if (!name.trim()) return alert("⚠️ Enter a session name");
              onCreate({
                name, iconName, themeColor, subtitle,
                startDate: startDate ? fromDatetimeLocal(startDate) : null,
                endDate: endDate ? fromDatetimeLocal(endDate) : null,
              });
            }}
            className="btn-hover"
          >
            <FiCheck size={16} /> Create Session
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// EDIT MODAL
// ============================================================
function EditModal({
  session, products, allProducts, searchProduct, setSearchProduct,
  onClose, onUpdate, onToggleProduct, onUpdateOffer, onRemoveOffer,
}) {
  const [name, setName] = useState(session.name);
  const [iconName, setIconName] = useState(session.iconName || "flash");
  const [themeColor, setThemeColor] = useState(session.themeColor || "#ef4444");
  const [subtitle, setSubtitle] = useState(session.subtitle || "");
  const [order, setOrder] = useState(session.order);
  const [startDate, setStartDate] = useState(toDatetimeLocal(session.startDate));
  const [endDate, setEndDate] = useState(toDatetimeLocal(session.endDate));
  const [showIconDD, setShowIconDD] = useState(false);
  const [activeTab, setActiveTab] = useState("info");

  const saveInfo = () => {
    onUpdate({
      name, iconName, themeColor, subtitle, order: Number(order),
      startDate: startDate ? fromDatetimeLocal(startDate) : null,
      endDate: endDate ? fromDatetimeLocal(endDate) : null,
    });
    alert("✅ Saved!");
  };

  const sessionProducts = allProducts.filter((p) =>
    (session.productIds || []).includes(p.id)
  );

  return (
    <div style={S.modalBg} onClick={onClose} className="modal-fade-in">
      <div style={S.modalLarge} onClick={(e) => e.stopPropagation()} className="modal-slide-in">
        <div style={S.modalHeader}>
          <h2 style={S.modalTitle}>
            <span style={{ ...S.sessionIconBox, background: `linear-gradient(135deg, ${themeColor}, ${themeColor}dd)`, width: 36, height: 36 }}>
              {getIconComponent(iconName, 18, "#fff")}
            </span>
            {session.name}
          </h2>
          <button style={S.closeX} onClick={onClose}><FiX size={22} /></button>
        </div>

        {/* Tabs */}
        <div style={S.tabBar}>
          {[
            { key: "info", label: "Session Info", Icon: FiSettings },
            { key: "products", label: `Products (${session.productIds?.length || 0})`, Icon: FiPackage },
            { key: "offers", label: `Offers (${Object.keys(session.offers || {}).length})`, Icon: FiTag },
          ].map((t) => (
            <button
              key={t.key}
              style={{
                ...S.tabBtn,
                ...(activeTab === t.key ? { borderBottomColor: themeColor, color: themeColor } : {}),
              }}
              onClick={() => setActiveTab(t.key)}
            >
              <t.Icon size={14} /> {t.label}
            </button>
          ))}
        </div>

        {/* TAB: INFO */}
        {activeTab === "info" && (
          <div style={S.tabContent}>
            <div style={S.formGrid}>
              <div style={S.field}>
                <label style={S.label}>Name:</label>
                <input style={S.input} value={name} onChange={(e) => setName(e.target.value)} />
              </div>

              <div style={S.field}>
                <label style={S.label}>App Icon:</label>
                <div style={{ position: "relative" }}>
                  <button style={{ ...S.iconDropBtn, borderColor: themeColor }} onClick={() => setShowIconDD(!showIconDD)}>
                    <span style={S.iconDropEmoji}>{getIconComponent(iconName, 22, themeColor)}</span>
                    <span style={S.iconDropName}>{iconName}</span>
                  </button>
                  {showIconDD && (
                    <div style={S.iconDropdown} className="custom-scroll">
                      {IONICONS_OPTIONS.map((ic) => (
                        <button
                          key={ic.name}
                          style={{
                            ...S.iconDropItem,
                            backgroundColor: iconName === ic.name ? themeColor + "22" : "transparent",
                          }}
                          onClick={() => { setIconName(ic.name); setShowIconDD(false); }}
                        >
                          {getIconComponent(ic.name, 20, iconName === ic.name ? themeColor : "#374151")}
                          <span style={{ fontSize: 10, color: "#374151", marginTop: 2 }}>{ic.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div style={S.field}>
                <label style={S.label}>Subtitle:</label>
                <input style={S.input} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
              </div>

              <div style={S.field}>
                <label style={S.label}>Display Order:</label>
                <input type="number" style={S.input} value={order} onChange={(e) => setOrder(e.target.value)} />
              </div>

              <div style={S.field}>
                <label style={S.label}>Theme Color:</label>
                <input type="color" style={{ ...S.input, height: 50, padding: 4, cursor: "pointer" }} value={themeColor} onChange={(e) => setThemeColor(e.target.value)} />
              </div>
            </div>

            <div style={S.dateGrid}>
              <div style={S.field}>
                <label style={S.label}><FiCalendar size={13} /> Start:</label>
                <input type="datetime-local" style={S.input} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div style={S.field}>
                <label style={S.label}><FiClock size={13} /> End:</label>
                <input type="datetime-local" style={S.input} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>

            <button
              style={{ ...S.saveBtn, background: `linear-gradient(135deg, ${themeColor}, ${themeColor}cc)`, marginTop: 16 }}
              onClick={saveInfo}
              className="btn-hover"
            >
              <FiSave size={16} /> Save Session Info
            </button>
          </div>
        )}

        {/* TAB: PRODUCTS */}
        {activeTab === "products" && (
          <div style={S.tabContent}>
            <div style={S.searchBox}>
              <FiSearch size={16} color="#9ca3af" />
              <input
                style={S.searchInput}
                placeholder="Search products..."
                value={searchProduct}
                onChange={(e) => setSearchProduct(e.target.value)}
              />
            </div>
            <div style={S.productList} className="custom-scroll">
              {products.length === 0 ? (
                <div style={S.empty}>No products found</div>
              ) : (
                products.map((p) => {
                  const isSelected = (session.productIds || []).includes(p.id);
                  const offer = session.offers?.[p.id];
                  return (
                    <div
                      key={p.id}
                      style={{
                        ...S.productRow,
                        backgroundColor: isSelected ? "#dcfce7" : "#fff",
                        borderColor: isSelected ? "#16a34a" : "#e5e7eb",
                      }}
                      onClick={() => onToggleProduct(p.id)}
                    >
                      <input type="checkbox" checked={isSelected || false} onChange={() => onToggleProduct(p.id)} onClick={(e) => e.stopPropagation()} />
                      {p.image && <img src={p.image} alt={p.nameEn} style={S.productImg} />}
                      <div style={{ flex: 1 }}>
                        <div style={S.productName}>{p.nameEn}</div>
                        <div style={S.productPrice}>
                          {p.mrpPrice && <span style={S.mrpSmall}>MRP Rs {p.mrpPrice} </span>}
                          Rs {p.price}
                          {offer && (
                            <span style={S.offerTag}>
                              <FiTag size={10} /> Rs {offer.finalPrice}
                            </span>
                          )}
                        </div>
                      </div>
                      {isSelected && (
                        <span style={S.selectedBadge}>
                          <FiCheck size={11} /> Added
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* TAB: OFFERS */}
        {activeTab === "offers" && (
          <div style={S.tabContent}>
            {sessionProducts.length === 0 ? (
              <div style={S.empty}>
                <FiPackage size={48} color="#cbd5e1" />
                <p style={{ marginTop: 12, color: "#64748b" }}>
                  No products added yet.<br />
                  Go to "Products" tab first.
                </p>
              </div>
            ) : (
              <div>
                <div style={S.offersHeader}>
                  <FiInfo size={14} color="#1e40af" />
                  <span style={{ color: "#1e40af", fontSize: 13, fontWeight: 600 }}>
                    Set offers for each product. These prices show in the app.
                  </span>
                </div>
                {sessionProducts.map((p) => (
                  <OfferRow
                    key={p.id}
                    product={p}
                    offer={session.offers?.[p.id] || null}
                    themeColor={themeColor}
                    onSave={(offerData) => onUpdateOffer(p.id, offerData)}
                    onRemove={() => onRemoveOffer(p.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// OFFER ROW
// ============================================================
function OfferRow({ product, offer, themeColor, onSave, onRemove }) {
  const [offerType, setOfferType] = useState(offer?.type || "flat_off");
  const [offerValue, setOfferValue] = useState(offer?.value || "");
  const [active, setActive] = useState(offer?.active !== false);

  const finalPrice = offerValue ? calcFinalPrice(product, offerType, offerValue) : null;
  const savings = finalPrice !== null ? Math.round(Number(product.price) - finalPrice) : 0;

  const OFFER_TYPES = [
    { value: "flat_off", label: "Flat Rs OFF", placeholder: "e.g. 50", hint: `Rs X off from price Rs ${product.price}` },
    { value: "percent_off", label: "% OFF", placeholder: "e.g. 10", hint: `X% off from Rs ${product.price}` },
    { value: "custom_sale", label: "Custom Sale Price", placeholder: "e.g. 450", hint: "Set exact sale price" },
    { value: "mrp_off", label: "Rs OFF from MRP", placeholder: "e.g. 100", hint: `Rs X off from MRP Rs ${product.mrpPrice || product.price}` },
  ];

  const currentType = OFFER_TYPES.find((t) => t.value === offerType);

  return (
    <div style={S.offerRow}>
      <div style={S.offerProductInfo}>
        {product.image && <img src={product.image} alt="" style={S.offerImg} />}
        <div>
          <div style={S.offerProductName}>{product.nameEn}</div>
          <div style={S.offerProductPrices}>
            {product.mrpPrice && <span style={S.mrpSmall}>MRP: Rs {product.mrpPrice} </span>}
            <span style={{ color: "#374151", fontWeight: 600 }}>Price: Rs {product.price}</span>
          </div>
        </div>
        <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <div
            style={{
              ...S.toggleSwitch,
              backgroundColor: active ? themeColor : "#cbd5e1",
              width: 36, height: 20,
            }}
            onClick={() => setActive(!active)}
          >
            <div style={{ ...S.toggleThumb, width: 16, height: 16, transform: active ? "translateX(16px)" : "translateX(0)" }} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 600, color: active ? themeColor : "#6b7280" }}>
            {active ? "Active" : "Hidden"}
          </span>
        </label>
      </div>

      <div style={S.offerTypeRow}>
        {OFFER_TYPES.map((t) => (
          <button
            key={t.value}
            style={{
              ...S.offerTypeBtn,
              background: offerType === t.value ? `linear-gradient(135deg, ${themeColor}, ${themeColor}cc)` : "#f3f4f6",
              color: offerType === t.value ? "#fff" : "#374151",
            }}
            onClick={() => setOfferType(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={S.offerInputRow}>
        <div style={{ flex: 1 }}>
          <input
            style={S.input}
            type="number"
            value={offerValue}
            onChange={(e) => setOfferValue(e.target.value)}
            placeholder={currentType?.placeholder}
          />
          <small style={{ color: "#6b7280", fontSize: 11 }}>{currentType?.hint}</small>
        </div>

        {finalPrice !== null && (
          <div style={{ ...S.pricePreview, borderColor: themeColor }}>
            <div style={S.pricePreviewMrp}>Was: Rs {product.price}</div>
            <div style={{ ...S.pricePreviewFinal, color: themeColor }}>Now: Rs {finalPrice}</div>
            {savings > 0 && (
              <div style={{ ...S.pricePreviewSave, background: themeColor }}>Save Rs {savings}</div>
            )}
          </div>
        )}
      </div>

      <div style={S.offerActions}>
        {offer && (
          <button style={S.removeOfferBtn} onClick={onRemove} className="btn-hover">
            <FiTrash2 size={12} /> Remove
          </button>
        )}
        <button
          style={{ ...S.saveOfferBtn, background: `linear-gradient(135deg, ${themeColor}, ${themeColor}cc)` }}
          onClick={() => {
            if (!offerValue) return alert("⚠️ Enter offer value");
            if (finalPrice === null || finalPrice < 0) return alert("⚠️ Invalid price");
            onSave({ type: offerType, value: Number(offerValue), finalPrice, active });
            alert("✅ Offer saved!");
          }}
          className="btn-hover"
        >
          <FiSave size={12} /> Save Offer
        </button>
      </div>
    </div>
  );
}

// ============================================================
// GLOBAL CSS - ANIMATIONS
// ============================================================
const globalCSS = `
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(30px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .modal-fade-in { animation: fadeIn 0.2s ease-out; }
  .modal-slide-in { animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
  .session-card-glass {
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    transition: transform 0.25s ease, box-shadow 0.25s ease;
  }
  .session-card-glass:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 40px rgba(0,0,0,0.12);
  }
  .btn-hover {
    transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
  }
  .btn-hover:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(0,0,0,0.15);
    opacity: 0.95;
  }
  .btn-hover:active {
    transform: translateY(0);
  }
  .product-list-item {
    transition: background 0.15s ease, transform 0.15s ease;
  }
  .product-list-item:hover {
    background: rgba(255,255,255,0.95) !important;
    transform: translateX(2px);
  }
  .custom-scroll::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  .custom-scroll::-webkit-scrollbar-track {
    background: rgba(0,0,0,0.05);
    border-radius: 10px;
  }
  .custom-scroll::-webkit-scrollbar-thumb {
    background: rgba(0,0,0,0.2);
    border-radius: 10px;
  }
  .custom-scroll::-webkit-scrollbar-thumb:hover {
    background: rgba(0,0,0,0.3);
  }
`;

// ============================================================
// STYLES
// ============================================================
const S = {
  container: {
    padding: 24,
    background: "linear-gradient(135deg, #e0e7ff 0%, #fce7f3 50%, #ddd6fe 100%)",
    minHeight: "100vh",
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  loadingContainer: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #e0e7ff 0%, #fce7f3 50%, #ddd6fe 100%)",
  },
  loadingSpinner: {
    animation: "spin 1.2s linear infinite",
  },
  loadingText: {
    marginTop: 16,
    color: "#475569",
    fontSize: 14,
    fontWeight: 600,
  },
  // HEADER
  headerCard: {
    background: "rgba(255,255,255,0.7)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 16,
    border: "1px solid rgba(255,255,255,0.5)",
    boxShadow: "0 8px 32px rgba(0,0,0,0.06)",
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 14,
  },
  headerIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    background: "linear-gradient(135deg, #f59e0b, #ef4444)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 8px 20px rgba(245,158,11,0.35)",
  },
  title: {
    fontSize: 24,
    fontWeight: 800,
    color: "#0f172a",
    margin: 0,
    letterSpacing: "-0.5px",
  },
  subtitleText: {
    fontSize: 13,
    color: "#64748b",
    margin: "4px 0 0",
  },
  createBtn: {
    padding: "12px 22px",
    background: "linear-gradient(135deg, #16a34a, #22c55e)",
    color: "#fff",
    border: "none",
    borderRadius: 12,
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 8,
    boxShadow: "0 8px 20px rgba(22,163,74,0.35)",
    transition: "all 0.2s ease",
  },
  // INFO BOX
  infoBox: {
    padding: 14,
    background: "rgba(239,246,255,0.7)",
    backdropFilter: "blur(10px)",
    border: "1px solid rgba(191,219,254,0.6)",
    borderRadius: 14,
    marginBottom: 20,
    fontSize: 13,
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  // STATS
  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 14,
    marginBottom: 24,
  },
  statCard: {
    padding: 18,
    borderRadius: 16,
    color: "#fff",
    display: "flex",
    alignItems: "center",
    gap: 14,
    boxShadow: "0 8px 24px rgba(0,0,0,0.1)",
  },
  statCardIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    background: "rgba(255,255,255,0.25)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backdropFilter: "blur(10px)",
  },
  statCardValue: {
    fontSize: 24,
    fontWeight: 800,
    lineHeight: 1,
  },
  statCardLabel: {
    fontSize: 12,
    fontWeight: 600,
    opacity: 0.95,
    marginTop: 4,
  },
  // SESSIONS GRID
  sessionsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))",
    gap: 20,
  },
  sessionCard: {
    borderRadius: 20,
    padding: 18,
    boxShadow: "0 8px 32px rgba(0,0,0,0.08)",
    border: "1px solid rgba(255,255,255,0.6)",
  },
  sessionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
    gap: 12,
  },
  sessionIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
  },
  sessionName: {
    fontSize: 16,
    fontWeight: 800,
    color: "#0f172a",
    margin: 0,
    letterSpacing: "-0.3px",
  },
  iconBadge: {
    fontSize: 10,
    padding: "2px 8px",
    borderRadius: 999,
    fontWeight: 700,
    display: "inline-block",
    marginTop: 4,
  },
  toggleWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 6,
    cursor: "pointer",
  },
  toggleSwitch: {
    width: 44,
    height: 24,
    borderRadius: 12,
    position: "relative",
    cursor: "pointer",
    transition: "background 0.2s",
    flexShrink: 0,
  },
  toggleThumb: {
    position: "absolute",
    top: 2,
    left: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#fff",
    boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
    transition: "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
  },
  subtitle: {
    color: "#475569",
    fontSize: 13,
    margin: "8px 0 10px",
  },
  dateBadge: {
    fontSize: 11,
    background: "rgba(254,243,199,0.7)",
    backdropFilter: "blur(10px)",
    color: "#92400e",
    padding: "5px 10px",
    borderRadius: 999,
    fontWeight: 600,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  stats: {
    display: "flex",
    gap: 8,
    marginBottom: 14,
    flexWrap: "wrap",
  },
  statBadge: {
    padding: "4px 10px",
    background: "rgba(255,255,255,0.7)",
    backdropFilter: "blur(10px)",
    color: "#1e40af",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    border: "1px solid rgba(191,219,254,0.4)",
  },
  // PRODUCTS LIST (NEW)
  productsListContainer: {
    marginTop: 14,
    marginBottom: 14,
    background: "rgba(255,255,255,0.55)",
    backdropFilter: "blur(15px)",
    WebkitBackdropFilter: "blur(15px)",
    borderRadius: 14,
    padding: 12,
    border: "1px solid rgba(255,255,255,0.7)",
  },
  productsListHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
    paddingBottom: 8,
    borderBottom: "1px dashed rgba(0,0,0,0.08)",
  },
  productsCountBadge: {
    fontSize: 10,
    padding: "3px 10px",
    borderRadius: 999,
    fontWeight: 700,
  },
  productsListBody: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    maxHeight: 280,
    overflowY: "auto",
    paddingRight: 4,
  },
  productListItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: 8,
    background: "rgba(255,255,255,0.8)",
    borderRadius: 10,
    border: "1px solid rgba(229,231,235,0.6)",
    cursor: "default",
  },
  productListImg: {
    width: 42,
    height: 42,
    borderRadius: 8,
    objectFit: "cover",
    border: "1px solid #e5e7eb",
    flexShrink: 0,
  },
  productListName: {
    fontSize: 12,
    fontWeight: 700,
    color: "#0f172a",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    marginBottom: 4,
  },
  productListPriceRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  productListMrp: {
    fontSize: 11,
    color: "#94a3b8",
    textDecoration: "line-through",
    fontWeight: 500,
  },
  productListFinalPrice: {
    fontSize: 13,
    fontWeight: 800,
  },
  productListPriceNoOffer: {
    fontSize: 12,
    fontWeight: 700,
    color: "#374151",
  },
  productListOfferBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    color: "#fff",
    fontSize: 9,
    fontWeight: 800,
    padding: "3px 7px",
    borderRadius: 999,
    boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
  },
  productListNoOfferBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    color: "#92400e",
    background: "#fef3c7",
    fontSize: 9,
    fontWeight: 700,
    padding: "3px 7px",
    borderRadius: 999,
  },
  // BUTTONS
  btnGroup: {
    display: "flex",
    gap: 8,
    marginTop: 4,
  },
  editBtn: {
    flex: 1,
    padding: "10px 14px",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    cursor: "pointer",
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    fontSize: 13,
    boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
  },
  deleteBtn: {
    padding: "10px 14px",
    background: "linear-gradient(135deg, #ef4444, #dc2626)",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    cursor: "pointer",
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 4px 12px rgba(239,68,68,0.3)",
  },
  empty: {
    gridColumn: "1 / -1",
    padding: 60,
    textAlign: "center",
    background: "rgba(255,255,255,0.6)",
    backdropFilter: "blur(20px)",
    borderRadius: 20,
    color: "#64748b",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  // MODAL
  modalBg: {
    position: "fixed",
    top: 0, left: 0, right: 0, bottom: 0,
    background: "rgba(15,23,42,0.6)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
    padding: 20,
  },
  modal: {
    background: "rgba(255,255,255,0.95)",
    backdropFilter: "blur(20px)",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 580,
    maxHeight: "90vh",
    overflow: "auto",
    boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
    border: "1px solid rgba(255,255,255,0.5)",
  },
  modalLarge: {
    background: "rgba(255,255,255,0.95)",
    backdropFilter: "blur(20px)",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 980,
    maxHeight: "92vh",
    overflow: "auto",
    boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
    border: "1px solid rgba(255,255,255,0.5)",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
    paddingBottom: 14,
    borderBottom: "1px solid rgba(0,0,0,0.06)",
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: 800,
    color: "#0f172a",
    margin: 0,
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  closeX: {
    background: "rgba(0,0,0,0.05)",
    border: "none",
    width: 36,
    height: 36,
    borderRadius: 10,
    cursor: "pointer",
    color: "#475569",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.15s",
  },
  // TABS
  tabBar: {
    display: "flex",
    borderBottom: "2px solid rgba(0,0,0,0.06)",
    marginBottom: 20,
    gap: 0,
  },
  tabBtn: {
    padding: "10px 16px",
    border: "none",
    background: "none",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 700,
    color: "#64748b",
    borderBottom: "2px solid transparent",
    marginBottom: -2,
    display: "flex",
    alignItems: "center",
    gap: 6,
    transition: "all 0.2s",
  },
  tabContent: { paddingTop: 8 },
  // FORM
  field: { marginBottom: 14 },
  label: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    fontWeight: 700,
    color: "#1e293b",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: "0.4px",
  },
  input: {
    width: "100%",
    padding: "11px 14px",
    border: "1.5px solid #e5e7eb",
    borderRadius: 10,
    fontSize: 14,
    boxSizing: "border-box",
    background: "#fff",
    transition: "border-color 0.15s, box-shadow 0.15s",
    fontFamily: "inherit",
    outline: "none",
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
    marginBottom: 14,
  },
  dateGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
    marginBottom: 4,
  },
  presetGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: 8,
    marginTop: 8,
  },
  presetBtn: {
    padding: "10px 12px",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    gap: 6,
    boxShadow: "0 4px 10px rgba(0,0,0,0.12)",
  },
  // ICON DROPDOWN
  iconDropBtn: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    border: "2px solid #e5e7eb",
    borderRadius: 10,
    cursor: "pointer",
    background: "#fff",
    fontSize: 14,
    width: "100%",
    transition: "border-color 0.15s",
  },
  iconDropEmoji: { display: "flex" },
  iconDropName: {
    flex: 1,
    textAlign: "left",
    fontWeight: 600,
    color: "#1e293b",
  },
  iconDropdown: {
    position: "absolute",
    top: "calc(100% + 6px)",
    left: 0,
    right: 0,
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    zIndex: 999,
    maxHeight: 260,
    overflowY: "auto",
    boxShadow: "0 12px 28px rgba(0,0,0,0.15)",
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    padding: 6,
    gap: 4,
  },
  iconDropItem: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 3,
    padding: "10px 6px",
    border: "none",
    cursor: "pointer",
    borderRadius: 8,
    background: "transparent",
    transition: "background 0.15s",
  },
  // PRODUCTS
  searchBox: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "0 14px",
    background: "#f8fafc",
    border: "1.5px solid #e5e7eb",
    borderRadius: 10,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    padding: "11px 0",
    border: "none",
    background: "transparent",
    fontSize: 14,
    outline: "none",
    fontFamily: "inherit",
  },
  productList: {
    maxHeight: 440,
    overflowY: "auto",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    background: "#fff",
  },
  productRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderBottom: "1px solid #f3f4f6",
    cursor: "pointer",
    transition: "background 0.15s",
  },
  productImg: {
    width: 52,
    height: 52,
    borderRadius: 8,
    objectFit: "cover",
  },
  productName: {
    fontSize: 13,
    fontWeight: 700,
    color: "#0f172a",
  },
  productPrice: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 3,
  },
  mrpSmall: {
    textDecoration: "line-through",
    color: "#94a3b8",
    fontSize: 11,
  },
  offerTag: {
    marginLeft: 6,
    background: "#dcfce7",
    color: "#16a34a",
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 800,
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
  },
  selectedBadge: {
    padding: "4px 10px",
    background: "linear-gradient(135deg, #16a34a, #22c55e)",
    color: "#fff",
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 800,
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    boxShadow: "0 2px 6px rgba(22,163,74,0.3)",
  },
  // OFFERS
  offersHeader: {
    marginBottom: 16,
    padding: "10px 14px",
    background: "rgba(239,246,255,0.7)",
    backdropFilter: "blur(10px)",
    borderRadius: 10,
    display: "flex",
    alignItems: "center",
    gap: 8,
    border: "1px solid rgba(191,219,254,0.5)",
  },
  offerRow: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
  },
  offerProductInfo: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  offerImg: {
    width: 50,
    height: 50,
    borderRadius: 8,
    objectFit: "cover",
  },
  offerProductName: {
    fontSize: 14,
    fontWeight: 800,
    color: "#0f172a",
  },
  offerProductPrices: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
  },
  offerTypeRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 12,
  },
  offerTypeBtn: {
    padding: "6px 12px",
    border: "none",
    borderRadius: 999,
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 700,
    transition: "all 0.15s",
  },
  offerInputRow: {
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
    marginBottom: 12,
  },
  pricePreview: {
    minWidth: 120,
    border: "2px solid",
    borderRadius: 12,
    padding: "8px 12px",
    textAlign: "center",
    flexShrink: 0,
    background: "#fff",
  },
  pricePreviewMrp: {
    fontSize: 10,
    color: "#94a3b8",
    textDecoration: "line-through",
  },
  pricePreviewFinal: {
    fontSize: 18,
    fontWeight: 800,
    marginTop: 2,
  },
  pricePreviewSave: {
    color: "#fff",
    fontSize: 10,
    fontWeight: 800,
    padding: "3px 8px",
    borderRadius: 999,
    marginTop: 4,
    display: "inline-block",
  },
  offerActions: {
    display: "flex",
    gap: 8,
    justifyContent: "flex-end",
  },
  removeOfferBtn: {
    padding: "8px 14px",
    background: "#fee2e2",
    color: "#dc2626",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    gap: 5,
  },
  saveOfferBtn: {
    padding: "8px 18px",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 800,
    display: "flex",
    alignItems: "center",
    gap: 5,
    boxShadow: "0 4px 10px rgba(0,0,0,0.12)",
  },
  // COMMON
  modalActions: {
    display: "flex",
    gap: 10,
    justifyContent: "flex-end",
    marginTop: 22,
    paddingTop: 16,
    borderTop: "1px solid rgba(0,0,0,0.06)",
  },
  cancelBtn: {
    padding: "11px 22px",
    background: "#f1f5f9",
    color: "#0f172a",
    border: "none",
    borderRadius: 10,
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 13,
  },
  saveBtn: {
    padding: "11px 22px",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 13,
    display: "flex",
    alignItems: "center",
    gap: 6,
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
  },
};