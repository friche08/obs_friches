/* ------------------------------------------------------------------------- */
/* 1. Initialisation de la carte                                            */
/* ------------------------------------------------------------------------- */
const map = L.map('map').setView([49.7, 4.7], 9);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

/* ------------------------------------------------------------------------- */
/* 2. Variables Globales                                                    */
/* ------------------------------------------------------------------------- */
let allData = [];     // Stocke toutes les lignes du CSV
let markers = [];     // Stocke les objets { marker, data } pour pouvoir les filtrer

/* ------------------------------------------------------------------------- */
/* 3. Chargement des données                                                */
/* ------------------------------------------------------------------------- */
Papa.parse('data.csv', {
  download: true,
  header: true,
  dynamicTyping: true, // Convertit auto les nombres (ex: surface)
  skipEmptyLines: true,

  complete: function (results) {
    allData = results.data;
    
    // 1. Créer les marqueurs sur la carte
    createMarkers(allData);
    
    // 2. Remplir les listes déroulantes (EPCI, Communes...)
    populateFilters(allData);
    
    // 3. Activer l'écoute sur les filtres (dès qu'on touche, ça met à jour)
    initFilterListeners();
    
    console.log('Données chargées et prêtes :', allData.length);
  },

  error: function (error) {
    console.error('Erreur CSV :', error);
  }
});

/* ------------------------------------------------------------------------- */
/* 4. Création des marqueurs                                                */
/* ------------------------------------------------------------------------- */
function createMarkers(data) {
  // Nettoyage au cas où on recharge
  markers.forEach(m => map.removeLayer(m.marker));
  markers = [];

  data.forEach(row => {
    if (!row.latitude || !row.longitude) return;

    // Création du marqueur
    const marker = L.marker([row.latitude, row.longitude]);

    // Popup informative
    const surface = row.unite_fonciere_surface ? row.unite_fonciere_surface + ' m²' : 'Non connue';
    marker.bindPopup(`
      <strong>${row.site_nom || 'Friche sans nom'}</strong><br>
      <em>${row.site_type || ''}</em><br>
      <hr style="margin:5px 0;">
      Commune : ${row.comm_nom}<br>
      Statut : ${row.site_statut}<br>
      Surface : ${surface}
    `);

    marker.addTo(map);

    // On stocke le marqueur ET les données associées pour le filtrage futur
    markers.push({ marker: marker, data: row });
  });
}

/* ------------------------------------------------------------------------- */
/* 5. Remplissage dynamique des Selects (EPCI, Commune)                     */
/* ------------------------------------------------------------------------- */
function populateFilters(data) {
  // --- A. EPCI ---
  // On récupère les noms uniques, on filtre les vides, et on trie par ordre alphabétique
  const epcis = [...new Set(data.map(d => d.epci_nom))].filter(Boolean).sort();
  const selectEpci = document.getElementById('filter-epci');
  
  epcis.forEach(epci => {
    const option = document.createElement('option');
    option.value = epci;
    option.textContent = epci;
    selectEpci.appendChild(option);
  });

  // --- B. Communes ---
  const communes = [...new Set(data.map(d => d.comm_nom))].filter(Boolean).sort();
  const selectCommune = document.getElementById('filter-commune');
  
  communes.forEach(commune => {
    const option = document.createElement('option');
    option.value = commune;
    option.textContent = commune;
    selectCommune.appendChild(option);
  });

  // --- C. Liste des friches (Optionnel, si la liste est longue c'est lourd) ---
  const friches = [...new Set(data.map(d => d.site_nom))].filter(Boolean).sort();
  const selectFriche = document.getElementById('filter-friche');
  
  friches.forEach(nom => {
    const option = document.createElement('option');
    option.value = nom;
    option.textContent = nom;
    selectFriche.appendChild(option);
  });
}

/* ------------------------------------------------------------------------- */
/* 6. Logique de Filtrage                                                   */
/* ------------------------------------------------------------------------- */

