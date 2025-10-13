const sheetsService = require('./services/sheetsService');
const connectDB = require('./config/database');
require('dotenv').config();

async function testDelete() {
    try {
        console.log('🔍 Testing confession deletion...\n');
        
        // Connect to MongoDB
        await connectDB();
        console.log('✅ Connected to MongoDB\n');
        
        // Wait for sheets to initialize
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const confessionId = 'form_14102025_14356'; // Replace with actual ID
        
        console.log(`Testing deletion of: ${confessionId}\n`);
        
        // Get confession first
        console.log('1️⃣ Getting confession...');
        const confession = await sheetsService.getConfessionById(confessionId);
        
        if (!confession) {
            console.log('❌ Confession not found!');
            process.exit(1);
        }
        
        console.log(`✅ Found confession:`);
        console.log(`   Content: ${confession.content.substring(0, 50)}...`);
        console.log(`   Row: ${confession.rowIndex}\n`);
        
        // Delete confession
        console.log('2️⃣ Deleting confession...');
        await sheetsService.deleteConfession(confessionId, true);
        
        console.log('\n✅ Deletion completed! Check Google Sheets to verify row is deleted.\n');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

testDelete();
