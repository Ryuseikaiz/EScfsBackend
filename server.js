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

// ==================== PUBLIC ROUTES ====================

// Get published confessions from Facebook (with pagination)
app.get('/api/confessions', async (req, res) => {
    try {
        // Allow up to 500 posts (will make multiple API calls)
        const limit = Math.min(parseInt(req.query.limit) || 500, 500);
        console.log(`📥 API request for ${limit} confessions`);
        
        const posts = await facebookService.getPublishedPosts(limit);
        
        res.json({
            confessions: posts,
            total: posts.length,
            limit: limit
        });
    } catch (error) {
        console.error('Error fetching confessions:', error);
        res.status(500).json({ error: 'Failed to fetch confessions' });
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
        const { source } = req.query; // 'website', 'google_sheets', or 'all'
        
        let websiteConfessions = [];
        let sheetsConfessions = [];

        // Get ALL confessions from MongoDB (not just pending)
        if (!source || source === 'all' || source === 'website') {
            websiteConfessions = await databaseService.getAllConfessions();
        }

        // Get confessions from Google Sheets
        if (!source || source === 'all' || source === 'google_sheets') {
            sheetsConfessions = await sheetsService.getPendingConfessions();
        }

        const allConfessions = [
            ...websiteConfessions.map(c => ({ ...c, sourceType: 'website' })),
            ...sheetsConfessions.map(c => ({ ...c, sourceType: 'google_sheets', status: c.status || 'pending' }))
        ];

        // Sort by timestamp descending
        allConfessions.sort((a, b) => {
            const dateA = new Date(a.timestamp || a.submittedAt);
            const dateB = new Date(b.timestamp || b.submittedAt);
            return dateB - dateA;
        });

        // Count stats
        const pendingWebsite = websiteConfessions.filter(c => c.status === 'pending').length;
        const pendingSheets = sheetsConfessions.filter(c => !c.status || c.status === 'pending').length;

        res.json({
            confessions: allConfessions,
            stats: {
                website: pendingWebsite,
                google_sheets: pendingSheets,
                total: pendingWebsite + pendingSheets
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

        // Get next ES ID (check both sources)
        const dbLatestId = await databaseService.getLatestESId();
        const sheetsLatestId = await sheetsService.getNextESId();
        const fbLatestId = await facebookService.getLatestESId();
        
        let esId = Math.max(dbLatestId, sheetsLatestId, fbLatestId) + 1;
        
        // Reset to 0 if exceeds 9999 (cycle back)
        if (esId > 9999) {
            esId = 0;
        }
        
        console.log(`📊 ES_ID calculation: DB=${dbLatestId}, Sheets=${sheetsLatestId}, FB=${fbLatestId} → Next=${esId}${esId === 0 ? ' (Reset cycle)' : ''}`);
        
        // Determine which image to use for Facebook posting
        let fbImageUrl = null;
        
        if (sourceType === 'google_sheets' && (confession.driveLink || (confession.images && confession.images.length > 0))) {
            // Google Sheets: Download from Drive → Upload to ImgBB → Post to Facebook
            try {
                console.log('🔄 Converting Google Drive images to ImgBB for Facebook posting...');
                
                const driveUrls = confession.images || [confession.driveLink];
                const downloadedFiles = await driveDownloadService.downloadMultipleImages(driveUrls);
                
                if (downloadedFiles.length > 0) {
                    const imgbbUrls = await imgbbService.uploadMultipleImages(downloadedFiles);
                    fbImageUrl = imgbbUrls[0]; // Use first image for Facebook
                    console.log(`✅ Converted to ImgBB: ${fbImageUrl}`);
                }
            } catch (conversionError) {
                console.error('⚠️  Failed to convert images:', conversionError.message);
                console.log('⚠️  Will post text-only to Facebook');
            }
        } else if (sourceType === 'website' && confession.images && confession.images.length > 0) {
            // Website submissions already use ImgBB
            fbImageUrl = confession.images[0];
            console.log(`✅ Using website ImgBB image: ${fbImageUrl}`);
        }
        
        // Post to Facebook (with image if available)
        const fbPost = await facebookService.postConfession(
            esId, 
            confession.content, 
            fbImageUrl
        );
        
        // Update status in appropriate source
        if (sourceType === 'website') {
            await databaseService.updateConfessionStatus(id, 'approved', esId, fbPost.id, req.user.username);
        } else {
            await sheetsService.updateConfessionStatus(id, 'approved', esId, fbPost.id);
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

// Delete/Reject confession
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
