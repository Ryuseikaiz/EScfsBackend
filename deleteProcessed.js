const connectDB = require('./config/database');
const ProcessedConfession = require('./models/ProcessedConfession');
require('dotenv').config();

async function deleteProcessedConfession(confessionId) {
    try {
        console.log('🔍 Connecting to MongoDB...\n');
        await connectDB();
        
        console.log(`🗑️  Deleting processed confession: ${confessionId}...\n`);
        
        const result = await ProcessedConfession.deleteOne({ confessionId });
        
        if (result.deletedCount > 0) {
            console.log(`✅ Successfully deleted ${confessionId} from database`);
            console.log('   This confession will now appear as pending again');
        } else {
            console.log(`⚠️  No confession found with ID: ${confessionId}`);
        }
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

// Get confession ID from command line argument
const confessionId = process.argv[2] || 'form_3';
deleteProcessedConfession(confessionId);
