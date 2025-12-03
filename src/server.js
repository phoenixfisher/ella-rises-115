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
    res.locals.user = req.session.user;
    const openPaths = ['/', '/login', '/logout', '/create-account'];

    if (openPaths.includes(req.path)) {
        return next();
    }
    
    if (req.session.isLoggedIn) {
        next();
    } else {
        res.redirect('/login'); 
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

// Routes for adding a user
app.get("/addUser", (req, res) => {
    res.render("addUser");
});

// Handle form submission for adding a user
app.post("/addUser", (req, res) => {
    const { username, password, level } = req.body;
    if (!username || !password) {
        return res.status(400).render("addUser", { error_message: "Username and password are required." });
    }
    const newUser = {
        username,
        password,
        level
    };
    knex("users")
        .insert(newUser)
        .then(() => {
            res.redirect("/users");
        })
        .catch((dbErr) => {
            console.error("Error inserting user:", dbErr.message);
            res.status(500).render("addUser", { error_message: "Unable to save user. Please try again." });
        });
});


// Handle form submission for deleting a user
app.post("/deleteUser/:id", (req, res) => {
    
    knex("users").where("id", req.params.id).del().then(users => {
        res.redirect("/users");
    }).catch(err => {
        console.log(err);
        res.status(500).json({err});
    })
});


// Routes for editing a user
app.get("/editUser/:id", (req, res) => {
    const id = req.params.id;

    knex("users")
    .where({ id: id })
    .first()
    .then((user) => {
        if (!user) {
            return res.status(404).render("displayUsers", {
                users: [],
                userLevel: req.session.user.level,
                error_message: "User not found."
            });
        }

        res.render("editUser", { user, error_message: "" });
    })
    .catch((err) => {
        console.error("Database query error:", err.message);
        res.status(500).render("displayUsers", {
            users: [],
            userLevel: req.session.user.level,
            error_message: `Database error: ${err.message}.`
        });
    });

});


// Handle form submission for editing a user
app.post("/editUser/:id", (req, res) => {
    const id = req.params.id;
    const { username, password, level } = req.body;

    if (!username || !password) {
        return knex("users")
            .where({ id: id })
            .first()
            .then((user) => {
                if (!user) {
                    return res.status(404).render("displayUsers", {
                        users: [],
                        userLevel: req.session.user.level,
                        error_message: "User not found."
                    });
                }
                res.status(400).render("editUser", {
                    user,
                    error_message: "Username and password are required."
                });
            })
            .catch((err) => {
                console.error("Error fetching user:", err.message);
                res.status(500).render("displayUsers", {
                    users: [],
                    userLevel: req.session.user.level,
                    error_message: "Unable to load user for editing."
                });
            });
    }
    const updatedUser = {
        username,
        password,
        level
    };
    
    knex("users")
        .where({ id: id })
        .update(updatedUser)
        .then((rowsUpdated) => {
            if (rowsUpdated === 0) {
                return res.status(404).render("displayUsers", {
                    users: [],
                    userLevel: req.session.user.level,
                    error_message: "User not found."
                });
            }
            res.redirect("/users");
        })
        .catch((err) => {
            console.error("Error updating user:", err.message);
            knex("users")
                .where({ id: id })
                .first()
                .then((user) => {
                    if (!user) {
                        return res.status(404).render("displayUsers", {
                            users: [],
                            userLevel: req.session.user.level,
                            error_message: "User not found."
                        });
                    }
                    res.status(500).render("editUser", {
                        user,
                        error_message: "Unable to update user. Please try again."
                    });
                })
                .catch((fetchErr) => {
                    console.error("Error fetching user after update failure:", fetchErr.message);
                    res.status(500).render("displayUsers", {
                        users: [],
                        userLevel: req.session.user.level,
                        error_message: "Unable to update user."
                    });
                });
        });
});


// =========================
// START SERVER
// =========================
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
