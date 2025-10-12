const mongoose = require('mongoose');

const ProcessedConfessionSchema = new mongoose.Schema({
    confessionId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    source: {
        type: String,
        enum: ['google_form', 'website'],
        required: true
    },
    status: {
        type: String,
        enum: ['approved', 'deleted', 'rejected'],
        required: true
    },
    esId: {
        type: Number,
        default: null
    },
    fbPostId: {
        type: String,
        default: null
    },
    processedBy: {
        type: String,
        default: null
    },
    processedAt: {
        type: Date,
        default: Date.now
    },
    content: {
        type: String,
        default: null
    }
});

module.exports = mongoose.model('ProcessedConfession', ProcessedConfessionSchema);
