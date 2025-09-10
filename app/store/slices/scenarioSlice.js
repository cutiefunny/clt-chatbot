import { scenarioTriggers } from '../../lib/chatbotEngine';
import { locales } from '../../lib/locales';

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
    const { scenarioStates, handleEvents } = get();

    // If the scenario is already running, just open the panel
    if (scenarioStates[scenarioId]) {
        set({ 
            isScenarioPanelOpen: true, 
            activeScenarioId: scenarioId,
            activePanel: 'scenario' 
        });
        get().focusChatInput();
        return;
    }
    
    // Start a new scenario session
    set({ 
        isScenarioPanelOpen: true, 
        activeScenarioId: scenarioId,
        activePanel: 'scenario',
        scenarioStates: {
            ...scenarioStates,
            [scenarioId]: {
                messages: [],
                state: null,
                slots: {},
                isLoading: true,
            }
        }
    });
    
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { text: scenarioId } }),
      });
      const data = await response.json();
      
      handleEvents(data.events);

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
          [scenarioId]: {
            ...state.scenarioStates[scenarioId],
            messages: [{ id: 'error', sender: 'bot', text: 'An error occurred while starting the scenario.' }],
            isLoading: false,
          },
        },
      }));
    } finally {
      get().focusChatInput();
    }
  },

  endScenario: (scenarioId) => {
    const { language, messages, scenarioStates, saveMessage } = get();

    // 1. Create the "scenario ended" message object
    const endMessage = {
      id: Date.now(),
      sender: 'bot',
      text: locales[language].scenarioEnded(scenarioId),
      type: 'scenario_end_notice', // Use a distinct type
    };

    // 2. Remove any "resume scenario" prompts for this scenario from the main chat
    const filteredMessages = messages.filter(
      (msg) => msg.type !== 'scenario_resume_prompt' || msg.scenarioId !== scenarioId
    );

    // 3. Clean up the state for the ended scenario
    const newScenarioStates = { ...scenarioStates };
    delete newScenarioStates[scenarioId];

    // 4. Update the store in a single call
    set({
      scenarioStates: newScenarioStates,
      isScenarioPanelOpen: false,
      activeScenarioId: null,
      activePanel: 'main',
      messages: [...filteredMessages, endMessage],
    });

    // 5. Save the "scenario ended" message to Firestore
    saveMessage(endMessage);
  },

  setScenarioPanelOpen: (isOpen) => {
      const { activeScenarioId } = get();
      
      set(state => {
          let newMessages = state.messages;
          if (!isOpen && activeScenarioId) {
              // Remove any previous resume prompts for the same scenario
              newMessages = state.messages.filter(msg =>
                  msg.type !== 'scenario_resume_prompt' || msg.scenarioId !== activeScenarioId
              );
              // Add a new resume prompt
              newMessages.push({
                  id: Date.now(),
                  sender: 'bot',
                  type: 'scenario_resume_prompt',
                  scenarioId: activeScenarioId,
                  text: '', // Text is set dynamically in the component
              });
          }

          return {
              isScenarioPanelOpen: isOpen,
              activePanel: isOpen ? 'scenario' : 'main',
              messages: newMessages,
          };
      });

      get().focusChatInput();
  },
  
  setScenarioState: (scenarioState) => {
      set({ scenarioState });
  },

  handleScenarioResponse: async (payload) => {
    const { scenarioId } = payload;
    const { handleEvents, showToast } = get();

    set(state => ({
      scenarioStates: {
        ...state.scenarioStates,
        [scenarioId]: {
          ...state.scenarioStates[scenarioId],
          isLoading: true,
          messages: payload.userInput 
            ? [...state.scenarioStates[scenarioId].messages, { id: Date.now(), sender: 'user', text: payload.userInput }]
            : state.scenarioStates[scenarioId].messages,
        }
      }
    }));
    
    const currentScenario = get().scenarioStates[scenarioId];

    try {
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
          language: get().language, // Pass language to API
        }),
      });
      const data = await response.json();

      handleEvents(data.events);

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
              }
          }
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
              }
          }
        }));
      } else if (data.type === 'scenario_validation_fail') {
        showToast(data.message, 'error');
        set(state => ({
          scenarioStates: {
            ...state.scenarioStates,
            [scenarioId]: { ...state.scenarioStates[scenarioId], isLoading: false }
          }
        }));
      } else {
        throw new Error("Invalid scenario response type received: " + data.type);
      }
    } catch (error) {
      console.error("Error in scenario conversation:", error);
       set(state => ({
          scenarioStates: {
              ...state.scenarioStates,
              [scenarioId]: {
                  ...state.scenarioStates[scenarioId],
                  messages: [...state.scenarioStates[scenarioId].messages, { id: 'error', sender: 'bot', text: 'An error occurred.' }],
                  isLoading: false,
              }
          }
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