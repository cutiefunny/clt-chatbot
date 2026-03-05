// app/lib/streamProcessors.js
import { locales } from "./locales";

// --- 👇 [수정] chartDataText 변수 추가 ---
export async function* processFlowiseStream(reader, decoder, language) {
  let buffer = "";
  let thinkingMessageReplaced = false;
  let collectedText = ""; // 스트림 전체 텍스트 수집
  let buttonText = ""; // 추출된 버튼 텍스트
  let chartDataText = ""; // [추가] 추출된 차트 데이터 (JSON 문자열)
  let extractedSlots = {}; // 추출된 슬롯
  // const { language } = get(); // [제거]

  // --- 👇 [제거] 차트 테스트를 위한 Mock 데이터 ---
  // const mockChartData = { ... };
  // --- 👆 [제거] ---

  try {
    let idleTimeoutId;
    while (true) {
      const readPromise = reader.read();
      const timeoutPromise = new Promise((_, reject) => {
        idleTimeoutId = setTimeout(() => reject(new Error("Stream read timeout (idle for 30s)")), 30000);
      });

      const { value, done } = await Promise.race([readPromise, timeoutPromise]);
      clearTimeout(idleTimeoutId);

      if (done) break; // 스트림 종료
      if (!value) continue;

      let chunk;
      try {
        chunk = decoder.decode(value, { stream: true });
      } catch (e) {
        console.warn("Flowise stream decoding error:", e);
        chunk = "";
      }

      buffer += chunk;

      let messageEndIndex;
      while ((messageEndIndex = buffer.indexOf("\n\n")) !== -1) {
        const messageChunk = buffer.slice(0, messageEndIndex);
        buffer = buffer.slice(messageEndIndex + 2);

        if (!messageChunk.trim()) continue;

        const lines = messageChunk.split("\n");
        let eventType = "";
        let dataPayload = "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            eventType = line.substring(6).trim();
          } else if (line.startsWith("data:")) {
            dataPayload = line.substring(5).trim();
          }
        }

        if (dataPayload === "[DONE]") {
          console.log("[Flowise Stream] Stream ended");
          continue;
        }

        if (!dataPayload) continue;

        let data;
        try {
          data = JSON.parse(dataPayload);
          // If the event type is provided, map it to the structure expected by the rest of the code
          if (eventType && !data.event) {
            data = { event: eventType, data: data };
          }
        } catch (e) {
          console.warn("[Flowise Stream] Failed to parse JSON data payload:", dataPayload);
          continue;
        }

        console.log("[Flowise Stream Event]", data);

        let textChunk = "";

        if (
          data.event === "agentFlowExecutedData" &&
          Array.isArray(data.data) &&
          data.data.length > 0
        ) {
          const lastData = data.data[data.data.length - 1];
          if (lastData?.data?.output?.content) {
            textChunk = lastData.data.output.content;
            if (typeof textChunk === "string") {
              let isJsonString = false;
              try {
                const parsed = JSON.parse(textChunk);
                if (parsed && typeof parsed === "object") {
                  isJsonString = true;
                }
              } catch (e) {
                isJsonString = false;
              }
              if (isJsonString) {
                console.log(
                  "[Flowise Stream] Ignoring JSON 'output.content':",
                  textChunk
                );
              } else {
                console.log(
                  "[Flowise Stream] Ignoring non-JSON string 'output.content' (intermediate data):",
                  textChunk
                );
              }
            } else {
              console.log(
                "[Flowise Stream] Ignoring non-string 'output.content':",
                textChunk
              );
            }
          }
        } else if (
          // --- 👇 [유지] 'usedTools' 이벤트 핸들링 로직 ---
          data.event === "usedTools" &&
          Array.isArray(data.data) &&
          data.data.length > 0
        ) {
          const toolName = data.data[0]?.tool;
          const toolOutput = data.data[0]?.toolOutput;

          // 1. 'chartData' tool이 명시적으로 온 경우
          if (toolName === "chartData" && toolOutput && typeof toolOutput === "string") {
            try {
              // toolOutput 자체가 차트 JSON 문자열임
              const parsedChart = JSON.parse(toolOutput);
              // 유효성 검사 (type과 data가 있는지)
              if (parsedChart && parsedChart.type && parsedChart.data) {
                chartDataText = toolOutput; // 원본 JSON 문자열 저장
                console.log(
                  "[Flowise Stream] Extracted chartData from 'chartData' tool:",
                  chartDataText
                );
              } else {
                console.warn(
                  "[Flowise Stream] 'chartData' tool output was not a valid chart object:",
                  toolOutput
                );
              }
            } catch (e) {
              console.warn(
                "[Flowise Stream] Failed to parse 'chartData' tool output:",
                e,
                toolOutput
              );
            }
          }
          // 2. 다른 tool이거나, tool 이름이 명시되지 않은 경우 (기존 로직)
          else if (toolOutput && typeof toolOutput === "string") {
            // scenarioId 또는 question 추출 시도 (차트 데이터가 아닐 경우)
            if (!buttonText) {
              const matchScenarioId = toolOutput.match(
                /"scenarioId"\s*:\s*"([^"]+)"/
              );
              if (matchScenarioId && matchScenarioId[1]) {
                buttonText = `\n\n[BUTTON:${matchScenarioId[1]}]`;
              }
            }
            const matchQuestion = toolOutput.match(
              /"question"\s*:\s*"([^"]+)"/
            );
            if (matchQuestion && matchQuestion[1]) {
              const extractedQuestion = matchQuestion[1];
              if (extractedSlots.question !== extractedQuestion) {
                extractedSlots.question = extractedQuestion;
                console.log(
                  `[Flowise Stream] Extracted question: ${extractedQuestion}`
                );
              }
            }
          }
          // --- 👆 [유지] ---
        } else if (data.event === "token" && typeof data.data === "string") {
          // 토큰 누적
          textChunk = data.data;
          collectedText += textChunk;

          // 실시간으로 누적된 텍스트 전달
          if (textChunk.trim().length > 0) {
            yield { type: "text", data: collectedText, replace: !thinkingMessageReplaced };
            thinkingMessageReplaced = true;
          }
        } else if (data.event === "chunk" && data.data?.response) {
          // 청크 데이터 처리
          textChunk = data.data.response;
          collectedText += textChunk;

          // 실시간으로 누적된 텍스트 전달
          if (textChunk.trim().length > 0) {
            yield { type: "text", data: collectedText, replace: !thinkingMessageReplaced };
            thinkingMessageReplaced = true;
          }
        } else if (data.event === "end" && data.data === "[DONE]") {
          // 스트림 종료 신호
          console.log("[Flowise Stream] Stream ended");
        }
      }
    } // end while

    if (buffer.trim()) {
      try {
        const data = JSON.parse(buffer.trim());
        console.log("[Flowise Stream Event] (Final Buffer)", data);
        let textChunk = "";
        if (data.event === "agentFlowExecutedData" /*...*/) {
          // ...
        } else if (data.event === "token" /*...*/) {
          // ...
        }
      } catch (e) {
        console.warn(
          "Error parsing final Flowise stream buffer:",
          e,
          "Buffer:",
          buffer
        );
      }
    }

    // --- 👇 [수정] yield 순서 변경 (차트 -> 텍스트 -> 버튼) ---

    // 1. 차트 데이터 yield
    if (chartDataText) {
      // 차트 데이터는 텍스트로 수집하지 않고, 별도 타입으로 전달
      yield { type: "chart", data: chartDataText };
    }

    // 2. 수집된 텍스트 전체를 yield
    if (collectedText.trim().length > 0) {
      // thinkingMessageReplaced 플래그는 "텍스트가 수신되었음"을 의미
      yield { type: "text", data: collectedText, replace: thinkingMessageReplaced };
    }

    // 3. 버튼 yield
    if (buttonText) {
      yield { type: "button", data: buttonText };
      collectedText += buttonText; // finalText에도 버튼 텍스트 포함
    }
    // --- 👆 [수정] ---

    const bookingNoRegex = /\b([A-Z]{2}\d{10})\b/i;
    const match = collectedText.match(bookingNoRegex);
    if (match && match[1]) {
      extractedSlots.bkgNr = match[1];
    }

    if (Object.keys(extractedSlots).length > 0) {
      yield { type: "slots", data: extractedSlots };
    }

    yield { type: "finalText", data: collectedText };
  } catch (streamError) {
    console.error("Flowise stream processing error:", streamError);
    // --- 👇 [수정] language 인자 사용 ---
    yield {
      type: "error",
      data: new Error(
        locales[language]?.errorUnexpected || "Error processing stream."
      ),
    };
    // --- 👆 [수정] ---
  }
}

