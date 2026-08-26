(function(){
  var SOUTH_TAMPA_ZIPS = ["33602","33606","33609","33611","33616","33621","33629"];
  var state = { zip: "", plan: "weekly", dogs: 1 };

  function $(id){ return document.getElementById(id); }

  function showStep(n){
    var steps = document.querySelectorAll('#quote .qstep');
    for (var i = 0; i < steps.length; i++){
      steps[i].hidden = (parseInt(steps[i].getAttribute('data-step'), 10) !== n);
    }
  }

  function updateEstimate(){
    var rate = state.plan === 'weekly' ? 24 : 20;
    var extraDogs = state.dogs - 1;
    $('qest-amount').innerHTML = '$' + rate + '<span class="qest-per">/visit</span>';
    $('qest-month').textContent = extraDogs > 0
      ? '+$' + (extraDogs * 4) + '/week for ' + extraDogs + ' extra dog' + (extraDogs > 1 ? 's' : '')
      : '1 dog';
  }

  var zipBtn = $('qzip-btn');
  if (zipBtn){
    zipBtn.addEventListener('click', function(){
      var zip = $('qzip').value.trim();
      if (!/^[0-9]{5}$/.test(zip)){
        $('qzip').focus();
        return;
      }
      state.zip = zip;
      $('qzip-msg').textContent = SOUTH_TAMPA_ZIPS.indexOf(zip) > -1
        ? "Good news — we're already picking up in " + zip + "!"
        : "We'll double check " + zip + " is on our route — here's a quote either way:";
      updateEstimate();
      showStep(2);
    });
  }

  var toggles = document.querySelectorAll('.qtoggle-btn');
  for (var t = 0; t < toggles.length; t++){
    toggles[t].addEventListener('click', function(){
      for (var j = 0; j < toggles.length; j++){ toggles[j].classList.remove('active'); }
      this.classList.add('active');
      state.plan = this.getAttribute('data-plan');
      updateEstimate();
    });
  }

  var dogMinus = $('qdog-minus'), dogPlus = $('qdog-plus');
  if (dogMinus) dogMinus.addEventListener('click', function(){
    if (state.dogs > 1){ state.dogs--; $('qdog-count').textContent = state.dogs; updateEstimate(); }
  });
  if (dogPlus) dogPlus.addEventListener('click', function(){
    if (state.dogs < 6){ state.dogs++; $('qdog-count').textContent = state.dogs; updateEstimate(); }
  });

  var continueBtn = $('qcontinue-btn');
  if (continueBtn) continueBtn.addEventListener('click', function(){
    $('qform-zip').value = state.zip;
    $('qform-plan').value = state.plan === 'weekly' ? 'Weekly' : 'Twice-weekly';
    $('qform-dogs').value = state.dogs;
    $('qform-estimate').value = '$' + (state.plan === 'weekly' ? 24 : 20) + '/visit, ' + $('qest-month').textContent;
    showStep(3);
  });

  var backBtns = document.querySelectorAll('#quote .qback');
  for (var b = 0; b < backBtns.length; b++){
    backBtns[b].addEventListener('click', function(){
      showStep(parseInt(this.getAttribute('data-back'), 10));
    });
  }

  var form = $('qstep-form');
  if (form){
    form.addEventListener('submit', function(e){
      e.preventDefault();
      var data = new URLSearchParams(new FormData(form)).toString();
      fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: data
      }).catch(function(){}).then(function(){
        showStep(4);
      });
    });
  }
})();
