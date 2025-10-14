const fs = require('fs');

const envContent = `# Server Configuration
PORT=5000
NODE_ENV=development

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=lpg_gas_db
DB_USER=postgres
DB_PASSWORD=12345

# JWT Configuration
JWT_SECRET=FDDGFDG4RRERERRGBGGR4534534
JWT_EXPIRES_IN=24h

# Login Credentials (for initial setup)
DEFAULT_EMAIL=ramnishbase2brand@gmail.com
DEFAULT_PASSWORD=Ramnish@123

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Email Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=ramnishbase2brand@gmail.com
EMAIL_PASSWORD=hsjy sqaw jdue lsrd

# URLs
BACKEND_BASE_URL=http://localhost:5000
FRONTEND_URL=http://localhost:3000

# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=dr0x84q69
CLOUDINARY_API_KEY=958347841584284
CLOUDINARY_API_SECRET=sEXY8lARWuUV9XMP71mpTiRU750E`;

try {
  fs.writeFileSync('.env', envContent);
  console.log('✅ .env file fixed successfully!');
  console.log('📧 Email configuration added:');
  console.log('   - EMAIL_HOST=smtp.gmail.com');
  console.log('   - EMAIL_PORT=587');
  console.log('   - EMAIL_USER=ramnishbase2brand@gmail.com');
  console.log('   - EMAIL_PASSWORD=hsjy sqaw jdue lsrd');
  console.log('🌐 URLs added:');
  console.log('   - BACKEND_BASE_URL=http://localhost:5000');
  console.log('   - FRONTEND_URL=http://localhost:3000');
  console.log('\n🚀 Now restart your server to apply changes!');
} catch (error) {
  console.error('❌ Error fixing .env file:', error.message);
}

