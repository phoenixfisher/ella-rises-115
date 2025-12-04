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
            res.render("users/displayUsers", {
                users: users,
                userLevel: req.session.user.level,
                user: req.session.user
            });
        })
        .catch((err) => {
            console.error("Database query error:", err.message);
            res.render("users/displayUsers", {
                users: [],
                error_message: `Database error: ${err.message}`
            });
        });
});

// Routes for adding a user
app.get("/addUser", (req, res) => {
    res.render("users/addUser");
});

// Handle form submission for adding a user
app.post("/addUser", async (req, res) => {
    const { username, password, level } = req.body;

    if (!username || !password) {
        return res.status(400).render("users/addUser", { error_message: "Username and password are required." });
    }

    try {
        // Security: Hash the password before creating the user
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const newUser = {
            username,
            password: hashedPassword, // Store the hash, not the plain text
            level
        };

        await knex("users").insert(newUser);
        res.redirect("/users");

    } catch (dbErr) {
        console.error("Error inserting user:", dbErr.message);
        res.status(500).render("users/addUser", { error_message: "Unable to save user. Please try again." });
    }
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
            return res.status(404).render("users/displayUsers", {
                users: [],
                userLevel: req.session.user.level,
                error_message: "User not found."
            });
        }

        res.render("users/editUser", { user, error_message: "" });
    })
    .catch((err) => {
        console.error("Database query error:", err.message);
        res.status(500).render("users/displayUsers", {
            users: [],
            userLevel: req.session.user.level,
            error_message: `Database error: ${err.message}.`
        });
    });

});


// Handle form submission for editing a user
app.post("/editUser/:id", async (req, res) => {
    const id = req.params.id;
    const { username, password, level } = req.body;

    // 1. Validation: Check if username exists
    if (!username) {
        try {
            const user = await knex("users").where({ id: id }).first();
            if (!user) {
                return res.status(404).render("users/displayUsers", {
                    users: [],
                    userLevel: req.session.user.level,
                    error_message: "User not found."
                });
            }
            return res.status(400).render("users/editUser", {
                user,
                error_message: "Username is required."
            });
        } catch (err) {
            console.error("Error fetching user:", err.message);
            return res.status(500).render("users/displayUsers", {
                users: [],
                userLevel: req.session.user.level,
                error_message: "Unable to load user for editing."
            });
        }
    }

    // 2. Prepare the update object
    const updatedUser = {
        username,
        level
    };

    // 3. Security: Hash the password IF it was provided
    if (password && password.trim() !== "") {
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        updatedUser.password = hashedPassword;
    }

    // 4. Update the database
    try {
        const rowsUpdated = await knex("users").where({ id: id }).update(updatedUser);

        if (rowsUpdated === 0) {
            return res.status(404).render("users/displayUsers", {
                users: [],
                userLevel: req.session.user.level,
                error_message: "User not found."
            });
        }
        res.redirect("/users");

    } catch (err) {
        console.error("Error updating user:", err.message);
        // Error handling: fetch user again to re-render form
        try {
            const user = await knex("users").where({ id: id }).first();
            if (!user) {
                return res.status(404).render("users/displayUsers", {
                    users: [],
                    userLevel: req.session.user.level,
                    error_message: "User not found."
                });
            }
            res.status(500).render("users/editUser", {
                user,
                error_message: "Unable to update user. Please try again."
            });
        } catch (fetchErr) {
            console.error("Error fetching user after failure:", fetchErr.message);
            res.status(500).render("users/displayUsers", {
                users: [],
                userLevel: req.session.user.level,
                error_message: "Unable to update user."
            });
        }
    }
});

// Route for viewing all participants (those with records in the participants table)
app.get("/participants", requireRole(["M"]), (req, res) => {
    knex.select(
            'participantid',
            'participantemail',
            knex.raw("participantfirstname || ' ' || participantlastname as participantfullname"),
            'participantphone'
        ) 
        .from("participants")
        .then(participants => {
            console.log(`Successfully retrieved ${participants.length} participants`);
            res.render("participants/participants", {
                participants: participants,
                userLevel: req.session.user.level,
                user: req.session.user
            });
        })
        .catch((err) => {
            console.error("Database query error:", err.message);
            res.render("participants/participants", {
                participants: [],
                userLevel: req.session.user ? req.session.user.level : null,
                user: req.session.user, 
                error_message: `Database error: ${err.message}`
            });
        });
});

