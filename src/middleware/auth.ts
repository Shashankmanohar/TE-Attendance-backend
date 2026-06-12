import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User, { IUser } from '../models/User';

export interface AuthRequest extends Request {
  user?: IUser;
}

export const protect = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    res.status(401).json({ success: false, message: 'Not authorized, token missing' });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'qr_attendance_jwt_secret_key_9988') as any;
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      res.status(401).json({ success: false, message: 'User not found with this token' });
      return;
    }

    if (!user.active) {
      res.status(403).json({ success: false, message: 'Your account is deactivated' });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Not authorized, invalid token' });
  }
};

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: `User role '${req.user?.role}' is not authorized to access this route`
      });
      return;
    }
    next();
  };
};
