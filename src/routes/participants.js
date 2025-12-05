const express = require("express");

const db = require("../config/db");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

// Route for viewing all participants with Search, Sort, AND Pagination
router.get("/participants", requireRole(["M"]), async (req, res) => {
    try {
        // 1. Get Parameters
        const searchTerm = req.query.search || "";
        const sortBy = req.query.sortBy || "lastname";
        const sortOrder = req.query.sortOrder || "asc";
        
        // Pagination Params
        const page = parseInt(req.query.page) || 1;
        const limit = 10; // Number of participants per page
        const offset = (page - 1) * limit;

        // 2. Define Filter Logic (Used for both counting and fetching)
        const modifyQuery = (queryBuilder) => {
            if (searchTerm) {
                queryBuilder.where((builder) => {
                    builder.where("participantfirstname", "ilike", `%${searchTerm}%`)
                           .orWhere("participantlastname", "ilike", `%${searchTerm}%`)
                           .orWhere("participantemail", "ilike", `%${searchTerm}%`)
                           .orWhere("participantphone", "ilike", `%${searchTerm}%`);
                });
            }
        };

        // 3. Get Total Count (Needed to calculate total pages)
        const countResult = await db("participants")
            .where(modifyQuery)
            .count("participantid as count")
            .first();
        
        const totalCount = parseInt(countResult.count);
        const totalPages = Math.ceil(totalCount / limit);

        // 4. Get Actual Data
        const sortMap = {
            "lastname": "participantlastname",
            "firstname": "participantfirstname",
            "email": "participantemail"
        };
        const dbColumn = sortMap[sortBy] || "participantlastname";

        const participants = await db.select(
                "participantid",
                "participantemail",
                db.raw("participantfirstname || ' ' || participantlastname as participantfullname"),
                "participantfirstname",
                "participantlastname",
                "participantphone"
            )
            .from("participants")
            .where(modifyQuery)
            .orderBy(dbColumn, sortOrder)
            .limit(limit)
            .offset(offset);

        // 5. Render View
        res.render("participants/participants", {
            participants: participants,
            userLevel: req.session.user.level,
            user: req.session.user,
            
            // Search & Sort params (to keep UI state)
            searchTerm: searchTerm,
            sortBy: sortBy,
            sortOrder: sortOrder,

            // Pagination Variables (Fixes your ReferenceError)
            page: page,
            totalPages: totalPages,
            prevPageTop: page > 1 ? page - 1 : 1, 
            nextPageTop: page < totalPages ? page + 1 : totalPages
        });

    } catch (err) {
        console.error("Database query error:", err.message);
        res.render("participants/participants", {
            participants: [],
            userLevel: req.session.user ? req.session.user.level : null,
            user: req.session.user,
            error_message: `Database error: ${err.message}`,
            
            // Default values to prevent view crashes on error
            searchTerm: "",
            sortBy: "lastname",
            sortOrder: "asc",
            page: 1,
            totalPages: 0,
            prevPageTop: 1,
            nextPageTop: 1
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
