/**
 * Booking Widget — Google Apps Script backend
 * Matches the API contract expected by booking-widget.js:
 *
 *   GET  ?action=config                  -> { businessName, services[], hours{}, maxAdvanceDays, minNoticeHours }
 *   GET  ?action=slots&date=YYYY-MM-DD&service=ID -> { slots: ["17:00", "18:00", ...] }
 *   POST { service, date, time, name, email, phone, note, lang }  -> { ok:true } | { ok:false, error }
 *
 * SETUP
 * 1. In this Apps Script project: Project Settings → set Time zone to
 *    "Europe/Berlin" (or wherever the calendar/event should actually live).
 * 2. Adjust the CONFIG block below.
 * 3. Deploy → New deployment → type "Web app".
 *      Execute as: Me
 *      Who has access: Anyone
 * 4. Copy the resulting /exec URL into ask-her-out.html as `endpoint`.
 * 5. Every time you *change the code* you need a new deployment (or use
 *    "Manage deployments" → edit → new version) for the /exec URL to
 *    pick up the changes.
 */

/* ───────────────────────── CONFIG — edit this ───────────────────────── */

var CONFIG = {
  // Shown to the widget; not shown anywhere since this flow uses forceService
  // client-side, but kept as a sane fallback if you ever reuse this backend
  // for a widget instance that shows the normal service picker.
  businessName: 'Max & you',
  services: [
    { id: 'date', name: 'Dinner date', duration: 120 }
  ],

  // Which calendar to read/write. '' = your default (primary) calendar.
  // To use a specific calendar instead, paste its Calendar ID here
  // (Google Calendar → calendar settings → "Integrate calendar" → Calendar ID).
  calendarId: '',

  // Opening hours per weekday. 0 = Sunday ... 6 = Saturday, matching JS Date#getDay().
  // Empty array = closed that day. Ranges are "HH:MM-HH:MM", 24h format.
  hours: {
    0: ['17:00-22:00'], // Sun
    1: ['17:00-22:00'], // Mon
    2: ['17:00-22:00'], // Tue
    3: ['17:00-22:00'], // Wed
    4: ['17:00-22:00'], // Thu
    5: ['17:00-22:00'], // Fri
    6: ['17:00-22:00']  // Sat
  },

  // How far apart candidate start times are, in minutes.
  slotIntervalMinutes: 60,

  // Fallback event duration (minutes) if the requested service id isn't
  // found in `services` above — this is what actually gets used for the
  // "Dinner date" forced-service flow from the front end.
  defaultDurationMinutes: 120,

  // Don't allow booking a slot less than this many hours from now.
  minNoticeHours: 3,

  // Don't allow booking further out than this many days.
  maxAdvanceDays: 60,

  // Calendar event title. {service} is replaced with the service name.
  eventTitleTemplate: '{service} — booked via website',

  // Your own email, to get notified whenever someone books. Leave '' to skip.
  notifyEmail: Session.getEffectiveUser().getEmail()
};

/* ───────────────────────── HTTP entry points ───────────────────────── */

function doGet(e) {
  try {
    var action = e.parameter.action;
    if (action === 'config') return jsonOut(getConfig());
    if (action === 'slots') return jsonOut(getSlots(e.parameter.date, e.parameter.service));
    return jsonOut({ error: 'unknown_action' });
  } catch (err) {
    return jsonOut({ error: 'server_error', message: String(err) });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var check = validateBooking(body);
    if (!check.ok) return jsonOut({ ok: false, error: check.error });
    return jsonOut(createBooking(body));
  } catch (err) {
    return jsonOut({ ok: false, error: 'server_error', message: String(err) });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ───────────────────────── config ───────────────────────── */

function getConfig() {
  return {
    businessName: CONFIG.businessName,
    services: CONFIG.services,
    hours: CONFIG.hours,
    maxAdvanceDays: CONFIG.maxAdvanceDays,
    minNoticeHours: CONFIG.minNoticeHours
  };
}

/* ───────────────────────── slots ───────────────────────── */

function getSlots(dateStr, serviceId) {
  if (!dateStr) return { slots: [] };

  var dateParts = dateStr.split('-').map(Number); // [YYYY, MM, DD]
  var weekday = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]).getDay();
  var ranges = CONFIG.hours[weekday] || [];
  if (!ranges.length) return { slots: [] };

  var duration = getDurationForService(serviceId);
  var candidates = buildCandidateTimes(ranges, duration);
  if (!candidates.length) return { slots: [] };

  var dayStart = new Date(dateParts[0], dateParts[1] - 1, dateParts[2], 0, 0, 0);
  var dayEnd = new Date(dateParts[0], dateParts[1] - 1, dateParts[2], 23, 59, 59);
  var busy = getBusyIntervals(dayStart, dayEnd);

  var earliestAllowed = new Date(Date.now() + CONFIG.minNoticeHours * 3600 * 1000);

  var free = candidates.filter(function (c) {
    var start = partsToDate(dateStr, c.time);
    var end = new Date(start.getTime() + duration * 60000);
    if (start < earliestAllowed) return false;
    return !overlapsAny(start, end, busy);
  });

  return { slots: free.map(function (c) { return c.time; }) };
}

