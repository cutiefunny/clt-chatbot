// app/lib/chatbotEngine.js

import { fetchScenario, fetchScenarios } from './api';
import { locales } from './locales';
import { nodeHandlers } from './nodeHandlers';
import { FASTAPI_BASE_URL, API_DEFAULTS } from './constants';
import { ChatbotEngine } from "@clt-chatbot/scenario-core";

const SUPPORTED_SCHEMA_VERSION = "1.0";

let cachedScenarioCategories = null;
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5분

/**
 * FastAPI의 /shortcut 엔드포인트에서 시나리오 카테고리 데이터를 가져옵니다.
 * 성능을 위해 5분 동안 캐시된 데이터를 사용합니다.
 * @returns {Promise<Array>} 시나리오 카테고리 배열 (subCategories 포함)
 */
export async function getScenarioCategories() {
    const now = Date.now();
    if (cachedScenarioCategories && (now - lastFetchTime < CACHE_DURATION)) {
        return cachedScenarioCategories;
    }

    try {
        const { TENANT_ID, STAGE_ID, SEC_OFC_ID } = API_DEFAULTS;
        const params = new URLSearchParams({
            ten_id: TENANT_ID,
            stg_id: STAGE_ID,
            sec_ofc_id: SEC_OFC_ID,
        });

        const response = await fetch(`${FASTAPI_BASE_URL}/shortcut?${params.toString()}`);

        if (response.ok) {
            const data = await response.json();
            // --- [수정] 백엔드 명세에 따라 응답 처리 ---
            // API 응답 구조: Array of ShortcutResponse 또는 단일 ShortcutResponse
            // ShortcutResponse: { id, name, order, subCategories }
            let categoryData = data;
            if (!Array.isArray(data)) {
                categoryData = [data];
            }

            cachedScenarioCategories = categoryData;
            lastFetchTime = now;
            console.log('[getScenarioCategories] FastAPI에서 로드 성공:', categoryData);
            return cachedScenarioCategories;
        } else {
            throw new Error(`Failed with status ${response.status}`);
        }
    } catch (error) {
        console.warn("Error fetching scenario categories from FastAPI:", error);
        return [];
    }
}

export async function findActionByTrigger(message) {
    const scenarioCategories = await getScenarioCategories();
    if (!scenarioCategories) return null;

    for (const category of scenarioCategories) {
        for (const subCategory of category.subCategories) {
            for (const item of subCategory.items) {
                // 사용자가 입력한 텍스트가 아이템의 제목과 정확히 일치하는지 확인 (대소문자 무시, 공백 제거)
                if (message.toLowerCase().trim() === item.title.toLowerCase().trim()) {
                    // action 객체 유효성 검사 추가 (type과 value가 있는지)
                    if (item.action && typeof item.action.type === 'string' && typeof item.action.value === 'string') {
                        return item.action;
                    } else {
                        console.warn(`Invalid action found for item "${item.title}":`, item.action);
                        return null; // 유효하지 않으면 null 반환
                    }
                }
            }
        }
    }
    return null; // 일치하는 아이템 없음
}

export const getScenarioList = async () => {
    const scenarios = await fetchScenarios();
    if (!Array.isArray(scenarios)) return [];

    // 백엔드가 [{id, title, ...}] 또는 [id, id, ...] 형태로 줄 수 있어 방어적으로 처리
    return scenarios
        .map((s) => (typeof s === 'string' ? s : s?.id))
        .filter(Boolean);
};

export const getScenario = async (scenarioId) => {
    // scenarioId 유효성 검사 추가
    if (!scenarioId || typeof scenarioId !== 'string') {
        throw new Error(`Invalid scenario ID provided: ${scenarioId}`);
    }
    const scenarioData = await fetchScenario(scenarioId);

    // 스키마 버전 확인
    if (!scenarioData?.version || scenarioData.version !== SUPPORTED_SCHEMA_VERSION) {
        console.warn(
            `Scenario "${scenarioId}" has unsupported schema version "${scenarioData?.version}". Expected "${SUPPORTED_SCHEMA_VERSION}". Proceeding with caution.`
        );
    }

    return scenarioData;
};

