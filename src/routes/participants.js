const express = require("express");

const db = require("../config/db");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

// Route for viewing all participants with search functionality
router.get("/participants", requireRole(["M"]), (req, res) => {
    // 1. Get the search term from the URL query string (defaults to empty string)
    const searchTerm = req.query.search || "";

    // 2. Start the base query
    let query = db.select(
        "participantid",
        "participantemail",
        db.raw("participantfirstname || ' ' || participantlastname as participantfullname"),
        "participantphone"
    ).from("participants");

    // 3. If a search term exists, add the filter logic
    if (searchTerm) {
        query = query.where((builder) => {
            builder.where("participantfirstname", "ilike", `%${searchTerm}%`)
                   .orWhere("participantlastname", "ilike", `%${searchTerm}%`)
                   .orWhere("participantemail", "ilike", `%${searchTerm}%`)
                   .orWhere("participantphone", "ilike", `%${searchTerm}%`);
        });
    }

    // 4. Execute query and render
    query.then((participants) => {
            console.log(`Successfully retrieved ${participants.length} participants`);
            res.render("participants/participants", {
                participants: participants,
                userLevel: req.session.user.level,
                user: req.session.user,
                searchTerm: searchTerm // Pass this back to the view to keep the input filled
            });
        })
        .catch((err) => {
            console.error("Database query error:", err.message);
            res.render("participants/participants", {
                participants: [],
                userLevel: req.session.user ? req.session.user.level : null,
                user: req.session.user,
                error_message: `Database error: ${err.message}`,
                searchTerm: searchTerm
            });
        });
});

// Route to view the full info for a specific participant (read-only)
router.get("/displayParticipant/:id", requireRole(["M"]), (req, res) => {
    const participantid = req.params.id;

    db("participants")
        .select("*")
        .where({ participantid })
        .first()
        .then((participant) => {
            if (!participant) {
                return res.status(404).render("participants/participants", {
                    participants: [],
                    userLevel: req.session.user.level,
                    error_message: "Participant not found.",
                });
            }
            return db("milestones")
                .select("milestonetitle", "milestonedate", "milestoneid")
                .where({ participantid })
                .orderBy("milestonedate", "desc")
                .then((milestones) => {
                    res.render("participants/displayParticipant", {
                        participant,
                        milestones,
                        userLevel: req.session.user.level,
                        user: req.session.user,
                        backLink: "/participants",
                    });
                });
        })
        .catch((err) => {
            console.error("Error fetching participant details:", err.message);
            res.status(500).send("Server Error");
        });
});

// Routes for adding a new participant
router.get("/addParticipant", requireRole(["M"]), (req, res) => {
    res.render("participants/addParticipant", {
        userLevel: req.session.user.level,
        user: req.session.user,
    });
});

router.post("/addParticipant", requireRole(["M"]), (req, res) => {
    const {
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
        participantfieldofinterest,
    } = req.body;

    if (!participantfirstname || !participantlastname || !participantemail) {
        return res.status(400).render("participants/addParticipant", {
            userLevel: req.session.user.level,
            error_message: "First Name, Last Name, and Email are required.",
        });
    }

    db("participants")
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
            participantfieldofinterest,
        })
        .then(() => {
            res.redirect("/participants");
        })
        .catch((err) => {
            console.error("Error adding participant:", err.message);
            res.status(500).render("participants/addParticipant", {
                userLevel: req.session.user.level,
                error_message: "Unable to add participant. Please try again.",
            });
        });
});

// Routes for editing an existing participant
router.get("/editParticipant/:id", requireRole(["M"]), (req, res) => {
    const participantid = req.params.id;

    db("participants")
        .select("*")
        .where({ participantid })
        .first()
        .then((participant) => {
            if (!participant) {
                return res.status(404).send("Participant not found");
            }
            res.render("participants/editParticipant", {
                participant,
                userLevel: req.session.user.level,
                user: req.session.user,
            });
        })
        .catch((err) => {
            console.error("Error loading participant for edit:", err.message);
            res.status(500).send("Server Error");
        });
});

// Update participant
router.post("/editParticipant/:id", requireRole(["M"]), (req, res) => {
    const participantid = req.params.id;
    const {
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
        participantfieldofinterest,
    } = req.body;

    db("participants")
        .where({ participantid })
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
            participantfieldofinterest,
        })
        .then(() => {
            res.redirect("/participants");
        })
        .catch((err) => {
            console.error("Error updating participant:", err.message);
            res.status(500).send("Error updating participant");
        });
});

// Delete participant
router.post("/deleteParticipant/:id", requireRole(["M"]), (req, res) => {
    db("participants")
        .where("participantid", req.params.id)
        .del()
        .then(() => {
            res.redirect("/participants");
        })
        .catch((err) => {
            console.log(err);
            res.status(500).json({ err });
        });
});

module.exports = router;
