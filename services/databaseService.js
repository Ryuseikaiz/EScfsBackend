const Confession = require('../models/Confession');

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
    async getPendingConfessions() {
        try {
            const confessions = await Confession.find({ 
                status: 'pending',
                source: 'website'
            })
            .sort({ submittedAt: -1 })
            .lean();

            return confessions.map(conf => ({
                id: conf._id.toString(),
                content: conf.content,
                images: conf.images || [],
                source: conf.source,
                status: conf.status,
                timestamp: conf.submittedAt,
                submittedAt: conf.submittedAt
            }));
        } catch (error) {
            console.error('Error fetching pending confessions from database:', error);
            throw error;
        }
    }

    /**
     * Get all confessions (including approved) from MongoDB
     */
    async getAllConfessions(status = null) {
        try {
            const query = { source: 'website' };
            if (status) {
                query.status = status;
            }

            const confessions = await Confession.find(query)
                .sort({ submittedAt: -1 })
                .lean();

            return confessions.map(conf => ({
                id: conf._id.toString(),
                content: conf.content,
                images: conf.images || [],
                source: conf.source,
                status: conf.status,
                timestamp: conf.submittedAt,
                submittedAt: conf.submittedAt,
                esId: conf.esId,
                fbPostId: conf.fbPostId
            }));
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
    async getLatestESId() {
        try {
            const confession = await Confession.findOne({ 
                status: 'approved',
                esId: { $ne: null }
            })
            .sort({ esId: -1 })
            .lean();

            // Return NEXT ID to use (latest + 1)
            return confession ? confession.esId + 1 : 2290;
        } catch (error) {
            console.error('Error getting latest ES_ID:', error);
            return 2290;
        }
    }
}

module.exports = new DatabaseService();
