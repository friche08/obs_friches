/* ------------------------------------------------------------------------- */
/* 1. Initialisation                                                         */
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
let ardennesLayerGroup = L.layerGroup().addTo(map);

const ZOOM_THRESHOLD = 13;

const selEpci = document.getElementById('filter-epci');
const selCommune = document.getElementById('filter-commune');
const selFriche = document.getElementById('filter-friche');

/* ------------------------------------------------------------------------- */
/* 3. Chargement des données                                                 */
/* ------------------------------------------------------------------------- */
Papa.parse('data.csv', {
    download: true,
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    complete: function (results) {
        allData = results.data;
        addMarkers(allData);
        loadGeoJsonData();
        loadArdennesOutline(); 
        initCascadingFilters();
        initFilterListeners(); 
        updateMap(false); 
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
                    return { color: color, weight: 2, opacity: 1, fillOpacity: 0.2 };
                },
                onEachFeature: function (feature, layer) {
                    const id = feature.properties.site_id;
                    if (id) {
                        polygonsDict[id] = layer;
                        layer.on('click', () => { if(markersDict[id]) markersDict[id].openPopup(); });
                    }
                }
            });
            updateMap(false);
        })
        .catch(err => console.error("Erreur GeoJSON Friches :", err));
}

function loadArdennesOutline() {
    fetch('ardennes.geojson')
        .then(response => response.json())
        .then(geojson => {
            L.geoJSON(geojson, {
                style: { color: '#ffffff', weight: 5, opacity: 1, fillOpacity: 0, interactive: false }
            }).addTo(ardennesLayerGroup);
            L.geoJSON(geojson, {
                style: { color: '#422d58', weight: 2, opacity: 1, fillOpacity: 0, interactive: false }
            }).addTo(ardennesLayerGroup);
        })
        .catch(err => console.error("Erreur GeoJSON Ardennes :", err));
}

/* ------------------------------------------------------------------------- */
/* 4. Logique de Filtrage                                                    */
/* ------------------------------------------------------------------------- */

function getFilteredData() {
    const surfMin = parseFloat(document.getElementById('surface-min').value) || 0;
    const surfMax = parseFloat(document.getElementById('surface-max').value) || Infinity;
    const checkedBoxes = document.querySelectorAll('fieldset input:checked');
    const allowedStatuses = Array.from(checkedBoxes).map(cb => cb.value);

    return allData.filter(d => {
        if (!allowedStatuses.includes(d.site_statut)) return false;
        const s = d.unite_fonciere_surface || 0;
        return (s >= surfMin && s <= surfMax);
    });
}

function initCascadingFilters() {
    updateFilterOptions();
    selEpci.addEventListener('change', updateFilterOptions);
    selCommune.addEventListener('change', updateFilterOptions);
    selFriche.addEventListener('change', () => updateMap(true));
}

function updateFilterOptions() {
    const baseData = getFilteredData();
    populateSelect(selEpci, baseData, 'epci_nom', '- Tous les EPCI -');
    const selectedEpci = selEpci.value;
    let filteredCommunes = baseData;
    if (selectedEpci) filteredCommunes = filteredCommunes.filter(d => d.epci_nom === selectedEpci);
    populateSelect(selCommune, filteredCommunes, 'comm_nom', '- Toutes les communes -');
    const selectedCommune = selCommune.value;
    let filteredFriches = filteredCommunes; 
    if (selectedCommune) filteredFriches = filteredFriches.filter(d => d.comm_nom === selectedCommune);
    populateSelect(selFriche, filteredFriches, 'site_nom', '- Toutes les friches -');
    updateMap(true);
}

function populateSelect(selectElement, dataList, key, defaultText) {
    const currentVal = selectElement.value;
    selectElement.innerHTML = `<option value="">${defaultText}</option>`;
    const values = [...new Set(dataList.map(d => d[key]))].filter(Boolean).sort();
    values.forEach(val => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = val;
        selectElement.appendChild(opt);
    });
    if ([...selectElement.options].some(o => o.value === currentVal)) {
        selectElement.value = currentVal;
    }
}

function initFilterListeners() {
    document.querySelectorAll('fieldset input, #surface-min, #surface-max').forEach(input => {
        input.addEventListener('change', updateFilterOptions);
        if(input.type === 'number') input.addEventListener('input', updateFilterOptions);
    });
}

/* ------------------------------------------------------------------------- */
/* 5. Moteur de rendu et Zoom Automatique                                    */
/* ------------------------------------------------------------------------- */
map.on('zoomend', () => updateMap(false));

