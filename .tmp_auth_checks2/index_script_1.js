
    (function () {
      try {
        if (new URLSearchParams(window.location.search).get('embedded') === '1') {
          document.documentElement.classList.add('admin-embedded');
        }
      } catch (error) {}
    }());
  
