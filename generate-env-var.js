// Script to generate GOOGLE_SERVICE_ACCOUNT_KEY environment variable
const fs = require('fs');
const path = require('path');

const credentialsPath = process.argv[2] || './google-credentials.json';

try {
    if (!fs.existsSync(credentialsPath)) {
        console.error('❌ Credentials file not found:', credentialsPath);
        console.log('\nUsage: node generate-env-var.js [path-to-credentials.json]');
        process.exit(1);
    }

    const credentials = fs.readFileSync(credentialsPath, 'utf8');
    
    // Validate JSON
    JSON.parse(credentials);
    
    console.log('✅ Valid credentials file found!\n');
    console.log('Copy the following line to your .env file or deployment platform:\n');
    console.log('─'.repeat(80));
    console.log(`GOOGLE_SERVICE_ACCOUNT_KEY='${credentials.trim()}'`);
    console.log('─'.repeat(80));
    console.log('\n📝 Instructions:');
    console.log('1. Copy the entire line above (including the quotes)');
    console.log('2. Paste it into your deployment platform\'s environment variables');
    console.log('3. Or add it to your .env file for local development');
    console.log('\n⚠️  IMPORTANT: Never commit this to Git!');
    
} catch (error) {
    console.error('❌ Error reading credentials:', error.message);
    process.exit(1);
}
