const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const multer = require('multer');
require('dotenv').config();

const connectDB = require('./config/database');
const facebookService = require('./services/facebookService');
const sheetsService = require('./services/sheetsService');
const databaseService = require('./services/databaseService');
const driveService = require('./services/driveService');
const imgbbService = require('./services/imgbbService');
const driveDownloadService = require('./services/driveDownloadService');
const Admin = require('./models/Admin');

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to MongoDB
connectDB();

// Configure multer for memory storage
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        // Accept images only
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Only image files are allowed'), false);
        }
        cb(null, true);
    }
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
};

// ==================== CACHING ====================
let cachedConfessions = null;
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// ==================== PUBLIC ROUTES ====================

// Get published confessions from Facebook (with caching)
app.get('/api/confessions', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 500, 500);
        const now = Date.now();
        const cacheAge = now - lastFetchTime;
        
        // Return cached data if fresh and sufficient
        if (cachedConfessions && cacheAge < CACHE_DURATION && cachedConfessions.length >= limit) {
            console.log(`📦 Returning cached confessions (${cachedConfessions.length} posts, cache age: ${Math.floor(cacheAge / 1000)}s)`);
            const posts = cachedConfessions.slice(0, limit);
            return res.json({
                confessions: posts,
                total: posts.length,
                limit: limit,
                cached: true,
                cacheAge: Math.floor(cacheAge / 1000)
            });
        }
        
        // Fetch fresh data
        console.log(`📥 API request for ${limit} confessions (fetching from Facebook...)`);
        const posts = await facebookService.getPublishedPosts(limit);
        
        // Update cache
        cachedConfessions = posts;
        lastFetchTime = now;
        console.log(`✅ Cached ${posts.length} confessions`);
        
        res.json({
            confessions: posts,
            total: posts.length,
            limit: limit,
            cached: false
        });
    } catch (error) {
        console.error('Error fetching confessions:', error);
        res.status(500).json({ error: 'Failed to fetch confessions' });
    }
});

// Force refresh cache (can be called by admin or cron job)
app.post('/api/confessions/refresh-cache', async (req, res) => {
    try {
        console.log('🔄 Manually refreshing confession cache...');
        const posts = await facebookService.getPublishedPosts(500);
        cachedConfessions = posts;
        lastFetchTime = Date.now();
        console.log(`✅ Cache refreshed with ${posts.length} confessions`);
        
        res.json({
            success: true,
            message: 'Cache refreshed successfully',
            totalConfessions: posts.length
        });
    } catch (error) {
        console.error('Error refreshing cache:', error);
        res.status(500).json({ error: 'Failed to refresh cache' });
    }
});

// Submit new confession (public, no login required)
app.post('/api/confessions/submit', upload.array('images', 5), async (req, res) => {
    try {
        const { content } = req.body;
        
        if (!content || content.trim() === '') {
            return res.status(400).json({ error: 'Confession content is required' });
        }

        let imageUrls = [];

        // Upload images to ImgBB if provided
        if (req.files && req.files.length > 0) {
            try {
                const filesData = req.files.map(file => ({
                    buffer: file.buffer,
                    filename: file.originalname,
                    mimetype: file.mimetype
                }));

                imageUrls = await imgbbService.uploadMultipleImages(filesData);
                console.log(`✅ Uploaded ${imageUrls.length} images to ImgBB`);
            } catch (uploadError) {
                console.error('Error uploading images to ImgBB:', uploadError);
                // Continue without images if upload fails
            }
        }

        // Save to MongoDB (website submissions)
        const result = await databaseService.addConfession({
            content: content.trim(),
            images: imageUrls
        });

        res.json({ 
            message: 'Confession submitted successfully! Waiting for approval.',
            id: result.id,
            imageUrls: imageUrls
        });
    } catch (error) {
        console.error('Error submitting confession:', error);
        res.status(500).json({ error: 'Failed to submit confession' });
    }
});