// --- 👇 [수정] get() 인자 제거 (불필요) ---
export async function* processGeminiStream(reader, decoder) {
  let buffer = "";
  let slotsFound = false;
  let thinkingMessageReplaced = false;
  let idleTimeoutId;
  try {
    while (true) {
      const readPromise = reader.read();
      const timeoutPromise = new Promise((_, reject) => {
        idleTimeoutId = setTimeout(() => reject(new Error("Stream read timeout (idle for 30s)")), 30000);
      });
      const { value, done } = await Promise.race([readPromise, timeoutPromise]);
      clearTimeout(idleTimeoutId);

      if (done) break;
      const chunk = decoder.decode(value);
      if (!slotsFound) {
        buffer += chunk;
        const separatorIndex = buffer.indexOf("|||");
        if (separatorIndex !== -1) {
          const jsonPart = buffer.substring(0, separatorIndex);
          const textPart = buffer.substring(separatorIndex + 3);
          buffer = "";
          try {
            const parsed = JSON.parse(jsonPart);
            if (parsed.slots) {
              yield { type: "slots", data: parsed.slots };
              yield { type: "rawResponse", data: parsed };
            }
          } catch (e) {
            console.error("Gemini stream slot parse error:", e, jsonPart);
            yield {
              type: "rawResponse",
              data: { error: "Slot parse fail", data: jsonPart },
            };
          }
          slotsFound = true;
          if (textPart) {
            yield { type: "text", data: textPart, replace: !thinkingMessageReplaced };
            thinkingMessageReplaced = true;
          }
        }
      } else {
        yield { type: "text", data: chunk, replace: !thinkingMessageReplaced };
        thinkingMessageReplaced = true;
      }
    }
  } catch (streamError) {
    console.error("Gemini stream read error:", streamError);
    yield { type: "error", data: streamError };
  }
}
// --- 👆 [수정] ---