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

  // --- 👇 [추가] 차트 테스트를 위한 Mock 데이터 ---
  // Re-charts 또는 Chart.js에서 사용하기 좋은 형식의 Mock 데이터
  const mockChartData = {
    type: "bar", // 차트 타입 bar(막대), line(선), pie(원형)
    data: {
      labels: ["FAIRWAY TRANSPORT CO.,LTD.", "CMA CGM MARSEILLES", "MAERSK LINE", "MAXPEED CO., LTD.", "SAMSUNG ELECTRONICS CO.,LTD."],
      datasets: [
        {
          label: "Outstanding (USD)",
          data: [11,400,772.87, 553,600.00, 318,750.00, 249,399.67, 54,371.38],
          backgroundColor: "rgba(99, 102, 241, 0.6)",
          borderColor: "rgba(99, 102, 241, 1)",
          borderWidth: 1,
        }
      ],
    },
    options: {
      indexAxis: 'y',  //막대가 가로인지 세로인지 지정 
      responsive: true,
      plugins: {
        legend: {
          position: "top",
        },
        title: {
          display: true,
          text: "Top 5 Customers by Outstanding Amount (USD) for SELSC Office (2025.11.11)",
        },
      },
      scales: {
        y: {
          beginAtZero: true,
        },
      },
    },
  };
  // --- 👆 [추가] ---

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

            // --- 👇 [추가] 차트 데이터 추출 로직 ---
            // "chartData": "{\"type\":\"bar\",...}" 와 같이 stringify된 JSON이 값으로 오는 경우
            const matchChartData = toolOutput.match(/"chartData"\s*:\s*"(.*?)"/);
            if (matchChartData && matchChartData[1]) {
              try {
                // 1. 캡처된 문자열 (e.g., {\"type\":\"bar\",...})의 이스케이프를 해제합니다.
                const unescapedString = matchChartData[1].replace(/\\"/g, '"');
                // 2. 이스케이프가 해제된 문자열이 유효한 JSON인지 확인 (선택 사항이지만 권장)
                JSON.parse(unescapedString);
                // 3. 유효한 JSON 문자열을 chartDataText에 할당
                chartDataText = unescapedString;
                console.log("[Flowise Stream] Extracted chartData (stringified):", chartDataText);
              } catch (e) {
                console.warn("[Flowise Stream] Failed to parse extracted chartData:", e, matchChartData[1]);
              }
            }
            
            // --- 👇 [추가] 요청대로 테스트용 Mock 데이터를 하드코딩 ---
            // (참고: 실제 운영 시에는 위 matchChartData 로직만 사용하고 이 줄은 제거해야 합니다)
            chartDataText = JSON.stringify(mockChartData);
            console.log("[Flowise Stream] HARDCODED mock chartData for testing.");
            // --- 👆 [추가] ---

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

    // --- 👇 [추가] 차트 데이터 yield (buttonText 이후) ---
    if (chartDataText) {
      // 차트 데이터는 텍스트로 수집하지 않고, 별도 타입으로 전달
      yield { type: "chart", data: chartDataText };
    }
    // --- 👆 [추가] ---

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