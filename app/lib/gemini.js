import { GoogleGenerativeAI } from '@google/generative-ai';

// API 키를 사용하여 Gemini 클라이언트 초기화
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

/**
 * Gemini API에 프롬프트를 보내고 스트리밍 응답을 처리하는 함수
 * @param {string} prompt - 사용자 입력 메시지
 * @param {string} language - 응답 언어 ('ko' 또는 'en')
 * @returns {ReadableStream} - Gemini API의 스트리밍 응답
 */
export async function getGeminiStream(prompt, language = 'ko') { // --- 👈 [수정] language 파라미터 추가
  try {
    // --- 👇 [수정된 부분] ---
    const languageInstruction = language === 'en' 
        ? "Please respond in English." 
        : "반드시 한국어로 답변해주세요.";
    
    const fullPrompt = `${languageInstruction}\n\nUser: ${prompt}`;
    const result = await model.generateContentStream(fullPrompt);
    // --- 👆 [여기까지] ---
    
    // ReadableStream으로 변환하여 반환
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