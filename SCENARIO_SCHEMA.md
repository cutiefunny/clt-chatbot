# Chatbot Scenario Schema v1.0

This document defines the structure of the JSON data used for chatbot scenarios.

**Last Updated:** 2025-10-28
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

JSON

{
  "id": "string",         // Unique node ID
  "type": "string",       // Node type (e.g., "message", "form", "api", "delay")
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
JSON

{
  "content": "string", // Text content of the message
  "replies": [         // Optional quick replies
    { "display": "string", "value": "string" },
    ...
  ]
}
2. form Node
JSON

{
  "title": "string",   // Title displayed above the form
  "elements": [        // Array of form elements
    // See Form Element Schemas below
  ]
}
3. api Node
JSON

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
(... other node types like branch, slotfilling, llm, setSlot, fixedmenu, link, toast, iframe, scenario would be defined here ...)

N. delay Node (New)
JSON

{
  "duration": "number" // Delay duration in milliseconds (e.g., 1000 for 1 second)
}
Form Element Schemas (within form node data.elements)
1. input Element
JSON

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
JSON

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
(... other form element types like date, checkbox, dropbox would be defined here ...)

Edge Object Structure
JSON

{
  "id": "string",             // Unique edge ID
  "source": "string",         // Source node ID
  "target": "string",         // Target node ID
  "sourceHandle": "string | null" // ID of the specific source handle (e.g., "onSuccess", reply value, condition ID)
}

**주요 변경 사항:**

* **Node Data Schemas** 섹션에 `delay` 노드 타입을 위한 정의를 추가했습니다.
* `delay` 노드의 `data` 객체에는 `duration` (number 타입, 밀리초 단위) 필드가 포함됩니다.

이제 이 스키마를 사용하여 챗봇 클라이언트에서 딜레이 노드의 동작을 구현하거나 동기화할 수 있습니다.