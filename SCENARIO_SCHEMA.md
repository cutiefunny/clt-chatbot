Markdown

# Chatbot Scenario Schema v1.0

This document defines the structure of the JSON data used for chatbot scenarios.

**Last Updated:** 2025-10-27
**Current Version:** "1.0"

## Root Structure

The root object of a scenario JSON contains the following properties:

```json
{
  "version": "string",  // Schema version (e.g., "1.0") - MANDATORY
  "id": "string",       // Scenario ID (usually matches the document/file name)
  "name": "string",     // Scenario display name
  "job": "string",      // Scenario job type ("Batch", "Process", "Long Transaction")
  "nodes": [ ... ],     // Array of Node objects
  "edges": [ ... ],     // Array of Edge objects
  "startNodeId": "string | null" // ID of the node where the simulation should start
}
Node Object Structure
Each node object has the following base structure:

```json
{
  "id": "string",         // Unique node ID
  "type": "string",       // Node type (e.g., "message", "form", "api")
  "position": {           // Position on the canvas
    "x": "number",
    "y": "number"
  },
  "data": { ... },        // Data specific to the node type
  "width": "number",        // Node width
  "height": "number",       // Node height
  "parentNode": "string | undefined", // ID of the parent node if grouped
  "extent": "'parent' | undefined"    // Usually 'parent' if grouped
}
Node Data Schemas (data object)
1. message Node
```json
{
  "content": "string", // Text content of the message
  "replies": [         // Optional quick replies
    { "display": "string", "value": "string" },
    ...
  ]
}
2. form Node
```json
{
  "title": "string",   // Title displayed above the form
  "elements": [        // Array of form elements
    // See Form Element Schemas below
  ],
  // Note: dataSourceType and dataSource seem unused, confirm if needed
}
3. api Node
```json
{
  "isMulti": "boolean", // Whether multiple API calls are enabled
  // --- Single API Call Properties (used if isMulti is false) ---
  "method": "'GET' | 'POST' | 'PUT' | 'DELETE'",
  "url": "string",
  "headers": "string", // JSON string for headers
  "body": "string",    // JSON string for the request body
  "responseMapping": [
    { "path": "string", "slot": "string" }, // JSON path (e.g., data.items[0].id) and target slot name
    ...
  ],
  // --- Multi API Call Properties (used if isMulti is true) ---
  "apis": [
    {
      "id": "string", // Unique ID for this specific API call within the node
      "name": "string", // Display name for this API call
      "method": "'GET' | 'POST' | 'PUT' | 'DELETE'",
      "url": "string",
      "headers": "string",
      "body": "string",
      "responseMapping": [ ... ] // Same structure as above
    },
    ...
  ]
}
(... 다른 노드 타입 (branch, slotfilling, llm, setSlot 등)의 data 스키마도 유사하게 정의합니다 ...)

Form Element Schemas (within form node data.elements)
1. input Element
```json
{
  "id": "string",
  "type": "input",
  "name": "string",        // Slot name to store the value
  "label": "string",
  "placeholder": "string | undefined",
  "defaultValue": "string | undefined", // Default value (can be literal or "{slotName}")
  "validation": {
    "type": "'text' | 'email' | 'phone number' | 'custom'",
    "regex": "string | undefined" // Only if type is 'custom'
  }
}
2. grid Element
```json
{
  "id": "string",
  "type": "grid",
  "name": "string | undefined", // Slot name (maybe less relevant for grid display?)
  "label": "string",
  "optionsSlot": "string | undefined", // Slot containing array data to display
  "displayKeys": "string[] | undefined", // Keys to display when using optionsSlot with objects
  "hideNullColumns": "boolean | undefined", // Whether to hide columns where all values are null/undefined/empty
  // --- Fallback if optionsSlot is not used ---
  "rows": "number | undefined",
  "columns": "number | undefined",
  "data": "string[] | undefined" // Flat array of cell values (row by row)
}
(... 다른 폼 요소 타입 (date, checkbox, dropbox) 스키마도 정의 ...)

Edge Object Structure
```json
{
  "id": "string",             // Unique edge ID
  "source": "string",         // Source node ID
  "target": "string",         // Target node ID
  "sourceHandle": "string | null" // ID of the specific source handle (e.g., "onSuccess", reply value, condition ID)
}

### 2. 버전 정보 필드 추가 및 저장 로직 수정

빌더에서 시나리오를 저장할 때 정의된 스키마 버전을 포함하도록 `saveScenarioData` 함수를 수정합니다.

**`src/firebaseApi.js` 수정:**

```javascript
import { db } from './firebase';
import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  writeBatch,
  addDoc,
  updateDoc,
} from 'firebase/firestore';

// --- 👇 스키마 버전 정의 (상단 또는 설정 파일) ---
const CURRENT_SCHEMA_VERSION = "1.0";
// --- 👆 ---

// ... (fetchScenarios, createScenario 등 기존 함수들) ...

export const saveScenarioData = async ({ scenario, data }) => {
  if (!scenario || !scenario.id) {
    throw new Error('No scenario selected to save.');
  }
  const scenarioDocRef = doc(db, "scenarios", scenario.id);

  // --- 👇 저장 데이터에 버전 정보 추가 ---
  const dataToSave = {
    ...data,
    version: CURRENT_SCHEMA_VERSION // 스키마 버전 명시
  };
  // --- 👆 ---

  // data 객체에 nodes, edges, startNodeId가 모두 포함됨
  await setDoc(scenarioDocRef, dataToSave, { merge: true }); // merge: true 옵션으로 기존 필드 유지
};

// ... (템플릿 관련 함수 등 나머지 코드) ...