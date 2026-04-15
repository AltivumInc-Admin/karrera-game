/* =========================================
   Karrera — Two Truths and a Lie
   Static version — game data encoded in URL hash
   ========================================= */

(function () {
  'use strict';

  // ---- State ----
  let gameData = null; // { name, claims: [str,str,str], lie: 0|1|2 }
  let selectedGuessIndex = null;

  // ---- DOM Helpers ----
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  function showScreen(id) {
    $$('.screen').forEach((s) => s.classList.remove('active'));
    const screen = $(`#${id}`);
    if (screen) {
      screen.classList.add('active');
      window.scrollTo(0, 0);
    }
  }

  // ---- Encoding ----
  // We encode game data as a base64-encoded JSON in the URL hash.
  // The lie_index is obfuscated: we XOR it with a simple key derived from the name length.
  // This isn't cryptographic security — it just prevents casual URL inspection.

  function encodeGame(name, claims, lieIndex) {
    const key = (name.length * 7 + 13) % 3;
    const obfuscatedLie = lieIndex ^ key; // Simple XOR obfuscation
    const payload = {
      n: name,
      c: claims,
      l: obfuscatedLie,
      k: key // Store the key so we can decode
    };
    const json = JSON.stringify(payload);
    // Use URL-safe base64
    return btoa(unescape(encodeURIComponent(json)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  function decodeGame(encoded) {
    try {
      // Restore standard base64
      let b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
      // Add padding
      while (b64.length % 4) b64 += '=';
      const json = decodeURIComponent(escape(atob(b64)));
      const payload = JSON.parse(json);
      const lieIndex = payload.l ^ payload.k; // Reverse XOR
      return {
        name: payload.n,
        claims: payload.c,
        lie: lieIndex
      };
    } catch (e) {
      return null;
    }
  }

  function getBaseUrl() {
    return window.location.origin + window.location.pathname;
  }

  // ---- Router ----
  function route() {
    const hash = window.location.hash;

    if (hash && hash.length > 2) {
      // Check if it's a challenge link
      const encoded = hash.substring(1); // Remove #
      const decoded = decodeGame(encoded);
      if (decoded) {
        gameData = decoded;
        loadPlayScreen();
        return;
      }
    }

    showScreen('screen-landing');
  }

  // ---- Create Flow ----
  function initCreateFlow() {
    const textareas = $$('.claim-input-card textarea');
    const radios = $$('input[name="lie-pick"]');
    const btnCreate = $('#btn-create');
    const nameInput = $('#creator-name');

    // Char counts
    textareas.forEach((ta) => {
      ta.addEventListener('input', () => {
        const card = ta.closest('.claim-input-card');
        card.querySelector('.char-count').textContent = `${ta.value.length}/300`;
        validateCreateForm();
      });
    });

    // Lie toggle styling
    radios.forEach((r) => {
      r.addEventListener('change', () => {
        $$('.claim-input-card').forEach((c) => c.classList.remove('is-lie'));
        const card = r.closest('.claim-input-card');
        if (r.checked) card.classList.add('is-lie');
        validateCreateForm();
      });
    });

    nameInput.addEventListener('input', validateCreateForm);

    // Submit
    btnCreate.addEventListener('click', createChallenge);

    // Create another
    if ($('#btn-create-another')) {
      $('#btn-create-another').addEventListener('click', () => {
        window.location.hash = '';
        resetCreateForm();
        showScreen('screen-landing');
      });
    }
  }

  function validateCreateForm() {
    const name = $('#creator-name').value.trim();
    const textareas = $$('.claim-input-card textarea');
    const lieSelected = $('input[name="lie-pick"]:checked');
    const allFilled = Array.from(textareas).every((ta) => ta.value.trim().length >= 5);
    const valid = name.length > 0 && allFilled && lieSelected;
    $('#btn-create').disabled = !valid;
  }

  function createChallenge() {
    const textareas = $$('.claim-input-card textarea');
    const lieIndex = parseInt($('input[name="lie-pick"]:checked').value);
    const name = $('#creator-name').value.trim();
    const claims = Array.from(textareas).map((ta) => ta.value.trim());

    // Encode into URL hash
    const encoded = encodeGame(name, claims, lieIndex);
    const shareUrl = getBaseUrl() + '#' + encoded;

    // Store the creator's email for potential future use
    const email = $('#creator-email').value.trim();
    if (email) {
      try { localStorage.setItem('karrera_email', email); } catch (e) {}
    }

    showShareScreen(shareUrl, name);
  }

  // ---- Share Screen ----
  function showShareScreen(shareUrl, creatorName) {
    $('#share-url').value = shareUrl;
    showScreen('screen-share');

    // Copy button
    $('#btn-copy').onclick = async () => {
      try {
        await navigator.clipboard.writeText(shareUrl);
        $('#btn-copy').classList.add('copied');
        $('#btn-copy span').textContent = 'Copied!';
        setTimeout(() => {
          $('#btn-copy').classList.remove('copied');
          $('#btn-copy span').textContent = 'Copy';
        }, 2000);
      } catch {
        const input = $('#share-url');
        input.select();
        document.execCommand('copy');
      }
    };

    const shareText = `I posted my career "Two Truths and a Lie" on Karrera. Think you can spot my fake credential?`;

    // LinkedIn share
    $('#btn-share-linkedin').onclick = () => {
      const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
      window.open(url, '_blank', 'width=600,height=500');
    };

    // X share
    $('#btn-share-x').onclick = () => {
      const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
      window.open(url, '_blank', 'width=600,height=400');
    };
  }

  // ---- Play Screen (Guesser) ----
  function loadPlayScreen() {
    showScreen('screen-play');
    selectedGuessIndex = null;

    $('#creator-display-name').textContent = gameData.name;

    // Render claim cards
    const container = $('#claim-cards');
    container.innerHTML = '';
    $('#btn-guess').disabled = true;

    gameData.claims.forEach((text, i) => {
      const card = document.createElement('div');
      card.className = 'claim-card';
      card.dataset.index = i;
      card.innerHTML = `
        <span class="claim-number">${i + 1}</span>
        <span class="claim-text">${escapeHtml(text)}</span>
      `;
      card.addEventListener('click', () => selectClaim(i));
      container.appendChild(card);
    });
  }

  function selectClaim(index) {
    selectedGuessIndex = index;
    $$('.claim-card').forEach((c, i) => {
      c.classList.toggle('selected', i === index);
    });
    const nameVal = $('#guesser-name').value.trim();
    $('#btn-guess').disabled = nameVal.length === 0;
  }

  function initPlayFlow() {
    $('#guesser-name').addEventListener('input', () => {
      const nameVal = $('#guesser-name').value.trim();
      $('#btn-guess').disabled = nameVal.length === 0 || selectedGuessIndex === null;
    });

    $('#btn-guess').addEventListener('click', submitGuess);
  }

  function submitGuess() {
    const guesserName = $('#guesser-name').value.trim();
    const isCorrect = selectedGuessIndex === gameData.lie;

    // Store guesser email if provided
    const email = $('#guesser-email').value.trim();
    if (email) {
      try { localStorage.setItem('karrera_email', email); } catch (e) {}
    }

    showRevealScreen(isCorrect, guesserName);
  }

  // ---- Reveal Screen ----
  function showRevealScreen(isCorrect, guesserName) {
    const header = $('#reveal-header');
    const cardsContainer = $('#reveal-cards');

    // Header
    if (isCorrect) {
      header.innerHTML = `
        <div class="result-icon">&#x1f3af;</div>
        <h2>You spotted the lie!</h2>
        <p class="result-subtitle">Nice work, ${escapeHtml(guesserName)}. Most people get fooled.</p>
      `;
    } else {
      header.innerHTML = `
        <div class="result-icon">&#x1f92f;</div>
        <h2>You got fooled!</h2>
        <p class="result-subtitle">Don't worry, ${escapeHtml(guesserName)} — most people do too.</p>
      `;
    }

    // Cards with reveal
    cardsContainer.innerHTML = '';
    gameData.claims.forEach((text, i) => {
      const isLie = i === gameData.lie;
      const wasPicked = i === selectedGuessIndex;
      const card = document.createElement('div');
      let classes = 'reveal-card';
      if (isLie) classes += ' is-lie';
      else classes += ' is-truth';
      if (wasPicked) classes += ' was-picked';
      card.className = classes;

      let badges = '';
      if (isLie) badges += '<span class="reveal-badge lie">The Lie</span>';
      else badges += '<span class="reveal-badge truth">True</span>';
      if (wasPicked) badges += '<span class="reveal-badge your-pick">Your pick</span>';

      card.innerHTML = `
        <span class="claim-number">${i + 1}</span>
        <span class="claim-text">${escapeHtml(text)}</span>
        <div class="reveal-badges">${badges}</div>
      `;
      cardsContainer.appendChild(card);
    });

    // Create own challenge
    $('#btn-create-own').onclick = () => {
      window.location.hash = '';
      gameData = null;
      selectedGuessIndex = null;
      resetCreateForm();
      showScreen('screen-landing');
    };

    // Share buttons on reveal
    const shareUrl = window.location.href;
    const shareText = isCorrect
      ? `I spotted the fake credential on ${gameData.name}'s "Two Truths and a Lie" challenge on Karrera. Can you?`
      : `I got fooled by ${gameData.name}'s resume on Karrera's "Two Truths and a Lie." Think you can do better?`;

    $('#btn-reveal-share-linkedin').onclick = () => {
      const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
      window.open(url, '_blank', 'width=600,height=500');
    };

    $('#btn-reveal-share-x').onclick = () => {
      const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
      window.open(url, '_blank', 'width=600,height=400');
    };

    showScreen('screen-reveal');
  }

  // ---- Utilities ----
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function resetCreateForm() {
    $('#creator-name').value = '';
    $('#creator-email').value = '';
    $$('.claim-input-card textarea').forEach((ta) => { ta.value = ''; });
    $$('.char-count').forEach((c) => (c.textContent = '0/300'));
    $$('input[name="lie-pick"]').forEach((r) => (r.checked = false));
    $$('.claim-input-card').forEach((c) => c.classList.remove('is-lie'));
    $('#btn-create').disabled = true;
  }

  // ---- Handle hash changes ----
  window.addEventListener('hashchange', route);

  // ---- Init ----
  function init() {
    initCreateFlow();
    initPlayFlow();
    route();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
