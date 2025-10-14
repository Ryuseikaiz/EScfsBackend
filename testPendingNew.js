const sheetsService = require('./services/sheetsService');
const connectDB = require('./config/database');
require('dotenv').config();

async function testPendingAfterColumnChange() {
    try {
        console.log('🔍 Testing pending confessions after column B added...\n');
        
        await connectDB();
        console.log('✅ Connected to MongoDB\n');
        
        // Wait for sheets to initialize
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const confessions = await sheetsService.getPendingConfessions();
        
        console.log(`✅ Total pending confessions: ${confessions.length}\n`);
        
        confessions.slice(0, 5).forEach((conf, index) => {
            console.log(`${index + 1}. ID: ${conf.id}`);
            console.log(`   Timestamp: ${conf.timestamp}`);
            console.log(`   Content: ${conf.content.substring(0, 60)}...`);
            console.log(`   Image: ${conf.driveLink || 'No image'}`);
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

testPendingAfterColumnChange();
