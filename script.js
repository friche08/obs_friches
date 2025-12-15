/* ------------------------------------------------------------------------- */
/*  Initialisation de la carte Leaflet                                        */
/* ------------------------------------------------------------------------- */

// Création de la carte centrée sur les Ardennes
const map = L.map('map').setView([49.7, 4.7], 9);

// Fond de carte OpenStreetMap
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

/* ------------------------------------------------------------------------- */
/*  Ouverture / fermeture du panneau de filtres                               */
/* ------------------------------------------------------------------------- */

// Bouton "Filtres"
const toggleButton = document.getElementById('toggle-filters');

// Panneau de filtres
const filtersPanel = document.getElementById('filters-panel');

// Sécurité minimale
if (toggleButton && filtersPanel) {
  toggleButton.addEventListener('click', () => {
    filtersPanel.classList.toggle('open');
  });
} else {
  console.error('Bouton ou panneau filtres introuvable dans le DOM');
}
