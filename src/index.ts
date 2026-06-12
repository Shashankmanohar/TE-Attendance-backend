import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import connectDB from './config/db';
import { initSocket } from './config/socket';

// Routes
import authRoutes from './routes/authRoutes';
import branchRoutes from './routes/branchRoutes';
import batchRoutes from './routes/batchRoutes';
import studentRoutes from './routes/studentRoutes';
import staffRoutes from './routes/staffRoutes';
import facultyRoutes from './routes/facultyRoutes';
import attendanceRoutes from './routes/attendanceRoutes';
import dashboardRoutes from './routes/dashboardRoutes';

// Load env variables
dotenv.config();

// Connect to Database
connectDB();

const app = express();
const server = http.createServer(app);

// Initialize Socket.io
initSocket(server);

// Enable CORS dynamically for development and vercel domains
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || 
        origin.startsWith('http://localhost') || 
        origin.endsWith('.vercel.app') || 
        origin === process.env.FRONTEND_URL) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure uploads folder exists
const uploadsDir = (process.env.VERCEL === '1' || process.env.NODE_ENV === 'production' || __dirname.includes('var/task') || __dirname.includes('var\\task'))
  ? '/tmp'
  : path.join(__dirname, '../uploads');
if (uploadsDir !== '/tmp') {
  try {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
  } catch (error) {
    console.log('Unable to create uploads directory, skipping (expected on read-only serverless filesystems):', error);
  }
}

// Static folder for file uploads
app.use('/uploads', express.static(uploadsDir));

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/batches', batchRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/faculty', facultyRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date() });
});

const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV !== 'production') {
  server.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  });
}

// Root endpoint for testing
app.get('/', (req, res) => {
  res.send('hello from backend');
});

export default app;
