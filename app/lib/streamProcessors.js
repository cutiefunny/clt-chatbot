// app/lib/streamProcessors.js
import { locales } from "./locales";

// --- 👇 [수정] get() 대신 language를 인자로 받도록 변경 ---
export async function* processFlowiseStream(reader, decoder, language) {
  let buffer = "";
  let thinkingMessageReplaced = false;
  let collectedText = ""; // 스트림 전체 텍스트 수집
  let buttonText = ""; // 추출된 버튼 텍스트
  let extractedSlots = {}; // 추출된 슬롯
  // const { language } = get(); // [제거]

  try {
    while (true) {
      const { value, done } = await reader.read();
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
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim() || line.toLowerCase().startsWith("message:")) continue;

        let jsonString = "";
        if (line.toLowerCase().startsWith("data:")) {
          jsonString = line.substring(line.indexOf(":") + 1).trim();
        } else {
          jsonString = line.trim();
        }

        if (!jsonString || jsonString === "[DONE]") continue;

        let data;
        try {
          data = JSON.parse(jsonString);
        } catch (e) {
          buffer = line + (buffer ? "\n" + buffer : "");
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
          data.event === "usedTools" &&
          Array.isArray(data.data) &&
          data.data.length > 0
        ) {
          const toolOutput = data.data[0]?.toolOutput;
          if (toolOutput && typeof toolOutput === "string") {
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
        } else if (data.event === "token" && typeof data.data === "string") {
          textChunk = data.data;
          if (textChunk.trim().length > 0 && !thinkingMessageReplaced) {
            yield { type: "text", data: textChunk, replace: true };
            thinkingMessageReplaced = true;
          } else if (thinkingMessageReplaced) {
            yield { type: "text", data: textChunk, replace: false };
          }
          collectedText += textChunk;
        } else if (data.event === "chunk" && data.data?.response) {
          textChunk = data.data.response;
          if (textChunk.trim().length > 0 && !thinkingMessageReplaced) {
            yield { type: "text", data: textChunk, replace: true };
            thinkingMessageReplaced = true;
          } else if (thinkingMessageReplaced) {
            yield { type: "text", data: textChunk, replace: false };
          }
          collectedText += textChunk;
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

    if (buttonText) {
      yield { type: "button", data: buttonText };
      collectedText += buttonText;
    }

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
  try {
    while (true) {
      const { value, done } = await reader.read();
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