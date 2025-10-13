const axios = require('axios');
require('dotenv').config();

class FacebookService {
    constructor() {
        this.pageAccessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
        this.pageId = process.env.FACEBOOK_PAGE_ID;
        this.baseURL = 'https://graph.facebook.com/v19.0';

        if (!this.pageAccessToken || !this.pageId) {
            console.warn('⚠️ Warning: Facebook credentials not configured in .env');
        }
    }

    /**
     * Get published posts from Facebook page with pagination
     * Uses cursor-based pagination to bypass 100 posts limit
     */
    async getPublishedPosts(maxLimit = 500) {
        try {
            if (!this.pageAccessToken || !this.pageId) {
                throw new Error('Facebook credentials not configured');
            }

            let allPosts = [];
            let nextPageUrl = null;
            let requestCount = 0;
            const maxRequests = Math.ceil(maxLimit / 100); // Maximum number of API calls

            console.log(`📥 Fetching up to ${maxLimit} posts from Facebook...`);

            do {
                requestCount++;
                console.log(`📄 Request ${requestCount}/${maxRequests}...`);

                const url = nextPageUrl || `${this.baseURL}/${this.pageId}/posts`;
                const params = nextPageUrl ? {} : {
                    access_token: this.pageAccessToken,
                    fields: 'id,message,created_time,full_picture,attachments,reactions.summary(true),comments.summary(true)',
                    limit: 100 // Max per request
                };

                const response = await axios.get(url, { params });

                // Format posts to extract ES_ID and content
                const posts = response.data.data.map(post => {
                    const message = post.message || '';
                    const esIdMatch = message.match(/#ES_(\d+)/);
                    const esId = esIdMatch ? esIdMatch[1] : null;

                    return {
                        id: post.id,
                        esId: esId,
                        fullId: esId ? `#ES_${esId}` : null,
                        content: message,
                        createdTime: post.created_time,
                        image: post.full_picture || null,
                        attachments: post.attachments,
                        reactionCount: post.reactions?.summary?.total_count || 0,
                        commentCount: post.comments?.summary?.total_count || 0
                    };
                });

                allPosts = allPosts.concat(posts);
                console.log(`✅ Fetched ${posts.length} posts (Total: ${allPosts.length})`);

                // Check if there's a next page
                nextPageUrl = response.data.paging?.next || null;

                // Stop if we've reached the desired limit or max requests
                if (allPosts.length >= maxLimit || requestCount >= maxRequests) {
                    break;
                }

                // Add a small delay to avoid rate limiting
                if (nextPageUrl) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }

            } while (nextPageUrl && requestCount < maxRequests);

            // Trim to exact limit if needed
            const finalPosts = allPosts.slice(0, maxLimit);
            console.log(`🎉 Successfully fetched ${finalPosts.length} posts`);

            return finalPosts;
        } catch (error) {
            console.error('Error fetching Facebook posts:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Post confession to Facebook page (with optional image)
     */
    async postConfession(esId, content, imageUrl = null) {
        try {
            if (!this.pageAccessToken || !this.pageId) {
                throw new Error('Facebook credentials not configured');
            }

            // Format message with ES_ID
            const formattedMessage = `#ES_${esId} ${content}`;

            // If image URL provided, download and upload as binary
            if (imageUrl) {
                try {
                    console.log(`📥 Downloading image from: ${imageUrl}`);
                    
                    // Download image
                    const imageResponse = await axios.get(imageUrl, {
                        responseType: 'arraybuffer'
                    });
                    
                    const imageBuffer = Buffer.from(imageResponse.data);
                    console.log(`✅ Downloaded ${imageBuffer.length} bytes`);

                    // Upload to Facebook using multipart form data
                    const FormData = require('form-data');
                    const formData = new FormData();
                    
                    formData.append('message', formattedMessage);
                    formData.append('access_token', this.pageAccessToken);
                    formData.append('source', imageBuffer, {
                        filename: 'confession.jpg',
                        contentType: 'image/jpeg'
                    });

                    const response = await axios.post(
                        `${this.baseURL}/${this.pageId}/photos`,
                        formData,
                        {
                            headers: {
                                ...formData.getHeaders()
                            }
                        }
                    );

                    console.log(`✅ Posted confession #ES_${esId} to Facebook with image:`, response.data.id);

                    return {
                        id: response.data.id,
                        esId: esId,
                        message: formattedMessage
                    };
                    
                } catch (imageError) {
                    console.error('❌ Failed to post with image, posting text-only:', imageError.message);
                    // Fallback to text-only post
                }
            }

            // Text-only post (fallback or no image)
            const postData = {
                message: formattedMessage,
                access_token: this.pageAccessToken
            };

            const response = await axios.post(
                `${this.baseURL}/${this.pageId}/feed`,
                postData
            );

            console.log(`✅ Posted confession #ES_${esId} to Facebook (text-only):`, response.data.id);

            return {
                id: response.data.id,
                esId: esId,
                message: formattedMessage
            };
            
        } catch (error) {
            console.error('Error posting to Facebook:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Get the latest ES_ID from Facebook posts
     */
    async getLatestESId() {
        try {
            const posts = await this.getPublishedPosts(100);
            
            // Filter posts with ES_ID and get the highest number
            const esIds = posts
                .filter(post => post.esId)
                .map(post => parseInt(post.esId))
                .filter(id => !isNaN(id));

            if (esIds.length === 0) {
                return 2289; // Start from ES_2289 as requested
            }

            return Math.max(...esIds);
        } catch (error) {
            console.error('Error getting latest ES_ID:', error);
            return 2289; // Default to 2289
        }
    }
}

module.exports = new FacebookService();
