const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
require('dotenv').config();

class DriveService {
    constructor() {
        this.sharedDriveFolderId = process.env.SHARED_DRIVE_FOLDER_ID;
        this.auth = null;
        this.drive = null;
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
                    scopes: [
                        'https://www.googleapis.com/auth/drive.file',
                        'https://www.googleapis.com/auth/drive'
                    ]
                });

                this.drive = google.drive({ version: 'v3', auth: this.auth });
                console.log('✅ Google Drive API initialized for Shared Drive');
            } else {
                console.warn('⚠️ Warning: Google credentials file not found');
            }
        } catch (error) {
            console.error('Error initializing Google Drive:', error);
        }
    }

    /**
     * Upload image to Google Shared Drive and return public URL
     * @param {Buffer} fileBuffer - File buffer
     * @param {String} filename - Original filename
     * @param {String} mimeType - File MIME type
     * @returns {Promise<String>} - Public URL of uploaded file
     */
    async uploadImage(fileBuffer, filename, mimeType) {
        try {
            if (!this.drive) {
                throw new Error('Google Drive not initialized');
            }

            if (!this.sharedDriveFolderId) {
                throw new Error('SHARED_DRIVE_FOLDER_ID not configured in .env');
            }

            // Create readable stream from buffer
            const bufferStream = new Readable();
            bufferStream.push(fileBuffer);
            bufferStream.push(null);

            // Generate unique filename with timestamp
            const timestamp = Date.now();
            const ext = path.extname(filename);
            const basename = path.basename(filename, ext);
            const uniqueFilename = `${basename}_${timestamp}${ext}`;

            // Upload file to Shared Drive folder
            const fileMetadata = {
                name: uniqueFilename,
                parents: [this.sharedDriveFolderId]
            };

            const media = {
                mimeType: mimeType,
                body: bufferStream
            };

            const response = await this.drive.files.create({
                requestBody: fileMetadata,
                media: media,
                fields: 'id, webViewLink, webContentLink',
                supportsAllDrives: true // Important for Shared Drives
            });

            const fileId = response.data.id;

            // Make file publicly accessible
            await this.drive.permissions.create({
                fileId: fileId,
                requestBody: {
                    role: 'reader',
                    type: 'anyone'
                },
                supportsAllDrives: true // Important for Shared Drives
            });

            // Get public URL for direct image display
            const publicUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;

            console.log(`✅ Uploaded image to Shared Drive: ${uniqueFilename} -> ${publicUrl}`);

            return publicUrl;
        } catch (error) {
            console.error('Error uploading to Google Shared Drive:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Upload multiple images to Google Shared Drive
     * @param {Array} files - Array of file objects {buffer, filename, mimetype}
     * @returns {Promise<Array>} - Array of public URLs
     */
    async uploadMultipleImages(files) {
        try {
            const uploadPromises = files.map(file => 
                this.uploadImage(file.buffer, file.filename, file.mimetype)
            );

            const urls = await Promise.all(uploadPromises);
            console.log(`✅ Uploaded ${urls.length} images to Shared Drive`);
            
            return urls;
        } catch (error) {
            console.error('Error uploading multiple images:', error);
            throw error;
        }
    }

    /**
     * Delete image from Google Shared Drive
     * @param {String} fileUrl - Public URL of the file
     */
    async deleteImage(fileUrl) {
        try {
            if (!this.drive) {
                throw new Error('Google Drive not initialized');
            }

            // Extract file ID from URL
            const fileIdMatch = fileUrl.match(/id=([^&]+)/);
            if (!fileIdMatch) {
                throw new Error('Invalid Drive URL');
            }

            const fileId = fileIdMatch[1];

            await this.drive.files.delete({
                fileId: fileId,
                supportsAllDrives: true
            });

            console.log(`🗑️ Deleted image from Shared Drive: ${fileId}`);
        } catch (error) {
            console.error('Error deleting from Shared Drive:', error);
            // Don't throw - deletion failure shouldn't break the flow
        }
    }
}

module.exports = new DriveService();
