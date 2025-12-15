/* ------------------------------------------------------------------------- */
/* 1. Initialisation                                                        */
/* ------------------------------------------------------------------------- */
const map = L.map('map').setView([49.7, 4.7], 9);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

/* ------------------------------------------------------------------------- */
/* 2. Variables Globales                                                    */
/* ------------------------------------------------------------------------- */
let allData = [];
let markers = [];          // Objets { marker, data }
let markersDict = {};      // Nouveau : { site_id : markerLeaflet } pour lier polygone/popup
let polygonsDict = {};
let polygonsLayerGroup = L.layerGroup().addTo(map);
const ZOOM_THRESHOLD = 13;

/* ------------------------------------------------------------------------- */
/* 3. Chargement des données (CSV puis GeoJSON)                             */
/* ------------------------------------------------------------------------- */
Papa.parse('data.csv', {
  download: true,
  header: true,
  dynamicTyping: true,
  skipEmptyLines: true,

  complete: function (results) {
    allData = results.data;
    
    // 1. Créer les marqueurs
    addMarkers(allData);
    
    // 2. Initialiser les filtres (Listes déroulantes)
    initCascadingFilters();
    
    // 3. Charger le GeoJSON des contours
    loadGeoJsonData();
    
    // 4. Activer les écouteurs de statut et surface
    initFilterListeners(); 

    // 5. Premier rendu
    updateMap(); 
  }
});

function loadGeoJsonData() {
  fetch('friches.geojson')
    .then(response => response.json())
    .then(geojson => {
      L.geoJSON(geojson, {
        style: function (feature) {
          const siteId = feature.properties.site_id;
          const row = allData.find(d => d.site_id === siteId);
          const color = row ? getColorForStatus(row.site_statut) : '#3388ff';
          
          return {
            color: color,
            weight: 2,
            opacity: 1,
            fillOpacity: 0.2
          };
        },
        onEachFeature: function (feature, layer) {
          const id = feature.properties.site_id;
          if (id) {
            polygonsDict[id] = layer;
            
            // 🚩 NOUVEAUTÉ 1 : Lier le clic du polygone au popup du marqueur
            layer.on('click', function(e) {
                // S'assurer que le marqueur existe et est visible
                if(markersDict[id]) {
                    markersDict[id].openPopup();
                }
            });
            
            // Pas besoin de popup ici, on utilise celui du marqueur
            // layer.bindPopup(feature.properties.nom || feature.properties.site_nom);
          }
        }
      });
      updateMap();
    })
    .catch(err => console.error("Erreur chargement GeoJSON :", err));
}

/* ------------------------------------------------------------------------- */
/* 4. Fonctions SVG et Marqueurs (pas de changement)                        */
/* ------------------------------------------------------------------------- */

function getColorForStatus(status) {
  const colors = {
    "friche potentielle": "#aea397",
    "friche sans projet": "#745b47",
    "friche avec projet": "#2b7756",
    "friche reconvertie": "#99c221"
  };
  return colors[status] || "#777777";
}

function createSvgPicto(pictocol) {
  return `
<svg width="19.2" height="19.2" version="1.1" xmlns="http://www.w3.org/2000/svg">
  <rect x="3.6" y="3.6" width="12" height="12" rx="3"
       fill="${pictocol}" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round">
    <animate attributeName="x" dur="0.4s" begin="mouseover" from="3.6" to="1.6" fill="freeze"/>
    <animate attributeName="y" dur="0.4s" begin="mouseover" from="3.6" to="1.6" fill="freeze"/>
    <animate attributeName="width" dur="0.4s" begin="mouseover" from="12" to="16" fill="freeze"/>
    <animate attributeName="height" dur="0.4s" begin="mouseover" from="12" to="16" fill="freeze"/>
    <animate attributeName="stroke-width" dur="0.4s" begin="mouseover" from="1.6" to="3.2" fill="freeze"/>
    <animate attributeName="x" dur="0.4s" begin="mouseout" from="1.6" to="3.6" fill="freeze"/>
    <animate attributeName="y" dur="0.4s" begin="mouseout" from="1.6" to="3.6" fill="freeze"/>
    <animate attributeName="width" dur="0.4s" begin="mouseout" from="16" to="12" fill="freeze"/>
    <animate attributeName="height" dur="0.4s" begin="mouseout" from="16" to="12" fill="freeze"/>
    <animate attributeName="stroke-width" dur="0.4s" begin="mouseout" from="3.2" to="1.6" fill="freeze"/>
  </rect>
</svg>`;
}

