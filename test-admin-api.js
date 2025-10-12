const axios = require('axios');

async function testAdminAPI() {
    try {
        console.log('🔍 Testing Admin API for pending confessions...\n');

        // Login first to get token
        const loginResponse = await axios.post('http://localhost:5000/api/admin/login', {
            username: 'toilaai',
            password: 'ailatoi'
        });

        const token = loginResponse.data.token;
        console.log('✅ Logged in successfully\n');

        // Get pending confessions
        const response = await axios.get('http://localhost:5000/api/admin/pending', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        console.log(`📊 Found ${response.data.confessions.length} pending confessions\n`);

        response.data.confessions.forEach((conf, idx) => {
            console.log(`--- Confession ${idx + 1} ---`);
            console.log('Source:', conf.source);
            console.log('Content:', conf.content.substring(0, 50) + '...');
            console.log('Has images array:', !!conf.images);
            console.log('Images count:', conf.images ? conf.images.length : 0);
            console.log('Image URLs:', conf.images || 'none');
            console.log('');
        });

        // Check specifically Google Sheets ones
        const sheetsConfessions = response.data.confessions.filter(c => c.source === 'google_form');
        console.log(`\n🔍 Google Sheets confessions: ${sheetsConfessions.length}`);
        sheetsConfessions.forEach((conf, idx) => {
            console.log(`\nGoogle Form Confession ${idx + 1}:`);
            console.log('Images:', conf.images);
            console.log('First image URL:', conf.images && conf.images[0]);
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
    }
}

testAdminAPI();
