const sheetsService = require('./services/sheetsService');
require('dotenv').config();

async function testPendingCount() {
    try {
        console.log('🔍 Testing Google Sheets pending confessions...\n');
        
        // Wait for sheets to initialize
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const confessions = await sheetsService.getPendingConfessions();
        
        console.log(`✅ Total pending confessions: ${confessions.length}\n`);
        
        confessions.forEach((conf, index) => {
            console.log(`${index + 1}. ID: ${conf.id}`);
            console.log(`   Timestamp: ${conf.timestamp}`);
            console.log(`   Content: ${conf.content.substring(0, 50)}...`);
            console.log(`   Status: ${conf.status}`);
            console.log(`   Row: ${conf.rowIndex}`);
            console.log('');
        });
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

testPendingCount();
