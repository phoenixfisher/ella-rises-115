const express = require("express");
const db = require("../config/db");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

// ==============================================
// 1. READ: View All Surveys (With Filters)
// ==============================================
router.get("/surveys", requireRole(["M"]), async (req, res) => {
    try {
        // 1. Get filter parameters from URL
        const { date, event, score, nps, search } = req.query;
        const searchTerm = (search || "").trim();

        // 2. Start building the main query
        let query = db("surveys")
            .join("participants", "surveys.participantid", "participants.participantid")
            .join("eventoccurrences", "surveys.eventoccurrenceid", "eventoccurrences.eventoccurrenceid")
            .join("events", "eventoccurrences.eventid", "events.eventid")
            .select(
                "surveys.surveyid",
                "surveys.surveyoverallscore",
                "surveys.surveynpsbucket",
                "participants.participantfirstname",
                "participants.participantlastname",
                "events.eventname",
                "events.eventid",
                "eventoccurrences.eventdatetimestart"
            );

        // 3. Apply Filters if they exist
        if (date) {
            // Compare just the YYYY-MM-DD part
            query.whereRaw("DATE(eventoccurrences.eventdatetimestart) = ?", [date]);
        }
        if (event) {
            query.where("events.eventid", event);
        }
        if (score) {
            // Filter for scores greater than or equal to the selection
            query.where("surveys.surveyoverallscore", ">=", score);
        }
        if (nps) {
            query.where("surveys.surveynpsbucket", nps);
        }
        if (searchTerm) {
            const term = `%${searchTerm.toLowerCase()}%`;
            query.where(function() {
                this.whereRaw("LOWER(events.eventname) LIKE ?", [term])
                    .orWhereRaw("LOWER(participants.participantfirstname) LIKE ?", [term])
                    .orWhereRaw("LOWER(participants.participantlastname) LIKE ?", [term])
                    .orWhereRaw("LOWER(surveys.surveycomments) LIKE ?", [term])
                    .orWhereRaw("LOWER(surveys.surveynpsbucket) LIKE ?", [term]);
            });
        }

        // Execute Survey Query
        const surveys = await query.orderBy("surveys.surveyid", "desc");

        // 4. Fetch Events List for the Filter Dropdown
        const eventsList = await db("events").select("eventid", "eventname").orderBy("eventname");

        res.render("surveys/surveys", {
            surveys,
            eventsList, // Pass list for dropdown
            filters: { ...req.query, search: searchTerm }, // Pass current filters back to view (to keep inputs filled)
            user: req.session.user,
            userLevel: req.session.user.level
        });
    } catch (err) {
        console.error("Error fetching surveys:", err);
        res.status(500).send("Error loading surveys");
    }
});

// ==============================================
// 2. CREATE: Add Survey
// ==============================================

// Display the Add Survey Form (Public Access)
router.get("/addSurvey", async (req, res) => {
    try {
        // Fetch dropdown data
        const participants = await db("participants")
            .select("participantid", "participantfirstname", "participantlastname")
            .orderBy("participantlastname");
            
        const events = await db("eventoccurrences")
            .join("events", "eventoccurrences.eventid", "events.eventid")
            .select("eventoccurrences.eventoccurrenceid", "events.eventname", "eventoccurrences.eventdatetimestart")
            .orderBy("eventoccurrences.eventdatetimestart", "desc");

        // Safely determine user level (visitor = null)
        const user = req.session.user || null;
        const userLevel = user ? user.level : null;

        res.render("surveys/addSurvey", {
            participants,
            events,
            user: user,
            userLevel: userLevel,
            error_message: null
        });
    } catch (err) {
        console.error("Error loading add survey page:", err);
        res.status(500).send("Error loading page");
    }
});

