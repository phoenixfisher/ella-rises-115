const express = require("express");
const bcrypt = require("bcrypt");

const db = require("../config/db");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

// Route for viewing all users
router.get("/users", requireRole(["M"]), (req, res) => {
    db.select("username", "password", "level", "id")
        .from("users")
        .then((users) => {
            console.log(`Successfully retrieved ${users.length} users from database`);
            res.render("users/displayUsers", {
                users: users,
                userLevel: req.session.user.level,
                user: req.session.user,
            });
        })
        .catch((err) => {
            console.error("Database query error:", err.message);
            res.render("users/displayUsers", {
                users: [],
                error_message: `Database error: ${err.message}`,
            });
        });
});

// Routes for adding a user
router.get("/addUser", requireRole(["M"]), (req, res) => {
    res.render("users/addUser");
});

router.post("/addUser", requireRole(["M"]), async (req, res) => {
    const { username, password, level } = req.body;

    if (!username || !password) {
        return res
            .status(400)
            .render("users/addUser", { error_message: "Username and password are required." });
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
        res.redirect("/users");
    } catch (dbErr) {
        console.error("Error inserting user:", dbErr.message);
        res
            .status(500)
            .render("users/addUser", { error_message: "Unable to save user. Please try again." });
    }
});

// Handle form submission for deleting a user
router.post("/deleteUser/:id", requireRole(["M"]), (req, res) => {
    db("users")
        .where("id", req.params.id)
        .del()
        .then(() => {
            res.redirect("/users");
        })
        .catch((err) => {
            console.log(err);
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
    const { username, password, level } = req.body;

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
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        updatedUser.password = hashedPassword;
    }

    try {
        const rowsUpdated = await db("users").where({ id: id }).update(updatedUser);

        if (rowsUpdated === 0) {
            return res.status(404).render("users/displayUsers", {
                users: [],
                userLevel: req.session.user.level,
                error_message: "User not found.",
            });
        }
        res.redirect("/users");
    } catch (err) {
        console.error("Error updating user:", err.message);
        try {
            const user = await db("users").where({ id: id }).first();
            if (!user) {
                return res.status(404).render("users/displayUsers", {
                    users: [],
                    userLevel: req.session.user.level,
                    error_message: "User not found.",
                });
            }
            res.status(500).render("users/editUser", {
                user,
                error_message: "Unable to update user. Please try again.",
            });
        } catch (fetchErr) {
            console.error("Error fetching user after failure:", fetchErr.message);
            res.status(500).render("users/displayUsers", {
                users: [],
                userLevel: req.session.user.level,
                error_message: "Unable to update user.",
            });
        }
    }
});

module.exports = router;
