const express = require("express");

const db = require("../config/db");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

// Route for viewing all participants with search functionality
router.get("/participants", requireRole(["M"]), async (req, res) => {
    const searchTerm = (req.query.search || "").trim();
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = 50;
    const offset = (page - 1) * pageSize;

    const applySearch = (builder) => {
        if (searchTerm) {
            builder.where((qb) => {
                qb.where("participantfirstname", "ilike", `%${searchTerm}%`)
                  .orWhere("participantlastname", "ilike", `%${searchTerm}%`)
                  .orWhere("participantemail", "ilike", `%${searchTerm}%`)
                  .orWhere("participantphone", "ilike", `%${searchTerm}%`);
            });
        }
    };

    try {
        const baseQuery = db("participants").modify(applySearch);

        const [{ count }] = await baseQuery.clone().count("* as count");

        const participants = await baseQuery
            .clone()
            .select(
                "participantid",
                "participantemail",
                db.raw("participantfirstname || ' ' || participantlastname as participantfullname"),
                "participantphone"
            )
            .orderBy("participantlastname")
            .limit(pageSize)
            .offset(offset);

        const total = parseInt(count, 10) || 0;
        const totalPages = Math.max(Math.ceil(total / pageSize), 1);

        res.render("participants/participants", {
            participants,
            userLevel: req.session.user.level,
            user: req.session.user,
            searchTerm,
            page,
            totalPages,
            total
        });
    } catch (err) {
        console.error("Database query error:", err.message);
        res.render("participants/participants", {
            participants: [],
            userLevel: req.session.user ? req.session.user.level : null,
            user: req.session.user,
            error_message: `Database error: ${err.message}`,
            searchTerm
        });
    }
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
        req.flash("error", "First Name, Last Name, and Email are required.");
        return res.redirect("/addParticipant");
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
            req.flash("success", "Participant added.");
            res.redirect("/participants");
        })
        .catch((err) => {
            console.error("Error adding participant:", err.message);
            req.flash("error", "Unable to add participant. Please try again.");
            res.redirect("/addParticipant");
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
            req.flash("success", "Participant updated.");
            res.redirect("/participants");
        })
        .catch((err) => {
            console.error("Error updating participant:", err.message);
            req.flash("error", "Error updating participant.");
            res.redirect(`/editParticipant/${participantid}`);
        });
});

// Delete participant
router.post("/deleteParticipant/:id", requireRole(["M"]), (req, res) => {
    db("participants")
        .where("participantid", req.params.id)
        .del()
        .then(() => {
            req.flash("error", "Participant deleted.");
            res.redirect("/participants");
        })
        .catch((err) => {
            console.log(err);
            req.flash("error", "Unable to delete participant.");
            res.status(500).json({ err });
        });
});

module.exports = router;
