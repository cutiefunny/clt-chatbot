
const testData = {
    "result": "success",
    "data": [
        {
            "id": "hPd0AJVSwcpwM16Wdtz3",
            "author": "잼미니",
            "content": "3월 17일, 서울은 맑고 포근한 날씨가 예상됩니다.",
            "likes": 0
        }
    ]
};

function getDeepValue(obj, path) {
    if (!path) return undefined;
    // Current logic in library:
    const normalizedPath = path.replace(/\[(\w+)\]/g, '.$1').replace(/^\./, '');
    const keys = normalizedPath.split('.');

    console.log(`Path: "${path}" -> Normalized: "${normalizedPath}" -> Keys:`, keys);

    let current = obj;
    for (const key of keys) {
        if (current === null || current === undefined) {
            console.log(`  Failed at key: "${key}" (current is ${current})`);
            return undefined;
        }
        current = current[key];
        console.log(`  Key: "${key}" -> Result:`, typeof current === 'object' ? '{...}' : current);
    }
    return current;
}

console.log("--- Test 1: Simple key ---");
console.log("Final Result:", getDeepValue(testData, "result"));

console.log("\n--- Test 2: Nested path with array ---");
console.log("Final Result:", getDeepValue(testData, "data[0].content"));

console.log("\n--- Test 3: Path without brackets ---");
console.log("Final Result:", getDeepValue(testData, "data.0.content"));
