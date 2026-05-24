import { Sequelize } from "sequelize";

const dbName = process.env.DB_NAME || "glasses";
const dbUser = process.env.DB_USER || "root";
const dbPassword = process.env.DB_PASSWORD || null;
const dbHost = process.env.DB_HOST || "127.0.0.1";
const dbPort = parseInt(process.env.DB_PORT || "3306", 10);
const isProduction = process.env.NODE_ENV === "production";

// Chỉ tạo DB khi chạy local (development)
const ensureDatabaseExists = async () => {
  if (isProduction) return; // Bỏ qua trên Railway/Render

  const adminDb = new Sequelize("", dbUser, dbPassword, {
    host: dbHost,
    port: dbPort,
    dialect: "mysql",
    logging: false,
  });

  await adminDb.query(
    `CREATE DATABASE IF NOT EXISTS \`${dbName}\` 
     DEFAULT CHARACTER SET utf8mb4 
     DEFAULT COLLATE utf8mb4_unicode_ci;`
  );
  await adminDb.close();
};

// Tạo sequelize instance dùng chung toàn app
export const sequelize = new Sequelize(dbName, dbUser, dbPassword, {
  host: dbHost,
  port: dbPort,
  dialect: "mysql",
  logging: false,
  timezone: "+07:00",
  dialectOptions: isProduction
    ? { ssl: { require: false, rejectUnauthorized: false } }
    : {},
});

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

const connectDB = async (retries = MAX_RETRIES) => {
  try {
    await ensureDatabaseExists();
    await sequelize.authenticate();
    console.log(
      `>>> Connection to "${dbName}" has been established successfully` +
      ` (${process.env.NODE_ENV || "development"}).`
    );
  } catch (error) {
    if (retries > 0) {
      console.warn(
        `>>> DB connection failed. Retrying in ${RETRY_DELAY_MS / 1000}s...` +
        ` (${retries} attempts left)`
      );
      await new Promise((res) => setTimeout(res, RETRY_DELAY_MS));
      return connectDB(retries - 1);
    }

    console.error(">>> Unable to connect to the database:", error.message);
    throw error;
  }
};

export default connectDB;