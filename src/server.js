const express = require("express");
const bodyParser = require("body-parser");
const expressLayouts = require("express-ejs-layouts");
const session = require("express-session");
const helmet = require("helmet");
const bcrypt = require("bcrypt");
require("dotenv").config();
const path = require("path");

const app = express();
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-session-secret-change-me";

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

// Basic security headers
app.use(helmet({ contentSecurityPolicy: false }));

// Parse form POST data
app.use(bodyParser.urlencoded({ extended: true }));

// Sessions
app.use(
    session({
        secret: SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
        },
    })
);

// Expose common template locals
app.use((req, res, next) => {
    res.locals.user = req.session?.user || null;
    res.locals.title = "Ella Rises";
    res.locals.messages = [];
    next();
});

// =========================
// AUTH HELPERS
// =========================
const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect("/login");
    }
    next();
};

// Require specific user level(s); manager = "M", user = "U"
const requireRole = (levels) => {
    const allowed = Array.isArray(levels) ? levels : [levels];
    return (req, res, next) => {
        if (!req.session.user) {
            return res.redirect("/login");
        }
        if (!allowed.includes(req.session.user.level)) {
            return res.status(403).render("auth/login", {
                layout: false,
                error_message: "You are not authorized to view that page.",
            });
        }
        next();
    };
};

// =========================
// LOGIN ROUTES
// =========================

// Default route → landing page
app.get("/", (req, res) => {
    res.render("landing", {error_message: ""});
});

// Optional login route (same page)
app.get("/login", (req, res) => {
    res.render("auth/login");
});

// Alias for registration route
app.get("/register", (req, res) => {
    res.redirect("/create-account");
});

// Public landing page
app.get("/landing", (req, res) => {
    res.render("landing");
});

// Process login form
app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await knex("users").where({ username }).first();

        if (!user) {
            return res.render("auth/login", {
                layout: false,
                error_message: "Invalid username or password.",
            });
        }

        let isValidPassword = false;

        // If password is already hashed, use bcrypt. Otherwise, support legacy plain text and re-hash.
        if (user.password && user.password.startsWith("$2")) {
            isValidPassword = await bcrypt.compare(password, user.password);
        } else {
            isValidPassword = user.password === password;
            if (isValidPassword) {
                const newHash = await bcrypt.hash(password, 10);
                await knex("users").where({ id: user.id }).update({ password: newHash });
            }
        }

        if (!isValidPassword) {
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

        res.redirect("/landing");
    } catch (err) {
        console.error(err);
        res.send("Login error");
    }
});

