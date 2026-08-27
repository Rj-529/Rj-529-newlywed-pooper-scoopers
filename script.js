document.addEventListener('DOMContentLoaded', function () {
  const SOUTH_TAMPA_ZIPS = ['33602','33606','33609','33611','33616','33621','33629'];
  const state = { zip: '', plan: 'weekly', dogs: 1 };
  const $ = (id) => document.getElementById(id);

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
        ? `Good news — we're already picking up in ${zip}!`
        : `We'll double check ${zip} is on our route — here's a quote either way:`;
    }
    updateEstimate();
    showStep(2);
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

  $('qcontinue-btn')?.addEventListener('click', () => {
    $('qform-zip').value = state.zip;
    $('qform-plan').value = state.plan === 'weekly' ? 'Weekly' : 'Twice-weekly';
    $('qform-dogs').value = state.dogs;
    $('qform-estimate').value = '$' + (state.plan === 'weekly' ? 24 : 20) + '/visit, ' + $('qest-month').textContent;
    showStep(3);
  });

  document.querySelectorAll('#quote .qback').forEach((btn) => {
    btn.addEventListener('click', function () {
      showStep(Number(this.dataset.back));
    });
  });

  const form = $('qstep-form');
  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submit = form.querySelector('button[type="submit"]');
      const original = submit.textContent;
      submit.disabled = true;
      submit.textContent = 'Sending...';

      const payload = {
        name: $('qname').value.trim(),
        phone: $('qphone').value.trim(),
        address: $('qaddress').value.trim(),
        zip: state.zip,
        plan: state.plan === 'weekly' ? 'Weekly' : 'Twice-weekly',
        dogs: state.dogs,
        estimate: $('qform-estimate').value,
        notes: $('qnotes').value.trim()
      };

      try {
        const response = await fetch('/api/leads', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.ok) throw new Error(data.error || 'Unable to submit quote request.');

        const thanks = document.querySelector('#quote .qthanks');
        if (thanks) thanks.innerHTML = '<h3>You\'re on the list!</h3><p>We got your quote request and will text you shortly to confirm the details.</p>';
        showStep(4);
        form.reset();
      } catch (err) {
        alert(err?.message || "We couldn't save your request. Please call or text us instead.");
        submit.disabled = false;
        submit.textContent = original;
      }
    });
  }
});
