const express = require("express");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// Landing pages handled in auth routes (/, /landing)

// Dashboard example
router.get("/dashboard", requireAuth, (req, res) => {
    res.render("index", {
        username: req.session.user.username,
        level: req.session.user.level,
    });
});

module.exports = router;