function createPictoIcon(svg) {
  return L.divIcon({
    className: "picto",
    html: svg,
    iconSize: [19.2, 19.2],
    iconAnchor: [9.6, 9.6],
    popupAnchor: [0, -10]
  });
}

function addMarkers(rows) {
  markers.forEach(m => map.removeLayer(m.marker));
  markers = [];
  markersDict = {}; // Réinitialisation

  rows.forEach(row => {
    const lat = parseFloat(row.latitude);
    const lon = parseFloat(row.longitude);

    if (isNaN(lat) || isNaN(lon)) return;

    const pictocol = getColorForStatus(row.site_statut);
    const svgpicto = createSvgPicto(pictocol);
    const picto = createPictoIcon(svgpicto);

    const marker = L.marker([lat, lon], {
      icon: picto,
      title: row.site_nom,
      riseOnHover: true
    });

    const surf = row.unite_fonciere_surface ? row.unite_fonciere_surface + ' m²' : 'Non connue';
    marker.bindPopup(`
        <strong>${row.site_nom || 'Friche'}</strong><br>
        ${row.comm_nom}<br>
        <span style="color:${pictocol}">⬤</span> ${row.site_statut}<br>
        Surface: ${surf}
    `);

    marker.addTo(map); 
    
    markers.push({
      marker: marker,
      data: row
    });
    // Stockage du marqueur pour le lien avec le polygone (si site_id existe)
    if (row.site_id) {
        markersDict[row.site_id] = marker;
    }
  });
}

/* ------------------------------------------------------------------------- */
/* 5. Filtres Hiérarchiques (Cascade Intelligente)                          */
/* ------------------------------------------------------------------------- */
const selEpci = document.getElementById('filter-epci');
const selCommune = document.getElementById('filter-commune');
const selFriche = document.getElementById('filter-friche');

// 🚩 NOUVEAUTÉ 2 : Fonction utilitaire pour récupérer les données après filtre statut/surface
function getFilteredData() {
    const surfMin = parseFloat(document.getElementById('surface-min').value) || 0;
    const surfMax = parseFloat(document.getElementById('surface-max').value) || Infinity;
    const checkedBoxes = document.querySelectorAll('fieldset input:checked');
    const allowedStatuses = Array.from(checkedBoxes).map(cb => cb.value);

    return allData.filter(d => {
        // Filtre Statut
        if (!allowedStatuses.includes(d.site_statut)) return false;
        
        // Filtre Surface
        const s = d.unite_fonciere_surface || 0;
        if (s < surfMin || s > surfMax) return false;

        return true;
    });
}


function initCascadingFilters() {
    // Les listes doivent se mettre à jour à chaque changement de statut/surface
    
    // On appelle la mise à jour pour le remplissage initial
    updateFilterOptions();

    // Écouteurs pour les changements
    selEpci.addEventListener('change', updateFilterOptions);
    selCommune.addEventListener('change', updateFilterOptions);
    selFriche.addEventListener('change', updateMap);
}


function updateFilterOptions() {
    // 1. On récupère le sous-ensemble de données après filtrage (Statut/Surface)
    const baseData = getFilteredData();
    
    // 2. Mise à jour des EPCI (parmi les données restantes)
    populateSelect(selEpci, baseData, 'epci_nom');

    // 3. Mise à jour des Communes (basée sur EPCI sélectionné + baseData)
    const selectedEpci = selEpci.value;
    let filteredCommunes = baseData;
    if (selectedEpci) {
        filteredCommunes = filteredCommunes.filter(d => d.epci_nom === selectedEpci);
    }
    populateSelect(selCommune, filteredCommunes, 'comm_nom');
    
    // 4. Mise à jour des Friches (basée sur EPCI/Commune sélectionnés + baseData)
    const selectedCommune = selCommune.value;
    let filteredFriches = filteredCommunes; // On part de la liste des communes déjà filtrées
    if (selectedCommune) {
        filteredFriches = filteredFriches.filter(d => d.comm_nom === selectedCommune);
    }
    populateSelect(selFriche, filteredFriches, 'site_nom');
    
    // Une fois les listes mises à jour, on filtre la carte
    updateMap();
}


