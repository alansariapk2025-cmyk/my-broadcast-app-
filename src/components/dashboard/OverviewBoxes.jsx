import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, onSnapshot } from "firebase/firestore";
import { Users, ReceiptText, Wallet } from "lucide-react";

export default function OverviewBoxes() {
  const [summary, setSummary] = useState({
    totalOrders: 0,
    totalPayments: 0,
    totalCustomers: 0,
  });

  useEffect(() => {
    const unsubscribeOrders = onSnapshot(
      collection(db, "orders"),
      (snapshot) => {
        setSummary((prev) => ({ ...prev, totalOrders: snapshot.size }));
      },
      (err) => {
        console.warn("Orders overview listener error:", err);
      }
    );

    const unsubscribePayments = onSnapshot(
      collection(db, "payments"),
      (snapshot) => {
        const total = snapshot.docs.reduce((sum, doc) => {
          const amount = doc.data()?.amount || 0;
          return sum + amount;
        }, 0);
        setSummary((prev) => ({ ...prev, totalPayments: total }));
      },
      (err) => {
        console.warn("Payments overview listener error:", err);
      }
    );

    const unsubscribeUsers = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        setSummary((prev) => ({ ...prev, totalCustomers: snapshot.size }));
      },
      (err) => {
        console.warn("Users overview listener error:", err);
      }
    );

    return () => {
      unsubscribeOrders();
      unsubscribePayments();
      unsubscribeUsers();
    };
  }, []);

  const Box = ({ icon, label, value }) => (
    <div className="stat-card p-6 flex items-center gap-4 w-full sm:w-[30%] min-w-[240px]">
      <div className="p-3 rounded-xl bg-blue-500/10">{icon}</div>
      <div>
        <h2 className="text-xl font-bold theme-page-title">{value}</h2>
        <p className="text-sm theme-page-muted">{label}</p>
      </div>
    </div>
  );

  return (
    <div className="flex flex-wrap justify-center gap-6">
      <Box
        icon={<Users className="text-blue-500" size={28} />}
        label="Total Customers"
        value={summary.totalCustomers}
      />
      <Box
        icon={<ReceiptText className="text-blue-500" size={28} />}
        label="Total Orders"
        value={summary.totalOrders}
      />
      <Box
        icon={<Wallet className="text-blue-500" size={28} />}
        label="Total Payments"
        value={`PKR ${summary.totalPayments.toLocaleString()}`}
      />
    </div>
  );
}
