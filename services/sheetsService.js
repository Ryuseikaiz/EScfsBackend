const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const ProcessedConfession = require('../models/ProcessedConfession');
require('dotenv').config();

class SheetsService {
    constructor() {
        this.spreadsheetId = process.env.GOOGLE_SHEET_ID;
        this.auth = null;
        this.sheets = null;
        this.initialize();
    }

    async initialize() {
        try {
            // Load credentials from environment or file
            const credentialsPath = process.env.GOOGLE_CREDENTIALS_PATH || 
                                   path.join(__dirname, '../google-credentials.json');

            if (fs.existsSync(credentialsPath)) {
                const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
                
                this.auth = new google.auth.GoogleAuth({
                    credentials: credentials,
                    scopes: ['https://www.googleapis.com/auth/spreadsheets']
                });

                this.sheets = google.sheets({ version: 'v4', auth: this.auth });
                console.log('✅ Google Sheets API initialized');
            } else {
                console.warn('⚠️ Warning: Google credentials file not found');
            }
        } catch (error) {
            console.error('Error initializing Google Sheets:', error);
        }
    }

    /**
     * Convert Google Drive link to direct image URL
     * @param {string} driveUrl - Google Drive URL (view or sharing link)
     * @returns {string|null} - Direct image URL or null
     */
    convertDriveLinkToDirectUrl(driveUrl) {
        if (!driveUrl) return null;

        try {
            // Pattern 1: https://drive.google.com/file/d/FILE_ID/view
            let match = driveUrl.match(/\/file\/d\/([^\/]+)/);
            if (match) {
                const fileId = match[1];
                // Use thumbnail API with w1000 for good quality
                return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
            }

            // Pattern 2: https://drive.google.com/open?id=FILE_ID
            match = driveUrl.match(/[?&]id=([^&]+)/);
            if (match) {
                const fileId = match[1];
                return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
            }

            // Pattern 3: Already a direct link
            if (driveUrl.includes('drive.google.com/uc?') || driveUrl.includes('drive.google.com/thumbnail?')) {
                return driveUrl;
            }

            // If can't parse, return original
            return driveUrl;
        } catch (error) {
            console.error('Error converting Drive link:', error);
            return driveUrl;
        }
    }

    /**
     * Get pending confessions from Google Sheets
     */
    async getPendingConfessions() {
        try {
            if (!this.sheets || !this.spreadsheetId) {
                console.log('⚠️  Google Sheets not configured, skipping...');
                return [];
            }

            const confessions = [];

            // Get list of processed confession IDs
            const processedConfessions = await ProcessedConfession.find({
                source: 'google_form'
            }).select('confessionId status');
            
            const processedIds = new Set(processedConfessions.map(p => p.confessionId));
            
            console.log(`📋 Found ${processedIds.size} processed Google Form confessions in DB`);

            // Read from "Câu trả lời biểu mẫu 1" sheet - Main form responses
            try {
                const formResponse = await this.sheets.spreadsheets.values.get({
                    spreadsheetId: this.spreadsheetId,
                    range: "'Câu trả lời biểu mẫu 1'!A:E"
                });

                // Process form responses (skip header row)
                if (formResponse.data.values && formResponse.data.values.length > 1) {
                    const formRows = formResponse.data.values.slice(1);
                    formRows.forEach((row, index) => {
                        if (row.length >= 2 && row[1]) { // Check if content exists
                            const confessionId = `form_${index + 2}`;
                            
                            // Skip if already processed (approved or deleted)
                            if (processedIds.has(confessionId)) {
                                return;
                            }
                            
                            const driveLink = row[2] || null;
                            const directImageUrl = this.convertDriveLinkToDirectUrl(driveLink);
                            
                            confessions.push({
                                id: confessionId,
                                timestamp: row[0] || '',
                                content: row[1] || '',
                                images: directImageUrl ? [directImageUrl] : [], // Direct image URL array
                                image: directImageUrl, // Keep for backward compatibility
                                driveLink: driveLink, // Original Drive link
                                source: 'google_form',
                                status: 'pending',
                                rowIndex: index + 2
                            });
                        }
                    });
                }
                console.log(`✅ Found ${confessions.length} pending confessions from Google Form`);
            } catch (e) {
                console.log('ℹ️  "Câu trả lời biểu mẫu 1" sheet not found or empty');
            }

            // Read from "Pending_Confessions" sheet for website submissions (if exists)
            try {
                const pendingResponse = await this.sheets.spreadsheets.values.get({
                    spreadsheetId: this.spreadsheetId,
                    range: 'Pending_Confessions!A:E'
                });

                // Process website submissions
                if (pendingResponse.data.values && pendingResponse.data.values.length > 1) {
                    const pendingRows = pendingResponse.data.values.slice(1);
                    pendingRows.forEach((row, index) => {
                        if (row.length >= 2 && row[4] !== 'approved' && row[4] !== 'deleted') {
                            confessions.push({
                                id: `pending_${index + 2}`,
                                timestamp: row[0] || '',
                                content: row[1] || '',
                                source: row[2] || 'website',
                                status: row[3] || 'pending',
                                rowIndex: index + 2
                            });
                        }
                    });
                }
            } catch (e) {
                // This sheet is optional
            }

            return confessions;
        } catch (error) {
            console.error('Error fetching pending confessions from Sheets:', error.message);
            return [];
        }
    }

