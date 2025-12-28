"use client";

import { useState, useEffect, useRef } from "react";
import { supabase, Expense } from "@/lib/supabase";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: "안녕하세요! 지출 내역을 말씀해주시면 기록해드릴게요. 예: '오늘 커피 5000원 샀어'",
      timestamp: new Date(),
    },
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Load expenses on component mount
  useEffect(() => {
    loadExpenses();
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

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
    } finally {
      setLoading(false);
    }
  };

  const saveExpense = async (date: string, amount: number, description: string) => {
    try {
      const { data, error } = await supabase
        .from("expenses")
        .insert([
          {
            date,
            amount,
            description,
          },
        ])
        .select();

      if (error) throw error;

      if (data && data[0]) {
        setExpenses([data[0], ...expenses]);
      }
    } catch (error) {
      console.error("Error saving expense:", error);
      throw error;
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || sending) return;

    const userMessageText = inputMessage.trim();
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: userMessageText,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage("");
    setSending(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: userMessageText,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || errorData.error || "서버 오류가 발생했습니다.");
      }

      const data = await response.json();

      if (data.parsedData) {
        if (data.parsedData.action === "save_expense") {
          try {
            // Save expense to database
            await saveExpense(
              data.parsedData.date,
              data.parsedData.amount,
              data.parsedData.description
            );

            // Format date for display
            const displayDate = formatDate(data.parsedData.date);
            const displayAmount = formatAmount(data.parsedData.amount);

            const assistantMessage: Message = {
              id: (Date.now() + 1).toString(),
              role: "assistant",
              content: `${displayDate} ${data.parsedData.description} ${displayAmount}원을 저장했어요! ✅`,
              timestamp: new Date(),
            };
            setMessages((prev) => [...prev, assistantMessage]);
          } catch (saveError) {
            console.error("Error saving expense:", saveError);
            const errorMessage: Message = {
              id: (Date.now() + 1).toString(),
              role: "assistant",
              content: "저장 중 오류가 발생했습니다. 다시 시도해주세요.",
              timestamp: new Date(),
            };
            setMessages((prev) => [...prev, errorMessage]);
          }
        } else if (data.parsedData.action === "ask_clarification") {
          const assistantMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: data.parsedData.message || "날짜와 금액, 내용을 모두 알려주세요. 예: '오늘 점심 15000원'",
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, assistantMessage]);
        } else if (data.parsedData.action === "statistics") {
          // Statistics/analysis response
          const assistantMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: data.parsedData.message || data.message || "통계를 분석할 수 없었습니다.",
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, assistantMessage]);
        } else if (data.parsedData.action === "chat") {
          const assistantMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: data.parsedData.message || data.message || "지출 내역을 말씀해주시면 기록해드릴게요!",
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, assistantMessage]);
        } else {
          // Fallback to regular message
          const assistantMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: data.message || "응답을 받을 수 없었습니다.",
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, assistantMessage]);
        }
      } else {
        // No parsed data, show regular message
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: data.message || "지출 내역을 말씀해주시면 기록해드릴게요!",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      }
    } catch (error: any) {
      console.error("Error sending message:", error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: error.message || "죄송합니다. 오류가 발생했습니다. 다시 시도해주세요.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setSending(false);
    }
  };

  const formatDate = (dateString: string) => {
    // Handle YYYY-MM-DD format
    const [year, month, day] = dateString.split("-");
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    return date.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("ko-KR").format(amount);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 flex-shrink-0">
        <h1 className="text-xl font-semibold text-gray-900 text-center">
          AI 가계부 챗봇
        </h1>
      </div>

      {/* Expenses Cards - Above Chat */}
      {expenses.length > 0 && (
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 overflow-x-auto flex-shrink-0">
          <div className="flex gap-3 overflow-x-auto pb-2">
            {expenses.slice(0, 5).map((expense) => (
              <div
                key={expense.id}
                className="bg-white rounded-lg p-3 min-w-[200px] flex-shrink-0 shadow-sm"
              >
                <p className="text-xs text-gray-500 mb-1">
                  {formatDate(expense.date)}
                </p>
                <p className="text-sm font-medium text-gray-900 mb-1 truncate">
                  {expense.description}
                </p>
                <p className="text-base font-semibold text-blue-500 tabular-nums">
                  {formatAmount(expense.amount)}원
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chat Messages */}
      <div
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
      >
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${
              message.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[75%] md:max-w-[60%] rounded-2xl px-4 py-2.5 ${
                message.role === "user"
                  ? "bg-blue-500 text-white rounded-tr-sm"
                  : "bg-white text-gray-900 rounded-tl-sm shadow-sm"
              }`}
            >
              <p className="text-sm md:text-base whitespace-pre-wrap break-words">
                {message.content}
              </p>
              <p
                className={`text-xs mt-1 ${
                  message.role === "user"
                    ? "text-blue-100"
                    : "text-gray-400"
                }`}
              >
                {formatTime(message.timestamp)}
              </p>
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-sm">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="bg-white border-t border-gray-200 px-4 py-3 flex-shrink-0">
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder="메시지를 입력하세요..."
            className="flex-1 px-4 py-2.5 rounded-full bg-gray-100 text-gray-900 text-base border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
            disabled={sending}
          />
          <button
            type="submit"
            disabled={!inputMessage.trim() || sending}
            className="bg-blue-500 text-white rounded-full px-6 py-2.5 font-medium hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-[60px]"
          >
            {sending ? "..." : "전송"}
          </button>
        </form>
      </div>
    </div>
  );
}
