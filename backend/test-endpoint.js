// Quick test script to test the POST /update endpoint
const http = require('http');

const options = {
    hostname: 'localhost',
    port: 3003,
    path: '/update',
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
        console.log('Response:', JSON.parse(data));
    });
});

req.on('error', (error) => {
    console.error('Error:', error);
});

// Send empty body
req.write(JSON.stringify({}));
req.end();

console.log('Testing POST /update endpoint...');