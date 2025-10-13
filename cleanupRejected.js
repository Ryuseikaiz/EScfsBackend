const connectDB = require('./config/database');
const Confession = require('./models/Confession');
require('dotenv').config();

async function cleanupRejected() {
    try {
        console.log('🔍 Cleaning up rejected confessions...\n');
        await connectDB();
        
        // Find all rejected confessions from website
        const rejectedConfessions = await Confession.find({ 
            status: 'rejected',
            source: 'website'
        });
        
        console.log(`Found ${rejectedConfessions.length} rejected confessions\n`);
        
        if (rejectedConfessions.length === 0) {
            console.log('✅ No rejected confessions to clean up');
            process.exit(0);
        }
        
        rejectedConfessions.forEach((conf, index) => {
            console.log(`${index + 1}. ${conf._id}`);
            console.log(`   Content: ${conf.content.substring(0, 50)}...`);
            console.log(`   Status: ${conf.status}`);
            console.log(`   Date: ${conf.submittedAt}`);
            console.log('');
        });
        
        // Delete them
        const result = await Confession.deleteMany({ 
            status: 'rejected',
            source: 'website'
        });
        
        console.log(`✅ Deleted ${result.deletedCount} rejected confessions from database`);
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

cleanupRejected();
