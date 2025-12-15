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
let allData = [];          // Données CSV
let markers = [];          // Objets { marker, data }
let polygonsDict = {};     // Dictionnaire { site_id : layerLeaflet } pour les contours
let polygonsLayerGroup = L.layerGroup().addTo(map); // Groupe pour afficher les polygones visibles

// Configuration du Zoom pour les polygones
const ZOOM_THRESHOLD = 13; // Niveau de zoom min pour voir les contours

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
    
    // 4. Premier rendu (pour gérer les checkbox par défaut)
    updateMap(); 
  }
});

function loadGeoJsonData() {
  fetch('friches.geojson')
    .then(response => response.json())
    .then(geojson => {
      // Pour chaque entité du GeoJSON, on prépare le layer sans l'afficher tout de suite
      L.geoJSON(geojson, {
        style: function (feature) {
          // On cherche la ligne CSV correspondante pour avoir la couleur du statut
          // On suppose que le CSV a une colonne site_id et le GeoJSON une prop site_id
          const siteId = feature.properties.site_id; // ou feature.properties.id selon ton fichier
          const row = allData.find(d => d.site_id === siteId);
          const color = row ? getColorForStatus(row.site_statut) : '#3388ff';
          
          return {
            color: color,
            weight: 2,
            opacity: 1,
            fillOpacity: 0.2 // Légèrement transparent
          };
        },
        onEachFeature: function (feature, layer) {
          const id = feature.properties.site_id;
          if (id) {
            // On stocke le layer dans le dictionnaire avec l'ID comme clé
            polygonsDict[id] = layer;
            
            // Petit popup optionnel sur le polygone aussi
            if (feature.properties.nom || feature.properties.site_nom) {
               layer.bindPopup(feature.properties.nom || feature.properties.site_nom);
            }
          }
        }
      });
      
      console.log("GeoJSON chargé et indexé.");
      // Une fois chargé, on relance updateMap pour afficher ceux qui doivent l'être
      updateMap();
    })
    .catch(err => console.error("Erreur chargement GeoJSON :", err));
}

/* ------------------------------------------------------------------------- */
/* 4. Fonctions SVG et Marqueurs                                            */
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
  });
}

/* ------------------------------------------------------------------------- */
/* 5. Filtres Hiérarchiques (Cascade)                                       */
/* ------------------------------------------------------------------------- */
const selEpci = document.getElementById('filter-epci');
const selCommune = document.getElementById('filter-commune');
const selFriche = document.getElementById('filter-friche');

function initCascadingFilters() {
    // 1. Remplir EPCI
    populateSelect(selEpci, allData, 'epci_nom');

    // CORRECTION 1 : On appelle tout de suite les mises à jour 
    // pour peupler communes et friches avec "Tout" par défaut
    updateCommuneOptions();
    updateFricheOptions();

    // 2. Écouteurs
    selEpci.addEventListener('change', () => {
        updateCommuneOptions();
        updateFricheOptions();
        updateMap();
    });

    selCommune.addEventListener('change', () => {
        updateFricheOptions();
        updateMap();
    });

    selFriche.addEventListener('change', updateMap);
}

function populateSelect(selectElement, dataList, key) {
    const defaultOption = selectElement.options[0];
    selectElement.innerHTML = '';
    selectElement.appendChild(defaultOption);

    const values = [...new Set(dataList.map(d => d[key]))].filter(Boolean).sort();
    
    values.forEach(val => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = val;
        selectElement.appendChild(opt);
    });
}

function updateCommuneOptions() {
    const selectedEpci = selEpci.value;
    // Si EPCI vide, on prend tout, sinon on filtre
    const filteredData = selectedEpci 
        ? allData.filter(d => d.epci_nom === selectedEpci)
        : allData;

    populateSelect(selCommune, filteredData, 'comm_nom');
}

function updateFricheOptions() {
    const selectedEpci = selEpci.value;
    const selectedCommune = selCommune.value;

    let filteredData = allData;

    if (selectedEpci) filteredData = filteredData.filter(d => d.epci_nom === selectedEpci);
    if (selectedCommune) filteredData = filteredData.filter(d => d.comm_nom === selectedCommune);

    populateSelect(selFriche, filteredData, 'site_nom');
}

/* ------------------------------------------------------------------------- */
/* 6. Moteur de Filtrage (Markers + Polygones)                              */
/* ------------------------------------------------------------------------- */

function initFilterListeners() {
    document.querySelectorAll('fieldset input').forEach(input => {
        input.addEventListener('change', updateMap);
    });
    document.getElementById('surface-min').addEventListener('input', updateMap);
    document.getElementById('surface-max').addEventListener('input', updateMap);
}

// Écouteur de zoom pour afficher/cacher les polygones dynamiquement
map.on('zoomend', updateMap);

function updateMap() {
    const valEpci = selEpci.value;
    const valCommune = selCommune.value;
    const valFriche = selFriche.value;
    const surfMin = parseFloat(document.getElementById('surface-min').value) || 0;
    const surfMax = parseFloat(document.getElementById('surface-max').value) || Infinity;
    const checkedBoxes = document.querySelectorAll('fieldset input:checked');
    const allowedStatuses = Array.from(checkedBoxes).map(cb => cb.value);

    // On récupère le zoom actuel
    const currentZoom = map.getZoom();
    const showPolygons = currentZoom >= ZOOM_THRESHOLD;

    // On vide le groupe de polygones avant de le remplir à nouveau
    polygonsLayerGroup.clearLayers();

    markers.forEach(item => {
        const d = item.data;
        let visible = true;

        // --- Filtres Données ---
        if (valEpci && d.epci_nom !== valEpci) visible = false;
        if (visible && valCommune && d.comm_nom !== valCommune) visible = false;
        if (visible && valFriche && d.site_nom !== valFriche) visible = false;
        if (visible && !allowedStatuses.includes(d.site_statut)) visible = false;
        
        const s = d.unite_fonciere_surface || 0;
        if (visible && (s < surfMin || s > surfMax)) visible = false;

        // --- Gestion Affichage Marker ---
        if (visible) {
            if (!map.hasLayer(item.marker)) item.marker.addTo(map);
            
            // --- Gestion Affichage Polygone (Si zoom OK et friche visible) ---
            if (showPolygons && d.site_id && polygonsDict[d.site_id]) {
                polygonsLayerGroup.addLayer(polygonsDict[d.site_id]);
            }

        } else {
            if (map.hasLayer(item.marker)) map.removeLayer(item.marker);
            // Le polygone est géré par le clearLayers() au début, 
            // donc si visible=false, on ne le réajoute pas.
        }
    });
}

/* ------------------------------------------------------------------------- */
/* 7. UI Panneau                                                            */
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
