import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { supabase, Expense } from "@/lib/supabase";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

function getDateOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}

function parseRelativeDate(dateStr: string): string {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  
  if (dateStr.includes("오늘") || dateStr.includes("today")) {
    return todayStr;
  } else if (dateStr.includes("어제") || dateStr.includes("yesterday")) {
    return getDateOffset(-1);
  } else if (dateStr.includes("그저께") || dateStr.includes("day before yesterday")) {
    return getDateOffset(-2);
  } else if (dateStr.includes("내일") || dateStr.includes("tomorrow")) {
    return getDateOffset(1);
  }
  return todayStr;
}

// Check if message is a question (statistics query) or expense input
function isQuestion(message: string): boolean {
  const questionKeywords = [
    "얼마", "뭐", "어떻게", "몇", "언제", "무엇", "어디", "누구", "어떤",
    "총", "평균", "가장", "많이", "적게", "어떤", "무엇", "뭘", "뭐를",
    "알려줘", "알려", "보여줘", "보여", "확인", "조회", "검색", "찾아",
    "어제", "지난주", "이번 달", "지난 달", "이번 주", "지난 주"
  ];
  
  const strongQuestionKeywords = ["얼마", "뭐", "무엇", "어떻게", "총", "평균", "가장"];
  const hasStrongQuestionKeyword = strongQuestionKeywords.some(keyword => message.includes(keyword));
  const hasQuestionKeyword = questionKeywords.some(keyword => message.includes(keyword));
  
  // Check if it contains amount (numbers with 원, 만원, etc.)
  // More specific pattern: 숫자 + (만/천) + 원, or 숫자 + 원
  const hasAmount = /\d+[만천억]?원/.test(message) || /\d+원/.test(message);
  
  // Check for question marks or question patterns
  const hasQuestionMark = message.includes("?") || message.includes("？");
  
  // If has strong question keyword, it's likely a question
  if (hasStrongQuestionKeyword && !hasAmount) {
    return true;
  }
  
  // If has question keyword and question mark, it's a question
  if (hasQuestionKeyword && hasQuestionMark) {
    return true;
  }
  
  // If has question keyword but no amount, it's likely a question
  if (hasQuestionKeyword && !hasAmount) {
    return true;
  }
  
  // If has amount, it's likely an expense input (unless it's clearly a question)
  if (hasAmount && !hasStrongQuestionKeyword) {
    return false;
  }
  
  // Default: not a question
  return false;
}

