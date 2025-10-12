const axios = require('axios');
const FormData = require('form-data');

class ImgBBService {
    getApiKey() {
        return process.env.IMGBB_API_KEY;
    }

    /**
     * Upload image to ImgBB
     * @param {Buffer} imageBuffer - Image buffer
     * @param {string} filename - Original filename
     * @returns {Promise<string>} - Public image URL
     */
    async uploadImage(imageBuffer, filename) {
        try {
            const apiKey = this.getApiKey();
            
            if (!apiKey) {
                throw new Error('IMGBB_API_KEY not configured');
            }

            console.log(`📤 Uploading ${filename} to ImgBB...`);

            // Convert buffer to base64
            const base64Image = imageBuffer.toString('base64');

            // Create form data
            const formData = new FormData();
            formData.append('key', apiKey);
            formData.append('image', base64Image);
            formData.append('name', filename);

            const response = await axios.post(
                'https://api.imgbb.com/1/upload',
                formData,
                {
                    headers: {
                        ...formData.getHeaders()
                    },
                    params: {
                        key: apiKey
                    }
                }
            );

            if (response.data.success) {
                const imageUrl = response.data.data.display_url;
                console.log(`✅ Uploaded to ImgBB: ${imageUrl}`);
                return imageUrl;
            } else {
                throw new Error('ImgBB upload failed');
            }

        } catch (error) {
            console.error('❌ ImgBB upload error:', error.message);
            if (error.response) {
                console.error('Response:', error.response.data);
            }
            throw error;
        }
    }

    /**
     * Upload multiple images to ImgBB
     * @param {Array} imageFiles - Array of {buffer, filename}
     * @returns {Promise<Array<string>>} - Array of public image URLs
     */
    async uploadMultipleImages(imageFiles) {
        try {
            console.log(`📤 Uploading ${imageFiles.length} images to ImgBB...`);

            const uploadPromises = imageFiles.map(file => 
                this.uploadImage(file.buffer, file.filename)
            );

            const imageUrls = await Promise.all(uploadPromises);
            
            console.log(`✅ All ${imageUrls.length} images uploaded to ImgBB`);
            return imageUrls;

        } catch (error) {
            console.error('❌ Error uploading multiple images to ImgBB:', error);
            throw error;
        }
    }

    /**
     * Delete image from ImgBB using delete_url
     * @param {string} deleteUrl - Delete URL from upload response
     */
    async deleteImage(deleteUrl) {
        try {
            // ImgBB requires visiting delete_url to delete
            // Not implemented via API, requires manual deletion
            console.log(`ℹ️  To delete image, visit: ${deleteUrl}`);
        } catch (error) {
            console.error('❌ ImgBB delete error:', error.message);
        }
    }
}

module.exports = new ImgBBService();
