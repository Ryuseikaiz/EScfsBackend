const mongoose = require('mongoose');

const confessionSchema = new mongoose.Schema({
    content: {
        type: String,
        required: true,
        trim: true
    },
    images: {
        type: [String],
        default: []
    },
    source: {
        type: String,
        enum: ['website', 'google_form'],
        default: 'website'
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    esId: {
        type: Number,
        default: null
    },
    fbPostId: {
        type: String,
        default: null
    },
    submittedAt: {
        type: Date,
        default: Date.now
    },
    approvedAt: {
        type: Date,
        default: null
    },
    approvedBy: {
        type: String,
        default: null
    }
}, {
    timestamps: true
});

// Index for faster queries
confessionSchema.index({ status: 1, submittedAt: -1 });
confessionSchema.index({ esId: 1 });

module.exports = mongoose.model('Confession', confessionSchema);
