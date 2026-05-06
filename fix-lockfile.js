const fs = require('fs');
const lockPath = 'package-lock.json';
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));

const pkgKey = 'node_modules/@clt-chatbot/scenario-core';
if (lock.packages[pkgKey]) {
    console.log('Found it! Current state:', lock.packages[pkgKey]);
    delete lock.packages[pkgKey].link;
    lock.packages[pkgKey].version = '1.0.5';
    lock.packages[pkgKey].resolved = 'https://registry.npmjs.org/@clt-chatbot/scenario-core/-/scenario-core-1.0.5.tgz';
    lock.packages[pkgKey].integrity = 'sha512-YmQoP/6k6...'; // Need integrity? No, it's usually optional or resolved on install

    // Also fix the root entry if it references it as a local folder
    if (lock.packages[''].dependencies['@clt-chatbot/scenario-core']) {
        lock.packages[''].dependencies['@clt-chatbot/scenario-core'] = '1.0.5';
    }

    fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2));
    console.log('Updated lockfile successfully!');
} else {
    console.log('Package not found in lockfile at expected key.');
}
