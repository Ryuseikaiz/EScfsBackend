const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function listSheets() {
    try {
        console.log('🔍 Checking Google Sheets configuration...\n');

        let credentials;

        // Check environment variable first (for production)
        if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
            console.log('✅ Using credentials from environment variable');
            credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
        } else {
            // Check credentials file (for local)
            const credentialsPath = process.env.GOOGLE_CREDENTIALS_PATH || 
                                   path.join(__dirname, 'google-credentials.json');

            if (!fs.existsSync(credentialsPath)) {
                console.error('❌ Credentials file not found at:', credentialsPath);
                console.log('\n📝 Please:');
                console.log('1. Download credentials from Google Cloud Console');
                console.log('2. Save as google-credentials.json in escfs_backend folder');
                process.exit(1);
            }

            console.log('✅ Credentials file found:', credentialsPath);
            credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
        }

        console.log('✅ Service Account Email:', credentials.client_email);

        // Initialize Google Sheets API
        const auth = new google.auth.GoogleAuth({
            credentials: credentials,
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });

        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;

        if (!spreadsheetId) {
            console.error('❌ GOOGLE_SHEET_ID not found in .env');
            process.exit(1);
        }

        console.log('✅ Spreadsheet ID:', spreadsheetId);
        console.log('\n📊 Fetching spreadsheet info...\n');

        // Get spreadsheet metadata
        const response = await sheets.spreadsheets.get({
            spreadsheetId: spreadsheetId
        });

        console.log('✅ Spreadsheet Title:', response.data.properties.title);
        console.log('✅ Total Sheets:', response.data.sheets.length);
        console.log('\n📑 Available Sheets:\n');

        response.data.sheets.forEach((sheet, index) => {
            console.log(`${index + 1}. "${sheet.properties.title}"`);
            console.log(`   - Sheet ID: ${sheet.properties.sheetId}`);
            console.log(`   - Index: ${sheet.properties.index}`);
            console.log(`   - Rows: ${sheet.properties.gridProperties.rowCount}`);
            console.log(`   - Columns: ${sheet.properties.gridProperties.columnCount}`);
            console.log('');
        });

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('\n💡 Copy the exact sheet name and update your code!');
        console.log('\n⚠️  IMPORTANT: Make sure to share this spreadsheet with:');
        console.log(`   ${credentials.client_email}`);
        console.log('   Give it "Editor" permission!');

        // Try to read first sheet data
        const firstSheet = response.data.sheets[0].properties.title;
        console.log(`\n📖 Reading first 5 rows from "${firstSheet}"...\n`);

        try {
            const dataResponse = await sheets.spreadsheets.values.get({
                spreadsheetId: spreadsheetId,
                range: `'${firstSheet}'!A1:E5`
            });

            if (dataResponse.data.values) {
                console.log('✅ Sample data:');
                dataResponse.data.values.forEach((row, i) => {
                    console.log(`Row ${i + 1}:`, row);
                });
            } else {
                console.log('ℹ️  Sheet is empty');
            }
        } catch (readError) {
            console.error('❌ Error reading sheet data:', readError.message);
            console.log('\n⚠️  This usually means the service account does not have access!');
            console.log(`   Please share the spreadsheet with: ${credentials.client_email}`);
        }

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        
        if (error.code === 404) {
            console.log('\n📝 Spreadsheet not found. Please check:');
            console.log('1. GOOGLE_SHEET_ID in .env is correct');
            console.log('2. Service account has access to the spreadsheet');
        } else if (error.code === 403) {
            console.log('\n🔒 Permission denied. Please:');
            console.log('1. Share the spreadsheet with the service account email');
            console.log('2. Give it "Editor" permission');
        }
    }
}

listSheets();
