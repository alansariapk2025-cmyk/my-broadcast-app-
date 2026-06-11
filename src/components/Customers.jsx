import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "../firebase";
import { FaSearch } from "react-icons/fa";
import { Users } from "lucide-react";
import { useShop } from "../contexts/ShopContext";
import { filterByShop } from "../utils/shopUtils";
import notify from "../utils/notify";
import PageShell, { SectionCard } from "./ui/PageShell";

const num = (v) => (typeof v === "number" && !isNaN(v) ? v : Number(v) || 0);

export default function Customers({ assignedShopId: propShopId }) {
  const { effectiveShopId: ctxShopId } = useShop();
  const effectiveShopId = propShopId || ctxShopId;

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 20;

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      let list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (effectiveShopId) list = filterByShop(list, effectiveShopId);
      setOrders(list);
    } catch (err) {
      console.error("Orders fetch error:", err);
      notify.error("Failed to load customers");
    } finally {
      setLoading(false);
    }
  }, [effectiveShopId]);

  useEffect(() => {
    fetchOrders();
    const timer = setInterval(fetchOrders, 120_000);
    return () => clearInterval(timer);
  }, [fetchOrders]);

  // 🔹 Orders -> unique customers aggregate
  const customers = useMemo(() => {
    const map = {};

    orders.forEach((o) => {
      const createdAt = o.createdAt?.toDate
        ? o.createdAt.toDate()
        : o.createdAt?.seconds
        ? new Date(o.createdAt.seconds * 1000)
        : new Date();

      // key by userId, otherwise email, otherwise phone
      const key = o.userId || o.email || o.customerPhone || o.phone;
      if (!key) return;

      if (!map[key]) {
        map[key] = {
          id: key,
          name: o.customerName || o.userName || "—",
          email: o.email || "—",
          phone: o.customerPhone || o.phone || "—",
          address: o.customerAddress || o.address || "—",
          status: "Active",
          ordersCount: 0,
          totalSpent: 0,
          lastOrderAt: createdAt,
        };
      }

      map[key].ordersCount += 1;
      map[key].totalSpent += num(o.grandTotal ?? o.total ?? 0);
      if (createdAt > map[key].lastOrderAt) {
        map[key].lastOrderAt = createdAt;
      }
    });

    return Object.values(map);
  }, [orders]);

  // 🔹 Filter + search
  const filtered = useMemo(() => {
    const s = searchTerm.trim().toLowerCase();
    if (!s) return customers;

    return customers.filter((u) => {
      return (
        u.name.toLowerCase().includes(s) ||
        u.email.toLowerCase().includes(s) ||
        u.phone.toLowerCase().includes(s) ||
        u.address.toLowerCase().includes(s)
      );
    });
  }, [customers, searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm]);

  const totalPages = Math.ceil(filtered.length / perPage) || 1;
  const current = filtered.slice((page - 1) * perPage, page * perPage);

  return (
    <PageShell
      title="Customers"
      subtitle={`Total customers: ${customers.length}`}
      icon={Users}
    >
      <div className="theme-card theme-glass p-4 flex flex-wrap gap-3 items-center justify-between">
        <div className="flex items-center gap-2 theme-card-inner px-3 py-2 rounded-xl flex-1 min-w-[240px]">
          <FaSearch className="theme-page-muted shrink-0" />
          <input
            type="text"
            placeholder="Search by name, email, phone, address..."
            className="outline-none bg-transparent w-full theme-page-title text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center theme-page-muted py-10 text-lg animate-pulse">
          Loading customers...
        </div>
      ) : (
        <>
          <SectionCard>
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr>
                    <th className="p-3">#</th>
                    <th className="p-3">Name</th>
                    <th className="p-3">Email</th>
                    <th className="p-3">Phone</th>
                    <th className="p-3">Address</th>
                    <th className="p-3">Orders</th>
                    <th className="p-3">Total Spent</th>
                    <th className="p-3">Last Order</th>
                  </tr>
                </thead>
                <tbody>
                  {current.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="text-center p-6 theme-page-muted">
                        No customers found.
                      </td>
                    </tr>
                  ) : (
                    current.map((user, index) => (
                      <tr key={user.id} className="border-t theme-card-inner">
                        <td className="p-3">{(page - 1) * perPage + index + 1}</td>
                        <td className="p-3">{user.name}</td>
                        <td className="p-3">{user.email}</td>
                        <td className="p-3">{user.phone}</td>
                        <td className="p-3">{user.address}</td>
                        <td className="p-3 font-semibold">{user.ordersCount}</td>
                        <td className="p-3 font-semibold text-blue-500">
                          PKR {user.totalSpent.toLocaleString()}
                        </td>
                        <td className="p-3 text-xs theme-page-muted">
                          {user.lastOrderAt.toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <div className="flex justify-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              disabled={page === 1}
              className="theme-btn-secondary text-sm disabled:opacity-40"
            >
              Prev
            </button>
            <span className="px-3 py-1 font-semibold theme-page-title">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              disabled={page === totalPages}
              className="theme-btn-secondary text-sm disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </>
      )}
    </PageShell>
  );
}