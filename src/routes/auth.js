const express = require("express");
const bcrypt = require("bcrypt");

const db = require("../config/db");

const router = express.Router();

// Default route → landing page
router.get("/", (req, res) => {
    res.render("landing", { error_message: "" });
});

// Optional login route (same page)
router.get("/login", (req, res) => {
    res.render("auth/login");
});

// Alias for registration route
router.get("/register", (req, res) => {
    res.redirect("/create-account");
});

// Public landing page
router.get("/landing", (req, res) => {
    res.render("landing");
});

// Process login form
router.post("/login", async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await db("users").where({ username }).first();

        if (!user) {
            req.flash("error", "Invalid username or password.");
            return res.redirect("/login");
        }

        let isValidPassword = false;

        // If password is already hashed, use bcrypt. Otherwise, support legacy plain text and re-hash.
        if (user.password && user.password.startsWith("$2")) {
            isValidPassword = await bcrypt.compare(password, user.password);
        } else {
            isValidPassword = user.password === password;
            if (isValidPassword) {
                const newHash = await bcrypt.hash(password, 10);
                await db("users").where({ id: user.id }).update({ password: newHash });
            }
        }

        if (!isValidPassword) {
            req.flash("error", "Invalid username or password.");
            return res.redirect("/login");
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

// Dashboard sample
router.get("/dashboard", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/login");
    }
    res.render("index", {
        username: req.session.user.username,
        level: req.session.user.level,
    });
});

// LOGOUT
router.get("/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/landing");
    });
});

// Route for getting the create account view
router.get("/create-account", (req, res) => {
    res.render("auth/create-account", { layout: false, error_message: "" });
});

// Handles form submission from creating an account
router.post("/create-account", async (req, res) => {
    const { username, password } = req.body;
    const level = "U";

    if (!username || !password) {
        return res.status(400).render("auth/create-account", {
            layout: false,
            error_message: "Username and password are required.",
            user: null,
        });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = {
            username,
            password: hashedPassword,
            level,
        };

        await db("users").insert(newUser);

        res.redirect("/login");
    } catch (dbErr) {
        console.error("Error inserting user:", dbErr.message);
        if (dbErr.code === "23505") {
            req.flash("error", "Username is already taken.");
            return res.redirect("/create-account");
        }
        req.flash("error", "Unable to save user. Please try again.");
        res.redirect("/create-account");
    }
});

module.exports = router;