// Route to view the full info for a specific participant (read-only)
app.get("/displayParticipant/:id", requireRole(["M"]), (req, res) => {
    const participantid = req.params.id;

    knex("participants")
        .select("*") // Fetch ALL details for this specific person
        .where({ participantid: participantid })
        .first()
        .then((participant) => {
            if (!participant) {
                return res.status(404).render("participants/participants", {
                    participants: [],
                    userLevel: req.session.user.level,
                    error_message: "Participant not found."
                });
            }
            return knex("milestones")
                .select("milestonetitle", "milestonedate", "milestoneid")
                .where({ participantid })
                .orderBy("milestonedate", "desc")
                .then((milestones) => {
                    res.render("participants/displayParticipant", {
                        participant: participant,
                        milestones,
                        userLevel: req.session.user.level,
                        user: req.session.user,
                        backLink: "/participants"
                    });
                });
        })
        .catch((err) => {
            console.error("Error fetching participant details:", err.message);
            res.status(500).send("Server Error");
        });
});

// Routes for adding a new participant
// GET: Show the empty form
app.get("/addParticipant", requireRole(["M"]), (req, res) => {
    res.render("participants/addParticipant", {
        userLevel: req.session.user.level,
        user: req.session.user
    });
});

// POST: Save the new participant
app.post("/addParticipant", requireRole(["M"]), (req, res) => {
    // Destructure all fields from the form
    const { 
        participantfirstname, participantlastname, participantemail, 
        participantphone, participantdob, participantrole, 
        participantcity, participantstate, participantzip, 
        participantschooloremployer, participantfieldofinterest 
    } = req.body;

    // Basic validation
    if (!participantfirstname || !participantlastname || !participantemail) {
        return res.status(400).render("participants/addParticipant", {
            userLevel: req.session.user.level,
            error_message: "First Name, Last Name, and Email are required."
        });
    }

    knex("participants")
        .insert({
            participantfirstname,
            participantlastname,
            participantemail,
            participantphone,
            participantdob,
            participantrole,
            participantcity,
            participantstate,
            participantzip,
            participantschooloremployer,
            participantfieldofinterest
        })
        .then(() => {
            res.redirect("/participants");
        })
        .catch((err) => {
            console.error("Error adding participant:", err.message);
            res.status(500).render("participants/addParticipant", {
                userLevel: req.session.user.level,
                error_message: "Unable to add participant. Please try again."
            });
        });
});

// Routes for editing an existing participant
// GET: Show form pre-filled with current data
app.get("/editParticipant/:id", requireRole(["M"]), (req, res) => {
    const participantid = req.params.id;

    knex("participants")
        .select("*")
        .where({ participantid: participantid })
        .first()
        .then((participant) => {
            if (!participant) {
                return res.status(404).send("Participant not found");
            }
            res.render("participants/editParticipant", {
                participant: participant,
                userLevel: req.session.user.level,
                user: req.session.user
            });
        })
        .catch((err) => {
            console.error("Error loading participant for edit:", err.message);
            res.status(500).send("Server Error");
        });
});

// POST: Update the participant in the database
app.post("/editParticipant/:id", requireRole(["M"]), (req, res) => {
    const participantid = req.params.id;
    
    // Collect updated data
    const { 
        participantfirstname, participantlastname, participantemail, 
        participantphone, participantdob, participantrole, 
        participantcity, participantstate, participantzip, 
        participantschooloremployer, participantfieldofinterest 
    } = req.body;

    knex("participants")
        .where({ participantid: participantid })
        .update({
            participantfirstname,
            participantlastname,
            participantemail,
            participantphone,
            participantdob,
            participantrole,
            participantcity,
            participantstate,
            participantzip,
            participantschooloremployer,
            participantfieldofinterest
        })
        .then(() => {
            res.redirect("/participants");
        })
        .catch((err) => {
            console.error("Error updating participant:", err.message);
            // Re-render form with error message if it fails
            res.status(500).send("Error updating participant");
        });
});

