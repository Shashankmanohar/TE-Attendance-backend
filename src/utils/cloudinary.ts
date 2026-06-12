import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Uploads a local file to Cloudinary and deletes the local file.
 * @param filePath Local path to the file
 * @param folder Folder name in Cloudinary
 * @returns Secure URL of the uploaded image
 */
export const uploadToCloudinary = async (filePath: string, folder: string = 'te-attendance'): Promise<string> => {
  try {
    // If Cloudinary keys are not set, return local fallback URL or throw error
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      console.warn('Cloudinary credentials not set, using local path fallback.');
      // Since it's serverless and we might not be able to read local path, we still delete the local file
      // to prevent serverless space warnings, but this is a warning condition.
      return '';
    }

    const result = await cloudinary.uploader.upload(filePath, {
      folder: folder,
      resource_type: 'image',
    });

    // Delete local file after successful upload to Cloudinary
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    return result.secure_url;
  } catch (error) {
    // Make sure we clean up the local file even if upload fails
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (unlinkErr) {
        console.error('Error deleting local file after failed upload:', unlinkErr);
      }
    }
    throw error;
  }
};
