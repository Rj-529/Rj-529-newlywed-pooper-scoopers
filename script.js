document.addEventListener('DOMContentLoaded', function () {
  const SOUTH_TAMPA_ZIPS = ['33602','33606','33609','33611','33616','33621','33629'];
  const state = { zip: '', plan: 'weekly', dogs: 1 };
  const $ = (id) => document.getElementById(id);

  function formatPhone(value) {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    if (digits.length < 4) return digits ? '(' + digits : '';
    if (digits.length < 7) return '(' + digits.slice(0, 3) + ') ' + digits.slice(3);
    return '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6);
  }

  ['qtext-phone', 'qphone'].forEach((id) => {
    $(id)?.addEventListener('input', (event) => {
      event.target.value = formatPhone(event.target.value);
      event.target.setCustomValidity(event.target.value.replace(/\D/g, '').length === 10 ? '' : 'Enter a complete 10-digit phone number.');
    });
  });

  function showStep(n) {
    document.querySelectorAll('#quote .qstep').forEach((step) => {
      step.hidden = Number(step.dataset.step) !== n;
    });
  }

  function updateEstimate() {
    const rate = state.plan === 'weekly' ? 24 : 20;
    const extraDogs = state.dogs - 1;
    $('qest-amount').innerHTML = '$' + rate + '<span class="qest-per">/visit</span>';
    $('qest-month').textContent = extraDogs > 0
      ? '+$' + (extraDogs * 4) + '/week for ' + extraDogs + ' extra dog' + (extraDogs > 1 ? 's' : '')
      : '1 dog';

    const surcharge = extraDogs > 0
      ? ' An additional $' + (extraDogs * 4) + '/week applies for ' + extraDogs + ' extra dog' + (extraDogs > 1 ? 's.' : '.')
      : '';
    const timing = state.plan === 'weekly'
      ? 'Your first cleanup is free when you start a 4-week weekly plan. After that, your saved card will be charged $' + rate + ' after each completed weekly visit.'
      : 'Your saved card will be charged $' + rate + ' after each completed twice-weekly visit.';
    if ($('qpayment-terms')) {
      $('qpayment-terms').textContent = timing + surcharge + ' Service continues until you pause or cancel.';
    }
  }

  function estimateText() {
    return '$' + (state.plan === 'weekly' ? 24 : 20) + '/visit, ' + $('qest-month').textContent;
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
    const msg = $('qzip-msg');
    if (msg) {
      msg.textContent = SOUTH_TAMPA_ZIPS.includes(zip)
        ? `You're in our service area. Here's your instant quote for ${zip}:`
        : `Here's your instant quote for ${zip}. We'll confirm the address is on our route before your first visit:`;
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
    $('qform-plan').value = state.plan === 'weekly' ? 'Weekly' : 'Twice-weekly';
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
          plan: state.plan === 'weekly' ? 'Weekly' : 'Twice-weekly',
          dogs: state.dogs,
          estimate: estimateText(),
          consent: true
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || 'Unable to save your quote.');

      textForm.reset();
      status.textContent = 'Quote saved — we’ll text you shortly.';
      button.textContent = 'Saved';
    } catch (err) {
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
        plan: state.plan === 'weekly' ? 'Weekly' : 'Twice-weekly',
        dogs: state.dogs,
        estimate: $('qform-estimate').value,
        notes: $('qnotes').value.trim(),
        payment_authorized: $('qcharge-consent').checked
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
    showStep(4);
  } else if (paymentStatus === 'cancelled' && thanks) {
    thanks.innerHTML = '<h3>Your signup is saved.</h3><p>Your card wasn\'t added, so service isn\'t confirmed yet.</p><button class="btn btn-primary qretry" id="qretry-checkout" type="button">Return to secure checkout</button>';
    showStep(4);
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