// Admin login
app.post('/api/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Find admin in database
        const admin = await Admin.findOne({ username });

        if (!admin) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Compare password
        const isValidPassword = await admin.comparePassword(password);

        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Update last login
        admin.lastLogin = new Date();
        await admin.save();

        // Generate JWT token
        const token = jwt.sign(
            { id: admin._id, username: admin.username, role: admin.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({ 
            message: 'Login successful',
            token,
            user: { 
                username: admin.username, 
                role: admin.role,
                lastLogin: admin.lastLogin
            }
        });
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// ==================== ADMIN ROUTES (Protected) ====================

// Get pending confessions with filter support
app.get('/api/admin/pending', authenticateToken, async (req, res) => {
    try {
        const { source, status } = req.query; // 'website', 'google_sheets', or 'all'; status is optional
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        
        let websiteData = { confessions: [], total: 0 };
        let sheetsConfessions = [];

        // Get confessions from MongoDB (pagination handled in DB)
        if (!source || source === 'all' || source === 'website') {
            if (source === 'website') {
                 // Use optimized pending query if status is pending or not specified (default)
                 if (!status || status === 'pending') {
                     websiteData = await databaseService.getPendingConfessions(page, limit);
                 } else {
                     // Use generic query for history (approved/rejected)
                     websiteData = await databaseService.getAllConfessions(status, page, limit);
                 }
            } else {
                 // For 'all' source:
                 // If requesting 'pending', fetching limited amount is "okay" but risky for sorting.
                 // If requesting 'approved', we DEFINITELY need pagination.
                 
                 // If we are in 'all' mode, we really should fetch from DB with pagination
                 // and fetch from Sheets, then merge. 
                 
                 if (!status || status === 'pending') {
                    websiteData = await databaseService.getPendingConfessions(1, page * limit);
                 } else {
                    websiteData = await databaseService.getAllConfessions(status, 1, page * limit);
                 }
            }
        }

        // Get confessions from Google Sheets
        if (!source || source === 'all' || source === 'google_sheets') {
             // Sheets service currently only returns "Pending". 
             // Implementing "Approved" history from Sheets would need reading 'Published_Confessions'.
             // For now, if status is 'approved' or 'rejected', sheets returns empty (or we need to update sheetsService)
             // Let's assume for now Sheets only supports pending review in this dashboard.
             
             if (!status || status === 'pending') {
                sheetsConfessions = await sheetsService.getPendingConfessions();
             } else {
                 // TODO: Implement getHistory from Sheets if needed. 
                 sheetsConfessions = []; 
             }
        }

        let allConfessions = [];
        
        if (source === 'website') {
            // Native DB pagination
            allConfessions = websiteData.confessions;
            
            return res.json({
                confessions: allConfessions,
                pagination: {
                   page: websiteData.page,
                   limit: limit,
                   total: websiteData.total,
                   totalPages: websiteData.totalPages
                },
                stats: {
                    website: websiteData.total,
                    google_sheets: 0, 
                    total: websiteData.total
                }
            });
        }

        // Merge logic for 'all' or 'google_sheets'
        const websiteConfs = websiteData.confessions || [];
        
        allConfessions = [
            ...websiteConfs.map(c => ({ ...c, sourceType: 'website' })),
            ...sheetsConfessions.map(c => ({ ...c, sourceType: 'google_sheets', status: c.status || 'pending' }))
        ];

        // Sort by timestamp descending
        allConfessions.sort((a, b) => {
            const dateA = new Date(a.timestamp || a.submittedAt);
            const dateB = new Date(b.timestamp || b.submittedAt);
            return dateB - dateA;
        });
        
        // Manual Pagination for the merged list
        const totalItems = allConfessions.length;
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedConfessions = allConfessions.slice(startIndex, endIndex);

        // Count stats (approximate)
        const websiteTotal = websiteData.total || websiteConfs.length;
        const sheetsTotal = sheetsConfessions.length;

        res.json({
            confessions: paginatedConfessions,
            pagination: {
                page: page,
                limit: limit,
                total: websiteTotal + sheetsTotal,
                totalPages: Math.ceil((websiteTotal + sheetsTotal) / limit)
            },
            stats: {
                website: websiteTotal,
                google_sheets: sheetsTotal,
                total: websiteTotal + sheetsTotal
            }
        });
    } catch (error) {
        console.error('Error fetching pending confessions:', error);
        res.status(500).json({ error: 'Failed to fetch confessions' });
    }
});

// Approve confession and post to Facebook
app.post('/api/admin/approve/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { sourceType } = req.body; // 'website' or 'google_sheets'
        
        let confession;
        
        // Get confession from appropriate source
        if (sourceType === 'website') {
            confession = await databaseService.getConfessionById(id);
        } else {
            confession = await sheetsService.getConfessionById(id);
        }
        
        if (!confession) {
            return res.status(404).json({ error: 'Confession not found' });
        }

        // CRITICAL FIX: Check if already approved to prevent duplicates
        if (confession.status === 'approved') {
             console.log(`⚠️ Confession ${id} is already approved. Skipping duplicate approval request.`);
             return res.status(409).json({ 
                 error: 'Confession already approved',
                 esId: confession.esId ? `#ES_${confession.esId}` : 'Unknown',
                 fbPostId: confession.fbPostId
             });
        }

        // Get next ES ID (check both sources)
        const dbLatestId = await databaseService.getLatestESId();
        const sheetsLatestId = await sheetsService.getNextESId();
        const fbLatestId = await facebookService.getLatestESId();
        
        // All three functions already return the NEXT ID to use, so don't add +1 again
        let esId = Math.max(dbLatestId, sheetsLatestId, fbLatestId);
        
        // Reset to 0 if exceeds 9999 (cycle back)
        if (esId > 9999) {
            esId = 0;
        }
        
        console.log(`📊 ES_ID calculation: DB=${dbLatestId}, Sheets=${sheetsLatestId}, FB=${fbLatestId} → Next=${esId}${esId === 0 ? ' (Reset cycle)' : ''}`);
        
        // Determine which images to use for Facebook posting
        let fbImageUrls = [];
        let fbImageBuffers = []; // For direct buffer upload (better quality)

        if (sourceType === 'google_sheets' && (confession.driveLink || (confession.images && confession.images.length > 0))) {
            // Google Sheets: Download from Drive → Post DIRECTLY to Facebook (best quality, no ImgBB compression)
            try {
                console.log('🔄 Downloading Google Drive images for direct Facebook upload (full quality)...');

                const driveUrls = confession.images || [confession.driveLink];
                const downloadedFiles = await driveDownloadService.downloadMultipleImages(driveUrls);

                if (downloadedFiles.length > 0) {
                    fbImageBuffers = downloadedFiles.map(file => file.buffer);
                    console.log(`✅ Downloaded ${downloadedFiles.length} image(s) for direct upload (preserving quality)`);
                }
            } catch (conversionError) {
                console.error('⚠️  Failed to download images:', conversionError.message);
                console.log('⚠️  Will post text-only to Facebook');
            }
        } else if (sourceType === 'website' && confession.images && confession.images.length > 0) {
            // Website submissions already use ImgBB URLs
            fbImageUrls = confession.images; // Use ImgBB URLs
            console.log(`✅ Using ${confession.images.length} website ImgBB image(s)`);
        }

        // Post to Facebook (with images if available)
        const fbPost = await facebookService.postConfession(
            esId,
            confession.content,
            fbImageBuffers.length > 0 ? fbImageBuffers : (fbImageUrls.length > 0 ? fbImageUrls : null)
        );
        
        // Update status in appropriate source
        if (sourceType === 'website') {
            await databaseService.updateConfessionStatus(id, 'approved', esId, fbPost.id, req.user.username);
        } else {
            // For Google Sheets: DELETE ROW after approval (clean up the sheet)
            await sheetsService.updateConfessionStatus(id, 'approved', esId, fbPost.id, true);
        }

        res.json({ 
            message: 'Confession approved and posted to Facebook',
            esId: `#ES_${esId}`,
            fbPostId: fbPost.id
        });
    } catch (error) {
        console.error('Error approving confession:', error);
        res.status(500).json({ error: 'Failed to approve confession' });
    }
});

// Bulk approve all pending confessions with filters
app.post('/api/admin/approve-all', authenticateToken, async (req, res) => {
    try {
        const { sourceFilter, statusFilter } = req.body; // 'all', 'website', 'google_sheets' and status
        
        let websiteConfessions = [];
        let sheetsConfessions = [];

        // Get confessions based on filter
        if (!sourceFilter || sourceFilter === 'all' || sourceFilter === 'website') {
            // Fetch pending confessions directly (limit 1000 for bulk operations)
            const websiteData = await databaseService.getAllConfessions('pending', 1, 1000);
            websiteConfessions = websiteData.confessions;
        }

        if (!sourceFilter || sourceFilter === 'all' || sourceFilter === 'google_sheets') {
            sheetsConfessions = await sheetsService.getPendingConfessions();
            sheetsConfessions = sheetsConfessions.filter(c => !c.status || c.status === 'pending');
        }

        const allPendingConfessions = [
            ...websiteConfessions.map(c => ({ ...c, sourceType: 'website' })),
            ...sheetsConfessions.map(c => ({ ...c, sourceType: 'google_sheets' }))
        ];

        if (allPendingConfessions.length === 0) {
            return res.json({ 
                message: 'No pending confessions to approve',
                successCount: 0,
                failCount: 0,
                total: 0
            });
        }

        let successCount = 0;
        let failCount = 0;
        const results = [];

        // Get starting ES ID
        const dbLatestId = await databaseService.getLatestESId();
        const sheetsLatestId = await sheetsService.getNextESId();
        const fbLatestId = await facebookService.getLatestESId();
        
        // All three functions already return the NEXT ID to use, so don't add +1 again
        let esId = Math.max(dbLatestId, sheetsLatestId, fbLatestId);

        // Process each confession
        for (const confession of allPendingConfessions) {
            try {
                // Reset ES ID if exceeds 9999
                if (esId > 9999) {
                    esId = 0;
                }

                // Handle images
                let fbImageUrls = [];
                let fbImageBuffers = []; // For direct buffer upload (better quality)
                
                if (confession.sourceType === 'google_sheets' && (confession.driveLink || (confession.images && confession.images.length > 0))) {
                    try {
                        const driveUrls = confession.images || [confession.driveLink];
                        const downloadedFiles = await driveDownloadService.downloadMultipleImages(driveUrls);

                        if (downloadedFiles.length > 0) {
                            fbImageBuffers = downloadedFiles.map(file => file.buffer);
                        }
                    } catch (conversionError) {
                        console.error(`⚠️ Failed to download images for confession ${confession.id}:`, conversionError.message);
                    }
                } else if (confession.sourceType === 'website' && confession.images && confession.images.length > 0) {
                    fbImageUrls = confession.images; // Use ImgBB URLs
                }

                // Post to Facebook
                const fbPost = await facebookService.postConfession(
                    esId,
                    confession.content,
                    fbImageBuffers.length > 0 ? fbImageBuffers : (fbImageUrls.length > 0 ? fbImageUrls : null)
                );

                // Update status
                if (confession.sourceType === 'website') {
                    await databaseService.updateConfessionStatus(confession.id, 'approved', esId, fbPost.id, req.user.username);
                } else {
                    // For Google Sheets: DELETE ROW after approval
                    await sheetsService.updateConfessionStatus(confession.id, 'approved', esId, fbPost.id, true);
                }

                results.push({
                    id: confession.id,
                    esId: `#ES_${esId}`,
                    success: true
                });

                successCount++;
                esId++; // Increment for next confession

                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (error) {
                console.error(`Error approving confession ${confession.id}:`, error);
                results.push({
                    id: confession.id,
                    success: false,
                    error: error.message
                });
                failCount++;
            }
        }

        res.json({ 
            message: `Approved ${successCount} confessions`,
            successCount,
            failCount,
            total: allPendingConfessions.length,
            results
        });
    } catch (error) {
        console.error('Error in bulk approve:', error);
        res.status(500).json({ error: 'Failed to approve confessions' });
    }
});

// Reject confession (DELETE completely)
app.post('/api/admin/reject/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { sourceType } = req.body; // 'website' or 'google_sheets'
        
        // Reject = DELETE completely (no history needed)
        if (sourceType === 'website') {
            // For website: DELETE from database permanently
            await databaseService.deleteConfession(id);
        } else {
            // For Google Sheets: DELETE row + mark in ProcessedConfession as rejected
            await sheetsService.deleteConfession(id, true); // true = delete row from sheet
            
            // Update status to rejected instead of deleted in ProcessedConfession
            const ProcessedConfession = require('./models/ProcessedConfession');
            await ProcessedConfession.findOneAndUpdate(
                { confessionId: id },
                { status: 'rejected' },
                { new: true }
            );
        }

        res.json({ message: 'Confession rejected and deleted successfully' });
    } catch (error) {
        console.error('Error rejecting confession:', error);
        res.status(500).json({ error: 'Failed to reject confession' });
    }
});