// Handle form submission for deleting a participant
app.post("/deleteParticipant/:id", (req, res) => {
    
    knex("participants").where("participantid", req.params.id).del().then(participants => {
        res.redirect("/participants");
    }).catch(err => {
        console.log(err);
        res.status(500).json({err});
    })
});

// =========================
// MILESTONES
// =========================
app.get("/milestones", requireRole(["M"]), async (req, res) => {
    try {
        const milestones = await knex("milestones")
            .select("milestonetitle")
            .count("* as milestonecount")
            .countDistinct("participantid as participantcount")
            .groupBy("milestonetitle")
            .orderBy("milestonetitle", "asc");

        res.render("milestones/milestones", {
            milestones,
            user: req.session.user
        });
    } catch (err) {
        console.error("Error fetching milestones:", err);
        res.status(500).send("Error loading milestones");
    }
});

// Milestone detail: list participants who earned it
app.get("/milestones/:title", requireRole(["M"]), async (req, res) => {
    const title = req.params.title;
    try {
        const milestoneRows = await knex("milestones as m")
            .leftJoin("participants as p", "m.participantid", "p.participantid")
            .select(
                "m.milestoneid",
                "m.milestonetitle",
                "m.milestonedate",
                "p.participantid",
                "p.participantfirstname",
                "p.participantlastname",
                "p.participantemail"
            )
            .where("m.milestonetitle", title)
            .orderBy("m.milestonedate", "desc");

        res.render("milestones/milestoneDetail", {
            title,
            milestones: milestoneRows,
            participantCount: new Set(milestoneRows.map(m => m.participantid)).size,
            user: req.session.user
        });
    } catch (err) {
        console.error("Error fetching milestone detail:", err);
        res.status(500).send("Error loading milestone detail");
    }
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

        res.render("events/events", { 
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

    res.render("events/addEvent", {
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

        res.render("events/editEvent", {
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

        res.render("donations/donations", {     
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
// Edit Donation (Show Form)
// =========================
app.get("/editDonation/:donationid", async (req, res) => {
    const donationid = req.params.donationid;

    try {
        const donation = await knex("donations")
            .where("donationid", donationid)
            .first();

        if (!donation) {
            return res.send("Donation not found");
        }

        res.render("donations/editDonation", {
            donation,
            user: req.session.user || null
        });

    } catch (err) {
        console.error(err);
        res.send("Error loading donation");
    }
});

// =========================
// Edit Donation (Submit Form)
// =========================
app.post("/editDonation/:donationid", async (req, res) => {
    const donationid = req.params.donationid;
    const { donationdate, donationamount } = req.body;

    try {
        await knex("donations")
            .where("donationid", donationid)
            .update({
                donationdate,
                donationamount
            });

        res.redirect("/donations");

    } catch (err) {
        console.error(err);
        res.send("Error updating donation");
    }
});

// =========================
// Add Donation (Form View)
// =========================
app.get("/addDonation", async (req, res) => {
    try {
        res.render("donations/addDonation", {
            user: req.session.user || null
        });
    } catch (err) {
        console.error(err);
        res.send("Error loading Add Donation page");
    }
});


app.post("/addDonation", async (req, res) => {
    const { firstname, lastname, donationdate, donationamount } = req.body;

    try {
        // Insert participant and return ID
        const [newParticipant] = await knex("participants")
            .insert({
                participantfirstname: firstname,
                participantlastname: lastname
            })
            .returning(["participantid"]);

        // Extract ID
        const participantid = newParticipant.participantid;

        // Insert donation
        await knex("donations").insert({
            participantid,
            donationdate,
            donationamount
        });

        res.redirect("/donations");

    } catch (err) {
        console.error(err);
        res.send("Error adding donation");
    }
});



// =========================
// START SERVER
// =========================
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