// Handle the Add Survey POST (Public Access)
router.post("/addSurvey", async (req, res) => {
    const { 
        participantid, 
        eventoccurrenceid, 
        surveysatisfactionscore, 
        surveyusefulnessscore, 
        surveyinstructorscore, 
        surveyrecommendationscore,
        surveycomments 
    } = req.body;

    // Safely determine user level
    const user = req.session.user || null;
    const userLevel = user ? user.level : null;

    try {
        // Calculate Overall Score
        const scores = [
            parseInt(surveysatisfactionscore), 
            parseInt(surveyusefulnessscore), 
            parseInt(surveyinstructorscore), 
            parseInt(surveyrecommendationscore)
        ];
        const overallScore = scores.reduce((a, b) => a + b, 0) / scores.length;

        // Determine NPS Bucket
        let npsBucket = "Detractor";
        const recScore = parseInt(surveyrecommendationscore);
        if (recScore === 5) npsBucket = "Promoter";
        else if (recScore === 4) npsBucket = "Passive";

        await db("surveys").insert({
            participantid,
            eventoccurrenceid,
            surveysatisfactionscore,
            surveyusefulnessscore,
            surveyinstructorscore,
            surveyrecommendationscore,
            surveyoverallscore: overallScore,
            surveynpsbucket: npsBucket,
            surveycomments
        });

        // Redirect with success flash
        if (userLevel === 'M') {
            req.flash("success", "Survey created.");
            res.redirect("/addSurvey");
        } else {
            req.flash("success", "Thank you for your feedback!");
            res.redirect("/addSurvey");
        }

    } catch (err) {
        console.error("Error adding survey:", err);
        
        // Re-fetch data for the error view
        const participants = await db("participants").select("*");
        const events = await db("eventoccurrences")
            .join("events", "eventoccurrences.eventid", "events.eventid")
            .select("eventoccurrences.eventoccurrenceid", "events.eventname", "eventoccurrences.eventdatetimestart");

        res.status(500).render("surveys/addSurvey", {
            participants,
            events,
            user: user,
            userLevel: userLevel,
            error_message: "Failed to create survey. Please try again."
        });
    }
});

// ==============================================
// 3. UPDATE: Edit Survey
// ==============================================

// Display the Edit Survey Form
router.get("/editSurvey/:id", requireRole(["M"]), async (req, res) => {
    const surveyId = req.params.id;

    try {
        const survey = await db("surveys").where("surveyid", surveyId).first();

        if (!survey) {
            return res.status(404).send("Survey not found");
        }

        // We also need the lists again in case they want to change the participant/event
        const participants = await db("participants")
            .select("participantid", "participantfirstname", "participantlastname")
            .orderBy("participantlastname");
            
        const events = await db("eventoccurrences")
            .join("events", "eventoccurrences.eventid", "events.eventid")
            .select("eventoccurrences.eventoccurrenceid", "events.eventname", "eventoccurrences.eventdatetimestart")
            .orderBy("eventoccurrences.eventdatetimestart", "desc");

        res.render("surveys/editSurvey", {
            survey,
            participants,
            events,
            user: req.session.user,
            userLevel: req.session.user.level,
            error_message: null
        });
    } catch (err) {
        console.error("Error fetching survey for edit:", err);
        res.status(500).send("Error loading survey edit page");
    }
});

// Handle the Edit Survey POST
router.post("/editSurvey/:id", requireRole(["M"]), async (req, res) => {
    const surveyId = req.params.id;
    const { 
        participantid, 
        eventoccurrenceid, 
        surveysatisfactionscore, 
        surveyusefulnessscore, 
        surveyinstructorscore, 
        surveyrecommendationscore,
        surveycomments 
    } = req.body;

    try {
        // RE-CALCULATION LOGIC:
        const scores = [
            parseInt(surveysatisfactionscore), 
            parseInt(surveyusefulnessscore), 
            parseInt(surveyinstructorscore), 
            parseInt(surveyrecommendationscore)
        ];
        const overallScore = scores.reduce((a, b) => a + b, 0) / scores.length;

        let npsBucket = "Detractor";
        const recScore = parseInt(surveyrecommendationscore);
        if (recScore === 5) npsBucket = "Promoter";
        else if (recScore === 4) npsBucket = "Passive";

        await db("surveys")
            .where("surveyid", surveyId)
            .update({
                participantid,
                eventoccurrenceid,
                surveysatisfactionscore,
                surveyusefulnessscore,
                surveyinstructorscore,
                surveyrecommendationscore,
                surveyoverallscore: overallScore,
                surveynpsbucket: npsBucket,
                surveycomments
            });

        req.flash("success", "Survey updated.");
        res.redirect("/surveys");
    } catch (err) {
        console.error("Error updating survey:", err);
        req.flash("error", "Failed to update survey.");
        res.redirect(`/editSurvey/${surveyId}`);
    }
});

// ==============================================
// 4. DELETE: Remove Survey
// ==============================================
router.post("/deleteSurvey/:id", requireRole(["M"]), async (req, res) => {
    const surveyId = req.params.id;

    try {
        await db("surveys").where("surveyid", surveyId).del();
        req.flash("error", "Survey deleted.");
        res.redirect("/surveys");
    } catch (err) {
        console.error("Error deleting survey:", err);
        req.flash("error", "Failed to delete survey.");
        res.redirect("/surveys");
    }
});

module.exports = router;
