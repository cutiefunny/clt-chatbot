// app/store/slices/scenarioSlice.js
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  getDoc,
  setDoc,
  getDocs,
  query,
  orderBy,
  where,
  deleteDoc,
} from "firebase/firestore";
import { locales } from "../../lib/locales";
import { getErrorKey } from "../../lib/errorHandler";

const FASTAPI_BASE_URL = "https://musclecat-api.vercel.app"; // FastAPI 주소

export const createScenarioSlice = (set, get) => ({
  scenarioStates: {},
  activeScenarioSessionId: null,
  activeScenarioSessions: [],
  scenarioCategories: [],
  availableScenarios: [],
  unsubscribeScenariosMap: {},

  setScenarioSlots: (sessionId, newSlots) => {
    set(state => {
      if (!sessionId || !state.scenarioStates[sessionId]) {
        console.warn(`[setScenarioSlots] Invalid or non-existent scenario session ID: ${sessionId}`);
        return state;
      }
      
      const updatedScenarioState = {
        ...state.scenarioStates[sessionId],
        slots: newSlots,
      };

      return {
        scenarioStates: {
          ...state.scenarioStates,
          [sessionId]: updatedScenarioState,
        }
      };
    });
  },

  loadAvailableScenarios: async () => {
    // --- 👇 [수정] FastAPI 사용 시 ---
    if (get().useFastApi) {
        try {
            const response = await fetch(`${FASTAPI_BASE_URL}/scenarios`);
            if (response.ok) {
                const scenarios = await response.json();
                // API가 카테고리 구조로 준다면 평탄화하거나 그대로 사용
                // 여기서는 시나리오 ID 목록만 추출한다고 가정
                const ids = [];
                if(Array.isArray(scenarios)) {
                    scenarios.forEach(cat => {
                        if(cat.items) cat.items.forEach(item => ids.push(item.id));
                    });
                }
                set({ availableScenarios: ids, scenarioCategories: scenarios });
                return;
            }
        } catch (e) { console.error(e); }
    }
    // --- 👆 [수정] ---

    // 기존 Firebase 로직
    try {
      const scenariosCollection = collection(get().db, "scenarios");
      const querySnapshot = await getDocs(scenariosCollection);
      const scenarioIds = querySnapshot.docs.map((doc) => doc.id);
      set({ availableScenarios: scenarioIds });
    } catch (error) {
      console.error("Error loading available scenarios:", error);
      const { language, showEphemeralToast } = get();
      const errorKey = getErrorKey(error);
      const message =
        locales[language]?.[errorKey] || "Failed to load scenario list.";
      showEphemeralToast(message, "error");
      set({ availableScenarios: [] });
    }
  },

  loadScenarioCategories: async () => {
    // FastAPI 모드에서는 loadAvailableScenarios에서 카테고리도 함께 로드하므로 중복 로드 방지
    if (get().useFastApi) return; 

    try {
      const shortcutRef = doc(get().db, "shortcut", "main");
      const docSnap = await getDoc(shortcutRef);

      if (docSnap.exists() && docSnap.data().categories) {
        set({ scenarioCategories: docSnap.data().categories });
      } else {
        console.log(
          "No shortcut document found, initializing with default data."
        );
        const initialData = [];
        set({ scenarioCategories: initialData });
        await setDoc(shortcutRef, { categories: initialData });
      }
    } catch (error) {
      console.error(
        "Error loading/initializing scenario categories from Firestore.",
        error
      );
      const { language, showEphemeralToast } = get();
      const errorKey = getErrorKey(error);
      const message =
        locales[language]?.[errorKey] || "Failed to load scenario categories.";
      showEphemeralToast(message, "error");
      set({ scenarioCategories: [] });
    }
  },

  saveScenarioCategories: async (newCategories) => {
    const shortcutRef = doc(get().db, "shortcut", "main");
    try {
      await setDoc(shortcutRef, { categories: newCategories });
      set({ scenarioCategories: newCategories });
      return true;
    } catch (error) {
      console.error("Error saving scenario categories to Firestore:", error);
      const { language, showEphemeralToast } = get();
      const errorKey = getErrorKey(error);
      const message =
        locales[language]?.[errorKey] || "Failed to save scenario categories.";
      showEphemeralToast(message, "error");
      return false;
    }
  },

  openScenarioPanel: async (scenarioId, initialSlots = {}) => {
    const {
      user,
      currentConversationId,
      handleEvents,
      language,
      setActivePanel,
      addMessage,
      setForceScrollToBottom,
      showEphemeralToast,
      showScenarioBubbles,
    } = get();
    if (!user) return;

    let conversationId = currentConversationId;
    let newScenarioSessionId = null;

    try {
      try {
        const scenarioRef = doc(get().db, "scenarios", scenarioId);
        await updateDoc(scenarioRef, {
          lastUsedAt: serverTimestamp(),
        });
        console.log(`Updated lastUsedAt for scenario: ${scenarioId}`);
      } catch (error) {
        console.warn(
          `[openScenarioPanel] Failed to update lastUsedAt for scenario ${scenarioId}:`,
          error
        );
      }

      if (!conversationId) {
        const newConversationId = await get().createNewConversation(true);
        if (!newConversationId) {
          throw new Error(
            "Failed to ensure conversation ID for starting scenario."
          );
        }
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("Timeout waiting for conversation load")),
            5000
          );
          const check = () => {
            if (get().currentConversationId === newConversationId) {
              clearTimeout(timeout);
              resolve();
            } else {
              setTimeout(check, 100);
            }
          };
          check();
        });
        conversationId = newConversationId;
      }

      const scenarioSessionsRef = collection(
        get().db,
        "chats",
        user.uid,
        "conversations",
        conversationId,
        "scenario_sessions"
      );
      const newSessionDoc = await addDoc(scenarioSessionsRef, {
        scenarioId: scenarioId,
        status: "starting",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        messages: [],
        state: null,
        slots: initialSlots,
      });
      newScenarioSessionId = newSessionDoc.id;

      setActivePanel("main");
      setForceScrollToBottom(true);

      if (showScenarioBubbles) {
        await addMessage("user", {
          type: "scenario_bubble",
          scenarioSessionId: newScenarioSessionId,
        });
      }

      get().subscribeToScenarioSession(newScenarioSessionId);

      setTimeout(() => {
        setActivePanel("scenario", newScenarioSessionId);
      }, 100);

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: { text: scenarioId },
          scenarioSessionId: newScenarioSessionId,
          slots: initialSlots,
          language: language,
        }),
      });
      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ message: `Server error: ${response.statusText}` }));
        throw new Error(
          errorData.message || `Server error: ${response.statusText}`
        );
      }
      const data = await response.json();

      handleEvents(data.events, newScenarioSessionId, conversationId);

      const sessionRef = doc(
        get().db,
        "chats",
        user.uid,
        "conversations",
        conversationId,
        "scenario_sessions",
        newScenarioSessionId
      );
      let updatePayload = { updatedAt: serverTimestamp() };

      if (data.type === "scenario_start" || data.type === "scenario") {
        updatePayload.slots = { ...initialSlots, ...(data.slots || {}) };
        updatePayload.messages = [];
        updatePayload.state = null;

        if (data.nextNode) {
          if (data.nextNode.type !== "setSlot" && data.nextNode.type !== "set-slot") {
            updatePayload.messages.push({
              id: data.nextNode.id,
              sender: "bot",
              node: data.nextNode,
            });
          }
          const isFirstNodeSlotFillingOrForm =
            data.nextNode.type === "slotfilling" ||
            data.nextNode.type === "form" ||
            (data.nextNode.type === "branch" &&
              data.nextNode.data?.evaluationType !== "CONDITION");
          updatePayload.state = {
            scenarioId: scenarioId,
            currentNodeId: data.nextNode.id,
            awaitingInput: isFirstNodeSlotFillingOrForm,
          };
        } else if (data.message) {
          updatePayload.messages.push({
            id: "end-message",
            sender: "bot",
            text: data.message,
          });
          updatePayload.status = data.status || "completed";
        }
        updatePayload.status = data.status || "active";

        await updateDoc(sessionRef, updatePayload);

        if (
          data.nextNode &&
          data.nextNode.type !== "slotfilling" &&
          data.nextNode.type !== "form" &&
          !(
            data.nextNode.type === "branch" &&
            data.nextNode.data?.evaluationType !== "CONDITION"
          )
        ) {
          await get().continueScenarioIfNeeded(
            data.nextNode,
            newScenarioSessionId
          );
        }
      } else if (data.type === "error") {
        throw new Error(data.message || "Failed to start scenario from API.");
      } else {
        throw new Error(`Unexpected response type from API: ${data.type}`);
      }
    } catch (error) {
      console.error(`Error opening scenario panel for ${scenarioId}:`, error);
      const errorKey = getErrorKey(error);
      const message =
        locales[language]?.[errorKey] || "Failed to start scenario.";
      showEphemeralToast(message, "error");

      if (user && conversationId && newScenarioSessionId) {
        try {
          const sessionRef = doc(
            get().db,
            "chats",
            user.uid,
            "conversations",
            conversationId,
            "scenario_sessions",
            newScenarioSessionId
          );
          await deleteDoc(sessionRef);
          console.log(
            `Cleaned up failed scenario session: ${newScenarioSessionId}`
          );

          if (showScenarioBubbles) {
            set((state) => ({
              messages: state.messages.filter(
                (msg) =>
                  !(
                    msg.type === "scenario_bubble" &&
                    msg.scenarioSessionId === newScenarioSessionId
                  )
              ),
            }));
            console.log(
              `Removed scenario bubble from main chat for session: ${newScenarioSessionId}`
            );
          }
        } catch (cleanupError) {
          console.error(
            `Error cleaning up failed scenario session ${newScenarioSessionId}:`,
            cleanupError
          );
        }
      }
      setActivePanel("main");
    }
  },

  setScenarioSelectedOption: async (scenarioSessionId, messageNodeId, selectedValue) => {
    const { user, currentConversationId, scenarioStates, language, showEphemeralToast } = get();
    if (!user || !currentConversationId || !scenarioSessionId) return;

    const scenarioState = scenarioStates[scenarioSessionId];
    if (!scenarioState) return;

    const originalMessages = Array.isArray(scenarioState.messages) ? scenarioState.messages : [];
    const updatedMessages = originalMessages.map(msg => {
        if (msg.node && msg.node.id === messageNodeId) {
            return { ...msg, selectedOption: selectedValue };
        }
        return msg;
    });

    set(state => ({
        scenarioStates: {
            ...state.scenarioStates,
            [scenarioSessionId]: {
                ...state.scenarioStates[scenarioSessionId],
                messages: updatedMessages,
            },
        },
    }));

    try {
        const sessionRef = doc(get().db, "chats", user.uid, "conversations", currentConversationId, "scenario_sessions", scenarioSessionId);
        await updateDoc(sessionRef, {
            messages: updatedMessages
        });
    } catch (error) {
        console.error("Error updating scenario selected option in Firestore:", error);
        const errorKey = getErrorKey(error);
        const message = locales[language]?.[errorKey] || 'Failed to save selection in scenario.';
        showEphemeralToast(message, 'error');
        set(state => ({
            scenarioStates: {
                ...state.scenarioStates,
                [scenarioSessionId]: {
                  ...state.scenarioStates[scenarioSessionId],
                  messages: originalMessages,
                }
            },
        }));
    }
  },

  subscribeToScenarioSession: (sessionId) => {
    const { user, currentConversationId, unsubscribeScenariosMap, language, showEphemeralToast } = get();
    if (!user || !currentConversationId || unsubscribeScenariosMap[sessionId]) return;

    const sessionRef = doc(get().db, "chats", user.uid, "conversations", currentConversationId, "scenario_sessions", sessionId);
    const unsubscribe = onSnapshot(sessionRef, (doc) => {
      if (doc.exists()) {
        const scenarioData = doc.data();
        set(state => {
            const currentLocalState = state.scenarioStates[sessionId];
            const newScenarioStates = {
                ...state.scenarioStates,
                [sessionId]: {
                    ...(currentLocalState || {}),
                    ...scenarioData
                }
            };
            const newActiveSessions = Object.keys(newScenarioStates);

            return {
                scenarioStates: newScenarioStates,
                activeScenarioSessions: newActiveSessions,
            };
        });
      } else {
        console.log(`Scenario session ${sessionId} not found or deleted.`);
        get().unsubscribeFromScenarioSession(sessionId);
      }
    }, (error) => {
        console.error(`Error listening to scenario session ${sessionId}:`, error);
        const errorKey = getErrorKey(error);
        const message = locales[language]?.[errorKey] || 'Error syncing scenario state.';
        showEphemeralToast(message, 'error');
        get().unsubscribeFromScenarioSession(sessionId);
    });

    set(state => ({
        unsubscribeScenariosMap: {
            ...state.unsubscribeScenariosMap,
            [sessionId]: unsubscribe
        }
    }));
  },

  unsubscribeFromScenarioSession: (sessionId) => {
      set(state => {
          const newUnsubscribeMap = { ...state.unsubscribeScenariosMap };
          if (newUnsubscribeMap[sessionId]) {
              newUnsubscribeMap[sessionId]();
              delete newUnsubscribeMap[sessionId];
          }

          const updatedStates = { ...state.scenarioStates };
          delete updatedStates[sessionId];
          const updatedActiveSessions = Object.keys(updatedStates);

          const shouldResetActivePanel = state.activeScenarioSessionId === sessionId || state.lastFocusedScenarioSessionId === sessionId;

          return {
              unsubscribeScenariosMap: newUnsubscribeMap,
              scenarioStates: updatedStates,
              activeScenarioSessions: updatedActiveSessions,
              ...(shouldResetActivePanel ? {
                  activeScenarioSessionId: null,
                  lastFocusedScenarioSessionId: null,
                  activePanel: 'main'
              } : {})
          };
      });
  },

  unsubscribeAllScenarioListeners: () => {
    const { unsubscribeScenariosMap } = get();
    Object.keys(unsubscribeScenariosMap).forEach(sessionId => {
      get().unsubscribeFromScenarioSession(sessionId);
    });
  },

  endScenario: async (scenarioSessionId, status = 'completed') => {
    const { user, currentConversationId, language, showEphemeralToast } = get(); 
    if (!user || !currentConversationId || !scenarioSessionId) return;

    const sessionRef = doc(get().db, "chats", user.uid, "conversations", currentConversationId, "scenario_sessions", scenarioSessionId);
    
    try {
        await updateDoc(sessionRef, { status, state: null, updatedAt: serverTimestamp() }); 
        
        set(state => {
            const updatedState = state.scenarioStates[scenarioSessionId]
                ? { ...state.scenarioStates[scenarioSessionId], status: status, state: null } 
                : { status: status, state: null }; 

            return {
                scenarioStates: {
                    ...state.scenarioStates,
                    [scenarioSessionId]: updatedState
                },
            };
        });

        console.log(`[endScenario] Scenario ${scenarioSessionId} marked as ${status}. Panel will remain open.`);

    } catch (error) {
        console.error(`Error ending scenario ${scenarioSessionId} with status ${status}:`, error);
        const errorKey = getErrorKey(error);
        const message = locales[language]?.[errorKey] || 'Failed to update scenario status.';
        showEphemeralToast(message, 'error');
    }
  },

  handleScenarioResponse: async (payload) => {
    const { scenarioSessionId } = payload;
    const { handleEvents, showToast, user, currentConversationId, language, endScenario, showEphemeralToast } = get();
    if (!user || !currentConversationId || !scenarioSessionId) return;

    const currentScenario = get().scenarioStates[scenarioSessionId];
    if (!currentScenario) {
        console.warn(`handleScenarioResponse called for non-existent session: ${scenarioSessionId}`);
        showEphemeralToast(locales[language]?.errorUnexpected || 'An unexpected error occurred.', 'error');
        return;
    }
    const existingMessages = Array.isArray(currentScenario.messages) ? currentScenario.messages : [];

    set(state => ({
        scenarioStates: { ...state.scenarioStates, [scenarioSessionId]: { ...currentScenario, isLoading: true } }
    }));

    const sessionRef = doc(get().db, "chats", user.uid, "conversations", currentConversationId, "scenario_sessions", scenarioSessionId);

    try {
        let newMessages = [...existingMessages];

        if (payload.userInput) {
            newMessages.push({ id: `user-${Date.now()}`, sender: 'user', text: payload.userInput });
            try {
                await updateDoc(sessionRef, { messages: newMessages, updatedAt: serverTimestamp() });
            } catch (error) {
                console.error("Error updating user message in Firestore:", error);
                const errorKey = getErrorKey(error);
                const message = locales[language]?.[errorKey] || 'Failed to send message.';
                showEphemeralToast(message, 'error');
                set(state => ({
                  scenarioStates: { ...state.scenarioStates, [scenarioSessionId]: { ...state.scenarioStates[scenarioSessionId], isLoading: false } }
                }));
                return;
            }
        }

        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: {
                sourceHandle: payload.sourceHandle,
                text: payload.userInput
              },
              scenarioState: currentScenario.state,
              slots: { ...currentScenario.slots, ...(payload.formData || {}) },
              language: language,
              scenarioSessionId: scenarioSessionId,
            }),
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: `Server error: ${response.statusText}` }));
            throw new Error(errorData.message || `Server error: ${response.statusText}`);
        }
        const data = await response.json();

        handleEvents(data.events, scenarioSessionId, currentConversationId);

        if (data.nextNode && data.nextNode.type !== 'setSlot' && data.nextNode.type !== 'set-slot') {
            newMessages.push({ id: data.nextNode.id, sender: 'bot', node: data.nextNode });
        } else if (data.message && data.type !== 'scenario_validation_fail') {
            newMessages.push({ id: `bot-end-${Date.now()}`, sender: 'bot', text: data.message });
        }

        let updatePayload = {
            messages: newMessages,
            updatedAt: serverTimestamp(),
        };

        if (data.type === 'scenario_validation_fail') {
            showEphemeralToast(data.message, 'error');
            updatePayload.status = 'active';
        } else if (data.type === 'scenario_end') {
            const finalStatus = data.slots?.apiFailed ? 'failed' : 'completed';
            updatePayload.status = finalStatus;
            updatePayload.state = null;
            updatePayload.slots = data.slots || currentScenario.slots;
            await updateDoc(sessionRef, updatePayload);
            
            endScenario(scenarioSessionId, finalStatus); 
            
            return;
        } else if (data.type === 'scenario') {
            updatePayload.status = 'active';
            updatePayload.state = data.scenarioState;
            updatePayload.slots = data.slots || currentScenario.slots;
        } else if (data.type === 'error') {
            throw new Error(data.message || "Scenario step failed.");
        } else {
            throw new Error(`Unexpected response type from API: ${data.type}`);
        }

        await updateDoc(sessionRef, updatePayload);

        if (data.type === 'scenario' && data.nextNode) {
            const isInteractive = data.nextNode.type === 'slotfilling' ||
                                  data.nextNode.type === 'form' ||
                                  (data.nextNode.type === 'branch' && data.nextNode.data?.evaluationType !== 'CONDITION');
            if (!isInteractive) {
                await get().continueScenarioIfNeeded(data.nextNode, scenarioSessionId);
            }
        }

    } catch (error) {
        console.error(`Error handling scenario response for ${scenarioSessionId}:`, error);
        const errorKey = getErrorKey(error);
        const errorMessage = locales[language]?.[errorKey] || 'An error occurred during the scenario.';
        showEphemeralToast(errorMessage, 'error');

        const errorMessages = [...existingMessages, { id: `bot-error-${Date.now()}`, sender: 'bot', text: errorMessage }];
        try {
            await updateDoc(sessionRef, { messages: errorMessages, status: 'failed', state: null, updatedAt: serverTimestamp() });
            endScenario(scenarioSessionId, 'failed');
        } catch (updateError) {
             console.error(`Failed to update scenario status to failed for ${scenarioSessionId}:`, updateError);
              set(state => ({
                scenarioStates: {
                    ...state.scenarioStates,
                    [scenarioSessionId]: {
                        ...(state.scenarioStates[scenarioSessionId] || {}),
                        messages: errorMessages,
                        status: 'failed',
                        state: null,
                        isLoading: false
                    }
                }
             }));
             endScenario(scenarioSessionId, 'failed');
        }
    } finally {
      set(state => {
         if(state.scenarioStates[scenarioSessionId]) {
            return {
                scenarioStates: { ...state.scenarioStates, [scenarioSessionId]: { ...state.scenarioStates[scenarioSessionId], isLoading: false } }
            };
         }
         return state;
      });
    }
  },

  continueScenarioIfNeeded: async (lastNode, scenarioSessionId) => {
    if (!lastNode || !scenarioSessionId) {
      console.warn("continueScenarioIfNeeded: lastNode or scenarioSessionId is missing.");
      return;
    }

    const isInteractive = lastNode.type === 'slotfilling' ||
                          lastNode.type === 'form' ||
                          (lastNode.type === 'branch' && lastNode.data?.evaluationType !== 'CONDITION');

    if (!isInteractive && lastNode.id !== 'end') {
      console.log(`Node ${lastNode.id} (${lastNode.type}) is not interactive, continuing...`);
      try {
          await new Promise(resolve => setTimeout(resolve, 300));
          await get().handleScenarioResponse({
            scenarioSessionId: scenarioSessionId,
            currentNodeId: lastNode.id,
            sourceHandle: null,
            userInput: null,
          });
      } catch (error) {
          console.error(`[continueScenarioIfNeeded] Unexpected error during auto-continue for session ${scenarioSessionId}:`, error);
          const { language, showEphemeralToast, endScenario } = get();
          const errorKey = getErrorKey(error);
          const message = locales[language]?.[errorKey] || 'Scenario auto-continue failed.';
          showEphemeralToast(message, 'error');
          endScenario(scenarioSessionId, 'failed');
      }
    } else {
        console.log(`Node ${lastNode.id} (${lastNode.type}) is interactive or end node, stopping auto-continue.`);
    }
  },
});