    /**
     * Add new confession from website to Google Sheets
     */
    async addConfession(confessionData) {
        try {
            if (!this.sheets || !this.spreadsheetId) {
                throw new Error('Google Sheets not configured');
            }

            // Ensure Pending_Confessions sheet exists
            await this.ensurePendingSheet();

            const row = [
                confessionData.timestamp,
                confessionData.content,
                confessionData.source || 'website',
                confessionData.status || 'pending',
                '' // ES_ID (will be filled when approved)
            ];

            const response = await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: 'Pending_Confessions!A:E',
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [row]
                }
            });

            console.log('✅ Confession added to Google Sheets');
            
            return {
                id: `pending_${response.data.updates.updatedRange}`,
                ...confessionData
            };
        } catch (error) {
            console.error('Error adding confession:', error);
            throw error;
        }
    }

    /**
     * Get confession by ID
     */
    async getConfessionById(id) {
        try {
            const confessions = await this.getPendingConfessions();
            return confessions.find(c => c.id === id);
        } catch (error) {
            console.error('Error getting confession from Sheets:', error.message);
            return null;
        }
    }

    /**
     * Get next ES_ID number
     */
    async getNextESId() {
        try {
            if (!this.sheets || !this.spreadsheetId) {
                console.log('⚠️  Google Sheets not configured, returning default ES_ID');
                return 2290;
            }

            // Read from Published_Confessions sheet to get the latest ES_ID
            try {
                const publishedResponse = await this.sheets.spreadsheets.values.get({
                    spreadsheetId: this.spreadsheetId,
                    range: 'Published_Confessions!A:A'
                });

                if (!publishedResponse.data.values || publishedResponse.data.values.length <= 1) {
                    return 2290; // Default starting number
                }

                // Get all ES_IDs and find the maximum
                const esIds = publishedResponse.data.values
                    .slice(1) // Skip header
                    .map(row => {
                        const match = row[0]?.match(/#?ES_?(\d+)/i);
                        return match ? parseInt(match[1]) : 0;
                    })
                    .filter(id => id > 0);

                if (esIds.length === 0) {
                    return 2290;
                }

                return Math.max(...esIds) + 1;
            } catch (e) {
                console.log('ℹ️  Published_Confessions sheet not found, using default');
                return 2290;
            }
        } catch (error) {
            console.error('Error getting next ES_ID from Sheets:', error.message);
            return 2290; // Fallback
        }
    }

    /**
     * Update confession status after approval
     */
    async updateConfessionStatus(id, status, esId = null, fbPostId = null) {
        try {
            const confession = await this.getConfessionById(id);
            
            if (!confession) {
                throw new Error('Confession not found');
            }

            // Save to ProcessedConfession database
            if (status === 'approved' || status === 'deleted') {
                await ProcessedConfession.findOneAndUpdate(
                    { confessionId: id },
                    {
                        confessionId: id,
                        source: 'google_form',
                        status: status,
                        esId: esId,
                        fbPostId: fbPostId,
                        processedAt: new Date(),
                        content: confession.content
                    },
                    { upsert: true, new: true }
                );
                
                console.log(`✅ Confession ${id} saved to ProcessedConfession DB with status: ${status}`);
            }

            // Add to Published_Confessions sheet
            if (status === 'approved' && esId) {
                await this.ensurePublishedSheet();
                
                const publishedRow = [
                    `#ES_${esId}`,
                    confession.content,
                    new Date().toISOString(),
                    fbPostId || '',
                    confession.source
                ];

                await this.sheets.spreadsheets.values.append({
                    spreadsheetId: this.spreadsheetId,
                    range: 'Published_Confessions!A:E',
                    valueInputOption: 'USER_ENTERED',
                    resource: {
                        values: [publishedRow]
                    }
                });

                console.log(`✅ Confession #ES_${esId} added to Published_Confessions`);
            }

            // Mark as processed in original sheet
            const sheetName = id.includes('form_') 
                ? "'Câu trả lời biểu mẫu 1'" 
                : 'Pending_Confessions';
            const rowNum = confession.rowIndex;

            // Try to update status column (column E or F depending on sheet structure)
            try {
                console.log(`📝 Updating status in ${sheetName} row ${rowNum} to: ${status}`);
                
                await this.sheets.spreadsheets.values.update({
                    spreadsheetId: this.spreadsheetId,
                    range: `${sheetName}!E${rowNum}`,
                    valueInputOption: 'USER_ENTERED',
                    resource: {
                        values: [[status]]
                    }
                });
                
                console.log(`✅ Status updated successfully in ${sheetName}`);
            } catch (e) {
                console.log(`⚠️  Could not update status in ${sheetName}, row ${rowNum}: ${e.message}`);
                console.log(`ℹ️  This is normal for Google Form response sheets (read-only)`);
                // Don't throw error - deletion/approval can still work without status update
            }

            return true;
        } catch (error) {
            console.error('Error updating confession status:', error.message);
            throw error;
        }
    }

    /**
     * Delete confession
     */
    async deleteConfession(id) {
        try {
            console.log(`🗑️  Deleting confession: ${id}`);
            
            // Get confession details before deleting
            const confession = await this.getConfessionById(id);
            
            // Save to ProcessedConfession to prevent it from showing up again
            await ProcessedConfession.findOneAndUpdate(
                { confessionId: id },
                {
                    confessionId: id,
                    source: 'google_form',
                    status: 'deleted',
                    processedAt: new Date(),
                    content: confession?.content || ''
                },
                { upsert: true, new: true }
            );
            
            console.log(`✅ Confession ${id} marked as deleted in database`);
            
            // Also try to update in Sheets (optional, won't fail if it doesn't work)
            try {
                await this.updateConfessionStatus(id, 'deleted');
            } catch (e) {
                console.log('ℹ️  Could not update status in Google Sheets (this is OK)');
            }
            
            return true;
            
        } catch (error) {
            console.error('❌ Error deleting confession:', error.message);
            throw error;
        }
    }

    /**
     * Get statistics
     */
    async getStats() {
        try {
            const pending = await this.getPendingConfessions();
            
            let totalPublished = 0;
            try {
                if (this.sheets && this.spreadsheetId) {
                    const published = await this.sheets.spreadsheets.values.get({
                        spreadsheetId: this.spreadsheetId,
                        range: 'Published_Confessions!A:A'
                    });
                    totalPublished = (published.data.values?.length || 1) - 1; // Exclude header
                }
            } catch (e) {
                console.log('ℹ️  Published_Confessions sheet not found');
                totalPublished = 0;
            }

            return {
                pending: pending.length,
                published: totalPublished,
                total: pending.length + totalPublished
            };
        } catch (error) {
            console.error('Error getting stats from Sheets:', error.message);
            return { pending: 0, published: 0, total: 0 };
        }
    }

    /**
     * Ensure Pending_Confessions sheet exists
     */
    async ensurePendingSheet() {
        try {
            // Try to read the sheet
            await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Pending_Confessions!A1'
            });
        } catch (error) {
            // Sheet doesn't exist, create it
            await this.createPendingSheet();
        }
    }

    /**
     * Create Pending_Confessions sheet
     */
    async createPendingSheet() {
        try {
            await this.sheets.spreadsheets.batchUpdate({
                spreadsheetId: this.spreadsheetId,
                resource: {
                    requests: [{
                        addSheet: {
                            properties: {
                                title: 'Pending_Confessions'
                            }
                        }
                    }]
                }
            });

            // Add headers
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: 'Pending_Confessions!A1:E1',
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [['Timestamp', 'Content', 'Source', 'Status', 'ES_ID']]
                }
            });

            console.log('✅ Created Pending_Confessions sheet');
        } catch (error) {
            console.error('Error creating Pending_Confessions sheet:', error);
        }
    }

    /**
     * Ensure Published_Confessions sheet exists
     */
    async ensurePublishedSheet() {
        try {
            await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Published_Confessions!A1'
            });
        } catch (error) {
            // Create sheet
            await this.sheets.spreadsheets.batchUpdate({
                spreadsheetId: this.spreadsheetId,
                resource: {
                    requests: [{
                        addSheet: {
                            properties: {
                                title: 'Published_Confessions'
                            }
                        }
                    }]
                }
            });

            // Add headers
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: 'Published_Confessions!A1:E1',
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [['ES_ID', 'Content', 'Published_Date', 'FB_Post_ID', 'Source']]
                }
            });

            console.log('✅ Created Published_Confessions sheet');
        }
    }
}

module.exports = new SheetsService();