function updateMap(shouldFitBounds = false) {
    const valEpci = selEpci.value;
    const valCommune = selCommune.value;
    const valFriche = selFriche.value;
    const baseFilteredData = getFilteredData(); 
    const showPolygons = map.getZoom() >= ZOOM_THRESHOLD;

    polygonsLayerGroup.clearLayers();

    markers.forEach(item => {
        const d = item.data;
        let visible = baseFilteredData.includes(d);
        if (visible) {
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

    if (shouldFitBounds) fitMapToVisibleMarkers();
}

function fitMapToVisibleMarkers() {
    const visibleCoords = markers
        .filter(item => map.hasLayer(item.marker))
        .map(item => item.marker.getLatLng());
    if (visibleCoords.length > 0) {
        const markerBounds = L.latLngBounds(visibleCoords);
        map.fitBounds(markerBounds, { padding: [40, 40], maxZoom: 15 });
    }
}

/* ------------------------------------------------------------------------- */
/* 6. Fonctions SVG et Marqueurs (Popup modifié)                             */
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
    return `<svg width="19.2" height="19.2" version="1.1" xmlns="http://www.w3.org/2000/svg">
      <rect x="3.6" y="3.6" width="12" height="12" rx="3" fill="${pictocol}" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round">
        <animate attributeName="x" dur="0.4s" begin="mouseover" from="3.6" to="1.6" fill="freeze"/><animate attributeName="y" dur="0.4s" begin="mouseover" from="3.6" to="1.6" fill="freeze"/><animate attributeName="width" dur="0.4s" begin="mouseover" from="12" to="16" fill="freeze"/><animate attributeName="height" dur="0.4s" begin="mouseover" from="12" to="16" fill="freeze"/><animate attributeName="stroke-width" dur="0.4s" begin="mouseover" from="1.6" to="3.2" fill="freeze"/><animate attributeName="x" dur="0.4s" begin="mouseout" from="1.6" to="3.6" fill="freeze"/><animate attributeName="y" dur="0.4s" begin="mouseout" from="1.6" to="3.6" fill="freeze"/><animate attributeName="width" dur="0.4s" begin="mouseout" from="16" to="12" fill="freeze"/><animate attributeName="height" dur="0.4s" begin="mouseout" from="16" to="12" fill="freeze"/><animate attributeName="stroke-width" dur="0.4s" begin="mouseout" from="3.2" to="1.6" fill="freeze"/>
      </rect></svg>`;
}

function createPictoIcon(svg) {
    return L.divIcon({ className: "picto", html: svg, iconSize: [19.2, 19.2], iconAnchor: [9.6, 9.6], popupAnchor: [0, -10] });
}

function addMarkers(rows) {
    markers.forEach(m => map.removeLayer(m.marker));
    markers = [];
    markersDict = {};
    rows.forEach(row => {
        const lat = parseFloat(row.latitude), lon = parseFloat(row.longitude);
        if (isNaN(lat) || isNaN(lon)) return;

        const marker = L.marker([lat, lon], {
            icon: createPictoIcon(createSvgPicto(getColorForStatus(row.site_statut))),
            title: row.site_nom,
            riseOnHover: true
        });

        // 1. Traitement de la Pollution (enlever le mot "pollution")
        let rawPollution = row.sol_pollution_existe || 'Non renseignée';
        let valPollution = rawPollution.replace(/pollution/gi, '').trim();
        valPollution = valPollution.charAt(0).toUpperCase() + valPollution.slice(1);

        // 2. Traitement des Propriétaires (pluralité et anonymisation)
        let rawProprio = row.proprio_nom ? String(row.proprio_nom) : '';
        let labelProprio = 'Propriétaire';
        let valProprio = 'Non renseigné';
        if (rawProprio) {
            const list = rawProprio.split('|').map(p => p.trim() === '_X_' ? '(anonymisé)' : p.trim());
            if (list.length > 1) labelProprio = 'Propriétaires';
            valProprio = list.join(', ');
        }

        // 3. Construction du Popup
        const imagePath = `photos/${row.site_id}.webp`;
        const altText = `Photo ${row.site_nom} à ${row.comm_nom}`;
        const surf = row.unite_fonciere_surface ? row.unite_fonciere_surface + ' m²' : 'Non connue';

        const popupContent = `
            <div style="font-family: sans-serif; line-height: 1.4;">
                <div style="font-weight: bold; font-size: 1.2em;">${row.site_nom || 'Friche'}</div>
                <div style="font-style: italic; color: #555; margin-bottom: 5px;">${row.comm_nom || ''}</div>
                <hr style="border: 0; border-top: 1px solid #ccc; margin: 8px 0;">
                <div style="text-align: center;">
                    <img src="${imagePath}" style="max-width: 100%; border-radius: 4px;" 
                         onerror="this.style.display='none'">
                    <div style="font-size: 0.8em; color: #999; margin-top: 2px;">${altText}</div>
                </div>
                <div style="margin-top: 8px;">
                    <div><strong>Statut :</strong> ${row.site_statut}</div>
                    <div><strong>Surface :</strong> ${surf}</div>
                    <div><strong>Pollution :</strong> ${valPollution}</div>
                    <div><strong>${labelProprio} :</strong> ${valProprio}</div>
                </div>
            </div>`;

        marker.bindPopup(popupContent, { minWidth: 300 });
        marker.addTo(map);
        markers.push({ marker, data: row });
        if (row.site_id) markersDict[row.site_id] = marker;
    });
}

/* ------------------------------------------------------------------------- */
/* 7. UI Panneau                                                             */
/* ------------------------------------------------------------------------- */
const panel = document.getElementById('filters-panel');
document.getElementById('toggle-filters')?.addEventListener('click', (e) => { e.stopPropagation(); panel.classList.add('open'); });
document.getElementById('close-filters')?.addEventListener('click', () => panel.classList.remove('open'));
map.on('click', () => panel.classList.remove('open'));
