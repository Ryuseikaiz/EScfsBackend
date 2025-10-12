const { google } = require('googleapis');
const fs = require('fs');
require('dotenv').config();

async function testDriveAccess() {
    try {
        console.log('🔍 Testing Google Drive access...\n');

        // Load credentials
        const credentialsPath = process.env.GOOGLE_CREDENTIALS_PATH || './google-credentials.json';
        const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
        
        console.log('✅ Service Account:', credentials.client_email);
        console.log('📁 Folder ID:', process.env.SHARED_DRIVE_FOLDER_ID);
        console.log('');

        const auth = new google.auth.GoogleAuth({
            credentials: credentials,
            scopes: ['https://www.googleapis.com/auth/drive']
        });

        const drive = google.drive({ version: 'v3', auth });

        // Test 1: Get folder info
        console.log('📋 Test 1: Checking folder permissions...');
        try {
            const folderInfo = await drive.files.get({
                fileId: process.env.SHARED_DRIVE_FOLDER_ID,
                fields: 'id, name, mimeType, driveId, capabilities, permissions',
                supportsAllDrives: true
            });

            console.log('✅ Folder Name:', folderInfo.data.name);
            console.log('✅ Folder Type:', folderInfo.data.mimeType);
            console.log('✅ Drive ID:', folderInfo.data.driveId || 'N/A (Regular folder)');
            console.log('');

            // Check if it's a Shared Drive
            if (folderInfo.data.driveId) {
                console.log('✅ This is a SHARED DRIVE folder - Should work!');
            } else {
                console.log('⚠️  This is a REGULAR folder - Checking permissions...');
                
                // Check permissions
                try {
                    const permissions = await drive.permissions.list({
                        fileId: process.env.SHARED_DRIVE_FOLDER_ID,
                        fields: 'permissions(emailAddress, role, type)',
                        supportsAllDrives: true
                    });

                    console.log('📧 Folder shared with:');
                    permissions.data.permissions.forEach(perm => {
                        console.log(`   - ${perm.emailAddress || perm.type}: ${perm.role}`);
                    });

                    const serviceAccountHasAccess = permissions.data.permissions.some(
                        perm => perm.emailAddress === credentials.client_email && 
                               (perm.role === 'writer' || perm.role === 'owner')
                    );

                    if (serviceAccountHasAccess) {
                        console.log('✅ Service Account has WRITE access!');
                    } else {
                        console.log('❌ Service Account DOES NOT have write access!');
                        console.log('');
                        console.log('🔧 FIX:');
                        console.log('1. Open folder in Google Drive');
                        console.log('2. Right click → Share');
                        console.log('3. Add:', credentials.client_email);
                        console.log('4. Permission: Editor');
                        console.log('5. Uncheck "Notify people"');
                        console.log('6. Click Done');
                        return;
                    }
                } catch (permError) {
                    console.log('❌ Cannot check permissions:', permError.message);
                }
            }
            console.log('');
        } catch (error) {
            console.log('❌ Cannot access folder:', error.message);
            console.log('');
            console.log('🔧 Possible issues:');
            console.log('1. SHARED_DRIVE_FOLDER_ID is incorrect');
            console.log('2. Folder not shared with service account');
            console.log('3. Service account doesn\'t have permission');
            return;
        }

        // Test 2: Try to list files
        console.log('📋 Test 2: Listing files in folder...');
        try {
            const fileList = await drive.files.list({
                q: `'${process.env.SHARED_DRIVE_FOLDER_ID}' in parents and trashed=false`,
                fields: 'files(id, name, mimeType, createdTime)',
                supportsAllDrives: true,
                includeItemsFromAllDrives: true
            });

            console.log(`✅ Found ${fileList.data.files.length} files`);
            if (fileList.data.files.length > 0) {
                console.log('   Recent files:');
                fileList.data.files.slice(0, 3).forEach(file => {
                    console.log(`   - ${file.name} (${file.mimeType})`);
                });
            }
            console.log('');
        } catch (error) {
            console.log('❌ Cannot list files:', error.message);
            return;
        }

        // Test 3: Try to upload a test file
        console.log('📋 Test 3: Uploading test file...');
        try {
            const testContent = 'Test file from service account';
            const { Readable } = require('stream');
            const stream = new Readable();
            stream.push(testContent);
            stream.push(null);

            const fileMetadata = {
                name: `test_upload_${Date.now()}.txt`,
                parents: [process.env.SHARED_DRIVE_FOLDER_ID]
            };

            const media = {
                mimeType: 'text/plain',
                body: stream
            };

            const response = await drive.files.create({
                requestBody: fileMetadata,
                media: media,
                fields: 'id, name, webViewLink',
                supportsAllDrives: true
            });

            console.log('✅ Upload SUCCESS!');
            console.log('   File:', response.data.name);
            console.log('   ID:', response.data.id);
            console.log('   Link:', response.data.webViewLink);
            console.log('');

            // Make it public
            await drive.permissions.create({
                fileId: response.data.id,
                requestBody: {
                    role: 'reader',
                    type: 'anyone'
                },
                supportsAllDrives: true
            });

            const publicUrl = `https://drive.google.com/uc?export=view&id=${response.data.id}`;
            console.log('   Public URL:', publicUrl);
            console.log('');
            console.log('🎉 Everything is working! You can upload images now!');

            // Cleanup - delete test file
            await drive.files.delete({
                fileId: response.data.id,
                supportsAllDrives: true
            });
            console.log('✅ Test file cleaned up');

        } catch (error) {
            console.log('❌ Upload FAILED:', error.message);
            console.log('');
            
            if (error.message.includes('quota') || error.message.includes('storage')) {
                console.log('🔧 SOLUTION:');
                console.log('');
                console.log('This folder is in "My Drive" (not Shared Drive).');
                console.log('Service Account cannot upload here due to quota restrictions.');
                console.log('');
                console.log('Option 1: Use Google Shared Drive (need Workspace)');
                console.log('   - Create a Shared Drive');
                console.log('   - Add service account as Content Manager');
                console.log('');
                console.log('Option 2: Use different hosting (FREE)');
                console.log('   - Imgur: 12,500 uploads/day (recommended)');
                console.log('   - Cloudinary: 25GB storage');
                console.log('   - See IMGUR_SETUP.md for guide');
            }
        }

    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

testDriveAccess();
