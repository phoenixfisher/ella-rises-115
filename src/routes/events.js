const express = require("express");

const db = require("../config/db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// View events
router.get("/events", async (req, res) => {
    try {
        const eventList = await db("events")
            .join("eventoccurrences", "events.eventid", "=", "eventoccurrences.eventid")
            .select(
                "events.eventid",
                "events.eventname",
                "events.eventtype",
                "events.eventdescription",
                "events.eventrecurrencepattern",
                "eventoccurrences.eventdatetimestart",
                "eventoccurrences.eventdatetimeend",
                "eventoccurrences.eventlocation"
            )
            .orderBy("eventoccurrences.eventdatetimestart", "asc");

        res.render("events/events", {
            events: eventList,
            user: req.session.user,
        });
    } catch (err) {
        console.error("Error fetching events:", err);
        res.status(500).send("Error loading events");
    }
});

// Add event form
router.get("/addEvent", requireAuth, (req, res) => {
    res.render("events/addEvent", {
        user: req.session.user,
    });
});

// Edit event form
router.get("/editEvent/:id", requireAuth, async (req, res) => {
    const targetId = req.params.id;

    try {
        const eventToEdit = await db("events")
            .join("eventoccurrences", "events.eventid", "=", "eventoccurrences.eventid")
            .where("events.eventid", targetId)
            .select(
                "events.eventid",
                "events.eventname",
                "events.eventtype",
                "events.eventdescription",
                "events.eventrecurrencepattern",
                "events.eventdefaultcapacity",
                "eventoccurrences.eventdatetimestart",
                "eventoccurrences.eventdatetimeend",
                "eventoccurrences.eventlocation",
                "eventoccurrences.eventregistrationdeadline",
                "eventoccurrences.eventcapacity"
            )
            .first();

        if (!eventToEdit) {
            return res.status(404).send("Event not found");
        }

        res.render("events/editEvent", {
            event: eventToEdit,
            user: req.session.user,
        });
    } catch (err) {
        console.error("Error fetching event for edit:", err);
        res.status(500).send("Error loading edit page");
    }
});

// Add event submit
router.post("/addEvent", requireAuth, async (req, res) => {
    const { name, type, description, recurrence, capacity, startTime, endTime, location, deadline } =
        req.body;

    try {
        await db.transaction(async (trx) => {
            const [newEvent] = await trx("events")
                .insert({
                    eventname: name,
                    eventtype: type,
                    eventdescription: description,
                    eventrecurrencepattern: recurrence || "None",
                    eventdefaultcapacity: parseInt(capacity, 10),
                })
                .returning("eventid");

            await trx("eventoccurrences").insert({
                eventid: newEvent.eventid,
                eventdatetimestart: startTime,
                eventdatetimeend: endTime,
                eventlocation: location,
                eventcapacity: parseInt(capacity, 10),
                eventregistrationdeadline: deadline,
            });
        });

        res.redirect("/events");
    } catch (err) {
        console.error("Error adding event:", err);
        res.status(500).send("Failed to add event");
    }
});

// Edit event submit
router.post("/editEvent/:id", requireAuth, async (req, res) => {
    const targetEventId = req.params.id;
    const { name, type, description, recurrence, capacity, startTime, endTime, location, deadline } =
        req.body;

    try {
        await db.transaction(async (trx) => {
            await trx("events")
                .where({ eventid: targetEventId })
                .update({
                    eventname: name,
                    eventtype: type,
                    eventdescription: description,
                    eventrecurrencepattern: recurrence,
                    eventdefaultcapacity: parseInt(capacity, 10),
                });

            await trx("eventoccurrences")
                .where({ eventid: targetEventId })
                .update({
                    eventdatetimestart: startTime,
                    eventdatetimeend: endTime,
                    eventlocation: location,
                    eventcapacity: parseInt(capacity, 10),
                    eventregistrationdeadline: deadline,
                });
        });

        res.redirect("/events");
    } catch (err) {
        console.error("Error editing event:", err);
        res.status(500).send("Failed to update event");
    }
});

// Delete event
router.post("/deleteEvent/:id", requireAuth, async (req, res) => {
    const targetEventId = req.params.id;

    try {
        await db.transaction(async (trx) => {
            await trx("eventoccurrences").where({ eventid: targetEventId }).del();
            await trx("events").where({ eventid: targetEventId }).del();
        });

        res.redirect("/events");
    } catch (err) {
        console.error("Error deleting event:", err);
        res.status(500).send("Failed to delete event");
    }
});

module.exports = router;
