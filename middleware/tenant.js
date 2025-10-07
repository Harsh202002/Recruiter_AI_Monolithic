const dbManager = require('../config/database');

// Extract tenant information from subdomain
const extractTenantFromHost = (host) => {
  if (!host) return null;

  // Remove port if present
  const cleanHost = host.split(':')[0];
  
  // Development patterns
  const devPatterns = [
    /^([^.]+)\.localhost$/,
    /^([^.]+)\.lvh\.me$/
  ];
  
  // Production pattern
  const prodPattern = /^([^.]+)\.myapp\.com$/;
  
  // Check development patterns
  for (const pattern of devPatterns) {
    const match = cleanHost.match(pattern);
    if (match && match[1] !== 'www') {
      return match[1];
    }
  }
  
  // Check production pattern
  const prodMatch = cleanHost.match(prodPattern);
  if (prodMatch && prodMatch[1] !== 'www') {
    return prodMatch[1];
  }
  
  return null;
};

// Middleware to resolve tenant and attach database connection
const tenantMiddleware = async (req, res, next) => {
  try {
    const host = req.get('host') || req.headers.host;
    const tenantSubdomain = extractTenantFromHost(host);
    
    // Initialize master DB if not already done
    if (!dbManager.masterConnection) {
      await dbManager.initializeMasterDB();
    }

    // For super admin routes or non-tenant specific routes
    if (!tenantSubdomain || req.path.startsWith('/api/super-admin')) {
      req.db = dbManager.getMasterConnection();
      req.tenant = null;
      return next();
    }

    // Get tenant info from master database
    const Tenant = require('../models/master/Tenant')(dbManager.getMasterConnection());
    const tenant = await Tenant.findOne({ 
      subdomain: tenantSubdomain, 
      isActive: true 
    });

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found or inactive',
        code: 'TENANT_NOT_FOUND'
      });
    }

    // Get tenant-specific database connection using subdomain as DB name
    const tenantDB = await dbManager.getTenantDB(tenant.subdomain);
    
    // Attach tenant info and database to request
    req.tenant = tenant;
    req.db = tenantDB;
    req.tenantId = tenant.subdomain;

    next();
  } catch (error) {
    console.error('Tenant middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error in tenant resolution',
      code: 'TENANT_RESOLUTION_ERROR'
    });
  }
};

module.exports = tenantMiddleware;