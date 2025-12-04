const session = require("express-session");

const SESSION_SECRET = process.env.SESSION_SECRET || "dev-session-secret-change-me";

const sessionMiddleware = session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
    },
});

module.exports = { sessionMiddleware };
