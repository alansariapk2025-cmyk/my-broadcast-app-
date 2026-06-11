import { useCallback, useEffect, useMemo, useState } from "react";
import { getDocs, collection, doc, setDoc, collectionGroup } from "firebase/firestore";
import { saveAs } from "file-saver";
import {
  Database, Download, Upload, RefreshCw, Loader2, CheckCircle2, AlertTriangle, HardDrive,
} from "lucide-react";
import { db } from "../firebase";
import PageShell, { SectionCard } from "../components/ui/PageShell";
import notify from "../utils/notify";

const ALL_COLLECTIONS = [
  { id: "products", label: "Products", group: "core" },
  { id: "categories", label: "Categories (top-level)", group: "core" },
  { id: "shops", label: "Shops", group: "core" },
  { id: "users", label: "Users", group: "core" },
  { id: "orders", label: "Orders", group: "core" },
  { id: "payments", label: "Payments", group: "core" },
  { id: "customers", label: "Customers", group: "core" },
  { id: "banners", label: "Banners", group: "extra" },
  { id: "activityLogs", label: "Activity Logs", group: "extra" },
];

const LAST_BACKUP_KEY = "pos-last-backup-meta";

export default function Backup() {
  const [selected, setSelected] = useState(() => ALL_COLLECTIONS.filter((c) => c.group === "core").map((c) => c.id));
  const [counts, setCounts] = useState({});
  const [loadingCounts, setLoadingCounts] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [lastBackup, setLastBackup] = useState(null);
  const [shopCategoriesCount, setShopCategoriesCount] = useState(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAST_BACKUP_KEY);
      if (raw) setLastBackup(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const loadCounts = useCallback(async () => {
    setLoadingCounts(true);
    try {
      const next = {};
      await Promise.all(
        ALL_COLLECTIONS.map(async ({ id }) => {
          try {
            const snap = await getDocs(collection(db, id));
            next[id] = snap.size;
          } catch {
            next[id] = 0;
          }
        })
      );
      try {
        const subSnap = await getDocs(collectionGroup(db, "categories"));
        setShopCategoriesCount(subSnap.size);
      } catch {
        setShopCategoriesCount(0);
      }
      setCounts(next);
    } finally {
      setLoadingCounts(false);
    }
  }, []);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  const totalSelectedDocs = useMemo(
    () => selected.reduce((sum, id) => sum + (counts[id] || 0), 0),
    [selected, counts]
  );

  const toggleCollection = (id) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectAll = () => setSelected(ALL_COLLECTIONS.map((c) => c.id));
  const selectCore = () => setSelected(ALL_COLLECTIONS.filter((c) => c.group === "core").map((c) => c.id));

  const exportFirestoreData = async () => {
    if (selected.length === 0) {
      notify.warning("Select at least one collection");
      return;
    }
    setExporting(true);
    try {
      const allData = { _meta: { exportedAt: new Date().toISOString(), collections: selected } };

      for (const colName of selected) {
        const docsSnap = await getDocs(collection(db, colName));
        allData[colName] = {};
        docsSnap.forEach((docSnap) => {
          allData[colName][docSnap.id] = docSnap.data();
        });
      }

      if (selected.includes("shops")) {
        allData._shopCategories = {};
        const shopsSnap = await getDocs(collection(db, "shops"));
        for (const shopDoc of shopsSnap.docs) {
          const catSnap = await getDocs(collection(db, "shops", shopDoc.id, "categories"));
          if (catSnap.size > 0) {
            allData._shopCategories[shopDoc.id] = {};
            catSnap.forEach((d) => {
              allData._shopCategories[shopDoc.id][d.id] = d.data();
            });
          }
        }
      }

      const blob = new Blob([JSON.stringify(allData, null, 2)], { type: "application/json" });
      const filename = `firestore-backup-${new Date().toISOString().slice(0, 10)}.json`;
      saveAs(blob, filename);

      const meta = { date: new Date().toISOString(), collections: selected.length, filename };
      localStorage.setItem(LAST_BACKUP_KEY, JSON.stringify(meta));
      setLastBackup(meta);
      notify.success("Backup downloaded successfully!");
    } catch (error) {
      console.error("Error exporting Firestore:", error);
      notify.error("Backup failed. Check console.");
    } finally {
      setExporting(false);
    }
  };

  const importFirestoreData = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!window.confirm("Restore will overwrite existing documents. Continue?")) {
      event.target.value = "";
      return;
    }

    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      let restored = 0;

      for (const colName of Object.keys(data)) {
        if (colName.startsWith("_")) continue;
        if (!data[colName] || typeof data[colName] !== "object") continue;
        for (const docId of Object.keys(data[colName])) {
          await setDoc(doc(db, colName, docId), data[colName][docId]);
          restored++;
        }
      }

      if (data._shopCategories) {
        for (const shopId of Object.keys(data._shopCategories)) {
          for (const catId of Object.keys(data._shopCategories[shopId])) {
            await setDoc(doc(db, "shops", shopId, "categories", catId), data._shopCategories[shopId][catId]);
            restored++;
          }
        }
      }

      notify.success(`Restored ${restored} documents`);
      loadCounts();
    } catch (error) {
      console.error("Error importing Firestore:", error);
      notify.error("Restore failed. Check JSON format.");
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  };

  return (
    <PageShell
      title="Firestore Backup & Restore"
      subtitle="Select collections, preview counts, export or restore safely"
      icon={Database}
      actions={
        <button type="button" onClick={loadCounts} disabled={loadingCounts} className="theme-btn-secondary text-sm">
          <RefreshCw className={`w-4 h-4 ${loadingCounts ? "animate-spin" : ""}`} />
          Refresh Counts
        </button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="stat-card p-4">
          <p className="text-xs theme-page-muted">Selected Collections</p>
          <p className="text-2xl font-bold theme-highlight">{selected.length}</p>
        </div>
        <div className="stat-card p-4">
          <p className="text-xs theme-page-muted">Documents (selected)</p>
          <p className="text-2xl font-bold theme-highlight">{totalSelectedDocs.toLocaleString()}</p>
        </div>
        <div className="stat-card p-4">
          <p className="text-xs theme-page-muted">Shop Subcategories</p>
          <p className="text-2xl font-bold theme-highlight">{shopCategoriesCount}</p>
        </div>
      </div>

      {lastBackup && (
        <div className="theme-card-inner p-4 flex items-center gap-3 text-sm">
          <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
          <span className="theme-page-muted">
            Last backup: {new Date(lastBackup.date).toLocaleString()} — {lastBackup.collections} collections ({lastBackup.filename})
          </span>
        </div>
      )}

      <SectionCard title="Select Collections to Export" icon={HardDrive}>
        <div className="flex flex-wrap gap-2 mb-4">
          <button type="button" onClick={selectAll} className="theme-btn-secondary text-xs">Select All</button>
          <button type="button" onClick={selectCore} className="theme-btn-secondary text-xs">Core Only</button>
          <button type="button" onClick={() => setSelected([])} className="theme-btn-secondary text-xs">Clear</button>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ALL_COLLECTIONS.map(({ id, label, group }) => (
            <label
              key={id}
              className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition ${
                selected.includes(id) ? "border-blue-500/50 bg-blue-500/10" : "theme-card-inner"
              }`}
            >
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected.includes(id)}
                  onChange={() => toggleCollection(id)}
                  className="rounded"
                />
                <span className="text-sm theme-page-title">{label}</span>
              </span>
              <span className="text-xs theme-page-muted font-mono">
                {loadingCounts ? "…" : (counts[id] ?? 0)}
              </span>
            </label>
          ))}
        </div>
        <p className="text-xs theme-page-muted mt-3">
          Shop subcategories are included automatically when &quot;Shops&quot; is selected.
        </p>
      </SectionCard>

      <SectionCard title="Export / Restore" icon={Database}>
        <div className="flex items-start gap-3 p-4 theme-card-inner rounded-xl mb-4">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm theme-page-muted">
            Restore overwrites matching document IDs. Always export a fresh backup before importing.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={exportFirestoreData}
            disabled={exporting || selected.length === 0}
            className="theme-btn-primary"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Export Backup ({selected.length} collections)
          </button>
          <label className={`theme-btn-secondary cursor-pointer ${importing ? "opacity-50 pointer-events-none" : ""}`}>
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Restore from JSON
            <input type="file" accept=".json" onChange={importFirestoreData} className="hidden" disabled={importing} />
          </label>
        </div>
      </SectionCard>
    </PageShell>
  );
}
