const Confession = require('../models/Confession');
const ProcessedConfession = require('../models/ProcessedConfession');

class DatabaseService {
    /**
     * Add confession from website to MongoDB
     */
    async addConfession(confessionData) {
        try {
            const confession = new Confession({
                content: confessionData.content,
                images: confessionData.images || [],
                source: 'website',
                status: 'pending',
                submittedAt: new Date()
            });

            await confession.save();
            console.log('✅ Confession saved to MongoDB');

            return {
                id: confession._id,
                content: confession.content,
                images: confession.images,
                source: confession.source,
                status: confession.status,
                submittedAt: confession.submittedAt
            };
        } catch (error) {
            console.error('Error adding confession to database:', error);
            throw error;
        }
    }

    /**
     * Get pending confessions from MongoDB (website submissions only)
     */
    async getPendingConfessions(page = 1, limit = 50) {
        try {
            const skip = (page - 1) * limit;
            
            const [confessions, total] = await Promise.all([
                Confession.find({ 
                    status: 'pending',
                    source: 'website'
                })
                .sort({ submittedAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
                
                Confession.countDocuments({ 
                    status: 'pending',
                    source: 'website'
                })
            ]);

            return {
                confessions: confessions.map(conf => ({
                    id: conf._id.toString(),
                    content: conf.content,
                    images: conf.images || [],
                    source: conf.source,
                    status: conf.status,
                    timestamp: conf.submittedAt,
                    submittedAt: conf.submittedAt
                })),
                total,
                page: parseInt(page),
                totalPages: Math.ceil(total / limit)
            };
        } catch (error) {
            console.error('Error fetching pending confessions from database:', error);
            throw error;
        }
    }

    /**
     * Get all confessions (including approved) from MongoDB
     */
    async getAllConfessions(status = null, page = 1, limit = 50) {
        try {
            const query = { source: 'website' };
            if (status) {
                query.status = status;
            }

            const skip = (page - 1) * limit;

            const [confessions, total] = await Promise.all([
                Confession.find(query)
                    .sort({ submittedAt: -1 })
                    .skip(skip)
                    .limit(parseInt(limit))
                    .lean(),
                Confession.countDocuments(query)
            ]);

            return {
                confessions: confessions.map(conf => ({
                    id: conf._id.toString(),
                    content: conf.content,
                    images: conf.images || [],
                    source: conf.source,
                    status: conf.status,
                    timestamp: conf.submittedAt,
                    submittedAt: conf.submittedAt,
                    esId: conf.esId,
                    fbPostId: conf.fbPostId
                })),
                total,
                page: parseInt(page),
                totalPages: Math.ceil(total / limit)
            };
        } catch (error) {
            console.error('Error fetching confessions from database:', error);
            throw error;
        }
    }

    /**
     * Get confession by ID from MongoDB
     */
    async getConfessionById(id) {
        try {
            const confession = await Confession.findById(id).lean();
            
            if (!confession) {
                return null;
            }

            return {
                id: confession._id.toString(),
                content: confession.content,
                images: confession.images || [],
                source: confession.source,
                status: confession.status,
                timestamp: confession.submittedAt,
                esId: confession.esId,
                fbPostId: confession.fbPostId
            };
        } catch (error) {
            console.error('Error getting confession by ID:', error);
            return null;
        }
    }

    /**
     * Update confession status after approval
     */
    async updateConfessionStatus(id, status, esId = null, fbPostId = null, approvedBy = null) {
        try {
            const updateData = {
                status: status,
                approvedAt: new Date(),
                approvedBy: approvedBy
            };

            if (esId) {
                updateData.esId = esId;
            }

            if (fbPostId) {
                updateData.fbPostId = fbPostId;
            }

            const confession = await Confession.findByIdAndUpdate(
                id,
                updateData,
                { new: true }
            );

            if (!confession) {
                throw new Error('Confession not found');
            }

            console.log(`✅ Confession ${id} updated to status: ${status}`);
            return confession;
        } catch (error) {
            console.error('Error updating confession status:', error);
            throw error;
        }
    }

    /**
     * Delete confession from MongoDB (PERMANENTLY)
     */
    async deleteConfession(id) {
        try {
            const confession = await Confession.findByIdAndDelete(id);

            if (!confession) {
                throw new Error('Confession not found');
            }

            console.log(`✅ Confession ${id} permanently deleted from database`);
            return confession;
        } catch (error) {
            console.error('Error deleting confession:', error);
            throw error;
        }
    }

    /**
     * Reject confession (mark as rejected, keep in DB for history)
     */
    async rejectConfession(id, rejectedBy = null) {
        try {
            const confession = await Confession.findByIdAndUpdate(
                id,
                { 
                    status: 'rejected',
                    processedBy: rejectedBy,
                    processedAt: new Date()
                },
                { new: true }
            );

            if (!confession) {
                throw new Error('Confession not found');
            }

            console.log(`✅ Confession ${id} marked as rejected`);
            return confession;
        } catch (error) {
            console.error('Error rejecting confession:', error);
            throw error;
        }
    }

    /**
     * Get statistics from MongoDB
     */
    async getStats() {
        try {
            const stats = await Confession.aggregate([
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 }
                    }
                }
            ]);

            const result = {
                pending: 0,
                approved: 0,
                rejected: 0,
                total: 0
            };

            stats.forEach(stat => {
                result[stat._id] = stat.count;
                result.total += stat.count;
            });

            return result;
        } catch (error) {
            console.error('Error getting stats:', error);
            return { pending: 0, approved: 0, rejected: 0, total: 0 };
        }
    }

    /**
     * Get next ES_ID to use (latest + 1)
     */
    /**
     * Get next ES_ID to use (latest + 1)
     * Checks both Confession (legacy/active) and ProcessedConfession (archived)
     */
    async getLatestESId() {
        try {
            // Check active confessions (legacy)
            const activeConfession = await Confession.findOne({ 
                status: 'approved',
                esId: { $ne: null }
            })
            .sort({ esId: -1 })
            .lean();

            // Check processed confessions (archived)
            const processedConfession = await ProcessedConfession.findOne({
                status: 'approved',
                esId: { $ne: null }
            })
            .sort({ esId: -1 })
            .lean();

            const activeId = activeConfession ? activeConfession.esId : 0;
            const processedId = processedConfession ? processedConfession.esId : 0;
            
            // Get the maximum ID from both sources
            const maxId = Math.max(activeId, processedId);

            // Return NEXT ID to use (latest + 1)
            // If no history found, start at 2290
            return maxId > 0 ? maxId + 1 : 2290;
        } catch (error) {
            console.error('Error getting latest ES_ID:', error);
            return 2290;
        }
    }

    /**
     * Approve confession: Archive to ProcessedConfession and DELETE from Confession
     */
    async approveConfession(id, esId, fbPostId, approvedBy) {
        try {
            // 1. Find the original confession
            const confession = await Confession.findById(id);
            if (!confession) {
                throw new Error('Confession not found');
            }

            // 2. Create archive record
            await ProcessedConfession.create({
                confessionId: id,
                source: 'website',
                status: 'approved',
                esId: esId,
                fbPostId: fbPostId,
                processedBy: approvedBy,
                processedAt: new Date(),
                content: confession.content
            });

            // 3. Delete from main collection
            await Confession.findByIdAndDelete(id);

            console.log(`✅ Confession ${id} approved (#ES_${esId}) and migrated to archive.`);
            return { success: true };
        } catch (error) {
            console.error('Error approving confession:', error);
            throw error;
        }
    }

    /**
     * Cleanup: Migrate EXISTING approved confessions to ProcessedConfession
     */
    async cleanupApprovedConfessions() {
        try {
            console.log('🧹 Starting cleanup of approved confessions...');
            
            // Find all approved confessions in main DB
            const approvedConfessions = await Confession.find({ status: 'approved' }).lean();
            console.log(`📋 Found ${approvedConfessions.length} approved confessions to migrate.`);

            let count = 0;
            for (const conf of approvedConfessions) {
                try {
                    // Create archive
                    await ProcessedConfession.findOneAndUpdate(
                        { confessionId: conf._id.toString() },
                        {
                            confessionId: conf._id.toString(),
                            source: 'website',
                            status: 'approved',
                            esId: conf.esId,
                            fbPostId: conf.fbPostId,
                            processedBy: conf.approvedBy || 'migration',
                            processedAt: conf.approvedAt || new Date(),
                            content: conf.content
                        },
                        { upsert: true, new: true }
                    );

                    // Delete original
                    await Confession.findByIdAndDelete(conf._id);
                    count++;
                } catch (e) {
                    console.error(`❌ Failed to migrate confession ${conf._id}:`, e.message);
                }
            }

            console.log(`✅ Cleaned up ${count} approved confessions.`);
            return count;
        } catch (error) {
            console.error('Error during cleanup:', error);
            throw error;
        }
    }
}

module.exports = new DatabaseService();
