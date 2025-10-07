const mongoose = require('mongoose');

class DatabaseManager {
  constructor() {
    this.connections = new Map();
    this.masterConnection = null;
  }

  // Initialize master database connection (for super admin and tenant management)
  async initializeMasterDB() {
    try {
      const masterDbName = 'master_tenant_db';
      const connectionString = `${process.env.MONGODB_URI}${masterDbName}?${process.env.MONGODB_OPTIONS}`;
      
      this.masterConnection = await mongoose.createConnection(connectionString, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });

      console.log(`✅ Master database connected: ${masterDbName}`);
      return this.masterConnection;
    } catch (error) {
      console.error('❌ Master database connection failed:', error.message);
      throw error;
    }
  }

  // Get or create tenant-specific database connection
  async getTenantDB(tenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    // Return existing connection if available
    if (this.connections.has(tenantId)) {
      return this.connections.get(tenantId);
    }

    try {
      const dbName = `tenant_${tenantId}`;
      const connectionString = `${process.env.MONGODB_URI}${dbName}?${process.env.MONGODB_OPTIONS}`;
      
      const connection = await mongoose.createConnection(connectionString, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });

      // Store connection for reuse
      this.connections.set(tenantId, connection);
      
      console.log(`✅ Tenant database connected: ${dbName}`);
      return connection;
    } catch (error) {
      console.error(`❌ Tenant database connection failed for ${tenantId}:`, error.message);
      throw error;
    }
  }

  // Create new tenant database
  async createTenantDB(tenantId) {
    try {
      const connection = await this.getTenantDB(tenantId);
      
      // Initialize tenant-specific collections with indexes
      await this.initializeTenantCollections(connection);
      
      console.log(`✅ Tenant database created and initialized: tenant_${tenantId}`);
      return connection;
    } catch (error) {
      console.error(`❌ Failed to create tenant database for ${tenantId}:`, error.message);
      throw error;
    }
  }

  // Initialize tenant-specific collections and indexes
  async initializeTenantCollections(connection) {
    try {
      // Create collections with proper indexes
      const collections = [
        {
          name: 'users',
          indexes: [
            { email: 1 },
            { role: 1 },
            { isActive: 1 },
            { createdAt: -1 }
          ]
        },
        {
          name: 'requirements',
          indexes: [
            { createdBy: 1 },
            { assignedTo: 1 },
            { status: 1 },
            { dueDate: 1 },
            { createdAt: -1 }
          ]
        },
        {
          name: 'jobdescriptions',
          indexes: [
            { requirementId: 1 },
            { createdBy: 1 },
            { isActive: 1 },
            { shareableLink: 1 },
            { createdAt: -1 }
          ]
        },
        {
          name: 'applications',
          indexes: [
            { jobDescriptionId: 1 },
            { candidateId: 1 },
            { status: 1 },
            { appliedAt: -1 }
          ]
        },
        {
          name: 'candidates',
          indexes: [
            { email: 1 },
            { phone: 1 },
            { skills: 1 },
            { experience: 1 },
            { createdAt: -1 }
          ]
        }
      ];

      for (const collection of collections) {
        const coll = connection.collection(collection.name);
        
        // Create indexes
        for (const index of collection.indexes) {
          await coll.createIndex(index);
        }
      }

      console.log('✅ Tenant collections and indexes initialized');
    } catch (error) {
      console.error('❌ Failed to initialize tenant collections:', error.message);
      throw error;
    }
  }

  // Close specific tenant connection
  async closeTenantConnection(tenantId) {
    if (this.connections.has(tenantId)) {
      await this.connections.get(tenantId).close();
      this.connections.delete(tenantId);
      console.log(`✅ Tenant connection closed: ${tenantId}`);
    }
  }

  // Close all connections
  async closeAllConnections() {
    try {
      // Close tenant connections
      for (const [tenantId, connection] of this.connections) {
        await connection.close();
        console.log(`✅ Closed tenant connection: ${tenantId}`);
      }
      this.connections.clear();

      // Close master connection
      if (this.masterConnection) {
        await this.masterConnection.close();
        console.log('✅ Master connection closed');
      }
    } catch (error) {
      console.error('❌ Error closing connections:', error.message);
    }
  }

  // Get master connection
  getMasterConnection() {
    if (!this.masterConnection) {
      throw new Error('Master database not initialized');
    }
    return this.masterConnection;
  }
}

// Singleton instance
const dbManager = new DatabaseManager();

module.exports = dbManager;