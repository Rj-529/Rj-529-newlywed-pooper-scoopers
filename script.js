import { zipGate } from './zip-config.js';
import {
  SOURCE_STORAGE_KEY,
  normalizeMarketingSource,
  readSourceCookie,
  resolveRequestMarketingSource,
  sourceCookieHeader
} from './lead-source.js';

const TURNSTILE_PLACEHOLDER = 'TURNSTILE_SITE_KEY_PLACEHOLDER';

function persistMarketingSource(source) {
  const value = normalizeMarketingSource(source);
  if (!value) return;
  try { sessionStorage.setItem(SOURCE_STORAGE_KEY, value); } catch {}
  try { localStorage.setItem(SOURCE_STORAGE_KEY, value); } catch {}
  document.cookie = sourceCookieHeader(value, { secure: window.location.protocol === 'https:' });
}

function capturedMarketingSource() {
  const incoming = resolveRequestMarketingSource(new URL(window.location.href));
  if (incoming) persistMarketingSource(incoming);
  try {
    const fromSession = normalizeMarketingSource(sessionStorage.getItem(SOURCE_STORAGE_KEY));
    if (fromSession) return fromSession;
  } catch {}
  try {
    const fromLocal = normalizeMarketingSource(localStorage.getItem(SOURCE_STORAGE_KEY));
    if (fromLocal) return fromLocal;
  } catch {}
  return readSourceCookie(document.cookie);
}

function turnstileSiteKey() {
  const fromMeta = document.querySelector('meta[name="turnstile-sitekey"]')?.getAttribute('content')?.trim();
  if (fromMeta && fromMeta !== TURNSTILE_PLACEHOLDER) return fromMeta;
  return '';
}

function whenTurnstileReady(callback) {
  if (window.turnstile?.render) {
    callback();
    return;
  }
  const started = Date.now();
  const timer = setInterval(() => {
    if (window.turnstile?.render || Date.now() - started > 8000) {
      clearInterval(timer);
      if (window.turnstile?.render) callback();
    }
  }, 50);
}

