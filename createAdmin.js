const mongoose = require('mongoose');
require('dotenv').config();

const Admin = require('./models/Admin');

const createAdmin = async () => {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Check if admin already exists
        const existingAdmin = await Admin.findOne({ username: 'toilaai' });
        
        if (existingAdmin) {
            console.log('⚠️  Admin account already exists!');
            console.log(`Username: toilaai`);
            console.log(`Last login: ${existingAdmin.lastLogin || 'Never'}`);
        } else {
            // Create new admin
            const admin = new Admin({
                username: 'toilaai',
                password: 'ailatoi', // Will be hashed automatically by pre-save hook
                role: 'admin'
            });

            await admin.save();
            console.log('✅ Admin account created successfully!');
            console.log('👤 Username: toilaai');
            console.log('🔑 Password: ailatoi');
        }

        // Disconnect
        await mongoose.disconnect();
        console.log('✅ Disconnected from MongoDB');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
};

createAdmin();