// Fonction qui ajoute les "écouteurs" sur tous les inputs du panneau
function initFilterListeners() {
  const inputs = document.querySelectorAll('#filters-panel select, #filters-panel input');
  
  inputs.forEach(input => {
    // À chaque changement, on lance la fonction updateMap
    input.addEventListener('change', updateMap);
    // Pour les nombres, on peut aussi écouter 'input' pour du temps réel
    if(input.type === 'number') {
        input.addEventListener('input', updateMap);
    }
  });
}

// Fonction principale qui décide qui reste affiché
function updateMap() {
  // 1. Récupérer les valeurs choisies par l'utilisateur
  const selectedEpci = document.getElementById('filter-epci').value;
  const selectedCommune = document.getElementById('filter-commune').value;
  const selectedFriche = document.getElementById('filter-friche').value;
  
  const minSurf = parseFloat(document.getElementById('surface-min').value) || 0;
  const maxSurf = parseFloat(document.getElementById('surface-max').value) || Infinity;

  // Récupérer les statuts cochés (checkboxes)
  // On crée un tableau avec les valeurs des cases cochées (ex: ['friche sans projet', 'friche reconvertie'])
  const checkedStatusInputs = document.querySelectorAll('fieldset.filter-group input[type="checkbox"]:checked');
  const activeStatuses = Array.from(checkedStatusInputs).map(cb => cb.value);

  // 2. Boucler sur tous les marqueurs stockés
  markers.forEach(item => {
    const d = item.data; // les données brutes de la ligne CSV
    let isVisible = true;

    // --- Filtre EPCI ---
    if (selectedEpci && d.epci_nom !== selectedEpci) {
      isVisible = false;
    }

    // --- Filtre Commune ---
    if (isVisible && selectedCommune && d.comm_nom !== selectedCommune) {
      isVisible = false;
    }

    // --- Filtre Nom Friche ---
    if (isVisible && selectedFriche && d.site_nom !== selectedFriche) {
      isVisible = false;
    }

    // --- Filtre Statut (Checkbox) ---
    // On vérifie si le statut de la ligne est inclus dans la liste des cases cochées
    // Note: on met tout en minuscule pour éviter les erreurs de casse
    if (isVisible && activeStatuses.length > 0) {
       // Si le statut de la donnée n'est pas dans la liste des cochés -> on cache
       if (!activeStatuses.includes(d.site_statut)) {
         isVisible = false;
       }
    } else if (isVisible && activeStatuses.length === 0) {
       // Si l'utilisateur décoche tout, on considère qu'il ne veut rien voir (ou tout ? ici rien)
       isVisible = false; 
    }

    // --- Filtre Surface ---
    // Utilisation de la colonne unite_fonciere_surface
    const surf = d.unite_fonciere_surface || 0;
    if (isVisible) {
      if (surf < minSurf || surf > maxSurf) {
        isVisible = false;
      }
    }

    // 3. Appliquer la visibilité sur la carte
    if (isVisible) {
      item.marker.addTo(map);
    } else {
      map.removeLayer(item.marker);
    }
  });
}

/* ------------------------------------------------------------------------- */
/* 7. Gestion du panneau latéral (UI)                                       */
/* ------------------------------------------------------------------------- */
const toggleButton = document.getElementById('toggle-filters');
const filtersPanel = document.getElementById('filters-panel');

if (toggleButton && filtersPanel) {
  toggleButton.addEventListener('click', (e) => {
    e.stopPropagation(); // Empêche le clic de se propager à la carte
    filtersPanel.classList.toggle('open');
    
    // Petit bonus : changer le texte du bouton
    if(filtersPanel.classList.contains('open')){
        toggleButton.textContent = '✕ Fermer';
    } else {
        toggleButton.textContent = '☰ Filtres';
    }
  });
}

// Fermer le panneau si on clique sur la carte (UX sympa)
map.on('click', () => {
  filtersPanel.classList.remove('open');
  toggleButton.textContent = '☰ Filtres';
});
