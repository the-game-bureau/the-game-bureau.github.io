(function () {
  function goBack(button) {
    var fallback = button.getAttribute('data-mc-back-fallback') || '../index.html';
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.href = fallback;
  }

  function bindBackButtons() {
    var buttons = document.querySelectorAll('[data-mc-back]');
    buttons.forEach(function (button) {
      button.addEventListener('click', function () {
        goBack(button);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindBackButtons);
  } else {
    bindBackButtons();
  }
})();
