import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { createFaculty, deleteFaculty, getFacultyByFacultyId, getFaculty, updateFaculty } from '../controllers/facultyController';
import { protect, authorize } from '../middleware/auth';

const router = Router();

// Configure Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = (process.env.VERCEL === '1' || process.env.NODE_ENV === 'production' || __dirname.includes('var/task') || __dirname.includes('var\\task'))
      ? '/tmp'
      : path.join(__dirname, '../../uploads');
    // Ensure uploads directory exists if not using /tmp
    if (uploadDir !== '/tmp') {
      try {
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
      } catch (err) {
        console.log('Error creating uploads directory:', err);
      }
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// File filter for images
const fileFilter = (req: any, file: any, cb: any) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

router.route('/')
  .get(protect, getFaculty)
  .post(protect, authorize('super_admin', 'admin'), upload.single('photo'), createFaculty);

router.route('/:id')
  .put(protect, authorize('super_admin', 'admin'), upload.single('photo'), updateFaculty)
  .delete(protect, authorize('super_admin', 'admin'), deleteFaculty);

router.route('/code/:facultyId')
  .get(protect, getFacultyByFacultyId);

export default router;
