"use strict";

const express = require("express");
const { register, Gauge, Counter, Histogram } = require("prom-client");

let initialized = false;
let gauges = {};
let counters = {};

function initMetrics() {
  if (initialized) return;
  initialized = true;

  gauges.bypassActive = new Gauge({
    name: "cfb_bypass_active",
    help: "Whether bypass is currently active (1=active, 0=inactive)",
  });
  gauges.blockedIps = new Gauge({
    name: "cfb_blocked_ips",
    help: "Number of currently blocked IPs in the feed",
  });
  gauges.blockedIsps = new Gauge({
    name: "cfb_blocked_isps",
    help: "Number of ISPs currently blocking",
  });
  gauges.feedStale = new Gauge({
    name: "cfb_feed_stale",
    help: "Whether the feed data is stale (1=stale, 0=fresh)",
  });
  gauges.feedAgeHours = new Gauge({
    name: "cfb_feed_age_hours",
    help: "Age of feed data in hours",
  });
  gauges.domainsMonitored = new Gauge({
    name: "cfb_domains_monitored",
    help: "Number of domains being monitored",
  });
  counters.checksTotal = new Counter({
    name: "cfb_checks_total",
    help: "Total number of check cycles performed",
  });
  counters.bypassActivations = new Counter({
    name: "cfb_bypass_activations_total",
    help: "Total number of bypass activations",
  });
  counters.notificationsSent = new Counter({
    name: "cfb_notifications_sent_total",
    help: "Total notifications sent",
    labelNames: ["type"],
  });
}

function metricsRoutes(db, bypass) {
  const router = express.Router();
  initMetrics();

  router.get("/", async (req, res) => {
    const authHeader = req.headers.authorization;
    const apiKey = req.query.token;
    const token = authHeader?.replace("Bearer ", "") || apiKey;

    if (token) {
      const key = db.validateApiKey(token);
      if (!key || (!key.permissions.includes("metrics") && !key.permissions.includes("admin"))) {
        return res.status(401).send("Unauthorized");
      }
    } else if (!req.session?.userId) {
      return res.status(401).send("Unauthorized");
    }

    const status = bypass.getStatus();
    gauges.bypassActive.set(status.bypassActive ? 1 : 0);
    gauges.blockedIps.set(status.stats.blockedIps || 0);
    gauges.blockedIsps.set(status.stats.blockedIsps || 0);
    gauges.feedStale.set(status.stats.feedStale ? 1 : 0);
    gauges.feedAgeHours.set(status.stats.feedAge || 0);
    gauges.domainsMonitored.set(status.domainResults.length);

    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  });

  return router;
}

module.exports = { metricsRoutes };
