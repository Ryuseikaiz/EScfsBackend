const sheetsService = require('./services/sheetsService');
require('dotenv').config();

async function testDriveLinkConversion() {
    console.log('🧪 Testing Google Drive link conversion...\n');

    // Wait for sheets service to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test various Drive link formats
    const testLinks = [
        'https://drive.google.com/file/d/1ABC123/view?usp=drivesdk',
        'https://drive.google.com/open?id=1ABC123',
        'https://drive.google.com/uc?export=view&id=1ABC123',
        null,
        ''
    ];

    console.log('Testing link conversion:\n');
    testLinks.forEach(link => {
        const converted = sheetsService.convertDriveLinkToDirectUrl(link);
        console.log('Input: ', link || '(null/empty)');
        console.log('Output:', converted);
        console.log('---');
    });

    console.log('\n📋 Now fetching actual confessions from Google Sheets...\n');
    
    try {
        const confessions = await sheetsService.getPendingConfessions();
        
        console.log(`✅ Found ${confessions.length} confessions\n`);
        
        confessions.forEach((conf, idx) => {
            console.log(`Confession ${idx + 1}:`);
            console.log('  Source:', conf.source);
            console.log('  Original Drive Link:', conf.driveLink || 'none');
            console.log('  Converted Image URL:', conf.image || 'none');
            console.log('  Images array:', conf.images || []);
            console.log('---');
        });
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testDriveLinkConversion();
