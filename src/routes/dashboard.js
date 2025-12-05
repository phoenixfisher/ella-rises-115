const express = require("express");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// PUBLIC IMPACT DASHBOARD (No Login Required)
router.get("/dashboard", (req, res) => {
    res.render("dashboard/dashboard", {
        user: req.session.user || null, // Pass user so navbar works correctly
    });
});
///
// Private Dashboard (Keep your existing one)
//router.get("/dashboard", requireAuth, (req, res) => {
//    res.render("index", {
//        username: req.session.user.username,
//        level: req.session.user.level,
//      user: req.session.user
//    });
//});

module.exports = router;