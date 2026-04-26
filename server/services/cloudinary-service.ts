/**
 * Cloudinary Service for Attendance Photo Upload
 * Handles secure photo upload to Cloudinary with folder organization
 */

import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
  cloud_name: 'doeodacsg',
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Removed debug log
// Removed debug log

export interface CloudinaryUploadResult {
  success: boolean;
  url?: string;
  publicId?: string;
  error?: string;
}

export class CloudinaryService {
  private static readonly FOLDER_NAME = 'godiva attendance field images';
  private static readonly EMPLOYEE_PHOTO_FOLDER = 'employee-documents/photos';
  private static readonly AADHAR_FOLDER = 'employee-documents/aadhar';
  private static readonly PAN_FOLDER = 'employee-documents/pan';

  /**
   * Upload employee profile photo to Cloudinary
   * Optimized for small profile pictures (400x400, good quality)
   * @param base64Image - Base64 encoded image data
   * @param employeeId - Employee ID for file naming
   */
  static async uploadEmployeePhoto(
    base64Image: string,
    employeeId: string
  ): Promise<CloudinaryUploadResult> {
    try {
      const timestamp = new Date();
      const dateStr = timestamp.toISOString().split('T')[0];
      const publicId = `${this.EMPLOYEE_PHOTO_FOLDER}/${employeeId}_${dateStr}`;

      // Removed debug log
      // Removed debug log

      const result = await cloudinary.uploader.upload(base64Image, {
        public_id: publicId,
        folder: this.EMPLOYEE_PHOTO_FOLDER,
        resource_type: 'image',
        format: 'jpg',
        transformation: [
          { width: 400, height: 400, crop: 'fill', gravity: 'face' },
          { quality: 'auto:good' }
        ],
        tags: ['employee', 'profile_photo', employeeId]
      });

      // Removed debug log

      return {
        success: true,
        url: result.secure_url,
        publicId: result.public_id
      };

    } catch (error) {
      console.error('CLOUDINARY: Employee photo upload failed:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed'
      };
    }
  }

  /**
   * Upload Aadhar card document to Cloudinary
   * Optimized for document scans (1200x800, eco quality to save space)
   * @param base64Image - Base64 encoded image data
   * @param employeeId - Employee ID for file naming
   */
  static async uploadAadharCard(
    base64Image: string,
    employeeId: string
  ): Promise<CloudinaryUploadResult> {
    try {
      const timestamp = new Date();
      const dateStr = timestamp.toISOString().split('T')[0];
      const publicId = `${this.AADHAR_FOLDER}/${employeeId}_${dateStr}`;

      // Removed debug log
      // Removed debug log

      const result = await cloudinary.uploader.upload(base64Image, {
        public_id: publicId,
        folder: this.AADHAR_FOLDER,
        resource_type: 'image',
        format: 'jpg',
        transformation: [
          { width: 1200, height: 800, crop: 'limit' },
          { quality: 'auto:eco' }
        ],
        tags: ['employee', 'aadhar', employeeId]
      });

      // Removed debug log

      return {
        success: true,
        url: result.secure_url,
        publicId: result.public_id
      };

    } catch (error) {
      console.error('CLOUDINARY: Aadhar card upload failed:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed'
      };
    }
  }

  /**
   * Upload PAN card document to Cloudinary
   * Optimized for document scans (1200x800, eco quality to save space)
   * @param base64Image - Base64 encoded image data
   * @param employeeId - Employee ID for file naming
   */
  static async uploadPanCard(
    base64Image: string,
    employeeId: string
  ): Promise<CloudinaryUploadResult> {
    try {
      const timestamp = new Date();
      const dateStr = timestamp.toISOString().split('T')[0];
      const publicId = `${this.PAN_FOLDER}/${employeeId}_${dateStr}`;

      // Removed debug log
      // Removed debug log

      const result = await cloudinary.uploader.upload(base64Image, {
        public_id: publicId,
        folder: this.PAN_FOLDER,
        resource_type: 'image',
        format: 'jpg',
        transformation: [
          { width: 1200, height: 800, crop: 'limit' },
          { quality: 'auto:eco' }
        ],
        tags: ['employee', 'pan', employeeId]
      });

      // Removed debug log

      return {
        success: true,
        url: result.secure_url,
        publicId: result.public_id
      };

    } catch (error) {
      console.error('CLOUDINARY: PAN card upload failed:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed'
      };
    }
  }

  /**
   * Upload attendance photo to Cloudinary
   * @param base64Image - Base64 encoded image data
   * @param userId - User ID for file naming
   * @param timestamp - Timestamp for unique naming
   */
  static async uploadAttendancePhoto(
    base64Image: string,
    userId: string,
    timestamp: Date = new Date()
  ): Promise<CloudinaryUploadResult> {
    try {
      // Generate unique filename
      const dateStr = timestamp.toISOString().split('T')[0];
      const timeStr = timestamp.toTimeString().split(' ')[0].replace(/:/g, '-');
      const publicId = `${this.FOLDER_NAME}/${userId}_${dateStr}_${timeStr}`;

      // Removed debug log
      // Removed debug log

      // Upload to Cloudinary
      const result = await cloudinary.uploader.upload(base64Image, {
        public_id: publicId,
        folder: this.FOLDER_NAME,
        resource_type: 'image',
        format: 'jpg',
        quality: 'auto',
        transformation: [
          { width: 800, height: 600, crop: 'limit' }, // Limit size for storage efficiency
          { quality: 'auto:good' } // Optimize quality
        ],
        tags: ['attendance', 'field_work', userId]
      });

      // Removed debug log

      return {
        success: true,
        url: result.secure_url,
        publicId: result.public_id
      };

    } catch (error) {
      console.error('CLOUDINARY: Upload failed:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed'
      };
    }
  }

  /**
   * Delete attendance photo from Cloudinary
   * @param publicId - Cloudinary public ID of the image
   */
  static async deleteAttendancePhoto(publicId: string): Promise<boolean> {
    try {
      const result = await cloudinary.uploader.destroy(publicId);
      // Removed debug log
      return result.result === 'ok';
    } catch (error) {
      console.error('CLOUDINARY: Delete failed:', error);
      return false;
    }
  }

  /**
   * Get folder info to verify folder exists
   */
  static async ensureFolderExists(): Promise<boolean> {
    try {
      // List resources in the folder to check if it exists
      const result = await cloudinary.api.resources({
        type: 'upload',
        prefix: this.FOLDER_NAME,
        max_results: 1
      });
      
      // Removed debug log
      return true;
    } catch (error) {
      // Removed debug log
      // Folder will be created automatically on first upload
      return true;
    }
  }

  /**
   * Get upload configuration for frontend (for direct upload if needed)
   */
  static getUploadConfig() {
    return {
      cloudName: 'doeodacsg',
      uploadPreset: 'attendance_photos', // You may need to create this preset
      folder: this.FOLDER_NAME
    };
  }
}