// =========================
// PROTECTED ROUTES EXAMPLE
// =========================
app.get("/dashboard", requireAuth, (req, res) => {
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
app.post("/create-account", async (req, res) => {
    const { username, password } = req.body;
    const level = "U";
    
    if (!username || !password) {
        return res.status(400).render("auth/create-account", { 
            layout: false,
            error_message: "Username and password are required.",
            user: null
        });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = {
            username,
            password: hashedPassword,
            level
        };

        await knex("users").insert(newUser);

        res.redirect("/login");
    } catch (dbErr) {
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
    }
});

// Route for viewing all users (people with login accounts in the users table)
app.get("/users", requireRole(["M"]), (req, res) => {
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

// Route for viewing events
app.get("/events", async (req, res) => {
    try {
        const eventList = await knex("events")
            .join("eventoccurrences", "events.eventid", "=", "eventoccurrences.eventid")
            .select(
                "events.eventid",
                "events.eventname",
                "events.eventtype",
                "events.eventdescription",
                "events.eventrecurrencepattern",
                "eventoccurrences.eventdatetimestart",
                "eventoccurrences.eventdatetimeend",
                "eventoccurrences.eventlocation"
            )
            .orderBy("eventoccurrences.eventdatetimestart", "asc"); // Show soonest events first

        res.render("events", { 
            events: eventList,
            user: req.session.user // Passing user for the layout
        });

    } catch (err) {
        console.error("Error fetching events:", err);
        res.status(500).send("Error loading events");
    }
});

app.get("/addEvent", (req, res) => {
    // Check if user is logged in/admin if needed
    if (!req.session.user) {
        return res.redirect("/login");
    }

    res.render("addEvent", {
        user: req.session.user
    });
});

app.get("/editEvent/:id", async (req, res) => {
    const targetId = req.params.id;

    try {
        // We use .first() because we expect only one result
        const eventToEdit = await knex("events")
            .join("eventoccurrences", "events.eventid", "=", "eventoccurrences.eventid")
            .where("events.eventid", targetId)
            .select(
                "events.eventid",
                "events.eventname",
                "events.eventtype",
                "events.eventdescription",
                "events.eventrecurrencepattern",
                "events.eventdefaultcapacity",
                "eventoccurrences.eventdatetimestart",
                "eventoccurrences.eventdatetimeend",
                "eventoccurrences.eventlocation",
                "eventoccurrences.eventregistrationdeadline",
                "eventoccurrences.eventcapacity"
            )
            .first();

        // Safety check: Did we actually find an event?
        if (!eventToEdit) {
            return res.status(404).send("Event not found");
        }

        res.render("editEvent", {
            event: eventToEdit,
            user: req.session.user
        });

    } catch (err) {
        console.error("Error fetching event for edit:", err);
        res.status(500).send("Error loading edit page");
    }
});

app.post('/addEvent', async (req, res) => {
    // Destructure your form inputs
    const { 
        name, type, description, recurrence, capacity, // For 'events' table
        startTime, endTime, location, deadline        // For 'eventoccurrences' table
    } = req.body;

    try {
        await knex.transaction(async (trx) => {
            
            // Step 1: Insert into 'events'
            const [newEvent] = await trx('events')
                .insert({
                    eventname: name,
                    eventtype: type,
                    eventdescription: description,
                    eventrecurrencepattern: recurrence || 'None', // Default if empty
                    eventdefaultcapacity: parseInt(capacity)
                })
                .returning('eventid'); // ⚠️ CRITICAL: Must match the PK column name

            // Step 2: Insert into 'eventoccurrences' using the new ID
            await trx('eventoccurrences').insert({
                eventid: newEvent.eventid, // Link to the parent
                eventdatetimestart: startTime,
                eventdatetimeend: endTime,
                eventlocation: location,
                eventcapacity: parseInt(capacity), // Setting specific capacity to match default
                eventregistrationdeadline: deadline
            });
        });

        res.redirect('/events');

    } catch (err) {
        console.error("Error adding event:", err);
        res.status(500).send("Failed to add event");
    }
});

app.post('/editEvent/:id', async (req, res) => {
    const targetEventId = req.params.id;
    const { 
        name, type, description, recurrence, capacity, 
        startTime, endTime, location, deadline 
    } = req.body;

    try {
        await knex.transaction(async (trx) => {
            
            // Step 1: Update the Parent (events)
            await trx('events')
                .where({ eventid: targetEventId }) // Match PK
                .update({
                    eventname: name,
                    eventtype: type,
                    eventdescription: description,
                    eventrecurrencepattern: recurrence,
                    eventdefaultcapacity: parseInt(capacity)
                });

            // Step 2: Update the Child (eventoccurrences)
            // Note: This updates ALL occurrences for this event ID. 
            await trx('eventoccurrences')
                .where({ eventid: targetEventId }) // Match FK
                .update({
                    eventdatetimestart: startTime,
                    eventdatetimeend: endTime,
                    eventlocation: location,
                    eventcapacity: parseInt(capacity),
                    eventregistrationdeadline: deadline
                });
        });

        res.redirect('/events');//

    } catch (err) {
        console.error("Error editing event:", err);
        res.status(500).send("Failed to update event");
    }
});

app.post('/deleteEvent/:id', async (req, res) => {
    const targetEventId = req.params.id;

    try {
        await knex.transaction(async (trx) => {
            
            // Step 1: Delete from 'eventoccurrences' first
            await trx('eventoccurrences')
                .where({ eventid: targetEventId })
                .del();

            // Step 2: Delete from 'events' second
            await trx('events')
                .where({ eventid: targetEventId })
                .del();
        });

        res.redirect('/events');

    } catch (err) {
        console.error("Error deleting event:", err);
        res.status(500).send("Failed to delete event");
    }
});

// =========================
// Display Donations
// =========================
app.get("/donations", async (req, res) => {
    try {
        const donations = await knex("donations as d")
            .leftJoin("participants as p", "d.participantid", "p.participantid") // <-- safer join
            .select(
                "d.donationid",
                "p.participantfirstname",
                "p.participantlastname",
                "d.donationdate",
                "d.donationamount"
            )
            .orderByRaw("d.donationdate IS NULL ASC, d.donationdate DESC");

        res.render("donations", {     
            donations,
            user: req.session.user || null
        });

    } catch (err) {
        console.error(err);
        res.send("Error loading page");
    }
});

// =========================
// Delete Donations
// =========================
app.get("/deleteDonation/:donationid", async (req, res) => {
    const donationid = req.params.donationid;  // <-- FIXED

    try {
        await knex("donations")
            .where("donationid", donationid)
            .del();

        res.redirect("/donations");
    } catch (err) {
        console.error(err);
        res.send("Error deleting donation");
    }
});



// =========================
// START SERVER
// =========================
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
