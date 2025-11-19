# Chatbot Scenario Schema v1.0

This document defines the structure of the JSON data used for chatbot scenarios.

**Last Updated:** 2025-10-31
**Current Version:** "1.2"

## Root Structure

The root object of a scenario JSON contains the following properties:

```json
{
  "version": "string",  // Schema version (e.g., "1.0") - MANDATORY
  "id": "string",       // Scenario ID (usually matches the document/file name)
  "name": "string",     // Scenario display name
  "job": "string",      // Scenario job type ("Batch", "Process", "Long Transaction")
  // --- 👇 [추가] description 필드 ---
  "description": "string | null", // Optional scenario description
  // --- 👆 [추가 끝] ---
  "nodes": [ ... ],     // Array of Node objects
  "edges": [ ... ],     // Array of Edge objects
  "startNodeId": "string | null" // ID of the node where the simulation should start
}
Node Object Structure Each node object has the following base structure:

JSON

JSON

{
  "id": "string",         // Unique node ID
  "type": "string",       // Node type (e.g., "message", "form", "api", "llm", "delay")
  "position": {           // Position on the canvas
    "x": "number",
    "y": "number"
  },
  "data": { ... },        // Data specific to the node type
  "width": "number",        // Node width
  "height": "number",       // Node height
  "parentNode": "string | undefined", // ID of the parent node if grouped
  "extent": "'parent' | undefined"    // Usually 'parent' if grouped
}
Node Data Schemas (data object)

message Node

JSON

JSON

{
  "content": "string", // Text content of the message
  "replies": [         // Optional quick replies
    { "display": "string", "value": "string" },
    ...
  ],
  // --- 👇 [추가] chainNext 플래그 ---
  "chainNext": "boolean | undefined" // (Optional) If true, do not create a new bubble; append to the active bubble.
  // --- 👆 [추가 끝] ---
}
form Node

JSON

JSON

{
  "title": "string",   // Title displayed above the form
  "elements": [        // Array of form elements
    // See Form Element Schemas below
  ],
  // --- 👇 [추가] 엑셀 업로드 플래그 ---
  "enableExcelUpload": "boolean | undefined" // (Optional) Whether to show the Excel upload button in the simulator
  // --- 👆 [추가 끝] ---
}
api Node

JSON

JSON

{
  "isMulti": "boolean", // Whether multiple API calls are enabled
  // --- 👇 [추가] chainNext 플래그 ---
  "chainNext": "boolean | undefined", // (Optional) If true, do not create a new bubble. (Note: Loading/Error still shows)
  // --- 👆 [추가 끝] ---
  // --- Single API Call Properties (used if isMulti is false) ---
  "method": "'GET' | 'POST' | 'PUT' | 'DELETE'",
  "url": "string",
  "headers": "string", // JSON string for headers
  "body": "string",    // JSON string for the request body
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
branch Node

JSON

JSON

{
  "content": "string", // Text displayed before options/conditions
  "evaluationType": "'BUTTON' | 'CONDITION'", // How to branch
  // --- Used if evaluationType is 'CONDITION' ---
  "conditions": [
    {
      "id": "string", // Unique ID for this condition (used for edge sourceHandle)
      "slot": "string", // Slot name to check
      "operator": "'==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | '!contains'",
      "value": "string", // Value to compare against
      "valueType": "'value' | 'slot'" // Whether 'value' is a literal or another slot name
    },
    ...
  ],
  // --- Used for button text (BUTTON) or condition handle mapping (CONDITION) ---
  "replies": [ // Array length must match conditions array length if CONDITION type
    { "display": "string", "value": "string" }, // 'value' is used for edge sourceHandle
    ...
  ]
}
slotfilling Node

JSON

JSON

{
  "content": "string", // Question asked to the user
  "slot": "string",    // Slot name to store the user's input/choice
  "replies": [         // Optional quick replies (if provided, input is chosen from these)
    { "display": "string", "value": "string" },
    ...
  ]
}
llm Node

JSON

JSON

{
  "prompt": "string",        // Prompt template sent to the LLM (can include {slotName})
  "outputVar": "string | null", // Slot name to store the full LLM response text (optional)
  "conditions": [            // Optional conditions for branching based on LLM response
    {
      "id": "string",        // Unique ID for this condition (used for edge sourceHandle)
      "keyword": "string"    // Keyword to search for in the LLM response (case-insensitive)
    },
    ...
  ],
  // --- 👇 [추가] chainNext 플래그 ---
  "chainNext": "boolean | undefined" // (Optional) If true, do not create a new bubble. (Note: Loading/Error still shows)
  // --- 👆 [추가 끝] ---
}
setSlot Node

JSON

JSON

{
  "assignments": [
    { "key": "string", "value": "string" }, // 'value' can be literal or "{slotName}"
    ... // Supports multiple assignments
  ],
  // --- 👇 [추가] chainNext 플래그 ---
  "chainNext": "boolean | undefined" // (Optional) If true, do not create a new bubble.
  // --- 👆 [추가 끝] ---
}
delay Node

JSON

JSON

{
  "duration": "number", // Delay duration in milliseconds (e.g., 1000 for 1 second)
  // --- 👇 [추가] chainNext 플래그 ---
  "chainNext": "boolean | undefined" // (Optional) If true, do not create a new bubble.
  // --- 👆 [추가 끝] ---
}
fixedmenu Node

JSON

JSON

{
  "content": "string", // Title or instruction for the fixed menu
  "replies": [         // Menu buttons
    { "display": "string", "value": "string" }, // 'value' is used for edge sourceHandle
    ...
  ]
}
link Node

JSON

JSON

{
  "content": "string", // URL of the link
  "display": "string",  // Text to display for the link
  // --- 👇 [추가] chainNext 플래그 ---
  "chainNext": "boolean | undefined" // (Optional) If true, do not create a new bubble.
  // --- 👆 [추가 끝] ---
}
toast Node

JSON

JSON

{
  "message": "string",      // Message content for the toast
  "toastType": "'info' | 'success' | 'error'", // Type of toast (affects appearance/icon)
  // --- 👇 [추가] chainNext 플래그 ---
A "chainNext": "boolean | undefined" // (Optional) If true, do not create a new bubble (toast still appears).
  // --- 👆 [추가 끝] ---
}
iframe Node

JSON

JSON

{
  "url": "string",       // URL to load in the iframe
  "width": "string",     // Width in pixels (e.g., "300")
  "height": "string",     // Height in pixels (e.g., "250")
  // --- 👇 [추가] chainNext 플래그 ---
  "chainNext": "boolean | undefined" // (Optional) If true, do not create a new bubble.
  // --- 👆 [추가 끝] ---
}
scenario Node (Group Node)

JSON

JSON

{
  "label": "string",       // Display name of the imported scenario
  "scenarioId": "string",  // ID of the imported scenario
  "isCollapsed": "boolean" // Whether the group node is currently collapsed
}
Form Element Schemas (within form node data.elements)

input Element

JSON

JSON

{
  "id": "string",
  "type": "input",
  "name": "string",        // Slot name to store the value
  "label": "string",
  "placeholder": "string | undefined",
  "defaultValue": "string | undefined", // Default value (literal or "{slotName}")
  "validation": {
    "type": "'text' | 'email' | 'phone number' | 'custom'",
    "regex": "string | undefined" // Only if type is 'custom'
  }
}
date Element

JSON

JSON

{
  "id": "string",
  "type": "date",
  "name": "string",
  "label": "string",
  "defaultValue": "string | undefined", // e.g., "2025-12-31"
  "validation": { // Optional date range validation
    "type": "'today after' | 'today before' | 'custom'",
    "startDate": "string | undefined", // YYYY-MM-DD format, only if type is 'custom'
    "endDate": "string | undefined"    // YYYY-MM-DD format, only if type is 'custom'
  }
}
grid Element

JSON

JSON

{
  "id": "string",
  "type": "grid",
  "name": "string | undefined",         // Optional slot name (less common for display grids)
  "label": "string",
  "optionsSlot": "string | undefined", // Slot containing array data (e.g., 'slotName' or 'slotName.path.to.array')
  // --- 👇 [수정] displayKeys 타입 및 설명 변경 ---
  "displayKeys": "{ key: string, label: string }[] | undefined", // Array of objects defining columns. 'key' = data key, 'label' = header text.
  // --- 👆 [수정 끝] ---
  "hideNullColumns": "boolean | undefined", // Whether to hide columns if all values are null/empty
  // --- Fallback if optionsSlot is not used ---
  "rows": "number | undefined",
  "columns": "number | undefined",
  "data": "string[] | undefined"        // Flat array of cell values (row by row)
}
checkbox Element

JSON

JSON

{
  "id": "string",
  "type": "checkbox",
  "name": "string",        // Slot name to store the array of selected values
  "label": "string",
  "options": "string[]",   // Array of checkbox option labels/values
  "defaultValue": "string[] | undefined" // Array of initially checked values
}
dropbox Element

JSON

JSON

{
  "id": "string",
  "type": "dropbox",
  "name": "string",        // Slot name to store the selected value
  "label": "string",
  "optionsSlot": "string | undefined", // Slot containing array data (strings or {label, value} objects)
  "options": "(string | {label: string, value: string})[] | undefined", // Fallback options
  "defaultValue": "string | undefined" // Initially selected value
}

search Element

JSON

JSON

{
  "id": "string",
  "type": "search",
  "name": "string",        // Slot name to store the search term
  "label": "string",
  "placeholder": "string | undefined",
  "apiConfig": {
    "url": "string",
    "method": "'GET' | 'POST'",
    "headers": "string | undefined", // (Optional) JSON string for headers. Supports {slotName} interpolation.
    "bodyTemplate": "string | undefined" // (Optional) JSON string, used if method is 'POST'. '{{value}}' is replaced.
  },
  "resultSlot": "string" // Slot name to store the API response (e.g., an array for a grid)
}

Edge Object Structure

JSON

JSON

{
  "id": "string",             // Unique edge ID (often auto-generated)
  "source": "string",         // Source node ID
  "target": "string",         // Target node ID
  "sourceHandle": "string | null" // ID of the specific source handle (e.g., "onSuccess", reply value, condition ID, "default")
}