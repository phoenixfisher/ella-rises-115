const express = require("express");
const bodyParser = require("body-parser");
const expressLayouts = require("express-ejs-layouts");
const session = require("express-session");
require("dotenv").config();
const path = require("path");

const app = express();

// =========================
// INIT KNEX (PostgreSQL)
// =========================
const knex = require("knex")({
    client: "pg",
    connection: {
        host: process.env.PG_HOST,
        user: process.env.PG_USER,
        password: process.env.PG_PASSWORD,
        database: process.env.PG_DATABASE,
        port: process.env.PG_PORT,

        ssl: {
            rejectUnauthorized: false
        }
    }
});

// =========================
// VIEW ENGINE + STATIC FILES
// =========================
app.set("view engine", "ejs");
app.use(expressLayouts);
app.set("layout", "layout");

// This points Express to: src/views
app.set("views", path.join(__dirname, "views"));

// This serves static files from: src/public
app.use(express.static(path.join(__dirname, "public")));

// Parse form POST data
app.use(bodyParser.urlencoded({ extended: true }));

// Sessions
app.use(
    session({
        secret: "supersecret123",
        resave: false,
        saveUninitialized: false,
    })
);

// Expose common template locals
app.use((req, res, next) => {
    res.locals.user = req.session?.user || null;
    res.locals.title = "Ella Rises";
    res.locals.messages = [];
    next();
});

// Global authentication middleware
app.use((req, res, next) => {
    // Skip authentication for login routes
    if (req.path === '/' || req.path === '/login' || req.path === '/logout') {
        //continue with the request path
        return next();
    }
    if (req.session.isLoggedIn) {
        next();
    } 
    else {
        res.render("login", { error_message: "Please log in to access this page" });
    }
});

// =========================
// LOGIN ROUTES
// =========================

// Default route → landing page
app.get("/", (req, res) => {
    res.render("landing", {error_message: ""});
});

// Optional login route (same page)
app.get("/login", (req, res) => {
    res.render("auth/login",  {layout: false, error_message: ""});
});

// Public landing page
app.get("/landing", (req, res) => {
    res.render("landing");
});

// Process login form
app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await knex("users")
            .where({ username, password })
            .first();

        if (!user) {
            return res.render("auth/login", {
                layout: false,
                error_message: "Invalid username or password.",
            });
        }

        // Save user in session
        req.session.user = {
            id: user.id,
            username: user.username,
            level: user.level,
        };

        req.session.isLoggedIn = true;

        res.redirect("/landing");
    } catch (err) {
        console.error(err);
        res.send("Login error");
    }
});

// =========================
// PROTECTED ROUTES EXAMPLE
// =========================
app.get("/dashboard", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/login");
    }

    // You can render a dashboard.ejs, or keep this placeholder
    res.render("index", {
        username: req.session.user.username,
        level: req.session.user.level,
    });
});

// =========================
// LOGOUT
// =========================
app.get("/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/landing");
    });
});

// Route for getting the create account view
app.get("/create-account", (req, res) => {
    res.render("auth/create-account", { layout: false, error_message: "" });
});

// Handles form submission from creating an account

// These names for some of these variables probably need to be changed to match whatever it is going to be in the actual db
app.post("/create-account", (req, res) => {
    const { username, password } = req.body;
    const level = "U";
    
    if (!username || !password) {
        return res.status(400).render("auth/create-account", { 
            layout: false,
            error_message: "Username and password are required.",
            user: null
        });
    }

    const newUser = {
        username,
        password,
        level
    };

    knex("users")
        .insert(newUser)
        .then(() => {
            res.redirect("/login");
        })
        .catch((dbErr) => {
            console.error("Error inserting user:", dbErr.message);
            if (dbErr.code === '23505') {
                 return res.status(400).render("auth/create-account", { 
                    layout: false,
                    error_message: "Username is already taken.",
                    user: null
                });
            }
            res.status(500).render("auth/create-account", { 
                layout: false,
                error_message: "Unable to save user. Please try again.",
                user: null
            });
        });
});

// Route for viewing all users (people with login accounts in the users table)
app.get("/users", (req, res) => {
  if (req.session.isLoggedIn) {
    knex.select('username', 'password', 'level', 'id') 
        .from("users")
        .then(users => {
            console.log(`Successfully retrieved ${users.length} users from database`);
            res.render("displayUsers", {
                users: users,
                userLevel: req.session.user.level,
                user: req.session.user
            });
        })
        .catch((err) => {
            console.error("Database query error:", err.message);
            res.render("displayUsers", {
                users: [],
                error_message: `Database error: ${err.message}`
            });
        });
  }
  else {
    res.render("auth/login", { error_message: "" });
  }
});


// =========================
// START SERVER
// =========================
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
