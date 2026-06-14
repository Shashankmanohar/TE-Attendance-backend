import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Models
import Branch from './models/Branch';
import User from './models/User';
import Batch from './models/Batch';
import Student from './models/Student';
import Attendance from './models/Attendance';
import ActivityLog from './models/ActivityLog';

import { generateQRCode } from './utils/qrHelper';

dotenv.config({ path: path.join(__dirname, '../.env') });

const seedDB = async () => {
  try {
    console.log('Connecting to database for seeding...');
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/qr-attendance');
    console.log('Connected.');

    // Clear existing data
    console.log('Clearing existing database collections...');
    await Branch.deleteMany({});
    await User.deleteMany({});
    await Batch.deleteMany({});
    await Student.deleteMany({});
    await Attendance.deleteMany({});
    await ActivityLog.deleteMany({});
    console.log('Collections cleared.');

    // 1. Create Branches
    console.log('Creating branches...');
    const branchKolkata = await Branch.create({
      name: 'Kolkata Main Branch',
      address: 'Salt Lake Sector V, Kolkata, WB'
    });
    const branchDelhi = await Branch.create({
      name: 'Delhi South Centre',
      address: 'Kalu Sarai, Hauz Khas, Delhi'
    });
    console.log('Branches created.');

    // 2. Create Users (Staff)
    console.log('Creating staff users...');
    
    // Super Admin
    const superAdmin = await User.create({
      userId: 'USR-2026-000001',
      name: 'Super Admin',
      email: 'superadmin@coaching.com',
      password: 'password123',
      role: 'super_admin',
      branchId: null,
      qrCodeData: await generateQRCode('USR-2026-000001')
    });

    // Kolkata Branch Admin
    const adminKolkata = await User.create({
      userId: 'USR-2026-000002',
      name: 'Kolkata Administrator',
      email: 'admin.kolkata@coaching.com',
      password: 'password123',
      role: 'admin',
      branchId: branchKolkata._id,
      qrCodeData: await generateQRCode('USR-2026-000002')
    });

    // Kolkata Faculty / Teacher
    const teacherKolkata = await User.create({
      userId: 'USR-2026-000003',
      name: 'Dr. R. C. Sen (Physics)',
      email: 'teacher.physics@coaching.com',
      password: 'password123',
      role: 'teacher',
      branchId: branchKolkata._id,
      qrCodeData: await generateQRCode('USR-2026-000003')
    });

    // Kolkata Scanner Operator
    const scannerKolkata = await User.create({
      userId: 'USR-2026-000004',
      name: 'Kolkata Scanner Counter 1',
      email: 'scanner.kolkata@coaching.com',
      password: 'password123',
      role: 'scanner_operator',
      branchId: branchKolkata._id,
      qrCodeData: await generateQRCode('USR-2026-000004')
    });

    console.log('Staff users created.');

    // 3. Create Batches
    console.log('Creating batches...');
    
    const batchJEE = await Batch.create({
      name: 'JEE 2026 Alpha Batch',
      class: '12th',
      course: 'JEE',
      subject: 'Physics & Math',
      facultyId: teacherKolkata._id,
      timings: '08:00 AM - 10:00 AM',
      branchId: branchKolkata._id
    });

    const batchNEET = await Batch.create({
      name: 'NEET 2027 Conquerors',
      class: '11th',
      course: 'NEET',
      subject: 'Biology & Chemistry',
      facultyId: teacherKolkata._id,
      timings: '10:30 AM - 12:30 PM',
      branchId: branchKolkata._id
    });

    console.log('Batches created.');

    // 4. Create Students (with QR code generation)
    console.log('Creating students...');

    const studentData = [
      {
        studentId: 'STU-2026-000001',
        name: 'Aarav Sharma',
        rollNumber: 'JEE-12-001',
        phoneNumber: '+919876543210',
        parentPhoneNumber: '+919876543219',
        email: 'aarav.sharma@gmail.com',
        address: 'Salt Lake Sector 3, Kolkata',
        class: '12th' as const,
        course: 'JEE' as const,
        batchId: batchJEE._id,
        branchId: branchKolkata._id
      },
      {
        studentId: 'STU-2026-000002',
        name: 'Ananya Roy',
        rollNumber: 'JEE-12-002',
        phoneNumber: '+918765432109',
        parentPhoneNumber: '+918765432100',
        email: 'ananya.roy@yahoo.com',
        address: 'New Town, Kolkata',
        class: '12th' as const,
        course: 'JEE' as const,
        batchId: batchJEE._id,
        branchId: branchKolkata._id
      },
      {
        studentId: 'STU-2026-000003',
        name: 'Ishaan Verma',
        rollNumber: 'NEET-11-051',
        phoneNumber: '+917654321098',
        parentPhoneNumber: '+917654321090',
        email: 'ishaan.verma@outlook.com',
        address: 'Garia, Kolkata',
        class: '11th' as const,
        course: 'NEET' as const,
        batchId: batchNEET._id,
        branchId: branchKolkata._id
      },
      {
        studentId: 'STU-2026-000004',
        name: 'Rohan Gupta',
        rollNumber: 'NEET-11-052',
        phoneNumber: '+916543210987',
        parentPhoneNumber: '+916543210980',
        email: 'rohan.gupta@gmail.com',
        address: 'Dum Dum, Kolkata',
        class: '11th' as const,
        course: 'NEET' as const,
        batchId: batchNEET._id,
        branchId: branchKolkata._id
      }
    ];

    for (const student of studentData) {
      const qrCodeData = await generateQRCode(student.studentId);
      await Student.create({
        ...student,
        qrCodeData,
        photoUrl: '', // blank by default
        active: true
      });
    }

    console.log('Students created successfully.');

    // Create an initial Activity Log
    await ActivityLog.create({
      userId: superAdmin._id,
      action: 'SYSTEM_SEED',
      details: 'Initial system database seed executed successfully'
    });

    console.log('Database seeded successfully!');
    console.log('\n--- Test Account Credentials ---');
    console.log('Super Admin:       superadmin@coaching.com / password123');
    console.log('Branch Admin:      admin.kolkata@coaching.com / password123');
    console.log('Teacher:           teacher.physics@coaching.com / password123');
    console.log('Scanner Operator:  scanner.kolkata@coaching.com / password123');
    console.log('--------------------------------\n');

    await mongoose.disconnect();
  } catch (error: any) {
    console.error('Error seeding database:', error.message);
    process.exit(1);
  }
};

seedDB();
