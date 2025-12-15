/* ------------------------------------------------------------------------- */
/*  Initialisation de la carte Leaflet                                        */
/* ------------------------------------------------------------------------- */

const map = L.map('map').setView([49.7, 4.7], 9);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

/* ------------------------------------------------------------------------- */
/*  Données et marqueurs                                                      */
/* ------------------------------------------------------------------------- */

let allData = [];     // données du CSV
let markers = [];     // marqueurs Leaflet

/* ------------------------------------------------------------------------- */
/*  Chargement du CSV                                                         */
/* ------------------------------------------------------------------------- */

Papa.parse('data.csv', {
  download: true,
  header: true,
  dynamicTyping: true,

  complete: function (results) {
    allData = results.data;

    // Création des marqueurs
    createMarkers(allData);

    console.log('Données chargées :', allData.length);
  },

  error: function (error) {
    console.error('Erreur lors du chargement du CSV :', error);
  }
});

/* ------------------------------------------------------------------------- */
/*  Création des marqueurs                                                    */
/* ------------------------------------------------------------------------- */

function createMarkers(data) {

  data.forEach(row => {

    // Sécurité : on vérifie que les coordonnées existent
    if (!row.latitude || !row.longitude) return;

    const marker = L.marker([row.latitude, row.longitude]);

    // Popup simple (on enrichira plus tard)
    marker.bindPopup(`
      <strong>${row.nom_friche || 'Friche'}</strong><br>
      Commune : ${row.commune || '-'}<br>
      Statut : ${row.statut || '-'}
    `);

    marker.addTo(map);

    // On garde le lien entre données et marqueur
    markers.push({
      marker: marker,
      data: row
    });
  });
}

/* ------------------------------------------------------------------------- */
/*  Ouverture / fermeture du panneau de filtres                               */
/* ------------------------------------------------------------------------- */

const toggleButton = document.getElementById('toggle-filters');
const filtersPanel = document.getElementById('filters-panel');

if (toggleButton && filtersPanel) {
  toggleButton.addEventListener('click', () => {
    filtersPanel.classList.toggle('open');
  });
}
