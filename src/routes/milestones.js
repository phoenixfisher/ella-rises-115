const express = require("express");

const db = require("../config/db");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

// Milestones grouped by title
router.get("/milestones", requireRole(["M"]), async (req, res) => {
    const search = (req.query.search || "").trim();
    try {
        const milestones = await db("milestones")
            .select("milestonetitle")
            .count("* as milestonecount")
            .countDistinct("participantid as participantcount")
            .groupBy("milestonetitle")
            .modify((qb) => {
                if (search) {
                    qb.whereRaw("LOWER(milestonetitle) LIKE ?", [`%${search.toLowerCase()}%`]);
                }
            })
            .orderBy("milestonetitle", "asc");

        res.render("milestones/milestones", {
            milestones,
            user: req.session.user,
            search,
        });
    } catch (err) {
        console.error("Error fetching milestones:", err);
        res.status(500).send("Error loading milestones");
    }
});

// Milestone detail
router.get("/milestones/:title", requireRole(["M"]), async (req, res) => {
    const title = req.params.title;
    try {
        const milestoneRows = await db("milestones as m")
            .leftJoin("participants as p", "m.participantid", "p.participantid")
            .select(
                "m.milestoneid",
                "m.milestonetitle",
                "m.milestonedate",
                "p.participantid",
                "p.participantfirstname",
                "p.participantlastname",
                "p.participantemail"
            )
            .where("m.milestonetitle", title)
            .orderBy("m.milestonedate", "desc");

        res.render("milestones/milestoneDetail", {
            title,
            milestones: milestoneRows,
            participantCount: new Set(milestoneRows.map((m) => m.participantid)).size,
            user: req.session.user,
        });
    } catch (err) {
        console.error("Error fetching milestone detail:", err);
        res.status(500).send("Error loading milestone detail");
    }
});

module.exports = router;
