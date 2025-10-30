import { GoogleGenerativeAI } from '@google/generative-ai';

// API 키를 사용하여 Gemini 클라이언트 초기화
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-2.0-flash",
    generationConfig: {
        responseMimeType: "application/json",
    }
});

/**
 * Gemini API에 프롬프트를 보내고, 분석된 응답과 슬롯을 JSON으로 반환하는 함수
 * @param {string} prompt - 사용자 입력 메시지
 * @param {string} language - 응답 언어 ('ko' 또는 'en')
 * @param {Array} shortcuts - 숏컷 목록
 * @returns {Promise<object>} - { response: "챗봇 답변", slots: { key: value, ... } } 형태의 객체
 */
export async function getGeminiResponseWithSlots(prompt, language = 'ko', shortcuts = []) {
  try {
    const languageInstruction = language === 'en' 
        ? "Please construct your 'response' field in English." 
        : "반드시 'response' 필드는 한국어로 작성해주세요.";

    const shortcutList = shortcuts.length > 0
      ? `Here is a list of available shortcuts the user can use:\n${JSON.stringify(shortcuts, null, 2)}`
      : "There are no shortcuts available.";

    const systemInstruction = `You are a powerful AI assistant that analyzes user input, extracts key information (slots), and generates a response. Your output MUST be a valid JSON object with two fields: "response" and "slots".

1.  **Analyze the user's prompt**: Identify key entities like locations, dates, times, names, numbers, etc.
2.  **Populate the "slots" object**: Create a key-value pair for each extracted entity. For example, if the user says "I want to go to Jeju Island on November 5th", the slots should be \`{ "destination": "Jeju Island", "date": "November 5th" }\`. If no specific entities are found, return an empty object \`{}\`.
3.  **Generate the "response" string**:
    * If the user's prompt is strongly related to a shortcut from the list below, recommend it using the format: "혹시 아래와 같은 기능이 필요하신가요?\\n\\n[BUTTON:{shortcut.title}]".
    * If it relates to multiple shortcuts, use the format: "혹시 아래와 같은 기능이 필요하신가요?\\n[BUTTON:Shortcut 1]\\n\\n[BUTTON:Shortcut 2]".
    * Otherwise, provide a general, helpful conversational response.
4.  **Combine into a single JSON object** and return it.

**Available Shortcuts**:
${shortcutList}
`;
    
    const fullPrompt = `${systemInstruction}\n\n${languageInstruction}\n\nUser: ${prompt}`;
    
    const result = await model.generateContent(fullPrompt);
    const responseText = result.response.text();
    
    // Gemini가 반환한 JSON 문자열을 파싱
    return JSON.parse(responseText);

  } catch (error) {
    console.error("Gemini API Error:", error);
    // 오류 발생 시, 일반 텍스트 응답처럼 보이도록 폴백 JSON 객체를 반환
    return {
        response: "죄송합니다, 답변을 생성하는 데 문제가 발생했습니다.",
        slots: {}
    };
  }
}