// [NEW] Helper instance for basic utilities that don't depend on specific scenario data
const utilsEngine = new ChatbotEngine({ nodes: [], edges: [] });

/**
 * Re-exporting core utilities for compatibility with existing components.
 */
export const interpolateMessage = (message, slots) => utilsEngine.interpolateMessage(message, slots);
export const getDeepValue = (obj, path) => utilsEngine.getDeepValue(obj, path);

export const validateInput = (value, validation, language = 'ko') => {
    if (!validation) return { isValid: true };
    const t = (key, ...args) => {
        const msgOrFn = locales[language]?.[key] || locales['en']?.[key] || key;
        return typeof msgOrFn === 'function' ? msgOrFn(...args) : msgOrFn;
    };
    const getErrorMessage = (defaultKey) => validation.errorMessage || t(defaultKey);
    const valueStr = String(value ?? '');

    switch (validation.type) {
        case 'email':
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return { isValid: emailRegex.test(valueStr), message: getErrorMessage('validationEmail') };
        case 'phone number':
            const phoneRegex = /^\d{2,3}-\d{3,4}-\d{4}$/;
            return { isValid: phoneRegex.test(valueStr), message: getErrorMessage('validationPhone') };
        case 'custom':
            if (validation.regex) {
                try {
                    const isValid = new RegExp(validation.regex).test(valueStr);
                    return { isValid, message: isValid ? '' : getErrorMessage('validationFormat') };
                } catch (e) {
                    console.error("Invalid regex in validation:", validation.regex, e);
                    return { isValid: false, message: t('validationRegexError') };
                }
            }
            if (validation.startDate && validation.endDate) {
                const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                if (!dateRegex.test(valueStr)) return { isValid: false, message: getErrorMessage('validationFormat') };
                try {
                    const selectedDate = new Date(valueStr);
                    const startDate = new Date(validation.startDate);
                    const endDate = new Date(validation.endDate);
                    selectedDate.setHours(0, 0, 0, 0);
                    startDate.setHours(0, 0, 0, 0);
                    endDate.setHours(0, 0, 0, 0);
                    const isValid = selectedDate >= startDate && selectedDate <= endDate;
                    return { isValid, message: isValid ? '' : t('validationDateRange', validation.startDate, validation.endDate) };
                } catch (e) {
                    console.error("Invalid date format for range validation:", valueStr, e);
                    return { isValid: false, message: getErrorMessage('validationFormat') };
                }
            }
            return { isValid: true };
        case 'today after':
            const dateRegexAfter = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegexAfter.test(valueStr)) return { isValid: false, message: getErrorMessage('validationFormat') };
            try {
                const selectedDate = new Date(valueStr);
                const today = new Date();
                selectedDate.setHours(0, 0, 0, 0);
                today.setHours(0, 0, 0, 0);
                const isValid = selectedDate >= today;
                return { isValid, message: isValid ? '' : t('validationDateAfter') };
            } catch (e) {
                console.error("Invalid date format for 'today after' validation:", valueStr, e);
                return { isValid: false, message: getErrorMessage('validationFormat') };
            }
        case 'today before':
            const dateRegexBefore = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegexBefore.test(valueStr)) return { isValid: false, message: getErrorMessage('validationFormat') };
            try {
                const selectedDate = new Date(valueStr);
                const today = new Date();
                selectedDate.setHours(0, 0, 0, 0);
                today.setHours(0, 0, 0, 0);
                const isValid = selectedDate <= today;
                return { isValid, message: isValid ? '' : t('validationDateBefore') };
            } catch (e) {
                console.error("Invalid date format for 'today before' validation:", valueStr, e);
                return { isValid: false, message: getErrorMessage('validationFormat') };
            }
        case 'text':
            return { isValid: true };
        case 'required':
            return {
                isValid: valueStr.trim().length > 0,
                message: valueStr.trim().length > 0 ? '' : (t('validationRequired') || 'This field is required.')
            };
        default:
            console.warn(`Unknown validation type: ${validation.type}`);
            return { isValid: true };
    }
};


