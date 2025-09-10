import { scenarioTriggers } from '../../lib/chatbotEngine';

export const createScenarioSlice = (set, get) => ({
  // State
  scenarioStates: {},
  activeScenarioId: null,
  isScenarioPanelOpen: false,
  scenarioTriggers: {},

  // Actions
  loadScenarioTriggers: () => {
    set({ scenarioTriggers });
  },

  openScenarioPanel: async (scenarioId) => {
    const { scenarioStates } = get();
    if (scenarioStates[scenarioId]) {
      set({ isScenarioPanelOpen: true, activeScenarioId: scenarioId, activePanel: 'scenario' });
      get().focusChatInput();
      return;
    }
    set({
      isScenarioPanelOpen: true,
      activeScenarioId: scenarioId,
      activePanel: 'scenario',
      scenarioStates: { ...scenarioStates, [scenarioId]: { messages: [], state: null, slots: {}, isLoading: true } },
    });
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { text: scenarioId } }),
      });
      const data = await response.json();
      get().handleEvents(data.events);
      if (data.type === 'scenario_start') {
        const startNode = data.nextNode;
        set(state => ({
          scenarioStates: {
            ...state.scenarioStates,
            [scenarioId]: {
              messages: [{ id: startNode.id, sender: 'bot', node: startNode }],
              state: data.scenarioState,
              slots: data.slots || {},
              isLoading: false,
            },
          },
        }));
        await get().continueScenarioIfNeeded(startNode, scenarioId);
      } else {
        throw new Error("Failed to start scenario properly");
      }
    } catch (error) {
      console.error("Error starting scenario:", error);
      set(state => ({
        scenarioStates: {
          ...state.scenarioStates,
          [scenarioId]: { ...state.scenarioStates[scenarioId], messages: [{ id: 'error', sender: 'bot', text: 'Error starting scenario.' }], isLoading: false },
        },
      }));
    } finally {
      get().focusChatInput();
    }
  },

  endScenario: (scenarioId) => {
    const { scenarioStates, messages } = get();
    const newScenarioStates = { ...scenarioStates };
    delete newScenarioStates[scenarioId];
    set({
      scenarioStates: newScenarioStates,
      isScenarioPanelOpen: false,
      activeScenarioId: null,
      activePanel: 'main',
      messages: messages.filter(msg => msg.type !== 'scenario_resume_prompt' || msg.scenarioId !== scenarioId),
    });
  },

  setScenarioPanelOpen: (isOpen) => {
    const { activeScenarioId } = get();
    set(state => {
      let newMessages = state.messages;
      if (!isOpen && activeScenarioId) {
        newMessages = state.messages.filter(msg => msg.type !== 'scenario_resume_prompt' || msg.scenarioId !== activeScenarioId);
        newMessages.push({
          id: Date.now(),
          sender: 'bot',
          type: 'scenario_resume_prompt',
          scenarioId: activeScenarioId,
          text: '', // Text is set dynamically in the component via useTranslations
        });
      }
      return { isScenarioPanelOpen: isOpen, activePanel: isOpen ? 'scenario' : 'main', messages: newMessages };
    });
    get().focusChatInput();
  },
  
  setScenarioState: (scenarioState) => {
      set({ scenarioState });
  },

  handleScenarioResponse: async (payload) => {
    const { scenarioId } = payload;
    set(state => ({
      scenarioStates: {
        ...state.scenarioStates,
        [scenarioId]: {
          ...state.scenarioStates[scenarioId],
          isLoading: true,
          messages: payload.userInput
            ? [...state.scenarioStates[scenarioId].messages, { id: Date.now(), sender: 'user', text: payload.userInput }]
            : state.scenarioStates[scenarioId].messages,
        },
      },
    }));
    const currentScenario = get().scenarioStates[scenarioId];
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: { sourceHandle: payload.sourceHandle, text: payload.userInput },
          scenarioState: currentScenario.state,
          slots: { ...currentScenario.slots, ...(payload.formData || {}) },
        }),
      });
      const data = await response.json();
      get().handleEvents(data.events);
      if (data.type === 'scenario') {
        const nextNode = data.nextNode;
        set(state => ({
          scenarioStates: {
            ...state.scenarioStates,
            [scenarioId]: {
              ...state.scenarioStates[scenarioId],
              messages: [...state.scenarioStates[scenarioId].messages, { id: nextNode.id, sender: 'bot', node: nextNode }],
              state: data.scenarioState,
              slots: data.slots,
              isLoading: false,
            },
          },
        }));
        await get().continueScenarioIfNeeded(nextNode, scenarioId);
      } else if (data.type === 'scenario_end') {
        set(state => ({
          scenarioStates: {
            ...state.scenarioStates,
            [scenarioId]: {
              ...state.scenarioStates[scenarioId],
              messages: [...state.scenarioStates[scenarioId].messages, { id: 'end', sender: 'bot', text: data.message }],
              slots: data.slots,
              state: null,
              isLoading: false,
            },
          },
        }));
      } else if (data.type === 'scenario_validation_fail') {
        get().showToast(data.message, 'error');
        set(state => ({
          scenarioStates: { ...state.scenarioStates, [scenarioId]: { ...state.scenarioStates[scenarioId], isLoading: false } },
        }));
      } else {
        throw new Error("Invalid scenario response type received: " + data.type);
      }
    } catch (error) {
      console.error("Error in scenario conversation:", error);
      set(state => ({
        scenarioStates: {
          ...state.scenarioStates,
          [scenarioId]: { ...state.scenarioStates[scenarioId], messages: [...state.scenarioStates[scenarioId].messages, { id: 'error', sender: 'bot', text: 'An error occurred.' }], isLoading: false },
        },
      }));
    }
  },

  continueScenarioIfNeeded: async (lastNode, scenarioId) => {
    const isInteractive = lastNode.type === 'slotfilling' || lastNode.type === 'form' || (lastNode.data?.replies && lastNode.data.replies.length > 0);
    if (!isInteractive && lastNode.id !== 'end') {
      await new Promise(resolve => setTimeout(resolve, 500));
      await get().handleScenarioResponse({
        scenarioId: scenarioId,
        currentNodeId: lastNode.id,
        sourceHandle: null,
        userInput: null,
      });
    }
  },
});