function populateSelect(selectElement, dataList, key) {
    // On garde l'option "Tous..."
    const defaultOptionValue = selectElement.options[0].value;
    const currentSelectedValue = selectElement.value; // On garde la valeur choisie si elle existe
    
    selectElement.innerHTML = '';
    
    const defaultOption = document.createElement('option');
    defaultOption.value = defaultOptionValue;
    defaultOption.textContent = `Toutes les ${key.split('_')[0]}s`; // Texte générique
    selectElement.appendChild(defaultOption);

    const values = [...new Set(dataList.map(d => d[key]))].filter(Boolean).sort();
    
    values.forEach(val => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = val;
        selectElement.appendChild(opt);
    });

    // Réappliquer la valeur sélectionnée si elle est encore dans la liste
    if (currentSelectedValue && selectElement.querySelector(`option[value="${currentSelectedValue}"]`)) {
        selectElement.value = currentSelectedValue;
    } else {
        // Sinon, on sélectionne l'option "Tous..." (la première)
        selectElement.value = defaultOptionValue;
    }
}


/* ------------------------------------------------------------------------- */
/* 6. Moteur de Filtrage (Markers + Polygones)                              */
/* ------------------------------------------------------------------------- */

function initFilterListeners() {
    // Les changements de Statut ou Surface mettent à jour les listes ET la carte
    document.querySelectorAll('fieldset input, #surface-min, #surface-max').forEach(input => {
        input.addEventListener('change', updateFilterOptions);
        if(input.type === 'number') {
            input.addEventListener('input', updateFilterOptions);
        }
    });
}

map.on('zoomend', updateMap);

function updateMap() {
    const valEpci = selEpci.value;
    const valCommune = selCommune.value;
    const valFriche = selFriche.value;
    
    // On utilise la fonction getFilteredData pour la base du tri
    const baseFilteredData = getFilteredData(); 
    
    const currentZoom = map.getZoom();
    const showPolygons = currentZoom >= ZOOM_THRESHOLD;

    polygonsLayerGroup.clearLayers();

    markers.forEach(item => {
        const d = item.data;
        let visible = false;

        // On vérifie d'abord si la donnée passe les filtres Statut et Surface
        const isBaseVisible = baseFilteredData.some(b => b === d);

        // Si elle passe la base du filtre, on applique la cascade (EPCI, Commune, Friche)
        if (isBaseVisible) {
            visible = true;
            if (valEpci && d.epci_nom !== valEpci) visible = false;
            if (visible && valCommune && d.comm_nom !== valCommune) visible = false;
            if (visible && valFriche && d.site_nom !== valFriche) visible = false;
        }

        // --- Gestion Affichage Marker et Polygone ---
        if (visible) {
            if (!map.hasLayer(item.marker)) item.marker.addTo(map);
            
            if (showPolygons && d.site_id && polygonsDict[d.site_id]) {
                polygonsLayerGroup.addLayer(polygonsDict[d.site_id]);
            }
        } else {
            if (map.hasLayer(item.marker)) map.removeLayer(item.marker);
        }
    });
}

/* ------------------------------------------------------------------------- */
/* 7. UI Panneau (pas de changement)                                        */
/* ------------------------------------------------------------------------- */
const btnOpen = document.getElementById('toggle-filters');
const btnClose = document.getElementById('close-filters');
const panel = document.getElementById('filters-panel');

if (btnOpen && panel) {
    btnOpen.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.classList.add('open');
    });
}
if (btnClose && panel) {
    btnClose.addEventListener('click', () => {
        panel.classList.remove('open');
    });
}
map.on('click', () => {
    panel.classList.remove('open');
});
