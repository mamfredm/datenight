/*!
 * Booking Widget — drop-in Calendly-style booking for static sites.
 * Backend: Google Apps Script (see Code.gs).
 *
 * Usage:
 *   <div id="booking"></div>
 *   <script src="booking-widget.js"></script>
 *   <script>
 *     BookingWidget.init({
 *       el: '#booking',
 *       endpoint: 'https://script.google.com/macros/s/XXXX/exec', // or 'mock'
 *       lang: 'de',            // 'de' | 'en'
 *       accent: '#fcba01'      // brand color
 *     });
 *   </script>
 */
(function (global) {
  'use strict';

  /* ───────── i18n ───────── */
  var I18N = {
    de: {
      chooseService: 'Was möchtest du buchen?',
      chooseTime: 'Wähle Datum & Uhrzeit',
      yourDetails: 'Deine Kontaktdaten',
      minutes: 'Min.',
      loading: 'Lade Termine…',
      noSlots: 'An diesem Tag sind keine Termine frei.',
      pickDay: 'Bitte wähle einen Tag aus.',
      name: 'Name',
      email: 'E-Mail',
      phone: 'Telefon (optional)',
      note: 'Anmerkung (optional)',
      back: 'Zurück',
      book: 'Verbindlich buchen',
      booking: 'Wird gebucht…',
      done: 'Termin bestätigt!',
      doneText: 'Du erhältst gleich eine Bestätigung per E-Mail – inklusive Kalendereintrag für Apple, Google & Co.',
      again: 'Weiteren Termin buchen',
      errGeneric: 'Das hat leider nicht geklappt. Bitte versuche es erneut.',
      errTaken: 'Dieser Termin wurde gerade vergeben – bitte wähle einen anderen.',
      required: 'Bitte Name und eine gültige E-Mail angeben.',
      weekdays: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'],
      months: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli',
               'August', 'September', 'Oktober', 'November', 'Dezember'],
      at: 'um', oclock: 'Uhr'
    },
    en: {
      chooseService: 'What would you like to book?',
      chooseTime: 'Pick a date & time',
      yourDetails: 'Your details',
      minutes: 'min',
      loading: 'Loading times…',
      noSlots: 'No free times on this day.',
      pickDay: 'Please pick a day.',
      name: 'Name',
      email: 'Email',
      phone: 'Phone (optional)',
      note: 'Note (optional)',
      back: 'Back',
      book: 'Confirm booking',
      booking: 'Booking…',
      done: 'Booking confirmed!',
      doneText: 'A confirmation email is on its way — including a calendar file for Apple, Google & more.',
      again: 'Book another appointment',
      errGeneric: 'Something went wrong. Please try again.',
      errTaken: 'That time was just taken — please pick another slot.',
      required: 'Please enter your name and a valid email.',
      weekdays: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
      months: ['January', 'February', 'March', 'April', 'May', 'June', 'July',
               'August', 'September', 'October', 'November', 'December'],
      at: 'at', oclock: ''
    }
  };

  /* ───────── styles (injected once) ───────── */
  var CSS = '' +
  '.cbw{--cbw-accent:#fcba01;--cbw-ink:#1d1d1f;--cbw-mut:#6e6e73;--cbw-line:#e5e5e8;' +
    '--cbw-bg:#fff;--cbw-soft:#f6f6f7;--cbw-radius:14px;' +
    'font-family:inherit;color:var(--cbw-ink);background:var(--cbw-bg);' +
    'border:1px solid var(--cbw-line);border-radius:var(--cbw-radius);' +
    'max-width:460px;padding:22px;box-sizing:border-box}' +
  '.cbw *,.cbw *:before,.cbw *:after{box-sizing:inherit}' +
  '.cbw-steps{display:flex;gap:6px;margin-bottom:18px}' +
  '.cbw-steps i{flex:1;height:3px;border-radius:2px;background:var(--cbw-line);transition:background .25s}' +
  '.cbw-steps i.on{background:var(--cbw-accent)}' +
  '.cbw h3{margin:0 0 14px;font-size:17px;font-weight:650;line-height:1.3}' +
  '.cbw-svc{display:flex;flex-direction:column;gap:8px}' +
  '.cbw-svc button{display:flex;justify-content:space-between;align-items:center;gap:10px;' +
    'padding:13px 15px;border:1.5px solid var(--cbw-line);border-radius:11px;background:var(--cbw-bg);' +
    'font:inherit;font-size:15px;cursor:pointer;text-align:left;color:var(--cbw-ink);transition:border-color .15s,background .15s}' +
  '.cbw-svc button:hover{border-color:var(--cbw-accent);background:var(--cbw-soft)}' +
  '.cbw-svc small{color:var(--cbw-mut);white-space:nowrap}' +
  '.cbw-cal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}' +
  '.cbw-cal-head b{font-size:14.5px}' +
  '.cbw-nav{border:none;background:var(--cbw-soft);border-radius:8px;width:30px;height:30px;' +
    'cursor:pointer;font-size:15px;color:var(--cbw-ink)}' +
  '.cbw-nav:disabled{opacity:.35;cursor:default}' +
  '.cbw-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin-bottom:14px}' +
  '.cbw-grid span{font-size:11px;color:var(--cbw-mut);text-align:center;padding:4px 0}' +
  '.cbw-grid button{border:none;background:none;font:inherit;font-size:13.5px;padding:0;' +
    'aspect-ratio:1;border-radius:50%;cursor:pointer;color:var(--cbw-ink)}' +
  '.cbw-grid button:hover:not(:disabled){background:var(--cbw-soft)}' +
  '.cbw-grid button:disabled{color:var(--cbw-line);cursor:default}' +
  '.cbw-grid button.sel{background:var(--cbw-accent);font-weight:650}' +
  '.cbw-slots{display:grid;grid-template-columns:repeat(auto-fill,minmax(74px,1fr));gap:7px;' +
    'max-height:180px;overflow-y:auto;padding:2px}' +
  '.cbw-slots button{padding:9px 0;border:1.5px solid var(--cbw-line);border-radius:9px;' +
    'background:var(--cbw-bg);font:inherit;font-size:13.5px;cursor:pointer;color:var(--cbw-ink);transition:all .12s}' +
  '.cbw-slots button:hover{border-color:var(--cbw-accent)}' +
  '.cbw-slots button.sel{background:var(--cbw-accent);border-color:var(--cbw-accent);font-weight:650}' +
  '.cbw-hint{color:var(--cbw-mut);font-size:13.5px;padding:10px 2px}' +
  '.cbw-sum{background:var(--cbw-soft);border-radius:10px;padding:10px 13px;font-size:13.5px;margin-bottom:14px}' +
  '.cbw label{display:block;font-size:12.5px;color:var(--cbw-mut);margin:10px 0 4px}' +
  '.cbw input,.cbw textarea{width:100%;padding:10px 12px;border:1.5px solid var(--cbw-line);' +
    'border-radius:9px;font:inherit;font-size:14.5px;background:var(--cbw-bg);color:var(--cbw-ink)}' +
  '.cbw input:focus,.cbw textarea:focus{outline:none;border-color:var(--cbw-accent)}' +
  '.cbw-row{display:flex;gap:10px;margin-top:18px}' +
  '.cbw-btn{flex:1;padding:12px;border-radius:10px;font:inherit;font-size:15px;font-weight:600;' +
    'cursor:pointer;border:1.5px solid var(--cbw-line);background:var(--cbw-bg);color:var(--cbw-ink)}' +
  '.cbw-btn.pri{background:var(--cbw-accent);border-color:var(--cbw-accent)}' +
  '.cbw-btn:disabled{opacity:.55;cursor:default}' +
  '.cbw-err{color:#c0392b;font-size:13px;margin-top:10px}' +
  '.cbw-done{text-align:center;padding:14px 4px}' +
  '.cbw-done .ico{width:54px;height:54px;border-radius:50%;background:var(--cbw-accent);' +
    'display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:26px}' +
  '.cbw-done p{color:var(--cbw-mut);font-size:14px;line-height:1.5}' +
  '@media(prefers-reduced-motion:no-preference){.cbw-view{animation:cbwIn .18s ease}}' +
  '@keyframes cbwIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}';

  function injectCss() {
    if (document.getElementById('cbw-css')) return;
    var s = document.createElement('style');
    s.id = 'cbw-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ───────── helpers ───────── */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function iso(d) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }
  function niceDate(isoStr, lang) {
    var p = isoStr.split('-');
    return lang === 'de' ? p[2] + '.' + p[1] + '.' + p[0] : isoStr;
  }

  /* ───────── mock backend for demos ───────── */
  function mockApi(action, params) {
    return new Promise(function (res) {
      setTimeout(function () {
        if (action === 'config') {
          res({
            businessName: 'Sri Trang Thaimassage',
            services: [
              { id: 'thai',    name: 'Traditionelle Thai Massage · 52 €', duration: 60 },
              { id: 'aroma',   name: 'Hot Aroma Öl Massage · 58 €',       duration: 60 },
              { id: 'stone',   name: 'Hot Stone Massage · 68 €',          duration: 60 },
              { id: 'stress',  name: 'Anti Stress Massage · 58 €',        duration: 60 },
              { id: 'fuss',    name: 'Fuß Reflexzonen Massage · 53 €',    duration: 60 },
              { id: 'kopf',    name: 'Kopf Massage · 53 €',               duration: 60 },
              { id: 'sport',   name: 'Sport Massage · 58 €',              duration: 60 },
              { id: 'stempel', name: 'Thailändische Kräuterstempel · 68 €', duration: 60 }
            ],
            // Mo geschlossen, Di–Sa 10–20, So 10–19
            hours: { 0: ['10:00-19:00'], 1: [], 2: ['10:00-20:00'], 3: ['10:00-20:00'],
                     4: ['10:00-20:00'], 5: ['10:00-20:00'], 6: ['10:00-20:00'] },
            maxAdvanceDays: 60, minNoticeHours: 12
          });
        } else if (action === 'slots') {
          var day = new Date(params.date + 'T12:00:00').getDay();
          if (day === 1) return res({ slots: [] }); // Montag Ruhetag
          var all = ['10:00','11:00','12:00','13:00','14:00','15:00',
                     '16:00','17:00','18:00','19:00'];
          // pseudo-random availability per date
          var seed = params.date.split('-').join('') % 7;
          res({ slots: all.filter(function (_, i) { return (i + seed) % 3 !== 0; }) });
        } else {
          res({ ok: true });
        }
      }, 350);
    });
  }

  /* ───────── widget ───────── */
  function init(cfg) {
    injectCss();
    var root = typeof cfg.el === 'string' ? document.querySelector(cfg.el) : cfg.el;
    if (!root) { console.error('[BookingWidget] element not found:', cfg.el); return; }

    var lang = cfg.lang === 'en' ? 'en' : 'de';
    var t = I18N[lang];
    var mock = cfg.endpoint === 'mock';

    var box = el('div', 'cbw');
    if (cfg.accent) box.style.setProperty('--cbw-accent', cfg.accent);
    root.appendChild(box);

    var state = {
      remote: null, service: null, date: null, time: null,
      monthCursor: startOfMonth(new Date()), slots: null, loadingSlots: false,
      pendingService: null
    };

    // forceService: skip the "what would you like to book" step entirely and
    // use a client-defined service instead of anything from the backend's
    // service list. Useful when the widget is embedded for a single, known
    // purpose (e.g. "Dinner date") rather than a business with a menu of
    // bookable services. { id, name, duration }
    var forced = cfg.forceService || null;
    var totalSteps = forced ? 2 : 3;

    function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }

    function api(action, params, body) {
      if (mock) return mockApi(action, params || {});
      if (body) {
        return fetch(cfg.endpoint, {
          method: 'POST', body: JSON.stringify(body),
          headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow'
        }).then(function (r) { return r.json(); });
      }
      var q = Object.keys(params || {}).map(function (k) {
        return k + '=' + encodeURIComponent(params[k]);
      }).join('&');
      return fetch(cfg.endpoint + '?action=' + action + (q ? '&' + q : ''), { redirect: 'follow' })
        .then(function (r) { return r.json(); });
    }

    /* steps indicator */
    function steps(n) {
      var w = el('div', 'cbw-steps');
      for (var i = 1; i <= totalSteps; i++) w.appendChild(el('i', i <= n ? 'on' : ''));
      return w;
    }
    function view() {
      box.innerHTML = '';
      var v = el('div', 'cbw-view');
      box.appendChild(v);
      return v;
    }

    /* jump straight to the calendar with a given service pre-selected —
       used when someone clicks a massage in the price list above */
    function selectServiceById(id) {
      if (!state.remote) { state.pendingService = id; return; } // config not loaded yet
      var matches = state.remote.services.filter(function (s) { return s.id === id; });
      if (!matches.length) { renderServices(); return; } // no match → just show the normal list
      state.service = matches[0]; state.date = null; state.time = null; state.slots = null;
      renderCalendar();
    }

    /* step 1: services */
    function renderServices() {
      var v = view();
      v.appendChild(steps(1));
      v.appendChild(el('h3', null, t.chooseService));
      var list = el('div', 'cbw-svc');
      state.remote.services.forEach(function (s) {
        var b = el('button');
        b.appendChild(el('span', null, s.name));
        b.appendChild(el('small', null, s.duration + ' ' + t.minutes));
        b.onclick = function () {
          state.service = s; state.date = null; state.time = null; state.slots = null;
          renderCalendar();
        };
        list.appendChild(b);
      });
      v.appendChild(list);
    }

    /* persistent summary — grows as service/date/time get picked, shown from step 2 onward */
    function summaryBar() {
      if (!state.service) return null;
      var parts = [state.service.name];
      if (state.date) parts.push(niceDate(state.date, lang));
      if (state.time) parts.push(state.time + (lang === 'de' ? ' ' + t.oclock : ''));
      return el('div', 'cbw-sum', parts.join(' · '));
    }

    /* step 2: calendar + slots */
    function isDayOpen(d) {
      var hours = state.remote.hours || {};
      var wd = d.getDay();
      var today = new Date(); today.setHours(0, 0, 0, 0);
      var max = new Date(today.getTime() + (state.remote.maxAdvanceDays || 60) * 864e5);
      return d >= today && d <= max && (hours[wd] || []).length > 0;
    }

    function renderCalendar() {
      var v = view();
      v.appendChild(steps(forced ? 1 : 2));
      v.appendChild(el('h3', null, t.chooseTime));
      var sum = summaryBar();
      if (sum) v.appendChild(sum);

      var head = el('div', 'cbw-cal-head');
      var prev = el('button', 'cbw-nav', '‹');
      var next = el('button', 'cbw-nav', '›');
      var m = state.monthCursor;
      head.appendChild(prev);
      head.appendChild(el('b', null, t.months[m.getMonth()] + ' ' + m.getFullYear()));
      head.appendChild(next);
      v.appendChild(head);

      var thisMonth = startOfMonth(new Date());
      prev.disabled = m <= thisMonth;
      prev.onclick = function () { state.monthCursor = new Date(m.getFullYear(), m.getMonth() - 1, 1); renderCalendar(); };
      next.onclick = function () { state.monthCursor = new Date(m.getFullYear(), m.getMonth() + 1, 1); renderCalendar(); };

      var grid = el('div', 'cbw-grid');
      t.weekdays.forEach(function (w) { grid.appendChild(el('span', null, w)); });
      var firstDow = (new Date(m.getFullYear(), m.getMonth(), 1).getDay() + 6) % 7; // Mon-first
      for (var i = 0; i < firstDow; i++) grid.appendChild(el('span'));
      var days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
      for (var d = 1; d <= days; d++) {
        (function (d) {
          var date = new Date(m.getFullYear(), m.getMonth(), d);
          var b = el('button', null, String(d));
          b.disabled = !isDayOpen(date);
          if (state.date === iso(date)) b.classList.add('sel');
          b.onclick = function () { state.date = iso(date); state.time = null; loadSlots(); renderCalendar(); };
          grid.appendChild(b);
        })(d);
      }
      v.appendChild(grid);

      var area = el('div');
      if (!state.date) {
        area.appendChild(el('div', 'cbw-hint', t.pickDay));
      } else if (state.loadingSlots) {
        area.appendChild(el('div', 'cbw-hint', t.loading));
      } else if (state.slots && !state.slots.length) {
        area.appendChild(el('div', 'cbw-hint', t.noSlots));
      } else if (state.slots) {
        var slots = el('div', 'cbw-slots');
        state.slots.forEach(function (s) {
          var b = el('button', state.time === s ? 'sel' : '', s);
          b.onclick = function () { state.time = s; renderForm(); };
          slots.appendChild(b);
        });
        area.appendChild(slots);
      }
      v.appendChild(area);

      if (!forced) {
        var row = el('div', 'cbw-row');
        var back = el('button', 'cbw-btn', t.back);
        back.onclick = renderServices;
        row.appendChild(back);
        v.appendChild(row);
      }
    }

    function loadSlots() {
      state.loadingSlots = true; state.slots = null;
      var forDate = state.date;
      api('slots', { date: forDate, service: state.service.id }).then(function (r) {
        if (state.date !== forDate) return; // stale
        state.loadingSlots = false;
        state.slots = r.slots || [];
        renderCalendar();
      }).catch(function () {
        state.loadingSlots = false; state.slots = [];
        renderCalendar();
      });
    }

    /* step 3: details form */
    function renderForm() {
      var v = view();
      v.appendChild(steps(forced ? 2 : 3));
      v.appendChild(el('h3', null, t.yourDetails));
      var sum = summaryBar();
      if (sum) v.appendChild(sum);

      function field(labelText, tag, type, name) {
        v.appendChild(el('label', null, labelText));
        var i = el(tag);
        if (type) i.type = type;
        i.name = name;
        v.appendChild(i);
        return i;
      }
      var fName = field(t.name, 'input', 'text', 'name');
      var fMail = field(t.email, 'input', 'email', 'email');
      var fPhone = field(t.phone, 'input', 'tel', 'phone');
      var fNote = field(t.note, 'textarea', null, 'note');
      fNote.rows = 2;

      var err = el('div', 'cbw-err');
      v.appendChild(err);

      var row = el('div', 'cbw-row');
      var back = el('button', 'cbw-btn', t.back);
      back.onclick = renderCalendar;
      var submit = el('button', 'cbw-btn pri', t.book);
      row.appendChild(back);
      row.appendChild(submit);
      v.appendChild(row);

      submit.onclick = function () {
        err.textContent = '';
        var name = fName.value.trim(), email = fMail.value.trim();
        if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          err.textContent = t.required; return;
        }
        submit.disabled = back.disabled = true;
        submit.textContent = t.booking;
        api(null, null, {
          service: state.service.id, date: state.date, time: state.time,
          name: name, email: email,
          phone: fPhone.value.trim(), note: fNote.value.trim(), lang: lang
        }).then(function (r) {
          if (r && r.ok) return renderDone();
          submit.disabled = back.disabled = false;
          submit.textContent = t.book;
          err.textContent = r && r.error === 'slot_taken' ? t.errTaken : t.errGeneric;
          if (r && r.error === 'slot_taken') { state.time = null; loadSlots(); }
        }).catch(function () {
          submit.disabled = back.disabled = false;
          submit.textContent = t.book;
          err.textContent = t.errGeneric;
        });
      };
    }

    /* done */
    function renderDone() {
      var v = view();
      var d = el('div', 'cbw-done');
      d.appendChild(el('div', 'ico', '✓'));
      d.appendChild(el('h3', null, t.done));
      d.appendChild(el('p', null, t.doneText));
      var again = el('button', 'cbw-btn', t.again);
      again.style.marginTop = '16px';
      again.onclick = function () {
        state.service = state.date = state.time = state.slots = null;
        renderServices();
      };
      d.appendChild(again);
      v.appendChild(d);

      // optional hook: let the embedding page react once a slot is actually booked
      // (e.g. advance to a "see you then" screen, show the confirmed date/time, etc.)
      if (typeof cfg.onBooked === 'function') {
        cfg.onBooked({
          service: state.service,
          date: state.date,
          time: state.time,
          lang: lang
        });
      }
    }

    /* boot */
    box.appendChild(el('div', 'cbw-hint', t.loading));
    api('config', {}).then(function (r) {
      state.remote = r;
      if (forced) {
        state.service = forced; state.date = null; state.time = null; state.slots = null;
        renderCalendar();
      } else if (state.pendingService) {
        var id = state.pendingService; state.pendingService = null;
        selectServiceById(id);
      } else {
        renderServices();
      }
    }).catch(function () {
      box.innerHTML = '';
      box.appendChild(el('div', 'cbw-err', t.errGeneric));
    });

    return { selectService: selectServiceById };
  }

  global.BookingWidget = { init: init };
})(window);
