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
    // --- 👇 [로그 추가] ---
    console.log(`[getLlmResponse] Provider selected: ${llmProvider}`);
    // --- 👆 [여기까지] ---
    if (llmProvider === 'flowise') {
        return getFlowiseStreamingResponse(prompt, flowiseApiUrl);
    }
    
    // Gemini 스트리밍 응답을 기본으로 사용
    return getGeminiStreamingResponse(prompt, language, shortcuts);
}


/**
 * Flowise API에 스트리밍 요청을 보내고, 응답 스트림(ReadableStream)을 반환합니다.
 * @param {string} prompt - 사용자 입력 메시지
 * @param {string} apiUrl - Flowise API URL
 * @returns {Promise<ReadableStream|object>} - Flowise의 SSE 스트림 또는 에러 객체
 */
async function getFlowiseStreamingResponse(prompt, apiUrl) {
    // --- 👇 [로그 추가] ---
    console.log(`[getFlowiseStreamingResponse] Called with apiUrl: ${apiUrl}`);
    // --- 👆 [여기까지] ---
    if (!apiUrl) {
        // --- 👇 [로그 추가] ---
        console.error("[getFlowiseStreamingResponse] Error: Flowise API URL is not set.");
        // --- 👆 [여기까지] ---
        return {
            response: "Flowise API URL이 설정되지 않았습니다. 관리자 설정에서 URL을 입력해주세요.",
            slots: {}
        };
    }

    try {
        const requestBody = { question: prompt, streaming: true };
        // --- 👇 [로그 추가] ---
        console.log(`[getFlowiseStreamingResponse] Sending request to Flowise: ${apiUrl}`, requestBody);
        // --- 👆 [여기까지] ---
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });

        // --- 👇 [로그 추가] ---
        console.log(`[getFlowiseStreamingResponse] Received response status: ${response.status}`);
        // --- 👆 [여기까지] ---

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`[getFlowiseStreamingResponse] Flowise API Error (${response.status}):`, errorBody);
            throw new Error(`Flowise API request failed with status ${response.status}`);
        }
        
        // --- 👇 [로그 추가] ---
        console.log("[getFlowiseStreamingResponse] Response OK. Returning response body (stream).");
        // --- 👆 [여기까지] ---
        // response.json()을 기다리지 않고 스트림 본문(body)을 즉시 반환
        return response.body;

    } catch (error) {
        console.error("[getFlowiseStreamingResponse] API call failed:", error);
        // 스트림 대신 에러 객체를 반환
        return {
            response: "죄송합니다, Flowise API 호출 중 문제가 발생했습니다.",
            slots: {}
        };
    }
}


async function getGeminiStreamingResponse(prompt, language = 'ko', shortcuts = []) {
  // --- 👇 [로그 추가] ---
  console.log(`[getGeminiStreamingResponse] Called.`);
  // --- 👆 [여기까지] ---
  try {
    const languageInstruction = language === 'en' 
        ? "Please construct your 'response' field in English." 
        : "반드시 'response' 필드는 한국어로 작성해주세요.";

    const shortcutList = shortcuts.length > 0
      ? `Here is a list of available shortcuts the user can use:\n${JSON.stringify(shortcuts, null, 2)}`
      : "There are no shortcuts available.";

    const systemInstruction = `You are a powerful AI assistant. Your task is to analyze user input and generate a response in two parts, separated by '|||'.
1.  **First Part (JSON object for slots)**: Analyze the user's prompt to identify key entities (like locations, dates, times, names, etc.). Create a JSON object with a single key "slots" containing these key-value-pairs. If no specific entities are found, the value should be an empty object {}. Output this entire JSON object on a single line.
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
    
    // --- 👇 [로그 추가] ---
    console.log("[getGeminiStreamingResponse] Sending request to Gemini...");
    // --- 👆 [여기까지] ---
    const result = await streamingModel.generateContentStream(fullPrompt);
    
    // --- 👇 [로그 추가] ---
    console.log("[getGeminiStreamingResponse] Received stream from Gemini. Creating ReadableStream...");
    // --- 👆 [여기까지] ---
    const stream = new ReadableStream({
      async start(controller) {
        // --- 👇 [로그 추가] ---
        console.log("[getGeminiStreamingResponse] ReadableStream started. Reading chunks...");
        // --- 👆 [여기까지] ---
        for await (const chunk of result.stream) {
          const chunkText = chunk.text();
          // console.log("[getGeminiStreamingResponse] Enqueuing chunk:", chunkText); // Chunk 로그는 너무 많을 수 있어 주석 처리
          controller.enqueue(new TextEncoder().encode(chunkText));
        }
        // --- 👇 [로그 추가] ---
        console.log("[getGeminiStreamingResponse] Finished reading chunks. Closing controller.");
        // --- 👆 [여기까지] ---
        controller.close();
      }
    });

    return stream;

  } catch (error) {
    console.error("[getGeminiStreamingResponse] Gemini API Error:", error);
    // 스트리밍 API 실패 시, JSON 객체로 에러 응답 반환
    return {
        response: "죄송합니다, 답변을 생성하는 데 문제가 발생했습니다.",
        slots: {}
    };
  }
}