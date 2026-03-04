const admin = require('../models/admin');

// Admin authentication middleware
function authMiddleware(req, res, next) {
    // Skip login-related routes
    if (req.path.startsWith('/v1/admin/')) {
        return next();
    }

    // Handle static HTML pages
    if (req.path === '/logs.html') {
        // Log page access is not validated in middleware, but in frontend page
        return next();
    }

    // Only authenticate management-related APIs
    if (req.path.startsWith('/v1/api-keys') || 
        req.path.startsWith('/v1/invalid-cookies') || 
        req.path.startsWith('/v1/refresh-cookies') ||
        req.path.startsWith('/v1/logs')) {
        // Get Authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Auth token not provided'
            });
        }

        // Extract token
        const token = authHeader.split(' ')[1];
        
        // Verify token
        const result = admin.verifyToken(token);
        if (!result.success) {
            return res.status(401).json({
                success: false,
                message: 'Invalid token'
            });
        }

        // Add user info to request object
        req.admin = {
            username: result.username
        };
    }

    next();
}

module.exports = authMiddleware; 