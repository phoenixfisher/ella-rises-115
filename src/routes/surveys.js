const express = require("express");
const db = require("../config/db");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

// ==============================================
// 1. READ: View All Surveys
// ==============================================
router.get("/surveys", requireRole(["M"]), async (req, res) => {
    try {
        // Join with participants and events to show readable names
        const surveys = await db("surveys")
            .join("participants", "surveys.participantid", "participants.participantid")
            .join("eventoccurrences", "surveys.eventoccurrenceid", "eventoccurrences.eventoccurrenceid")
            .join("events", "eventoccurrences.eventid", "events.eventid")
            .select(
                "surveys.surveyid",
                "surveys.surveysatisfactionscore",
                "surveys.surveyusefulnessscore",
                "surveys.surveyinstructorscore",
                "surveys.surveyrecommendationscore",
                "surveys.surveyoverallscore",
                "surveys.surveynpsbucket",
                "surveys.surveycomments",
                "participants.participantfirstname",
                "participants.participantlastname",
                "events.eventname",
                "eventoccurrences.eventdatetimestart"
            )
            .orderBy("surveys.surveyid", "desc");

        res.render("surveys/surveys", {
            surveys,
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
