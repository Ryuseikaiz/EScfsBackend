const connectDB = require('./config/database');
const ProcessedConfession = require('./models/ProcessedConfession');
require('dotenv').config();

async function checkProcessedConfessions() {
    try {
        console.log('🔍 Connecting to MongoDB...\n');
        await connectDB();
        
        console.log('📊 Checking processed confessions from Google Form...\n');
        
        const processedConfessions = await ProcessedConfession.find({
            source: 'google_form'
        }).sort({ processedAt: -1 });
        
        console.log(`✅ Total processed: ${processedConfessions.length}\n`);
        
        processedConfessions.forEach((conf, index) => {
            console.log(`${index + 1}. ID: ${conf.confessionId}`);
            console.log(`   Status: ${conf.status}`);
            console.log(`   ES_ID: ${conf.esId || 'N/A'}`);
            console.log(`   Processed: ${conf.processedAt}`);
            console.log(`   Admin: ${conf.processedBy || 'N/A'}`);
            console.log('');
        });
        
        // Check specifically for form_3
        const form3 = await ProcessedConfession.findOne({ confessionId: 'form_3' });
        if (form3) {
            console.log('⚠️  form_3 found in database!');
            console.log('   Status:', form3.status);
            console.log('   This is why it\'s not showing as pending');
        } else {
            console.log('✅ form_3 NOT in database - should show as pending');
        }
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

checkProcessedConfessions();
