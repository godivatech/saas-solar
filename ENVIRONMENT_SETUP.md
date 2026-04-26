# Environment Setup Guide

## 🚨 CRITICAL ENVIRONMENT VARIABLES REQUIRED

The following environment variables are **REQUIRED** for the site visit system to function properly:

### 1. Google Maps API (Location Services)
```bash
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
```

**How to get Google Maps API Key:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable "Places API" and "Geocoding API"
4. Go to "Credentials" → "Create Credentials" → "API Key"
5. Copy the API key and add it to Replit Secrets

### 2. Firebase Admin SDK (Server Authentication)
```bash
FIREBASE_PROJECT_ID=solar-energy-56bc8
FIREBASE_PRIVATE_KEY=your_firebase_private_key_here
FIREBASE_CLIENT_EMAIL=your_firebase_client_email_here
FIREBASE_STORAGE_BUCKET=solar-energy-56bc8.firebasestorage.app
```

**How to get Firebase Admin SDK credentials:**
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: "solar-energy-56bc8"
3. Go to Project Settings → Service Accounts
4. Click "Generate New Private Key"
5. Copy the values from the JSON file to Replit Secrets

### 3. Cloudinary (Photo Upload)
```bash
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
```

**How to get Cloudinary credentials:**
1. Go to [Cloudinary Console](https://cloudinary.com/)
2. Sign up or log in
3. Go to Dashboard
4. Copy Cloud Name, API Key, and API Secret
5. Add them to Replit Secrets

## 🔧 Adding Secrets to Replit

1. Open your Replit project
2. Click on "Secrets" in the left sidebar (🔒 icon)
3. Add each environment variable as a separate secret
4. Click "Add Secret" for each one

## 📋 System Status Check

After adding all secrets, the system will:
- ✅ **Location Services**: Automatic GPS detection with human-readable addresses
- ✅ **Photo Upload**: Real Cloudinary integration for attendance photos
- ✅ **Authentication**: Full Firebase Admin SDK integration
- ✅ **Database**: Complete Firestore operations with proper permissions

## 🚨 Without These Secrets

| Missing Secret | System Impact |
|---------------|---------------|
| Google Maps API | Location shows coordinates only (no addresses) |
| Firebase Admin | Server authentication fails completely |
| Cloudinary | Photo uploads fail (placeholder images used) |

## 📞 Need Help?

If you encounter issues:
1. Check Replit Console logs for specific error messages
2. Verify all secret names match exactly (case-sensitive)
3. Ensure Firebase private key includes newlines (copy full JSON value)
4. Test individual services using the health check endpoint: `/api/health`

## 🔍 Testing Setup

Once secrets are added, test the system:
1. Open the application
2. Login with valid credentials
3. Try starting a site visit
4. Check that location detection works
5. Verify photo upload functionality

All systems should work seamlessly with proper environment configuration.