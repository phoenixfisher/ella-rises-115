require("dotenv").config();

const express = require("express");
const bodyParser = require("body-parser");
const expressLayouts = require("express-ejs-layouts");
const helmet = require("helmet");
const flash = require("connect-flash");
const path = require("path");

const { sessionMiddleware } = require("./config/session");
const { requireAuth } = require("./middleware/auth");

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const participantRoutes = require("./routes/participants");
const milestoneRoutes = require("./routes/milestones");
const eventRoutes = require("./routes/events");
const donationRoutes = require("./routes/donations");
const pageRoutes = require("./routes/pages");
const surveyRoutes = require("./routes/surveys");

// Initialize express object as the app
const app = express();

// View engine + static
app.set("view engine", "ejs");
app.use(expressLayouts);
app.set("layout", "layout");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));

// Security + parsing
app.use(helmet({ contentSecurityPolicy: false }));
app.use(bodyParser.urlencoded({ extended: true }));

// Sessions
app.use(sessionMiddleware);
app.use(flash());

// Template locals
app.use((req, res, next) => {
    res.locals.user = req.session?.user || null;
    res.locals.title = "Ella Rises";
    res.locals.messages = req.flash();
    next();
});

// Routes
app.use(authRoutes);
app.use(userRoutes);
app.use(participantRoutes);
app.use(milestoneRoutes);
app.use(eventRoutes);
app.use(donationRoutes);
app.use(pageRoutes);
app.use(surveyRoutes);

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
