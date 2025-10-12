const axios = require('axios');
const { google } = require('googleapis');
const fs = require('fs');
require('dotenv').config();

class DriveDownloadService {
    constructor() {
        this.auth = null;
        this.drive = null;
        this.initialize();
    }

    async initialize() {
        try {
            const credentialsPath = process.env.GOOGLE_CREDENTIALS_PATH || './google-credentials.json';
            
            if (fs.existsSync(credentialsPath)) {
                const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
                
                this.auth = new google.auth.GoogleAuth({
                    credentials: credentials,
                    scopes: ['https://www.googleapis.com/auth/drive.readonly']
                });

                this.drive = google.drive({ version: 'v3', auth: this.auth });
                console.log('✅ Google Drive Download Service initialized');
            }
        } catch (error) {
            console.error('Error initializing Drive Download Service:', error);
        }
    }

    /**
     * Extract file ID from Google Drive URL
     * @param {string} driveUrl - Google Drive URL
     * @returns {string|null} - File ID or null
     */
    extractFileId(driveUrl) {
        if (!driveUrl) return null;

        try {
            // Pattern 1: /file/d/FILE_ID/
            let match = driveUrl.match(/\/file\/d\/([^\/\?]+)/);
            if (match) return match[1];

            // Pattern 2: ?id=FILE_ID or &id=FILE_ID
            match = driveUrl.match(/[?&]id=([^&]+)/);
            if (match) return match[1];

            // Pattern 3: /uc?id=FILE_ID
            match = driveUrl.match(/\/uc\?.*id=([^&]+)/);
            if (match) return match[1];

            // Pattern 4: /thumbnail?id=FILE_ID
            match = driveUrl.match(/\/thumbnail\?.*id=([^&]+)/);
            if (match) return match[1];

            return null;
        } catch (error) {
            console.error('Error extracting file ID:', error);
            return null;
        }
    }

    /**
     * Download image from Google Drive as buffer
     * @param {string} driveUrl - Google Drive URL
     * @returns {Promise<{buffer: Buffer, filename: string, mimeType: string}>} - Image data
     */
    async downloadImage(driveUrl) {
        try {
            const fileId = this.extractFileId(driveUrl);
            if (!fileId) {
                throw new Error('Could not extract file ID from Drive URL');
            }

            console.log(`📥 Downloading from Google Drive: ${fileId}`);

            // Get file metadata
            const metadata = await this.drive.files.get({
                fileId: fileId,
                fields: 'name, mimeType, size',
                supportsAllDrives: true
            });

            const filename = metadata.data.name;
            const mimeType = metadata.data.mimeType;

            console.log(`📄 File: ${filename} (${mimeType})`);

            // Download file content
            const response = await this.drive.files.get({
                fileId: fileId,
                alt: 'media',
                supportsAllDrives: true
            }, {
                responseType: 'arraybuffer'
            });

            const buffer = Buffer.from(response.data);
            
            console.log(`✅ Downloaded ${buffer.length} bytes`);

            return {
                buffer: buffer,
                filename: filename,
                mimeType: mimeType
            };

        } catch (error) {
            console.error('❌ Error downloading from Google Drive:', error.message);
            throw error;
        }
    }

    /**
     * Download multiple images from Google Drive
     * @param {Array<string>} driveUrls - Array of Google Drive URLs
     * @returns {Promise<Array<{buffer, filename, mimeType}>>}
     */
    async downloadMultipleImages(driveUrls) {
        try {
            const validUrls = driveUrls.filter(url => url && this.extractFileId(url));
            
            if (validUrls.length === 0) {
                return [];
            }

            console.log(`📥 Downloading ${validUrls.length} images from Google Drive...`);

            const downloadPromises = validUrls.map(url => this.downloadImage(url));
            const results = await Promise.all(downloadPromises);

            return results;

        } catch (error) {
            console.error('❌ Error downloading multiple images:', error);
            throw error;
        }
    }
}

module.exports = new DriveDownloadService();
