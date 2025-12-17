/* ------------------------------------------------------------------------- */
/* 1. Initialisation (Mise à jour)                                           */
/* ------------------------------------------------------------------------- */
const bounds = L.latLngBounds([48, 1], [52, 8]);

const map = L.map('map', {
    minZoom: 8,
    maxZoom: 18,
    maxBounds: bounds,
    maxBoundsViscosity: 1.0
}).setView([49.7, 4.7], 9);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

/* ------------------------------------------------------------------------- */
/* 2. Variables Globales                                                     */
/* ------------------------------------------------------------------------- */
let allData = [];
let markers = [];
let markersDict = {};
let polygonsDict = {};
let polygonsLayerGroup = L.layerGroup().addTo(map);
// Nouveau : Groupe pour les limites du département
let ardennesLayerGroup = L.layerGroup().addTo(map);

const ZOOM_THRESHOLD = 13;

/* ------------------------------------------------------------------------- */
/* 3. Chargement des données (CSV, GeoJSON friches, GeoJSON Ardennes)        */
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
        
        // 2. Initialiser les filtres
        initCascadingFilters();
        
        // 3. Charger les contours des friches
        loadGeoJsonData();

        // 4. Charger les limites du département (Ardennes)
        loadArdennesOutline();
        
        // 5. Activer les écouteurs
        initFilterListeners(); 

        // 6. Premier rendu
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
                        layer.on('click', function(e) {
                            if(markersDict[id]) {
                                markersDict[id].openPopup();
                            }
                        });
                    }
                }
            });
            updateMap();
        })
        .catch(err => console.error("Erreur chargement GeoJSON friches :", err));
}

// --- AJOUT : Chargement des limites des Ardennes ---
function loadArdennesOutline() {
    fetch('ardennes.geojson')
        .then(response => response.json())
        .then(geojson => {
            // 1. Tracé du dessous : blanc large (5px)
            L.geoJSON(geojson, {
                style: {
                    color: '#ffffff',
                    weight: 5,
                    opacity: 1,
                    fillOpacity: 0,
                    interactive: false // Ne bloque pas le clic
                }
            }).addTo(ardennesLayerGroup);

            // 2. Tracé du dessus : violet fin (2px)
            L.geoJSON(geojson, {
                style: {
                    color: '#422d58',
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0,
                    interactive: false // Ne bloque pas le clic
                }
            }).addTo(ardennesLayerGroup);
        })
        .catch(err => console.error("Erreur chargement Ardennes GeoJSON :", err));
}

/* ------------------------------------------------------------------------- */
/* 4. Fonctions SVG et Marqueurs                                             */
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
    markersDict = {};

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

        const imagePath = `photos/${row.site_id}.webp`;
        const safeSite = (row.site_nom || '').replace(/"/g, ''); 
        const safeComm = (row.comm_nom || '').replace(/"/g, '');
        const altText = `Photo ${safeSite} à ${safeComm}`;

        let rawProprio = row.proprio_nom ? String(row.proprio_nom) : '';
        let labelProprio = 'Propriétaire';
        let valProprio = 'Non renseigné';

        if (rawProprio) {
            const propriosList = rawProprio.split('|').map(p => {
                p = p.trim();
                return p === '_X_' ? '(anonymisé)' : p;
            });
            if (propriosList.length > 1) labelProprio = 'Propriétaires';
            valProprio = propriosList.join(', ');
        }

        let rawPollution = row.sol_pollution_existe || 'Non renseignée';
        let valPollution = rawPollution.replace(/pollution/gi, '').trim(); 
        valPollution = valPollution.charAt(0).toUpperCase() + valPollution.slice(1);

        const popupContent = `
            <div class="popup-header">
                <h3 class="popup-title">${row.site_nom || 'Friche'}</h3>
                <div class="popup-subtitle">${row.comm_nom || ''}</div>
            </div>
            <hr class="popup-separator">
            <div class="img-container">
                <img src="${imagePath}" 
                     alt="${altText}" 
                     class="popup-img"
                     onerror="this.parentElement.style.display='none'"/>
                <div class="img-caption">${altText}</div>
            </div>
            <div class="popup-details">
                <div><strong>Statut :</strong> ${row.site_statut}</div>
                <div><strong>Surface :</strong> ${row.unite_fonciere_surface ? row.unite_fonciere_surface + ' m²' : 'Non connue'}</div>
                <div><strong>Pollution :</strong> ${valPollution}</div>
                <div><strong>${labelProprio} :</strong> ${valProprio}</div>
            </div>`;

        marker.bindPopup(popupContent);
        marker.addTo(map);
        
        markers.push({ marker: marker, data: row });
        if (row.site_id) {
            markersDict[row.site_id] = marker;
        }
    });
}

