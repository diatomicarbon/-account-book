"use client";

import { useState, useEffect } from "react";
import { supabase, Expense } from "@/lib/supabase";

export default function Home() {
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load expenses on component mount
  useEffect(() => {
    loadExpenses();
  }, []);

  const loadExpenses = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (data) setExpenses(data);
    } catch (error) {
      console.error("Error loading expenses:", error);
      alert("데이터를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !amount || !description) {
      alert("모든 필드를 입력해주세요.");
      return;
    }

    try {
      setSaving(true);
      const { data, error } = await supabase
        .from("expenses")
        .insert([
          {
            date,
            amount: parseInt(amount),
            description,
          },
        ])
        .select();

      if (error) throw error;

      // Add new expense to the top of the list
      if (data && data[0]) {
        setExpenses([data[0], ...expenses]);
      }

      setDate("");
      setAmount("");
      setDescription("");
    } catch (error) {
      console.error("Error saving expense:", error);
      alert("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("ko-KR").format(amount);
  };

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 md:px-6 md:py-16">
      <main className="w-full max-w-2xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-semibold text-center mb-12 md:mb-16 text-gray-900 tracking-tight">
          나의 스마트 가계부
        </h1>

        {/* Input Form */}
        <div className="bg-white rounded-lg p-6 md:p-8 mb-12 md:mb-16">
          <form onSubmit={handleSubmit} className="space-y-6 md:space-y-8">
            <div>
              <label
                htmlFor="date"
                className="block text-sm font-medium text-gray-600 mb-2"
              >
                날짜
              </label>
              <input
                type="date"
                id="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-4 py-3 md:py-3.5 rounded-md bg-gray-50 text-gray-900 text-base border-0 focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all outline-none"
                required
              />
            </div>

            <div>
              <label
                htmlFor="amount"
                className="block text-sm font-medium text-gray-600 mb-2"
              >
                금액
              </label>
              <input
                type="number"
                id="amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="금액을 입력하세요"
                className="w-full px-4 py-3 md:py-3.5 rounded-md bg-gray-50 text-gray-900 text-base border-0 focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all outline-none placeholder:text-gray-400"
                required
              />
            </div>

            <div>
              <label
                htmlFor="description"
                className="block text-sm font-medium text-gray-600 mb-2"
              >
                내용
              </label>
              <input
                type="text"
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="지출 내역을 입력하세요"
                className="w-full px-4 py-3 md:py-3.5 rounded-md bg-gray-50 text-gray-900 text-base border-0 focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all outline-none placeholder:text-gray-400"
                required
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-blue-500 text-white font-medium py-3.5 md:py-4 px-6 rounded-md text-base hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]"
            >
              {saving ? "저장 중..." : "저장하기"}
            </button>
          </form>
        </div>

        {/* Expenses List */}
        <div className="space-y-2 md:space-y-3">
          <h2 className="text-lg md:text-xl font-semibold text-gray-900 mb-6 md:mb-8 tracking-tight">
            지출 내역
          </h2>
          {loading ? (
            <div className="text-center py-12 text-gray-400 text-sm">로딩 중...</div>
          ) : expenses.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              아직 등록된 지출 내역이 없습니다.
            </div>
          ) : (
            expenses.map((expense) => (
              <div
                key={expense.id}
                className="bg-white rounded-lg p-5 md:p-6 hover:bg-gray-50 transition-colors"
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base md:text-lg font-medium text-gray-900 mb-1.5 break-words leading-snug">
                      {expense.description}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {formatDate(expense.date)}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xl md:text-2xl font-semibold text-blue-500 whitespace-nowrap tabular-nums">
                      {formatAmount(expense.amount)}원
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
