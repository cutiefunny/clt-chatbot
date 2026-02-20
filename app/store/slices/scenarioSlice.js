// app/store/slices/scenarioSlice.js
// 분산 모듈 통합 파일

import { createScenarioStateSlice } from "./scenarioStateSlice";
import { createScenarioAPISlice } from "./scenarioAPI";
import { createScenarioSessionSlice } from "./scenarioSessionSlice";
import { createScenarioHandlersSlice } from "./scenarioHandlers";

export const createScenarioSlice = (set, get) => ({
  ...createScenarioStateSlice(set, get),
  ...createScenarioAPISlice(set, get),
  ...createScenarioSessionSlice(set, get),
  ...createScenarioHandlersSlice(set, get),
});