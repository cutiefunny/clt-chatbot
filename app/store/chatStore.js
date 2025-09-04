import { create } from 'zustand';

const initialState = {
  messages: [{ id: Date.now(), sender: 'bot', text: '안녕하세요! 무엇을 도와드릴까요?' }],
  scenarioState: null,
  slots: {},
  isLoading: false,
};

export const useChatStore = create((set, get) => ({
  ...initialState,

  // --- 👇 [추가된 부분] ---
  restart: () => set(initialState),
  // --- 👆 [여기까지 추가] ---

  addMessage: (sender, messageData) => {
    let newMessage;
    if (sender === 'user') {
      newMessage = { id: Date.now(), sender, text: messageData.text };
    } else {
      if (messageData.data) {
        newMessage = { id: messageData.id, sender, node: messageData };
      } else {
        newMessage = {
          id: messageData.id || Date.now(),
          sender,
          text: messageData.text,
          scenarios: messageData.scenarios,
          isStreaming: messageData.isStreaming || false,
        };
      }
    }
    set(state => ({ messages: [...state.messages, newMessage] }));
  },

  updateStreamingMessage: (id, chunk) => {
    set(state => ({
      messages: state.messages.map(m => 
        m.id === id ? { ...m, text: m.text + chunk } : m
      )
    }));
  },

  finalizeStreamingMessage: (id) => {
    set(state => ({
      messages: state.messages.map(m => 
        m.id === id ? { ...m, isStreaming: false } : m
      )
    }));
  },

  startLoading: () => set({ isLoading: true }),
  stopLoading: () => set({ isLoading: false }),

  handleResponse: async (messagePayload) => {
    const { addMessage, updateStreamingMessage, finalizeStreamingMessage, startLoading, stopLoading } = get();
    startLoading();

    if (messagePayload.text) {
      addMessage('user', { text: messagePayload.text });
    }

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messagePayload,
          scenarioState: get().scenarioState,
          slots: get().slots,
        }),
      });

      if (!response.ok) throw new Error(`Server error: ${response.statusText}`);

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        if (data.type === 'scenario_start' || data.type === 'scenario') {
          addMessage('bot', data.nextNode);
          set({ scenarioState: data.scenarioState });
        } else if (data.type === 'scenario_end') {
          addMessage('bot', { text: data.message });
          set({ scenarioState: null });
        } else if (data.type === 'scenario_list') {
          addMessage('bot', { text: data.message, scenarios: data.scenarios });
        }
      } else {
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        const streamingMessageId = Date.now();
        addMessage('bot', { id: streamingMessageId, text: '', isStreaming: true });

        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            finalizeStreamingMessage(streamingMessageId);
            break;
          }
          updateStreamingMessage(streamingMessageId, value);
        }
      }
    } catch (error) {
      console.error('Failed to fetch chat response:', error);
      addMessage('bot', { text: '오류가 발생했습니다. 잠시 후 다시 시도해주세요.' });
    } finally {
      stopLoading();
    }
  },
}));