/* ------------------------------------------------------------------------- */
/* 5. Filtres Hiérarchiques (Cascade Intelligente)                           */
/* ------------------------------------------------------------------------- */
const selEpci = document.getElementById('filter-epci');
const selCommune = document.getElementById('filter-commune');
const selFriche = document.getElementById('filter-friche');

function getFilteredData() {
    const surfMin = parseFloat(document.getElementById('surface-min').value) || 0;
    const surfMax = parseFloat(document.getElementById('surface-max').value) || Infinity;
    const checkedBoxes = document.querySelectorAll('fieldset input:checked');
    const allowedStatuses = Array.from(checkedBoxes).map(cb => cb.value);

    return allData.filter(d => {
        if (!allowedStatuses.includes(d.site_statut)) return false;
        const s = d.unite_fonciere_surface || 0;
        if (s < surfMin || s > surfMax) return false;
        return true;
    });
}

function initCascadingFilters() {
    updateFilterOptions();
    selEpci.addEventListener('change', updateFilterOptions);
    selCommune.addEventListener('change', updateFilterOptions);
    selFriche.addEventListener('change', updateMap);
}

function updateFilterOptions() {
    const baseData = getFilteredData();
    populateSelect(selEpci, baseData, 'epci_nom');

    const selectedEpci = selEpci.value;
    let filteredCommunes = baseData;
    if (selectedEpci) {
        filteredCommunes = filteredCommunes.filter(d => d.epci_nom === selectedEpci);
    }
    populateSelect(selCommune, filteredCommunes, 'comm_nom');
    
    const selectedCommune = selCommune.value;
    let filteredFriches = filteredCommunes; 
    if (selectedCommune) {
        filteredFriches = filteredFriches.filter(d => d.comm_nom === selectedCommune);
    }
    populateSelect(selFriche, filteredFriches, 'site_nom');
    
    updateMap();
}

function populateSelect(selectElement, dataList, key) {
    const defaultOptionValue = selectElement.options[0].value;
    const currentSelectedValue = selectElement.value;
    
    selectElement.innerHTML = '';
    const defaultOption = document.createElement('option');
    defaultOption.value = defaultOptionValue;

    let defaultText = ''; 
    if (key === 'epci_nom') defaultText = '- Tous les EPCI -';
    else if (key === 'comm_nom') defaultText = '- Toutes les communes -';
    else if (key === 'site_nom') defaultText = '- Toutes les friches -';
    else defaultText = `Toutes les ${key.split('_')[0]}s`; 
    
    defaultOption.textContent = defaultText;
    selectElement.appendChild(defaultOption);

    const values = [...new Set(dataList.map(d => d[key]))].filter(Boolean).sort();
    
    values.forEach(val => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = val;
        selectElement.appendChild(opt);
    });

    if (currentSelectedValue && selectElement.querySelector(`option[value="${currentSelectedValue}"]`)) {
        selectElement.value = currentSelectedValue;
    } else {
        selectElement.value = defaultOptionValue;
    }
}

/* ------------------------------------------------------------------------- */
/* 6. Moteur de Filtrage (Markers + Polygones)                               */
/* ------------------------------------------------------------------------- */
function initFilterListeners() {
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
    const baseFilteredData = getFilteredData(); 
    const currentZoom = map.getZoom();
    const showPolygons = currentZoom >= ZOOM_THRESHOLD;

    polygonsLayerGroup.clearLayers();

    markers.forEach(item => {
        const d = item.data;
        let visible = false;
        const isBaseVisible = baseFilteredData.some(b => b === d);

        if (isBaseVisible) {
            visible = true;
            if (valEpci && d.epci_nom !== valEpci) visible = false;
            if (visible && valCommune && d.comm_nom !== valCommune) visible = false;
            if (visible && valFriche && d.site_nom !== valFriche) visible = false;
        }

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
/* 7. UI Panneau                                                             */
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