document.addEventListener('DOMContentLoaded', function () {
  const state = { zip: '', plan: 'weekly', dogs: 1, gate: '' };
  const marketingSource = capturedMarketingSource();
  const turnstileWidgets = {};
  const $ = (id) => document.getElementById(id);

  function renderTurnstile(step) {
    const sitekey = turnstileSiteKey();
    const containers = { 2: 'qtext-turnstile', 3: 'qsignup-turnstile', 4: 'qinterest-turnstile' };
    const el = $(containers[step]);
    if (!sitekey || !el) return;
    whenTurnstileReady(() => {
      if (turnstileWidgets[step]) {
        window.turnstile.reset(turnstileWidgets[step]);
        return;
      }
      turnstileWidgets[step] = window.turnstile.render(el, {
        sitekey,
        theme: 'auto',
        size: 'flexible',
        appearance: 'always',
        'refresh-expired': 'auto'
      });
    });
  }

  function turnstileToken(step) {
    const sitekey = turnstileSiteKey();
    if (!sitekey) return '';
    const widgetId = turnstileWidgets[step];
    const token = widgetId && window.turnstile ? window.turnstile.getResponse(widgetId) : '';
    if (!token) throw new Error('Please complete the spam check and try again.');
    return token;
  }

  function resetTurnstile(step) {
    const widgetId = turnstileWidgets[step];
    if (widgetId && window.turnstile) window.turnstile.reset(widgetId);
  }

  function attributionFields(step) {
    return {
      source: marketingSource || undefined,
      turnstile_token: turnstileToken(step)
    };
  }
  const planLabels = {
    weekly: 'Weekly',
    twice: 'Twice-weekly',
    biweekly: 'Every other week'
  };

  function formatPhone(value) {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    if (digits.length < 4) return digits ? '(' + digits : '';
    if (digits.length < 7) return '(' + digits.slice(0, 3) + ') ' + digits.slice(3);
    return '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6);
  }

  ['qtext-phone', 'qphone', 'qinterest-phone'].forEach((id) => {
    $(id)?.addEventListener('input', (event) => {
      event.target.value = formatPhone(event.target.value);
      event.target.setCustomValidity(event.target.value.replace(/\D/g, '').length === 10 ? '' : 'Enter a complete 10-digit phone number.');
    });
  });

  function showStep(n) {
    document.querySelectorAll('#quote .qstep').forEach((step) => {
      step.hidden = Number(step.dataset.step) !== n;
    });
    if (n === 2 || n === 3 || n === 4) renderTurnstile(n);
  }

  function updateEstimate() {
    const extraDogs = state.dogs - 1;
    const extraDogWeeklyTotal = extraDogs * 4;
    let perVisitTotal;
    let periodTotal;

    if (state.plan === 'twice') {
      periodTotal = 40 + extraDogWeeklyTotal;
      perVisitTotal = periodTotal / 2;
      $('qest-month').textContent = '2 visits/week · $' + periodTotal + '/week total';
    } else if (state.plan === 'biweekly') {
      periodTotal = 30 + (extraDogWeeklyTotal * 2);
      perVisitTotal = periodTotal;
      $('qest-month').textContent = '1 visit every other week · $' + periodTotal + ' every 2 weeks';
    } else {
      periodTotal = 24 + extraDogWeeklyTotal;
      perVisitTotal = periodTotal;
      $('qest-month').textContent = '1 visit/week · $' + periodTotal + '/week total';
    }

    $('qest-amount').innerHTML = '$' + perVisitTotal + '<span class="qest-per">/visit</span>';

    const surcharge = extraDogs > 0
      ? ' This total includes $' + extraDogWeeklyTotal + '/week for ' + extraDogs + ' extra dog' + (extraDogs > 1 ? 's.' : '.')
      : '';
    const timing = state.plan === 'twice'
      ? 'Your saved card will be charged $' + perVisitTotal + ' after each visit ($' + periodTotal + '/week total).'
      : state.plan === 'biweekly'
        ? 'Your saved card will be charged $' + perVisitTotal + ' after each every-other-week visit.'
        : 'Your saved card will be charged $' + perVisitTotal + ' after each weekly visit.';
    if ($('qpayment-terms')) {
      $('qpayment-terms').textContent = timing + surcharge + ' You will not be charged today. Service continues until you pause or cancel.';
    }
  }

  function estimateText() {
    return $('qest-amount').textContent + ', ' + $('qest-month').textContent;
  }

  async function startCheckout(leadId) {
    const response = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lead_id: leadId })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok || !data.checkout_url) {
      throw new Error(data.error || 'Unable to open secure checkout.');
    }
    window.location.assign(data.checkout_url);
  }

  function checkZip() {
    const input = $('qzip');
    const zip = (input?.value || '').trim();
    const hint = document.querySelector('#quote .qhint');

    if (!/^\d{5}$/.test(zip)) {
      if (hint) hint.textContent = 'Please enter a 5-digit ZIP code.';
      input?.focus();
      return;
    }

    state.zip = zip;
    state.gate = zipGate(zip);
    if (state.gate !== 'service_now') {
      $('qinterest-zip').value = zip;
      $('qinterest-title').textContent = state.gate === 'border' ? 'One quick route check' : 'Join our waitlist';
      $('qinterest-message').textContent = state.gate === 'border'
        ? 'We’ll confirm you’re on our route before we say “I do.” No card needed.'
        : 'We’re expanding around Tampa. Join the list and we’ll let you know when we’re ready to scoop.';
      showStep(4);
      return;
    }
    const msg = $('qzip-msg');
    if (msg) {
      msg.textContent = `You're in our service area. Here's your instant quote for ${zip}:`;
    }
    updateEstimate();
    showStep(2);
  }

  const startButton = $('qcontinue-btn');
  if (startButton) startButton.textContent = 'Start service';

  const form = $('qstep-form');
  if (form) {
    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) submitButton.textContent = 'Sign me up';
  }

  $('qzip-btn')?.addEventListener('click', checkZip);
  $('qzip')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      checkZip();
    }
  });

  document.querySelectorAll('.qtoggle-btn').forEach((btn) => {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.qtoggle-btn').forEach((b) => b.classList.remove('active'));
      this.classList.add('active');
      state.plan = this.dataset.plan;
      updateEstimate();
    });
  });

  $('qdog-minus')?.addEventListener('click', () => {
    if (state.dogs > 1) {
      state.dogs--;
      $('qdog-count').textContent = state.dogs;
      updateEstimate();
    }
  });

  $('qdog-plus')?.addEventListener('click', () => {
    if (state.dogs < 6) {
      state.dogs++;
      $('qdog-count').textContent = state.dogs;
      updateEstimate();
    }
  });

  startButton?.addEventListener('click', () => {
    $('qform-zip').value = state.zip;
    $('qform-plan').value = planLabels[state.plan];
    $('qform-dogs').value = state.dogs;
    $('qform-estimate').value = estimateText();
    showStep(3);
  });

  const textForm = $('qtext-form');
  textForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const phone = $('qtext-phone').value.trim();
    const consent = $('qtext-consent').checked;
    const status = $('qtext-status');
    const button = textForm.querySelector('button[type="submit"]');

    if (!consent) {
      status.textContent = 'Please check the consent box so we can text you.';
      return;
    }

    button.disabled = true;
    button.textContent = 'Saving...';
    status.textContent = '';

    try {
      const response = await fetch('/api/quote-leads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          phone,
          zip: state.zip,
          plan: planLabels[state.plan],
          dogs: state.dogs,
          estimate: estimateText(),
          consent: true,
          ...attributionFields(2)
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || 'Unable to save your quote.');

      textForm.reset();
      status.textContent = 'Quote saved — we’ll text you shortly.';
      button.textContent = 'Saved';
    } catch (err) {
      resetTurnstile(2);
      status.textContent = err?.message || 'We could not save your quote. Please text us instead.';
      button.disabled = false;
      button.textContent = 'Text me';
    }
  });

  document.querySelectorAll('#quote .qback').forEach((btn) => {
    btn.addEventListener('click', function () {
      showStep(Number(this.dataset.back));
    });
  });

  const interestForm = $('qinterest-form');
  interestForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = interestForm.querySelector('button[type="submit"]');
    const original = submit.textContent;
    submit.disabled = true;
    submit.textContent = 'Saving...';
    try {
      const response = await fetch('/api/interest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: $('qinterest-name').value.trim(), phone: $('qinterest-phone').value.trim(),
          email: $('qinterest-email').value.trim(), address: $('qinterest-address').value.trim(), zip: state.zip,
          ...attributionFields(4)
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || 'Unable to save your request.');
      const thanks = document.querySelector('#quote .qthanks');
      thanks.innerHTML = state.gate === 'border'
        ? '<h3>We’ve got you.</h3><p>We’ll confirm whether your address is on our route before we take the next step.</p>'
        : '<h3>You’re on the list.</h3><p>We’re expanding around Tampa and will reach out when we’re ready to scoop your neighborhood.</p>';
      showStep(5);
    } catch (err) {
      resetTurnstile(4);
      alert(err?.message || 'We could not save your request. Please call or text us instead.');
      submit.disabled = false;
      submit.textContent = original;
    }
  });

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submit = form.querySelector('button[type="submit"]');
      const original = submit.textContent;
      submit.disabled = true;
      submit.textContent = 'Saving your information...';

      const payload = {
        name: $('qname').value.trim(),
        phone: $('qphone').value.trim(),
        email: $('qemail').value.trim(),
        address: $('qaddress').value.trim(),
        zip: state.zip,
        plan: planLabels[state.plan],
        dogs: state.dogs,
        estimate: $('qform-estimate').value,
        notes: $('qnotes').value.trim(),
        payment_authorized: $('qcharge-consent').checked,
        ...attributionFields(3)
      };

      try {
        const response = await fetch('/api/leads', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.ok) throw new Error(data.error || 'Unable to start service.');

        if (!data.id) throw new Error('Your information was saved, but checkout could not start. Please call or text us.');
        submit.textContent = 'Opening secure checkout...';
        await startCheckout(data.id);
      } catch (err) {
        resetTurnstile(3);
        alert(err?.message || "We couldn't save your signup. Please call or text us instead.");
        submit.disabled = false;
        submit.textContent = original;
      }
    });
  }

  const params = new URLSearchParams(window.location.search);
  const paymentStatus = params.get('payment');
  const returnedLeadId = Number.parseInt(params.get('lead'), 10);
  const thanks = document.querySelector('#quote .qthanks');

  if (paymentStatus === 'success' && thanks) {
    thanks.innerHTML = '<h3>You\'re all set!</h3><p>Your card is securely saved. We\'ll text you shortly to confirm your service day and first cleanup.</p>';
    showStep(5);
  } else if (paymentStatus === 'cancelled' && thanks) {
    thanks.innerHTML = '<h3>Your signup is saved.</h3><p>Your card wasn\'t added, so service isn\'t confirmed yet.</p><button class="btn btn-primary qretry" id="qretry-checkout" type="button">Return to secure checkout</button>';
    showStep(5);
    $('qretry-checkout')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = 'Opening checkout...';
      try {
        await startCheckout(returnedLeadId);
      } catch (err) {
        alert(err?.message || 'Unable to open checkout. Please call or text us.');
        button.disabled = false;
        button.textContent = 'Return to secure checkout';
      }
    });
  }

  if ((paymentStatus === 'success' || paymentStatus === 'cancelled') && thanks) {
    requestAnimationFrame(() => $('quote')?.scrollIntoView({ block: 'start' }));
  }
});
