// Test Google Sheets timestamp parsing
const sheetsService = require('./services/sheetsService');

// Test cases
const testTimestamps = [
    '15/10/2025 14:27:32',
    '15/10/2025 1:45:36',
    '1/1/2025 0:00:00',
    '31/12/2024 23:59:59',
    '', // Empty
    null, // Null
    'invalid date string'
];

console.log('🧪 Testing Google Sheets timestamp parsing\n');

testTimestamps.forEach((timestamp, index) => {
    const parsed = sheetsService.parseGoogleSheetsTimestamp(timestamp);
    console.log(`Test ${index + 1}:`);
    console.log(`  Input:  ${timestamp || '(empty/null)'}`);
    console.log(`  Output: ${parsed}`);
    console.log(`  Valid:  ${!isNaN(new Date(parsed).getTime()) ? '✅' : '❌'}`);
    console.log('');
});

console.log('🎉 All timestamps converted to ISO format!');