// Delete/Reject confession (permanently delete)
app.delete('/api/admin/delete/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { sourceType } = req.body; // 'website' or 'google_sheets'
        
        // Delete from appropriate source
        if (sourceType === 'website') {
            await databaseService.deleteConfession(id);
        } else {
            await sheetsService.deleteConfession(id);
        }

        res.json({ message: 'Confession deleted successfully' });
    } catch (error) {
        console.error('Error deleting confession:', error);
        res.status(500).json({ error: 'Failed to delete confession' });
    }
});

// Bulk delete confessions (for approved/rejected)
app.post('/api/admin/delete-all', authenticateToken, async (req, res) => {
    try {
        const { sourceFilter, statusFilter } = req.body;
        
        // Only allow deleting approved or rejected confessions
        if (statusFilter !== 'approved' && statusFilter !== 'rejected') {
            return res.status(400).json({ error: 'Can only bulk delete approved or rejected confessions' });
        }

        let websiteConfessions = [];
        let sheetsConfessions = [];

        // Get confessions based on filter
        if (!sourceFilter || sourceFilter === 'all' || sourceFilter === 'website') {
            // Fetch confessions with large limit for bulk operations
            const websiteData = await databaseService.getAllConfessions(statusFilter, 1, 1000);
            websiteConfessions = websiteData.confessions;
        }

        if (!sourceFilter || sourceFilter === 'all' || sourceFilter === 'google_sheets') {
            const allSheets = await sheetsService.getPendingConfessions();
            // Note: Need to get ALL confessions including processed ones
            // This will require updating sheetsService to fetch processed ones too
        }

        const confessionsToDelete = [
            ...websiteConfessions.map(c => ({ ...c, sourceType: 'website' })),
            ...sheetsConfessions.map(c => ({ ...c, sourceType: 'google_sheets' }))
        ];

        if (confessionsToDelete.length === 0) {
            return res.json({
                message: 'No confessions to delete',
                successCount: 0,
                failCount: 0,
                total: 0
            });
        }

        let successCount = 0;
        let failCount = 0;

        for (const confession of confessionsToDelete) {
            try {
                if (confession.sourceType === 'website') {
                    await databaseService.deleteConfession(confession.id);
                } else {
                    await sheetsService.deleteConfession(confession.id);
                }
                successCount++;
            } catch (error) {
                console.error(`Error deleting confession ${confession.id}:`, error);
                failCount++;
            }
        }

        res.json({
            message: `Deleted ${successCount} confessions`,
            successCount,
            failCount,
            total: confessionsToDelete.length
        });
    } catch (error) {
        console.error('Error in bulk delete:', error);
        res.status(500).json({ error: 'Failed to delete confessions' });
    }
});

// Get statistics (for admin dashboard)
app.get('/api/admin/stats', authenticateToken, async (req, res) => {
    try {
        const dbStats = await databaseService.getStats();
        const sheetsStats = await sheetsService.getStats();
        
        const combinedStats = {
            website: {
                pending: dbStats.pending,
                approved: dbStats.approved,
                rejected: dbStats.rejected,
                total: dbStats.total
            },
            google_sheets: {
                pending: sheetsStats.pending,
                published: sheetsStats.published,
                total: sheetsStats.total
            },
            overall: {
                pending: dbStats.pending + sheetsStats.pending,
                approved: dbStats.approved + sheetsStats.published,
                total: dbStats.total + sheetsStats.total
            }
        };
        
        res.json(combinedStats);
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Start server (only if not running in serverless environment)
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`🚀 Server is running on port ${PORT}`);
        console.log(`📝 API available at http://localhost:${PORT}/api`);
    });
}

module.exports = app;
