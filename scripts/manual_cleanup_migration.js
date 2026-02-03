
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const connectDB = require('../config/database');
const databaseService = require('../services/databaseService');

const runMigration = async () => {
    try {
        console.log('🔌 Connecting to database...');
        await connectDB();

        console.log('🚀 Starting cleanup migration...');
        const count = await databaseService.cleanupApprovedConfessions();

        console.log(`✨ SUCCESS: Migrated and cleaned up ${count} approved confessions.`);
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
};

runMigration();
