const imgbbService = require('./services/imgbbService');
const fs = require('fs');
require('dotenv').config();

async function testImgBB() {
    try {
        console.log('🧪 Testing ImgBB upload...\n');
        console.log('API Key:', process.env.IMGBB_API_KEY ? '✅ Configured' : '❌ Not found');
        
        if (!process.env.IMGBB_API_KEY) {
            console.log('\n❌ Please add IMGBB_API_KEY to .env file');
            return;
        }

        // Create a simple test image (1x1 red pixel PNG)
        const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
        const testImageBuffer = Buffer.from(testImageBase64, 'base64');

        console.log('\n📤 Uploading test image to ImgBB...');
        
        const imageUrl = await imgbbService.uploadImage(testImageBuffer, 'test-image.png');
        
        console.log('\n✅ SUCCESS!');
        console.log('Image URL:', imageUrl);
        console.log('\n🎉 ImgBB is working! You can now upload images from your website.');
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        if (error.response && error.response.data) {
            console.error('Error details:', error.response.data);
        }
        
        console.log('\n🔧 Troubleshooting:');
        console.log('1. Check IMGBB_API_KEY in .env file');
        console.log('2. Make sure API key is valid (get from https://api.imgbb.com/)');
        console.log('3. Check internet connection');
    }
}

testImgBB();
