const express = require("express");
const bcrypt = require("bcrypt");

const db = require("../config/db");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

// Route for viewing all users with Search and Sort
router.get("/users", requireRole(["M"]), (req, res) => {
    // 1. Get Parameters
    const searchTerm = req.query.search || "";
    const sortBy = req.query.sortBy || "username"; // Default: Username
    const sortOrder = req.query.sortOrder || "asc"; // Default: A-Z

    // 2. Start Base Query
    let query = db("users").select("username", "password", "level", "id");

    // 3. Apply Search Filter
    if (searchTerm) {
        query = query.where((builder) => {
            builder.where("username", "ilike", `%${searchTerm}%`)
                   // Also search by 'level' (e.g. search "Manager" finds 'M')
                   .orWhere("level", "ilike", `%${searchTerm === 'Manager' ? 'M' : (searchTerm === 'User' ? 'U' : searchTerm)}%`);
        });
    }

    // 4. Apply Sorting
    const sortMap = {
        "username": "username",
        "level": "level"
    };
    const dbColumn = sortMap[sortBy] || "username";
    
    query = query.orderBy(dbColumn, sortOrder);

    // 5. Execute
    query.then((users) => {
            console.log(`Successfully retrieved ${users.length} users`);
            res.render("users/displayUsers", {
                users: users,
                userLevel: req.session.user.level,
                user: req.session.user,
                // Pass params back to view
                searchTerm: searchTerm,
                sortBy: sortBy,
                sortOrder: sortOrder
            });
        })
        .catch((err) => {
            console.error("Database query error:", err.message);
            res.render("users/displayUsers", {
                users: [],
                userLevel: req.session.user ? req.session.user.level : null,
                user: req.session.user,
                error_message: `Database error: ${err.message}`,
                searchTerm: searchTerm,
                sortBy: sortBy,
                sortOrder: sortOrder
            });
        });
});

// Routes for adding a user
router.get("/addUser", requireRole(["M"]), (req, res) => {
    res.render("users/addUser");
});

router.post("/addUser", requireRole(["M"]), async (req, res) => {
    const { username, password, confirmPassword, level } = req.body;

    if (!username || !password) {
        req.flash("error", "Username and password are required.");
        return res.redirect("/addUser");
    }
    if (password !== confirmPassword) {
        req.flash("error", "Passwords do not match.");
        return res.redirect("/addUser");
    }

    try {
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const newUser = {
            username,
            password: hashedPassword,
            level,
        };

        await db("users").insert(newUser);
        req.flash("success", "User created.");
        res.redirect("/users");
    } catch (dbErr) {
        console.error("Error inserting user:", dbErr.message);
        req.flash("error", "Unable to save user. Please try again.");
        res.redirect("/addUser");
    }
});

// Handle form submission for deleting a user
router.post("/deleteUser/:id", requireRole(["M"]), (req, res) => {
    db("users")
        .where("id", req.params.id)
        .del()
        .then(() => {
            req.flash("error", "User deleted.");
            res.redirect("/users");
        })
        .catch((err) => {
            console.log(err);
            req.flash("error", "Unable to delete user.");
            res.status(500).json({ err });
        });
});

// Routes for editing a user
router.get("/editUser/:id", requireRole(["M"]), (req, res) => {
    const id = req.params.id;

    db("users")
        .where({ id: id })
        .first()
        .then((user) => {
            if (!user) {
                return res.status(404).render("users/displayUsers", {
                    users: [],
                    userLevel: req.session.user.level,
                    error_message: "User not found.",
                });
            }

            res.render("users/editUser", { user, error_message: "" });
        })
        .catch((err) => {
            console.error("Database query error:", err.message);
            res.status(500).render("users/displayUsers", {
                users: [],
                userLevel: req.session.user.level,
                error_message: `Database error: ${err.message}.`,
            });
        });
});

// Handle form submission for editing a user
router.post("/editUser/:id", requireRole(["M"]), async (req, res) => {
    const id = req.params.id;
    const { username, password, confirmPassword, level } = req.body;

    if (!username) {
        try {
            const user = await db("users").where({ id: id }).first();
            if (!user) {
                return res.status(404).render("users/displayUsers", {
                    users: [],
                    userLevel: req.session.user.level,
                    error_message: "User not found.",
                });
            }
            return res.status(400).render("users/editUser", {
                user,
                error_message: "Username is required.",
            });
        } catch (err) {
            console.error("Error fetching user:", err.message);
            return res.status(500).render("users/displayUsers", {
                users: [],
                userLevel: req.session.user.level,
                error_message: "Unable to load user for editing.",
            });
        }
    }

    const updatedUser = {
        username,
        level,
    };

    if (password && password.trim() !== "") {
        if (password !== confirmPassword) {
            req.flash("error", "Passwords do not match.");
            return res.redirect(`/editUser/${id}`);
        }
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        updatedUser.password = hashedPassword;
    }

    try {
        const rowsUpdated = await db("users").where({ id: id }).update(updatedUser);

        if (rowsUpdated === 0) {
            req.flash("error", "User not found.");
            return res.redirect("/users");
        }
        req.flash("success", "User updated.");
        res.redirect("/users");
    } catch (err) {
        console.error("Error updating user:", err.message);
        try {
            const user = await db("users").where({ id: id }).first();
            if (!user) {
                req.flash("error", "User not found.");
                return res.redirect("/users");
            }
            req.flash("error", "Unable to update user. Please try again.");
            res.redirect(`/editUser/${id}`);
        } catch (fetchErr) {
            console.error("Error fetching user after failure:", fetchErr.message);
            req.flash("error", "Unable to update user.");
            res.redirect("/users");
        }
    }
});

module.exports = router;
