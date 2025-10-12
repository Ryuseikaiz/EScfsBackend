# 🚀 Deployment Guide

## Environment Variables Setup

### Required Environment Variables

Để deploy ứng dụng, bạn cần set các environment variables sau:

#### 1. Database
```bash
MONGO_URI=mongodb+srv://Kaikun:Kaikun123@tiendat.1rokfhy.mongodb.net/escfs
```

#### 2. JWT Secret
```bash
JWT_SECRET=your-secret-key-here-change-this-in-production
```

#### 3. Google APIs
```bash
GOOGLE_SHEET_ID=your-google-sheet-id
GOOGLE_SHARED_DRIVE_ID=your-shared-drive-id (optional)
```

#### 4. Google Service Account Credentials
**QUAN TRỌNG**: Thay vì upload file credentials, encode nội dung file JSON thành environment variable:

##### Bước 1: Đọc nội dung file `google-credentials.json`
```bash
# Windows PowerShell
$content = Get-Content google-credentials.json -Raw
$content
```

##### Bước 2: Copy toàn bộ nội dung JSON (bao gồm cả dấu ngoặc `{}`)

##### Bước 3: Set environment variable
```bash
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"...","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}
```

**Lưu ý**: Phải copy TOÀN BỘ nội dung JSON vào biến môi trường, bao gồm tất cả ký tự đặc biệt và newlines.

#### 5. Facebook API
```bash
FACEBOOK_PAGE_ACCESS_TOKEN=your-facebook-page-access-token
FACEBOOK_PAGE_ID=your-facebook-page-id
```

#### 6. ImgBB API
```bash
IMGBB_API_KEY=29e9cca6843d1c80514c7c7b5a44896c
```

---

## Deployment Platforms

### Option 1: Render.com (Khuyên dùng)

1. **Tạo Web Service mới**
   - Repository: Connect GitHub repo
   - Branch: `main`
   - Build Command: `npm install`
   - Start Command: `npm start`

2. **Set Environment Variables**
   - Vào tab "Environment"
   - Add tất cả variables ở trên
   - **Quan trọng**: Paste toàn bộ nội dung JSON vào `GOOGLE_SERVICE_ACCOUNT_KEY`

3. **Deploy**
   - Click "Manual Deploy" hoặc push code lên GitHub (auto deploy)

### Option 2: Railway.app

1. **New Project → Deploy from GitHub**
2. **Variables Tab**: Add tất cả environment variables
3. **Deploy**: Auto deploy khi push code

### Option 3: Vercel (Serverless) ⚠️

**LƯU Ý**: Vercel có giới hạn:
- Timeout: 60s (Hobby plan), 300s (Pro plan)
- Cold start có thể chậm
- Không tốt cho long-running tasks

**Cách deploy**:

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Hoặc deploy từ GitHub (khuyên dùng)
# Import project vào Vercel Dashboard
```

**Set Environment Variables trong Vercel Dashboard**:
1. Vào Project Settings → Environment Variables
2. Add tất cả variables từ section "Required Environment Variables" ở trên
3. **Quan trọng**: Paste toàn bộ JSON vào `GOOGLE_SERVICE_ACCOUNT_KEY`

**Vercel Configuration**: Project đã có `vercel.json` với cấu hình serverless

**API Endpoint sau khi deploy**: `https://your-project.vercel.app/api/*`

**Khuyến nghị**: Sử dụng **Render.com** hoặc **Railway** thay vì Vercel cho backend Express nếu có nhiều API calls hoặc cần uptime cao.

### Option 4: Heroku

```bash
heroku create your-app-name
heroku config:set MONGO_URI="mongodb+srv://..."
heroku config:set GOOGLE_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}'
# ... set các variables khác
git push heroku main
```

---

## Local Development

### Setup file credentials (KHÔNG commit vào Git)

1. Tạo file `google-credentials.json` trong thư mục root
2. Copy nội dung Service Account credentials vào
3. File này đã được add vào `.gitignore` để tránh commit nhầm

### Setup .env file

Tạo file `.env`:

```env
# MongoDB
MONGO_URI=mongodb+srv://Kaikun:Kaikun123@tiendat.1rokfhy.mongodb.net/escfs

# JWT
JWT_SECRET=your-secret-key

# Google Sheets & Drive
GOOGLE_SHEET_ID=your-sheet-id
GOOGLE_SHARED_DRIVE_ID=your-drive-id

# Facebook
FACEBOOK_PAGE_ACCESS_TOKEN=your-token
FACEBOOK_PAGE_ID=your-page-id

# ImgBB
IMGBB_API_KEY=29e9cca6843d1c80514c7c7b5a44896c

# Optional: Path to credentials file (default: ./google-credentials.json)
# GOOGLE_CREDENTIALS_PATH=./google-credentials.json
```

### Run locally

```bash
npm install
npm start
```

---

## Security Best Practices

✅ **DO**:
- Sử dụng environment variables cho credentials
- Rotate API keys định kỳ
- Giới hạn permissions của Service Account (chỉ read/write sheets/drive)
- Sử dụng HTTPS
- Enable CORS cho frontend domain cụ thể

❌ **DON'T**:
- Commit credentials vào Git
- Share API keys publicly
- Use default passwords
- Hardcode secrets trong code

---

## Troubleshooting

### Lỗi: "Google credentials not found"
→ Kiểm tra `GOOGLE_SERVICE_ACCOUNT_KEY` environment variable đã được set chưa

### Lỗi: "Invalid credentials"
→ Đảm bảo copy đúng toàn bộ JSON content, bao gồm dấu ngoặc và escape characters

### Lỗi: "Permission denied"
→ Kiểm tra Service Account đã được share quyền truy cập Google Sheet và Drive

---

## Contact

Nếu có vấn đề gì trong quá trình deployment, liên hệ admin! 💜
