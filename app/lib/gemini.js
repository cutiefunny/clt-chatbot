import { GoogleGenerativeAI } from '@google/generative-ai';

// API 키를 사용하여 Gemini 클라이언트 초기화
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

/**
 * Gemini API에 프롬프트를 보내고 스트리밍 응답을 처리하는 함수
 * @param {string} prompt - 사용자 입력 메시지
 * @returns {ReadableStream} - Gemini API의 스트리밍 응답
 */
export async function getGeminiStream(prompt) {
  try {
    const result = await model.generateContentStream(prompt);
    
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