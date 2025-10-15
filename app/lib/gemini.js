import { GoogleGenerativeAI } from '@google/generative-ai';

// API 키를 사용하여 Gemini 클라이언트 초기화
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

/**
 * Gemini API에 프롬프트를 보내고 스트리밍 응답을 처리하는 함수
 * @param {string} prompt - 사용자 입력 메시지
 * @param {string} language - 응답 언어 ('ko' 또는 'en')
 * @param {Array} shortcuts - 숏컷 목록
 * @returns {ReadableStream} - Gemini API의 스트리밍 응답
 */
export async function getGeminiStream(prompt, language = 'ko', shortcuts = []) {
  try {
    const languageInstruction = language === 'en' 
        ? "Please respond in English." 
        : "반드시 한국어로 답변해주세요.";

    const shortcutList = shortcuts.length > 0
      ? `Here is a list of available shortcuts the user can use:\n${JSON.stringify(shortcuts, null, 2)}`
      : "There are no shortcuts available.";

    const systemInstruction = `You are a helpful assistant. Your primary task is to analyze the user's prompt and determine if it relates to any of the available shortcuts.

1.  **Review Shortcuts**: First, review the following list of shortcuts:
    ${shortcutList}

2.  **Analyze Prompt**: Compare the user's prompt with the 'title' and 'description' of each shortcut.

3.  **Generate Response**:
    * **Single Match**: If the prompt is strongly related to a SINGLE shortcut, respond ONLY with: "혹시 [BUTTON:{shortcut.title}] 기능이 필요하신가요?" (or in English: "Are you perhaps looking for the '[BUTTON:{shortcut.title}]' feature?").
    * **Multiple Matches**: If the prompt could relate to MULTIPLE shortcuts, respond ONLY with: "혹시 아래와 같은 기능이 필요하신가요?" (or in English: "Are you perhaps looking for one of the following features?") followed by each recommended shortcut on a NEW LINE, like this:
        [BUTTON:Shortcut Title 1]
        [BUTTON:Shortcut Title 2]
    * **No Match**: If the prompt is a general question or greeting, provide a friendly, conversational response as a general-purpose AI assistant.

**Crucial Formatting Rule**: The text inside [BUTTON:...] MUST EXACTLY MATCH the 'title' of the corresponding shortcut.`;
    
    const fullPrompt = `${systemInstruction}\n\n${languageInstruction}\n\nUser: ${prompt}`;
    
    const result = await model.generateContentStream(fullPrompt);
    
    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of result.stream) {
          const chunkText = chunk.text();
          controller.enqueue(new TextEncoder().encode(chunkText));
        }
        controller.close();
      },
    });

    return stream;
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error("Failed to get response from Gemini API.");
  }
}