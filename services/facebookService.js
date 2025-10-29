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
                    fields: 'id,message,created_time,full_picture,attachments{media,subattachments{media}},reactions.summary(true),comments.summary(true)',
                    limit: 100 // Max per request
                };

                const response = await axios.get(url, { params });

                // Format posts to extract ES_ID and content
                const posts = response.data.data.map(post => {
                    const message = post.message || '';
                    const esIdMatch = message.match(/#ES_(\d+)/);
                    const esId = esIdMatch ? esIdMatch[1] : null;

                    // Extract all images from attachments
                    let images = [];
                    if (post.attachments && post.attachments.data && post.attachments.data.length > 0) {
                        const mainAttachment = post.attachments.data[0];
                        
                        // Check if there are subattachments (multiple images)
                        if (mainAttachment.subattachments && mainAttachment.subattachments.data) {
                            images = mainAttachment.subattachments.data
                                .filter(sub => sub.media && sub.media.image && sub.media.image.src)
                                .map(sub => sub.media.image.src);
                        } 
                        // Single image attachment
                        else if (mainAttachment.media && mainAttachment.media.image && mainAttachment.media.image.src) {
                            images = [mainAttachment.media.image.src];
                        }
                        // Fallback to full_picture if no media in attachments
                        else if (post.full_picture) {
                            images = [post.full_picture];
                        }
                    } else if (post.full_picture) {
                        // No attachments but has full_picture
                        images = [post.full_picture];
                    }

                    return {
                        id: post.id,
                        esId: esId,
                        fullId: esId ? `#ES_${esId}` : null,
                        content: message,
                        createdTime: post.created_time,
                        image: images[0] || null, // Keep for backward compatibility
                        images: images, // Array of all images
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
     * Post confession to Facebook page (with optional image or multiple images)
     * @param {number} esId - ES ID number
     * @param {string} content - Confession content
     * @param {string|string[]} imageUrls - Single image URL or array of image URLs
     */
    async postConfession(esId, content, imageUrls = null) {
        try {
            if (!this.pageAccessToken || !this.pageId) {
                throw new Error('Facebook credentials not configured');
            }

            // Format message with ES_ID
            const formattedMessage = `#ES_${esId} ${content}`;

            // Convert single URL to array for consistent handling
            const imageUrlArray = imageUrls ? (Array.isArray(imageUrls) ? imageUrls : [imageUrls]) : [];

            // If images provided, post with images
            if (imageUrlArray.length > 0) {
                try {
                    console.log(`📥 Downloading ${imageUrlArray.length} image(s)...`);

                    // Download all images
                    const imageBuffers = await Promise.all(
                        imageUrlArray.map(async (url, index) => {
                            console.log(`  📥 Downloading image ${index + 1}/${imageUrlArray.length}: ${url}`);
                            const response = await axios.get(url, { responseType: 'arraybuffer' });
                            const buffer = Buffer.from(response.data);
                            console.log(`  ✅ Downloaded ${buffer.length} bytes`);
                            return buffer;
                        })
                    );

                    // If only 1 image, use simple photo upload
                    if (imageBuffers.length === 1) {
                        const FormData = require('form-data');
                        const formData = new FormData();

                        formData.append('message', formattedMessage);
                        formData.append('access_token', this.pageAccessToken);
                        formData.append('source', imageBuffers[0], {
                            filename: 'confession.jpg',
                            contentType: 'image/jpeg'
                        });

                        const response = await axios.post(
                            `${this.baseURL}/${this.pageId}/photos`,
                            formData,
                            { headers: { ...formData.getHeaders() } }
                        );

                        console.log(`✅ Posted confession #ES_${esId} to Facebook with 1 image:`, response.data.id);
                        return {
                            id: response.data.id,
                            esId: esId,
                            message: formattedMessage
                        };
                    }

                    // Multiple images: Upload each photo first, then create feed post with attached_media
                    console.log(`📤 Uploading ${imageBuffers.length} images to Facebook...`);

                    const uploadedPhotoIds = await Promise.all(
                        imageBuffers.map(async (buffer, index) => {
                            const FormData = require('form-data');
                            const formData = new FormData();

                            formData.append('access_token', this.pageAccessToken);
                            formData.append('published', 'false'); // Don't publish yet
                            formData.append('source', buffer, {
                                filename: `confession_${index + 1}.jpg`,
                                contentType: 'image/jpeg'
                            });

                            const uploadResponse = await axios.post(
                                `${this.baseURL}/${this.pageId}/photos`,
                                formData,
                                { headers: { ...formData.getHeaders() } }
                            );

                            console.log(`  ✅ Uploaded image ${index + 1}: ${uploadResponse.data.id}`);
                            return uploadResponse.data.id;
                        })
                    );

                    // Create feed post with all attached photos
                    console.log(`📝 Creating feed post with ${uploadedPhotoIds.length} images...`);

                    const attachedMedia = uploadedPhotoIds.map(photoId => ({ media_fbid: photoId }));

                    const feedResponse = await axios.post(
                        `${this.baseURL}/${this.pageId}/feed`,
                        {
                            message: formattedMessage,
                            attached_media: JSON.stringify(attachedMedia),
                            access_token: this.pageAccessToken
                        }
                    );

                    console.log(`✅ Posted confession #ES_${esId} to Facebook with ${imageBuffers.length} images:`, feedResponse.data.id);

                    return {
                        id: feedResponse.data.id,
                        esId: esId,
                        message: formattedMessage,
                        imageCount: imageBuffers.length
                    };

                } catch (imageError) {
                    console.error('❌ Failed to post with images:', imageError.response?.data || imageError.message);
                    console.log('⚠️  Falling back to text-only post...');
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
     * Get the next ES_ID to use (latest + 1)
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
                return 2290; // Start from ES_2290
            }

            // Return NEXT ID to use (latest + 1)
            return Math.max(...esIds) + 1;
        } catch (error) {
            console.error('Error getting latest ES_ID:', error);
            return 2290; // Default to 2290
        }
    }
}

module.exports = new FacebookService();
