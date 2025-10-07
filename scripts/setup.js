const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const dbManager = require('../config/database');

// Setup script to initialize the application
const setupApplication = async () => {
  try {
    console.log('🚀 Starting application setup...');

    // Initialize master database
    console.log('📊 Initializing master database...');
    await dbManager.initializeMasterDB();

    // Create super admin if not exists
    const SuperAdmin = require('../models/master/SuperAdmin')(dbManager.getMasterConnection());
    
    const existingSuperAdmin = await SuperAdmin.findOne({});
    
    if (!existingSuperAdmin) {
      console.log('👤 Creating default super admin...');
      
      const superAdminData = {
        name: 'Super Admin',
        email: process.env.SUPER_ADMIN_EMAIL || 'admin@example.com',
        password: process.env.SUPER_ADMIN_PASSWORD || 'SuperAdmin123!'
      };

      await SuperAdmin.create(superAdminData);
      
      console.log('✅ Super admin created successfully');
      console.log(`📧 Email: ${superAdminData.email}`);
      console.log(`🔑 Password: ${superAdminData.password}`);
      console.log('⚠️  Please change the password after first login!');
    } else {
      console.log('✅ Super admin already exists');
    }

    // Create sample tenant for development
    if (process.env.NODE_ENV === 'development') {
      const Tenant = require('../models/master/Tenant')(dbManager.getMasterConnection());
      
      const existingTenant = await Tenant.findOne({ subdomain: 'demo' });
      
      if (!existingTenant) {
        console.log('🏢 Creating demo tenant...');
        
        const tempPassword = 'Demo123!';
        const hashedPassword = await bcrypt.hash(tempPassword, 12);
        
        const demoTenant = await Tenant.create({
          companyName: 'Demo Company',
          subdomain: 'demo',
          email: 'demo@example.com',
          phone: '+1234567890',
          address: {
            street: '123 Demo Street',
            city: 'Demo City',
            state: 'Demo State',
            country: 'Demo Country',
            zipCode: '12345'
          },
          adminCredentials: {
            username: 'demo_admin',
            tempPassword: hashedPassword
          },
          createdBy: existingSuperAdmin._id
        });

        // Create tenant database
  await dbManager.createTenantDB(demoTenant.subdomain);

        // Create demo company admin
  const tenantDB = await dbManager.getTenantDB(demoTenant.subdomain);
        const User = require('../models/tenant/User')(tenantDB);

        await User.create({
          name: 'Demo Admin',
          email: 'demo@example.com',
          password: tempPassword,
          role: 'company_admin',
          isEmailVerified: true
        });

        console.log('✅ Demo tenant created successfully');
        console.log('🌐 Access at: http://demo.localhost:3000');
        console.log(`📧 Email: demo@example.com`);
        console.log(`🔑 Password: ${tempPassword}`);
      } else {
        console.log('✅ Demo tenant already exists');
      }
    }

    console.log('🎉 Application setup completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('1. Start the server: npm run dev');
    console.log('2. Access super admin at: http://localhost:5000/api/super-admin/login');
    console.log('3. Access demo tenant at: http://demo.localhost:3000 (if created)');
    console.log('4. Create your first tenant via super admin panel');

  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  } finally {
    await dbManager.closeAllConnections();
    process.exit(0);
  }
};

// Run setup if called directly
if (require.main === module) {
  setupApplication();
}

module.exports = setupApplication;