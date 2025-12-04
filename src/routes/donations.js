const express = require("express");

const db = require("../config/db");

const router = express.Router();

// Display Donations
router.get("/donations", async (req, res) => {
    try {
        const donations = await db("donations as d")
            .leftJoin("participants as p", "d.participantid", "p.participantid")
            .select(
                "d.donationid",
                "p.participantfirstname",
                "p.participantlastname",
                "d.donationdate",
                "d.donationamount"
            )
            .orderByRaw("d.donationdate IS NULL ASC, d.donationdate DESC");

        res.render("donations/donations", {
            donations,
            user: req.session.user || null,
        });
    } catch (err) {
        console.error(err);
        res.send("Error loading page");
    }
});

// Delete Donations
router.get("/deleteDonation/:donationid", async (req, res) => {
    const donationid = req.params.donationid;

    try {
        await db("donations").where("donationid", donationid).del();
        req.flash("success", "Donation deleted.");
        res.redirect("/donations");
    } catch (err) {
        console.error(err);
        req.flash("error", "Error deleting donation.");
        res.send("Error deleting donation");
    }
});

// Edit Donation (Show Form)
router.get("/editDonation/:donationid", async (req, res) => {
    const donationid = req.params.donationid;

    try {
        const donation = await db("donations").where("donationid", donationid).first();

        if (!donation) {
            return res.send("Donation not found");
        }

        res.render("donations/editDonation", {
            donation,
            user: req.session.user || null,
        });
    } catch (err) {
        console.error(err);
        res.send("Error loading donation");
    }
});

// Edit Donation (Submit Form)
router.post("/editDonation/:donationid", async (req, res) => {
    const donationid = req.params.donationid;
    const { donationdate, donationamount } = req.body;

    try {
        await db("donations")
            .where("donationid", donationid)
            .update({
                donationdate,
                donationamount,
            });

        req.flash("success", "Donation updated.");
        res.redirect("/donations");
    } catch (err) {
        console.error(err);
        req.flash("error", "Error updating donation.");
        res.redirect(`/editDonation/${donationid}`);
    }
});

// Add Donation (Form View)
router.get("/addDonation", async (req, res) => {
    try {
        res.render("donations/addDonation", {
            user: req.session.user || null,
        });
    } catch (err) {
        console.error(err);
        res.send("Error loading Add Donation page");
    }
});

// Add Donation (Submit)
router.post("/addDonation", async (req, res) => {
    const { firstname, lastname, donationdate, donationamount } = req.body;

    try {
        const [newParticipant] = await db("participants")
            .insert({
                participantfirstname: firstname,
                participantlastname: lastname,
            })
            .returning(["participantid"]);

        const participantid = newParticipant.participantid;

        await db("donations").insert({
            participantid,
            donationdate,
            donationamount,
        });

        req.flash("success", "Donation added.");
        res.redirect("/donations");
    } catch (err) {
        console.error(err);
        req.flash("error", "Error adding donation.");
        res.redirect("/addDonation");
    }
});

module.exports = router;
