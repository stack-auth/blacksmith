// Quick test script to test the endpoints
const http = require('http');

function testEndpoint(path, body = {}) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3003,
            path: path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                console.log(`\n${path} Response:`, JSON.parse(data));
                resolve(JSON.parse(data));
            });
        });

        req.on('error', (error) => {
            console.error(`Error calling ${path}:`, error);
            reject(error);
        });

        req.write(JSON.stringify(body));
        req.end();

        console.log(`Testing POST ${path} endpoint...`);
    });
}

// Test both endpoints
async function runTests() {
    try {
        // Test /update endpoint
        await testEndpoint('/update');

        // Wait a bit then test /commit endpoint
        setTimeout(async () => {
            await testEndpoint('/commit', {
                message: 'Test commit from script',
                allowEmpty: true
            });
        }, 2000);

    } catch (error) {
        console.error('Test failed:', error);
    }
}

runTests();