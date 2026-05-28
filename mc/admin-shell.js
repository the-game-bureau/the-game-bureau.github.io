(function () {
  function goHome(button) {
    var target = button.getAttribute('data-mc-back-fallback')
              || button.getAttribute('data-mc-home')
              || '/';
    window.location.href = target;
  }

  function bindHomeButtons() {
    var buttons = document.querySelectorAll('[data-mc-back], [data-mc-home]');
    buttons.forEach(function (button) {
      button.addEventListener('click', function () {
        goHome(button);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindHomeButtons);
  } else {
    bindHomeButtons();
  }
})();