export async function runScenario(scenario, scenarioState, message, slots, scenarioSessionId, language) {
    if (!scenario || typeof scenario !== 'object' || !scenarioState || typeof scenarioState !== 'object') {
        console.error("runScenario called with invalid scenario or state:", { scenario, scenarioState });
        const errorMsg = locales[language]?.errorUnexpected || 'Scenario execution error.';
        return { type: 'scenario_end', message: errorMsg, scenarioState: null, slots: slots || {}, events: [] };
    }

    const { scenarioId, currentNodeId, awaitingInput } = scenarioState;
    let currentId = currentNodeId;
    let newSlots = { ...slots }; // 슬롯 복사
    const allEvents = []; // 이벤트 누적 배열
    const engine = new ChatbotEngine({ nodes: scenario.nodes || [], edges: scenario.edges || [] });

    // 1. 사용자 입력 처리 (awaitingInput 상태일 때)
    if (awaitingInput) {
        const currentNode = scenario.nodes?.find(n => n.id === currentId);
        if (!currentNode) {
            console.error(`Error in runScenario: Current node "${currentId}" not found during input processing.`);
            const errorMsg = locales[language]?.errorUnexpected || 'Scenario state error.';
            return { type: 'scenario_end', message: errorMsg, scenarioState: null, slots: newSlots, events: [] };
        }
        // 입력값 유효성 검사
        const validation = currentNode.data?.validation;
        const inputText = message?.text ?? '';
        const { isValid, message: validationMessage } = validateInput(inputText, validation, language);

        if (!isValid) {
            // 유효성 검사 실패 시, 현재 노드 유지하고 오류 메시지 반환
            return {
                type: 'scenario_validation_fail',
                message: validationMessage,
                nextNode: currentNode,
                scenarioState: scenarioState,
                slots: newSlots,
                events: allEvents,
            };
        }
        // 유효성 검사 통과 시 슬롯 업데이트
        if (currentNode.data?.slot) {
            newSlots[currentNode.data.slot] = inputText;
        } else {
            console.warn(`Node "${currentId}" awaited input but has no slot defined.`);
        }
    }

    // 2. 다음 노드 결정
    let currentNode = engine.getNextNode(currentId, message?.sourceHandle, newSlots);

    // 3. 비대화형 노드 자동 진행 루프
    while (currentNode) {
        const handler = nodeHandlers[currentNode.type]; // nodeHandlers에서 핸들러 가져오기

        if (handler) {
            try { // 핸들러 실행 오류 처리
                // 핸들러 실행 (delay 핸들러는 await Promise 포함)
                const result = await handler(currentNode, scenario, newSlots, scenarioSessionId, language, engine); // language, engine 전달

                if (!result) { // 핸들러가 유효하지 않은 결과 반환 시
                    throw new Error(`Handler for node type "${currentNode.type}" (ID: ${currentNode.id}) returned invalid result.`);
                }

                newSlots = result.slots || newSlots; // 슬롯 업데이트
                if (result.events) allEvents.push(...result.events); // 이벤트 누적

                // 핸들러가 현재 노드를 다시 반환하면 (대화형 노드), 루프 중단
                if (result.nextNode && result.nextNode.id === currentNode.id) {
                    currentNode = result.nextNode;
                    break;
                }
                // 다음 노드로 진행
                currentNode = result.nextNode;

            } catch (handlerError) { // 핸들러 실행 중 오류 발생 시
                console.error(`Error executing handler for node ${currentNode?.id} (${currentNode?.type}):`, handlerError);
                const errorMsg = locales[language]?.errorUnexpected || 'An error occurred during scenario execution.';
                // 오류 발생 시 시나리오 종료 처리
                return { type: 'scenario_end', message: errorMsg, scenarioState: null, slots: newSlots, events: allEvents, status: 'failed' }; // status: 'failed' 추가
            }
        } else { // 핸들러가 없는 노드 타입일 경우
            console.warn(`No handler found for node type: ${currentNode.type}. Ending scenario flow.`);
            currentNode = null; // 루프 종료
        }
    } // End of while loop

    // 4. 최종 결과 반환 (대화형 노드에서 멈췄거나, 시나리오 종료)
    if (currentNode) { // 대화형 노드에서 멈춘 경우
        console.log(`[runScenario] Interactive node ${currentNode.id} reached. Awaiting input.`);

        try {
            let nodeToReturn;
            try {
                nodeToReturn = structuredClone(currentNode); // 원본 복사
            } catch (e) {
                console.warn("[runScenario] structuredClone failed for node, fallback to JSON.parse", e);
                nodeToReturn = JSON.parse(JSON.stringify(currentNode));
            }

            // Form 노드 기본값 슬롯 업데이트 로직
            if (nodeToReturn.type === 'form') {
                let initialSlotsUpdate = {};
                (nodeToReturn.data.elements || []).forEach(element => {
                    if (element.name && element.defaultValue !== undefined && element.defaultValue !== null && String(element.defaultValue).trim() !== '') {
                        let resolvedValue = engine.interpolateMessage(String(element.defaultValue), newSlots);
                        if (element.type === 'checkbox' && !Array.isArray(element.defaultValue)) {
                            resolvedValue = typeof element.defaultValue === 'string'
                                ? element.defaultValue.split(',').map(s => s.trim())
                                : [resolvedValue];
                        }
                        if (newSlots[element.name] === undefined) {
                            initialSlotsUpdate[element.name] = resolvedValue;
                        }
                    }
                });
                if (Object.keys(initialSlotsUpdate).length > 0) {
                    newSlots = { ...newSlots, ...initialSlotsUpdate };
                    console.log(`[runScenario] Applied default values for form node ${currentNode.id}. Updated slots:`, initialSlotsUpdate);
                }
            }

            // 반환 전 보간 로직 강화 (업데이트된 newSlots 사용)
            if (nodeToReturn.data) {
                if (nodeToReturn.data.content) nodeToReturn.data.content = engine.interpolateMessage(nodeToReturn.data.content, newSlots);
                if (nodeToReturn.type === 'iframe' && nodeToReturn.data.url) nodeToReturn.data.url = engine.interpolateMessage(nodeToReturn.data.url, newSlots);
                if (nodeToReturn.type === 'link' && nodeToReturn.data.display) nodeToReturn.data.display = engine.interpolateMessage(nodeToReturn.data.display, newSlots);
                if (nodeToReturn.type === 'form' && nodeToReturn.data.title) nodeToReturn.data.title = engine.interpolateMessage(nodeToReturn.data.title, newSlots);
                if (nodeToReturn.type === 'form' && Array.isArray(nodeToReturn.data.elements)) {
                    nodeToReturn.data.elements.forEach(el => {
                        if (el.label) el.label = engine.interpolateMessage(el.label, newSlots);
                        if (el.placeholder) el.placeholder = engine.interpolateMessage(el.placeholder, newSlots);
                        if ((el.type === 'dropbox' || el.type === 'checkbox') && Array.isArray(el.options)) {
                            el.options = el.options.map(opt => typeof opt === 'string' ? engine.interpolateMessage(opt, newSlots) : opt);
                        }
                    });
                }
                if (nodeToReturn.type === 'branch' && Array.isArray(nodeToReturn.data.replies)) {
                    nodeToReturn.data.replies.forEach(reply => { if (reply.display) reply.display = engine.interpolateMessage(reply.display, newSlots); });
                }
            }

            // awaitingInput 상태 결정 로직 수정
            const isAwaiting = engine.isInteractiveNode(nodeToReturn);

            return {
                type: 'scenario',
                nextNode: nodeToReturn,
                scenarioState: { scenarioId, currentNodeId: nodeToReturn.id, awaitingInput: isAwaiting },
                slots: newSlots,
                events: allEvents,
            };
        } catch (processingError) {
            console.error(`Error during interactive node processing for node ${currentNode.id}:`, processingError);
            const errorMsg = locales[language]?.errorUnexpected || 'Scenario data processing error.';
            return { type: 'scenario_end', message: errorMsg, scenarioState: null, slots: newSlots, events: allEvents, status: 'failed' };
        }

    } else { // 시나리오 종료
        console.log(`[runScenario] Scenario ${scenarioId} ended.`);
        const endMessage = engine.interpolateMessage(locales[language]?.scenarioEnded(scenarioId) || 'Scenario ended.', newSlots);
        return {
            type: 'scenario_end',
            message: endMessage,
            scenarioState: null,
            slots: newSlots,
            events: allEvents,
            status: newSlots.apiFailed ? 'failed' : 'completed',
        };
    }
}