import { 
  DEFAULT_PARENT_ORIGIN, 
  SCENARIO_PANEL_WIDTH, 
  PARENT_ANIMATION_DELAY_MS 
} from './constants';

export const PARENT_ORIGIN =
  process.env.NEXT_PUBLIC_PARENT_ORIGIN || DEFAULT_PARENT_ORIGIN;
export { SCENARIO_PANEL_WIDTH, PARENT_ANIMATION_DELAY_MS };

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export const isEmbeddedInParent = () => {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return !!window.parent && window.parent !== window;
  } catch (err) {
    console.warn("Unable to access parent window:", err);
    return false;
  }
};

export const postToParent = (action, payload = {}, options = {}) => {
  const { onFallback } = options;
  if (!isEmbeddedInParent()) {
    if (onFallback) {
      onFallback();
    }
    return false;
  }

  if (typeof window === "undefined") {
    return false;
  }

  const message = { action, payload };

  try {
    window.parent.postMessage(message, PARENT_ORIGIN);
    return true;
  } catch (err) {
    console.error(
      `[postToParent] Failed to send message to parent (${PARENT_ORIGIN}):`,
      message,
      err
    );
    if (onFallback) {
      onFallback();
    }
    return false;
  }
};

export const openLinkThroughParent = (url) => {
  const fallback = () => {
    if (typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const didSend = postToParent(
    "callScreenOpen",
    { url },
    {
      onFallback: fallback,
    }
  );

  if (!didSend) {
    fallback();
  }

  return didSend;
};

export const delayParentAnimationIfNeeded = async (
  delayMs = PARENT_ANIMATION_DELAY_MS
) => {
  if (!isEmbeddedInParent()) {
    return false;
  }
  await sleep(delayMs);
  return true;
};
