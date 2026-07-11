// Παραμυθούπολη — shared site script

/* ============================================
   Modal: Πρόσκληση Εθελοντών Αφηγητών
   Εμφανίζεται όταν κάποιος πατά «Ακρόαση».
   ============================================ */

function buildAfigitesModal(){
  if (document.getElementById('afigitesModal')) return;

  var backdrop = document.createElement('div');
  backdrop.className = 'afigites-backdrop';
  backdrop.id = 'afigitesModal';
  backdrop.hidden = true;
  backdrop.innerHTML =
    '<div class="afigites-modal" role="dialog" aria-modal="true" aria-labelledby="afigitesModalTitle">' +
      '<button type="button" class="afigites-close" aria-label="Κλείσιμο" onclick="closeAfigitesModal()">&times;</button>' +
      '<h3 id="afigitesModalTitle">Αυτή η ιστορία περιμένει τη φωνή της 🎙️</h3>' +
      '<p>Στην Παραμυθούπολη ονειρευόμαστε τα παραμύθια μας να ακούγονται με φωνές αληθινές — ' +
      'φωνές παππούδων και γιαγιάδων, σαν εκείνες που έλεγαν ιστορίες τα βράδια, μια φορά κι έναν καιρό.</p>' +
      '<p>Έχεις μια ζεστή φωνή και λίγο χρόνο; Δεν χρειάζεσαι τίποτα άλλο.</p>' +
      '<div class="afigites-actions">' +
        '<a href="/afigites" class="btn btn-primary" onclick="trackAfigitesCta()">Θέλω να μάθω περισσότερα</a>' +
        '<button type="button" class="afigites-later" onclick="closeAfigitesModal()">Ίσως αργότερα</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(backdrop);

  backdrop.addEventListener('click', function(e){
    if (e.target === backdrop) closeAfigitesModal();
  });
}

function openAfigitesModal(){
  buildAfigitesModal();
  document.getElementById('afigitesModal').hidden = false;
  document.body.style.overflow = 'hidden';
  trackEvent('akroasi-click', 'Κλικ στο κουμπί Ακρόαση');
}

function closeAfigitesModal(){
  var m = document.getElementById('afigitesModal');
  if (m) m.hidden = true;
  document.body.style.overflow = '';
}

function trackAfigitesCta(){
  trackEvent('afigitis-cta', 'Κλικ στο Θέλω να μάθω περισσότερα');
}

/* GoatCounter events — αδρανή μέχρι να προστεθεί το GoatCounter script */
function trackEvent(path, title){
  if (window.goatcounter && typeof window.goatcounter.count === 'function'){
    window.goatcounter.count({ path: 'event/' + path, title: title, event: true });
  }
}

document.addEventListener('keydown', function(e){
  if (e.key === 'Escape') closeAfigitesModal();
});
