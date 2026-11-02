/* Only Inbox — the entire client-side script. No cookies, no analytics, no fonts. */
(function () {
  'use strict';

  // ------------------------------------------------------------- mobile nav
  var toggle = document.getElementById('nav-toggle');
  var links = document.getElementById('nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      var open = links.getAttribute('data-open') === 'true';
      links.setAttribute('data-open', String(!open));
      toggle.setAttribute('aria-expanded', String(!open));
      toggle.textContent = open ? 'Menu' : 'Close';
    });
  }

  // ------------------------------------------------------- device detection
  // Deliberately simple and local: the user agent is read once, in the browser,
  // and is never sent anywhere.
  var ua = navigator.userAgent;
  var platform = navigator.platform || '';
  var isIPad = platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  var isIOS = /iPhone|iPad|iPod/.test(ua) || isIPad;
  var isFirefox = /Firefox\//.test(ua);
  var isEdgeOrOpera = /Edg\/|OPR\//.test(ua);
  var isChromium = (/Chrome\/|Chromium\//.test(ua) && !/Firefox\//.test(ua)) || isEdgeOrOpera;
  var isSafari = /Safari\//.test(ua) && !/Chrome\/|Chromium\/|Firefox\/|Edg\/|OPR\//.test(ua);

  var note = document.getElementById('detect-note');
  var targetId = null;
  var label = '';

  if (isIOS) {
    targetId = 'card-ios';
    label = 'an iPhone or iPad';
  } else if (isFirefox) {
    targetId = 'card-firefox';
    label = 'Firefox';
  } else if (isChromium) {
    targetId = 'card-chrome';
    label = isEdgeOrOpera ? 'your Chromium browser' : 'Chrome';
  } else if (isSafari) {
    targetId = 'card-safari';
    label = 'Safari';
  }

  if (targetId) {
    var card = document.getElementById(targetId);
    if (card) {
      card.setAttribute('data-recommended', 'true');
      if (note) {
        note.textContent =
          'You are on ' + label + ', so that option is marked below. Nothing is installed until you choose it.';
      }
      if (card.scrollIntoView && window.location.hash === '#get') {
        card.scrollIntoView({ block: 'nearest' });
      }
    }
  }

  // Pending store buttons look like buttons but must not pretend to work.
  var pending = document.querySelectorAll('[aria-disabled="true"]');
  for (var i = 0; i < pending.length; i += 1) {
    pending[i].addEventListener('click', function (event) {
      event.preventDefault();
      var noteEl = document.getElementById('detect-note');
      if (noteEl) {
        noteEl.textContent = 'Not published yet — the help page has the manual install steps in the meantime.';
      }
    });
  }
})();