function getDurationForService(serviceId) {
  var match = CONFIG.services.filter(function (s) { return s.id === serviceId; })[0];
  return match ? match.duration : CONFIG.defaultDurationMinutes;
}

// Turns ["17:00-22:00"] + a duration into a flat list of candidate start times
// spaced by slotIntervalMinutes, that still fit before the range's end.
function buildCandidateTimes(ranges, durationMinutes) {
  var out = [];
  ranges.forEach(function (range) {
    var bounds = range.split('-');
    var startMin = hhmmToMinutes(bounds[0]);
    var endMin = hhmmToMinutes(bounds[1]);
    for (var t = startMin; t + durationMinutes <= endMin; t += CONFIG.slotIntervalMinutes) {
      out.push({ time: minutesToHHMM(t) });
    }
  });
  return out;
}

function hhmmToMinutes(hhmm) {
  var p = hhmm.split(':').map(Number);
  return p[0] * 60 + p[1];
}

function minutesToHHMM(mins) {
  var h = Math.floor(mins / 60);
  var m = mins % 60;
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
}

function partsToDate(dateStr, timeStr) {
  var d = dateStr.split('-').map(Number);
  var t = timeStr.split(':').map(Number);
  return new Date(d[0], d[1] - 1, d[2], t[0], t[1], 0, 0);
}

function getCalendar() {
  return CONFIG.calendarId
    ? CalendarApp.getCalendarById(CONFIG.calendarId)
    : CalendarApp.getDefaultCalendar();
}

function getBusyIntervals(rangeStart, rangeEnd) {
  var events = getCalendar().getEvents(rangeStart, rangeEnd);
  return events.map(function (ev) {
    return { start: ev.getStartTime(), end: ev.getEndTime() };
  });
}

function overlapsAny(start, end, busyIntervals) {
  return busyIntervals.some(function (b) {
    return start < b.end && end > b.start;
  });
}

/* ───────────────────────── booking ───────────────────────── */

function validateBooking(body) {
  if (!body || !body.date || !body.time || !body.service) {
    return { ok: false, error: 'bad_request' };
  }
  var name = (body.name || '').trim();
  var email = (body.email || '').trim();
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'bad_request' };
  }

  var dateParts = body.date.split('-').map(Number);
  var requested = partsToDate(body.date, body.time);
  var now = new Date();

  if (requested < new Date(now.getTime() + CONFIG.minNoticeHours * 3600 * 1000)) {
    return { ok: false, error: 'too_soon' };
  }
  var maxDate = new Date(now.getTime() + CONFIG.maxAdvanceDays * 86400 * 1000);
  if (requested > maxDate) {
    return { ok: false, error: 'too_far' };
  }

  // is this slot actually still open, per current calendar state?
  var stillFree = getSlots(body.date, body.service).slots.indexOf(body.time) !== -1;
  if (!stillFree) return { ok: false, error: 'slot_taken' };

  return { ok: true };
}

function createBooking(body) {
  // Serialize concurrent bookings so two people can't grab the same slot
  // in the same instant.
  var lock = LockService.getScriptLock();
  var gotLock = lock.tryLock(10000);
  if (!gotLock) return { ok: false, error: 'server_busy' };

  try {
    // re-check freshness once more now that we hold the lock
    var stillFree = getSlots(body.date, body.service).slots.indexOf(body.time) !== -1;
    if (!stillFree) return { ok: false, error: 'slot_taken' };

    var duration = getDurationForService(body.service);
    var start = partsToDate(body.date, body.time);
    var end = new Date(start.getTime() + duration * 60000);

    var serviceMeta = CONFIG.services.filter(function (s) { return s.id === body.service; })[0];
    var serviceName = serviceMeta ? serviceMeta.name : 'Dinner date';
    var title = CONFIG.eventTitleTemplate.replace('{service}', serviceName) + ' — ' + body.name;

    var descriptionLines = [
      'Booked via website.',
      'Name: ' + body.name,
      'Email: ' + body.email
    ];
    if (body.phone) descriptionLines.push('Phone: ' + body.phone);
    if (body.note) descriptionLines.push('Note: ' + body.note);

    getCalendar().createEvent(title, start, end, {
      description: descriptionLines.join('\n'),
      guests: body.email,
      sendInvite: true // Google Calendar emails the guest a confirmation + .ics automatically
    });

    if (CONFIG.notifyEmail) {
      MailApp.sendEmail({
        to: CONFIG.notifyEmail,
        subject: 'New booking: ' + serviceName + ' with ' + body.name,
        body: descriptionLines.join('\n') + '\nWhen: ' + start.toString()
      });
    }

    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}
