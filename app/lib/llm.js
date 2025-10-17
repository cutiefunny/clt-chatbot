import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY);

// JSON 응답 전용 모델
const model = genAI.getGenerativeModel({ 
    model: "gemini-2.0-flash",
    generationConfig: {
        responseMimeType: "application/json",
    }
});

// 스트리밍 응답 전용 모델
const streamingModel = genAI.getGenerativeModel({ 
    model: "gemini-2.0-flash"
});


/**
 * 선택된 LLM 공급자에 따라 API를 호출하고, 분석된 응답과 슬롯을 JSON으로 반환하는 함수
 * @param {string} prompt - 사용자 입력 메시지
 * @param {string} language - 응답 언어 ('ko' 또는 'en')
 * @param {Array} shortcuts - 숏컷 목록
 * @param {string} llmProvider - 사용할 LLM ('gemini' or 'flowise')
 * @param {string} flowiseApiUrl - Flowise API URL
 * @returns {Promise<object|ReadableStream>} - Gemini/Flowise 스트림의 경우 ReadableStream, 에러 시 JSON 객체를 반환
 */
export async function getLlmResponse(prompt, language = 'ko', shortcuts = [], llmProvider, flowiseApiUrl) {
    if (llmProvider === 'flowise') {
        return getFlowiseResponse(prompt, flowiseApiUrl);
    }
    
    // Gemini 스트리밍 응답을 기본으로 사용
    return getGeminiStreamingResponse(prompt, language, shortcuts);
}

// --- 👇 [수정된 부분] ---
async function getFlowiseResponse(prompt, apiUrl) {
    if (!apiUrl) {
        return new ReadableStream({
            start(controller) {
                controller.enqueue("Flowise API URL이 설정되지 않았습니다. 관리자 설정에서 URL을 입력해주세요.");
                controller.close();
            }
        });
    }

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: prompt }),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error("Flowise API Error:", errorBody);
            throw new Error(`Flowise API request failed with status ${response.status}`);
        }

        // 스트림을 읽어서 JSON으로 파싱하고 'text' 필드만 다시 스트림으로 만듭니다.
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            fullResponse += decoder.decode(value);
        }

        const jsonData = JSON.parse(fullResponse);
        let responseText = jsonData.text || "죄송합니다, Flowise에서 응답을 받지 못했습니다.";
        const content = jsonData.agentFlowExecutedData[7].data.input.messages[6].content || "not found";
        const contentJson = JSON.parse(content);
        const scenarioId = contentJson[0].scenarioId || "not found";
        const label = contentJson[0].label || "not found";
        //responseText += `\n\n[BUTTON:Execute ${label} (ID: ${scenarioId})]`;
        if (responseText.toLowerCase().includes("change the vessel") || responseText.toLowerCase().includes("booking no")) {
            responseText += `\n\n[BUTTON:Vessel Schedule]`;
        }
        
        return new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode(responseText));
                controller.close();
            }
        });

    } catch (error) {
        console.error("Flowise API call failed:", error);
        return new ReadableStream({
            start(controller) {
                controller.enqueue("죄송합니다, Flowise API 호출 중 문제가 발생했습니다.");
                controller.close();
            }
        });
    }
}
// --- 👆 [여기까지] ---

async function getGeminiStreamingResponse(prompt, language = 'ko', shortcuts = []) {
  try {
    const languageInstruction = language === 'en' 
        ? "Please construct your 'response' field in English." 
        : "반드시 'response' 필드는 한국어로 작성해주세요.";

    const shortcutList = shortcuts.length > 0
      ? `Here is a list of available shortcuts the user can use:\n${JSON.stringify(shortcuts, null, 2)}`
      : "There are no shortcuts available.";

    const systemInstruction = `You are a powerful AI assistant. Your task is to analyze user input and generate a response in two parts, separated by '|||'.
1.  **First Part (JSON object for slots)**: Analyze the user's prompt to identify key entities (like locations, dates, times, names, etc.). Create a JSON object with a single key "slots" containing these key-value pairs. If no specific entities are found, the value should be an empty object {}. Output this entire JSON object on a single line.
2.  **Second Part (Natural Language Response)**: After the JSON object and the '|||' separator, provide a helpful, conversational response to the user's prompt.
    * If the user's prompt is strongly related to a shortcut from the list below, recommend it using the format: "혹시 아래와 같은 기능이 필요하신가요?\\n\\n[BUTTON:{shortcut.title}]".
    * If it relates to multiple shortcuts, use the format: "혹시 아래와 같은 기능이 필요하신가요?\\n[BUTTON:Shortcut 1]\\n\\n[BUTTON:Shortcut 2]".
    * Otherwise, provide a general, helpful conversational response.

**EXAMPLE OUTPUT FORMAT**:
{"slots":{"destination":"Jeju Island","date":"November 5th"}}|||네, 11월 5일에 제주도로 가시는군요! 어떤 도움이 필요하신가요?

**Available Shortcuts**:
${shortcutList}
`;
    
    const fullPrompt = `${systemInstruction}\n\n${languageInstruction}\n\nUser: ${prompt}`;
    
    const result = await streamingModel.generateContentStream(fullPrompt);
    
    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of result.stream) {
          const chunkText = chunk.text();
          controller.enqueue(new TextEncoder().encode(chunkText));
        }
        controller.close();
      }
    });

    return stream;

  } catch (error) {
    console.error("Gemini API Error:", error);
    return new ReadableStream({
      start(controller) {
        const errorMessage = "죄송합니다, 답변을 생성하는 데 문제가 발생했습니다.";
        controller.enqueue(new TextEncoder().encode(errorMessage));
        controller.close();
      }
    });
  }
}