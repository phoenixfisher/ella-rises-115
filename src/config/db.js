const knex = require("knex");

console.log("EB DB CONFIG:", {
  host: process.env.RDS_HOSTNAME,
  user: process.env.RDS_USERNAME,
  database: process.env.RDS_DB_NAME,
  port: process.env.RDS_PORT,
  ssl: process.env.RDS_SSL
});

const db = knex({
    client: "pg",
    connection: {
        host: process.env.RDS_HOSTNAME,
        user: process.env.RDS_USERNAME,
        password: process.env.RDS_PASSWORD,
        database: process.env.RDS_DB_NAME,
        port: process.env.RDS_PORT,
        ssl: process.env.RDS_SSL === "true" ? { rejectUnauthorized: false } : false,
    },
});

module.exports = db;
