/* Shared site footer for public pages (home/games + gift shop + highlights).
   Drop a placeholder into the page:
     <footer class="site-footer" data-site-footer></footer>
     <script src="/assets/site-footer.js"></script>
   The script fills the placeholder with the standard copyright + social row,
   so the footer is literally identical across every public page (one source of
   truth, mirroring /assets/site-nav.js for the header). */
(function () {
  var footer =
    document.querySelector('footer[data-site-footer]') ||
    document.querySelector('footer.site-footer');
  if (!footer || footer.dataset.tgbFooterReady === 'true') return;

  footer.classList.add('site-footer');
  footer.innerHTML =
    '<span>&copy; The Game Bureau</span>' +
    '<span>' +
      '<a href="https://instagram.com/thegamebureau" target="_blank" rel="noopener">Instagram</a>' +
      '&nbsp;&nbsp;&nbsp;' +
      '<a href="https://x.com/thegamebureau" target="_blank" rel="noopener">X</a>' +
      '&nbsp;&nbsp;&nbsp;' +
      '<a href="https://youtube.com/@thegamebureau" target="_blank" rel="noopener">YouTube</a>' +
    '</span>';
  footer.dataset.tgbFooterReady = 'true';
}());
