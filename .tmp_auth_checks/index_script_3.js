
    (function () {
      document.querySelectorAll('[data-admin-menu]').forEach((menu) => {
        const trigger = menu.querySelector('.mb-trigger');
        const panel = menu.querySelector('.mb-panel');
        if (!trigger || !panel) return;

        function closeMenu() {
          menu.classList.remove('open');
          panel.hidden = true;
          trigger.setAttribute('aria-expanded', 'false');
        }

        trigger.addEventListener('click', (event) => {
          event.stopPropagation();
          const isOpen = !panel.hidden;
          document.querySelectorAll('[data-admin-menu]').forEach((otherMenu) => {
            otherMenu.classList.remove('open');
            const otherTrigger = otherMenu.querySelector('.mb-trigger');
            const otherPanel = otherMenu.querySelector('.mb-panel');
            if (otherTrigger) otherTrigger.setAttribute('aria-expanded', 'false');
            if (otherPanel) otherPanel.hidden = true;
          });
          if (isOpen) return;
          menu.classList.add('open');
          panel.hidden = false;
          trigger.setAttribute('aria-expanded', 'true');
        });

        panel.addEventListener('click', (event) => {
          event.stopPropagation();
          if (event.target.closest('.mb-item')) closeMenu();
        });

        document.addEventListener('click', closeMenu);
        document.addEventListener('keydown', (event) => {
          if (event.key === 'Escape') closeMenu();
        });
      });
    }());
  
