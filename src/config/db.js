const knex = require("knex");

const db = knex({
    client: "pg",
    connection: {
        host: process.env.RDS_HOST,
        user: process.env.RDS_USER,
        password: process.env.RDS_PASSWORD,
        database: process.env.RDS_DATABASE,
        port: process.env.RDS_PORT,
        ssl: process.env.RDS_SSL === "true" ? { rejectUnauthorized: false } : false,
    },
});

module.exports = db;
