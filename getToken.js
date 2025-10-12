const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// ===============================================================
// >> CHỈ CẦN SỬA DÒNG NÀY <<
const PAGE_NAME_TO_FIND = 'Ensemble Stars VN Confession'; // Sửa lại cho đúng tên Page của bạn
// ===============================================================

class FacebookTokenManager {
    constructor() {
        this.appId = process.env.FACEBOOK_APP_ID;
        this.appSecret = process.env.FACEBOOK_APP_SECRET;
        this.baseURL = 'https://graph.facebook.com/v19.0'; // Luôn dùng phiên bản mới

        if (!this.appId || !this.appSecret) {
            throw new Error('Vui lòng điền FACEBOOK_APP_ID và FACEBOOK_APP_SECRET trong file .env');
        }
    }

    /**
     * Đổi token ngắn hạn sang token dài hạn (60 ngày)
     */
    async exchangeForLongLivedToken(shortLivedToken) {
        try {
            const response = await axios.get(`${this.baseURL}/oauth/access_token`, {
                params: {
                    grant_type: 'fb_exchange_token',
                    client_id: this.appId,
                    client_secret: this.appSecret,
                    fb_exchange_token: shortLivedToken
                }
            });
            console.log('✅ Đã đổi sang User Token dài hạn.');
            return response.data.access_token;
        } catch (error) {
            console.error('❌ Lỗi khi đổi sang token dài hạn:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Lấy Page Access Token (không bao giờ hết hạn)
     */
    async getPageAccessToken(userAccessToken) {
        try {
            const response = await axios.get(`${this.baseURL}/me/accounts`, {
                params: {
                    access_token: userAccessToken,
                    fields: 'id,name,access_token' // Chỉ lấy các trường cần thiết
                }
            });

            console.log('📄 Danh sách các Page bạn quản lý:');
            response.data.data.forEach(page => console.log(` - ${page.name}`));
            
            const targetPage = response.data.data.find(page => page.name === PAGE_NAME_TO_FIND);

            if (targetPage) {
                console.log(`\n🎯 Đã tìm thấy Page: ${targetPage.name}`);
                await this.verifyToken(targetPage.access_token);
                return {
                    pageId: targetPage.id,
                    pageAccessToken: targetPage.access_token,
                    pageName: targetPage.name
                };
            } else {
                throw new Error(`Không tìm thấy Page nào có tên "${PAGE_NAME_TO_FIND}" trong danh sách.`);
            }
        } catch (error) {
            console.error('❌ Lỗi khi lấy Page Token:', error.response?.data || error.message);
            throw error;
        }
    }
    
    /**
     * Kiểm tra thông tin và thời hạn của token
     */
    async verifyToken(accessToken) {
        try {
            const appToken = `${this.appId}|${this.appSecret}`;
            const response = await axios.get(`${this.baseURL}/debug_token`, {
                params: {
                    input_token: accessToken,
                    access_token: appToken
                }
            });

            const { data } = response.data;
            console.log('🔍 Thông tin Token:');
            console.log(`  - Loại: ${data.type}`);
            console.log(`  - Hợp lệ: ${data.is_valid}`);
            console.log(`  - Hết hạn: ${data.expires_at === 0 ? 'Không bao giờ' : new Date(data.expires_at * 1000).toLocaleString()}`);
            
            if (data.expires_at !== 0) {
                 console.warn('⚠️ Cảnh báo: Token này có thời hạn. Hãy chắc chắn bạn đã dùng User Token dài hạn để lấy Page Token.');
            }

        } catch (error) {
            console.error('❌ Lỗi khi xác thực token:', error.response?.data || error.message);
        }
    }

    /**
     * Luồng xử lý hoàn chỉnh
     */
    async getPermanentToken(shortLivedToken) {
        console.log('🚀 Bắt đầu quá trình lấy token vĩnh viễn...\n');
        try {
            console.log('--- BƯỚC 1: Đổi sang User Token dài hạn ---');
            const longLivedToken = await this.exchangeForLongLivedToken(shortLivedToken);

            console.log('\n--- BƯỚC 2: Lấy Page Token vĩnh viễn ---');
            const pageInfo = await this.getPageAccessToken(longLivedToken);

            console.log('\n🎉 THÀNH CÔNG! Copy các dòng sau vào file .env của bạn:');
            console.log('===========================================================');
            console.log(`FACEBOOK_PAGE_ID=${pageInfo.pageId}`);
            console.log(`FACEBOOK_PAGE_ACCESS_TOKEN=${pageInfo.pageAccessToken}`);
            console.log('===========================================================');

        } catch (error) {
            console.error('\n💥 QUÁ TRÌNH THẤT BẠI 💥');
        }
    }
}

// Hàm main để chạy script
async function main() {
    const tokenManager = new FacebookTokenManager();
    const shortLivedToken = process.argv[2];

    if (!shortLivedToken) {
        console.log('📖 HƯỚNG DẪN SỬ DỤNG:');
        console.log('   node getToken.js <YOUR_SHORT_LIVED_TOKEN>');
        console.log('\n   Lấy token ngắn hạn từ: https://developers.facebook.com/tools/explorer/');
        console.log('   Các quyền cần có: pages_show_list, pages_read_engagement, pages_manage_posts');
        return;
    }
    
    await tokenManager.getPermanentToken(shortLivedToken);
}

main();