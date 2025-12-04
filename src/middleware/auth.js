// Require a user to be authenticated with any account
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

module.exports = { requireAuth, requireRole };
