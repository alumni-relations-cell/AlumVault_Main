const requiredVars = [
  'DB_USER',
  'DB_PASSWORD',
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'ENCRYPTION_KEY',
  'BLIND_INDEX_KEY',
  'INTERNAL_HMAC_SECRET'
];

function validateEnv() {
  const missing = [];
  for (const v of requiredVars) {
    if (!process.env[v]) {
      missing.push(v);
    }
  }

  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}. Refusing to start.`);
    process.exit(1);
  }

  return {
    PORT: process.env.PORT || 3000,
    DB_USER: process.env.DB_USER,
    DB_PASSWORD: process.env.DB_PASSWORD,
    DB_HOST: process.env.DB_HOST,
    DB_PORT: process.env.DB_PORT,
    DB_NAME: process.env.DB_NAME,
    REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
    RABBITMQ_URL: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
    JWT_PRIVATE_KEY: process.env.JWT_PRIVATE_KEY,
    JWT_PUBLIC_KEY: process.env.JWT_PUBLIC_KEY,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    BLIND_INDEX_KEY: process.env.BLIND_INDEX_KEY,
    INTERNAL_HMAC_SECRET: process.env.INTERNAL_HMAC_SECRET,
    NODE_ENV: process.env.NODE_ENV || 'development',
    CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3001'
  };
}

module.exports = validateEnv();
