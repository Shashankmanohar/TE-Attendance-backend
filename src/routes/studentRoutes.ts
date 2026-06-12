import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { createStudent, deleteStudent, getStudentByStudentId, getStudents, updateStudent } from '../controllers/studentController';
import { protect, authorize } from '../middleware/auth';

const router = Router();

// Configure Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = process.env.NODE_ENV === 'production'
      ? '/tmp/uploads'
      : path.join(__dirname, '../../uploads');
    // Ensure uploads directory exists
    try {
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
    } catch (err) {
      console.log('Error creating uploads directory:', err);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique name
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
  .get(protect, getStudents)
  .post(protect, authorize('super_admin', 'admin'), upload.single('photo'), createStudent);

router.route('/:id')
  .put(protect, authorize('super_admin', 'admin'), upload.single('photo'), updateStudent)
  .delete(protect, authorize('super_admin', 'admin'), deleteStudent);

router.route('/code/:studentId')
  .get(protect, getStudentByStudentId);

export default router;