// Fetch all expenses from Supabase
async function fetchAllExpenses(): Promise<Expense[]> {
  try {
    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error fetching expenses:", error);
    return [];
  }
}

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();

    if (!message) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { 
          error: "GEMINI_API_KEY is not configured",
          message: "GEMINI_API_KEY 환경 변수가 설정되지 않았습니다. .env.local 파일을 확인해주세요."
        },
        { status: 500 }
      );
    }

    // Verify API key format (should start with AIza)
    if (!apiKey.startsWith("AIza")) {
      return NextResponse.json(
        { 
          error: "Invalid API key format",
          message: "API 키 형식이 올바르지 않습니다. Google AI Studio에서 발급받은 API 키를 확인해주세요."
        },
        { status: 500 }
      );
    }

    // Try latest model names first, then fallback to older ones
    // Based on user's example, trying gemini-2.5-flash and other variants
    const modelNamesToTry = [
      "gemini-2.5-flash",      // Latest model (from user's example)
      "gemini-2.0-flash-exp",  // Latest experimental
      "gemini-1.5-flash",      // Stable fast model
      "gemini-1.5-pro",        // More capable
      "gemini-pro"             // Legacy
    ];
    
    let model;
    let workingModelName = null;
    
    // Try to initialize model (just get the model object, don't call yet)
    for (const modelName of modelNamesToTry) {
      try {
        model = genAI.getGenerativeModel({ model: modelName });
        workingModelName = modelName;
        console.log(`Initialized model: ${modelName}`);
        break;
      } catch (e: any) {
        console.log(`Failed to initialize ${modelName}:`, e.message);
        continue;
      }
    }
    
    if (!model) {
      return NextResponse.json(
        { 
          error: "No available models",
          message: "모델을 초기화할 수 없습니다. API 키와 모델 접근 권한을 확인해주세요."
        },
        { status: 500 }
      );
    }

    // Get today's date in YYYY-MM-DD format
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const yesterdayStr = getDateOffset(-1);

    // Check if this is a question (statistics query) or expense input
    const isQuestionMessage = isQuestion(message);

    // If it's a question, fetch expenses and analyze
    if (isQuestionMessage) {
      const expenses = await fetchAllExpenses();
      
      if (expenses.length === 0) {
        return NextResponse.json({
          message: "아직 저장된 지출 내역이 없어요. 지출 내역을 먼저 입력해주세요!",
          parsedData: {
            action: "chat",
            message: "아직 저장된 지출 내역이 없어요. 지출 내역을 먼저 입력해주세요!",
          },
        });
      }

      // Format expenses data for AI
      const expensesData = expenses.map(exp => ({
        date: exp.date,
        amount: exp.amount,
        description: exp.description,
        created_at: exp.created_at,
      }));

      // Build prompt for statistics analysis
      const analysisPrompt = `You are a helpful expense tracking assistant. Analyze the following expense data and answer the user's question in a friendly, natural Korean way.

Today's date: ${todayStr}

Expense Data (${expenses.length} items):
${JSON.stringify(expensesData, null, 2)}

User's question: "${message}"

Instructions:
- Answer in natural, friendly Korean
- Use specific numbers from the data
- Format amounts with commas (e.g., 15,000원)
- Be conversational and helpful
- If the question asks about a specific period, calculate based on the date field
- If asking about categories, group by description
- If no relevant data exists, say so politely

Answer the question directly without JSON format:`;

      let result;
      let response;
      let text;
      
      try {
        result = await model.generateContent(analysisPrompt);
        response = await result.response;
        text = response.text().trim();
      } catch (error: any) {
        // Try alternative models if needed
        if (error.message?.includes("not found") || error.message?.includes("404")) {
          const alternativeModels = modelNamesToTry.filter(name => name !== workingModelName);
          
          for (const altModelName of alternativeModels) {
            try {
              const altModel = genAI.getGenerativeModel({ model: altModelName });
              result = await altModel.generateContent(analysisPrompt);
              response = await result.response;
              text = response.text().trim();
              break;
            } catch (e: any) {
              continue;
            }
          }
        }
        
        if (!text) {
          throw error;
        }
      }

      return NextResponse.json({
        message: text,
        parsedData: {
          action: "statistics",
          message: text,
        },
      });
    }

    // Build system prompt with clear instructions for expense input
    const systemPrompt = `You are a helpful expense tracking assistant. Your job is to extract expense information from user messages and return it as JSON.

Today's date: ${todayStr}
Yesterday's date: ${yesterdayStr}

When the user mentions an expense, extract the following information and return ONLY a valid JSON object (no other text):
{
  "action": "save_expense",
  "date": "YYYY-MM-DD",
  "amount": number (integer only, no commas),
  "description": "short description"
}

Rules:
1. If date is mentioned as "오늘" or "today", use: ${todayStr}
2. If date is mentioned as "어제" or "yesterday", use: ${yesterdayStr}
3. If no date is mentioned, use: ${todayStr}
4. Extract amount as a number (e.g., "2만원" = 20000, "15000원" = 15000, "1.5만원" = 15000)
5. Description should be short and clear (e.g., "택시", "점심", "커피")
6. If you cannot extract date or amount, return:
   {
     "action": "ask_clarification",
     "message": "질문 메시지"
   }

Examples:
User: "오늘 점심 15000원"
Response: {"action": "save_expense", "date": "${todayStr}", "amount": 15000, "description": "점심"}

User: "어제 택시 탔는데 2만원 나왔어"
Response: {"action": "save_expense", "date": "${yesterdayStr}", "amount": 20000, "description": "택시"}

User: "커피 5000원"
Response: {"action": "save_expense", "date": "${todayStr}", "amount": 5000, "description": "커피"}

User: "안녕하세요"
Response: {"action": "chat", "message": "안녕하세요! 지출 내역을 말씀해주시면 기록해드릴게요."}

Now process this user message: "${message}"`;

    let result;
    let response;
    let text;
    let modelError: any = null;
    
    // Try the primary model first
    try {
      result = await model.generateContent(systemPrompt);
      response = await result.response;
      text = response.text().trim();
    } catch (error: any) {
      modelError = error;
      console.error("Error with primary model:", error.message);
      
      // If model not found, try alternative models
      if (error.message?.includes("not found") || error.message?.includes("404")) {
        const alternativeModels = modelNamesToTry.filter(name => name !== workingModelName);
        
        for (const altModelName of alternativeModels) {
          try {
            console.log(`Trying alternative model: ${altModelName}`);
            const altModel = genAI.getGenerativeModel({ model: altModelName });
            result = await altModel.generateContent(systemPrompt);
            response = await result.response;
            text = response.text().trim();
            console.log(`Successfully using model: ${altModelName}`);
            break;
          } catch (e: any) {
            console.log(`Model ${altModelName} also failed:`, e.message);
            continue;
          }
        }
      }
      
      // If still no success, throw error
      if (!text) {
        const errorDetails = modelError?.message || "알 수 없는 오류";
        throw new Error(
          `모델을 사용할 수 없습니다: ${errorDetails}\n\n` +
          `해결 방법:\n` +
          `1. Google AI Studio(https://aistudio.google.com/)에서 API 키 확인\n` +
          `2. API 키가 유효하고 Gemini API 접근 권한이 있는지 확인\n` +
          `3. .env.local 파일의 GEMINI_API_KEY가 올바른지 확인\n` +
          `4. 개발 서버 재시작: npm run dev`
        );
      }
    }

    // Try to parse JSON from response
    let parsedResponse = null;
    let userMessage = text;

    try {
      // Look for JSON in the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResponse = JSON.parse(jsonMatch[0]);
        
        // Validate and normalize the response
        if (parsedResponse.action === "save_expense") {
          // Ensure date is set
          if (!parsedResponse.date) {
            parsedResponse.date = todayStr;
          } else {
            // Parse relative dates
            parsedResponse.date = parseRelativeDate(parsedResponse.date);
          }
          
          // Ensure amount is a number
          if (typeof parsedResponse.amount === "string") {
            // Remove commas and convert
            parsedResponse.amount = parseInt(parsedResponse.amount.replace(/,/g, ""));
          }
          
          // Validate required fields
          if (!parsedResponse.amount || !parsedResponse.description) {
            parsedResponse = {
              action: "ask_clarification",
              message: "날짜와 금액, 내용을 모두 알려주세요. 예: '오늘 점심 15000원'",
            };
          }
        }
      }
    } catch (e) {
      console.error("Error parsing JSON:", e);
      // If parsing fails, treat as regular chat message
      parsedResponse = {
        action: "chat",
        message: text,
      };
    }

    return NextResponse.json({
      message: userMessage,
      parsedData: parsedResponse,
    });
  } catch (error: any) {
    console.error("Error calling Gemini API:", error);
    return NextResponse.json(
      { 
        error: "Failed to get AI response",
        message: error.message || "AI 응답을 받는 중 오류가 발생했습니다. 다시 시도해주세요.",
      },
      { status: 500 }
    );
  }
}

