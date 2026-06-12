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

// Enable CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
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

server.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});
