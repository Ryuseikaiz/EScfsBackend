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
    const credentialsObj = JSON.parse(credentials);
    
    // Minify JSON (remove extra whitespace)
    const minified = JSON.stringify(credentialsObj);
    
    // Base64 encode as alternative
    const base64 = Buffer.from(minified).toString('base64');
    
    console.log('✅ Valid credentials file found!\n');
    console.log('╔═══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║ OPTION 1: Minified JSON (Recommended for Vercel)                             ║');
    console.log('╚═══════════════════════════════════════════════════════════════════════════════╝');
    console.log('Copy this value (WITHOUT quotes) to Vercel:\n');
    console.log(minified);
    console.log('\n' + '─'.repeat(80) + '\n');
    
    console.log('╔═══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║ OPTION 2: Base64 Encoded (Alternative)                                       ║');
    console.log('╚═══════════════════════════════════════════════════════════════════════════════╝');
    console.log('Copy this value (WITHOUT quotes) to Vercel as GOOGLE_SERVICE_ACCOUNT_KEY_BASE64:\n');
    console.log(base64);
    console.log('\n' + '─'.repeat(80) + '\n');
    
    console.log('📝 Instructions for Vercel:');
    console.log('1. Go to your Vercel project settings');
    console.log('2. Navigate to Environment Variables');
    console.log('3. Add a new variable named: GOOGLE_SERVICE_ACCOUNT_KEY');
    console.log('4. Paste the minified JSON (Option 1) as the value WITHOUT any quotes');
    console.log('5. Click Save and redeploy');
    console.log('\n⚠️  IMPORTANT: Do NOT wrap the value in quotes in Vercel!');
    console.log('⚠️  IMPORTANT: Never commit credentials to Git!');
    
} catch (error) {
    console.error('❌ Error reading credentials:', error.message);
    process.exit(1);
}
