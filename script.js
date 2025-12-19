const bounds = L.latLngBounds([48, 1], [52, 8]);
const ZOOM_THRESHOLD = 13;

const map = L.map('map', {
    minZoom: 8, maxZoom: 18,
    maxBounds: bounds, maxBoundsViscosity: 1.0
}).setView([49.7, 4.7], 9);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
}).addTo(map);

let allData = [];
let markers = [];
let markersDict = {};
let polygonsDict = {};
const polygonsLayerGroup = L.layerGroup().addTo(map);
const ardennesLayerGroup = L.layerGroup().addTo(map);

const selEpci = document.getElementById('filter-epci');
const selCommune = document.getElementById('filter-commune');
const selFriche = document.getElementById('filter-friche');

// 1. Marqueurs SVG Originaux (Conservés avec riseOnHover)
function getColorForStatus(s) {
    const colors = { "friche potentielle": "#aea397", "friche sans projet": "#745b47", "friche avec projet": "#2b7756", "friche reconvertie": "#99c221" };
    return colors[s] || "#777";
}

function createSvgPicto(pictocol) {
    return `<svg width="19.2" height="19.2" version="1.1" xmlns="http://www.w3.org/2000/svg">
      <rect x="3.6" y="3.6" width="12" height="12" rx="3" fill="${pictocol}" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round">
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
      </rect></svg>`;
}

// 2. Chargement des données
Papa.parse('data.csv', {
    download: true, header: true, dynamicTyping: true, skipEmptyLines: true,
    complete: function (results) {
        allData = results.data;
        const maxS = Math.max(...allData.map(d => d.unite_fonciere_surface || 0));
        document.getElementById('surface-max').value = Math.ceil(maxS / 1000) * 1000;
        
        loadArdennesOutline();
        loadGeoJsonData();
        addMarkers(allData);
        initCascadingFilters();
        updateMap(false);
    }
});

function addMarkers(rows) {
    markers.forEach(m => map.removeLayer(m.marker));
    markers = [];
    rows.forEach(row => {
        const lat = parseFloat(row.latitude), lon = parseFloat(row.longitude);
        if (isNaN(lat)) return;

        const marker = L.marker([lat, lon], {
            icon: L.divIcon({ 
                className: "picto", 
                html: createSvgPicto(getColorForStatus(row.site_statut)), 
                iconSize: [19.2, 19.2], 
                iconAnchor: [9.6, 9.6], 
                popupAnchor: [0, -10] 
            }),
            riseOnHover: true 
        });

        // Traitement Propriétaires
        const pRaw = row.proprio_nom || "";
        const pArray = pRaw.split('|').map(p => p.trim() === "_X_" ? "(anonymisé)" : p.trim());
        const labelProprio = pArray.length > 1 ? "Propriétaires" : "Propriétaire";
        
        // Traitement Pollution
        const pollutionClean = (row.sol_pollution_existe || "").replace(/pollution /gi, "").trim();

        const imagePath = `photos/${row.site_id}.webp`;
        const altText = `Photo ${row.site_nom} à ${row.comm_nom}`;

        const popupContent = `
            <div class="popup-header-site">${row.site_nom || 'Friche'}</div>
            <span class="popup-commune">${row.comm_nom || ''}</span>
            <hr class="popup-sep">
            <img src="${imagePath}" class="popup-img" alt="${altText}" onerror="this.outerHTML='<span class=\'img-alt-text\'>${altText}</span>'"/>
            <div class="popup-details">
                <div><strong>Statut :</strong> ${row.site_statut}</div>
                <div><strong>Surface :</strong> ${row.unite_fonciere_surface ? row.unite_fonciere_surface.toLocaleString() + ' m²' : 'Inconnue'}</div>
                <div><strong>Pollution :</strong> ${pollutionClean || 'Inconnue'}</div>
                <div><strong>${labelProprio} :</strong> ${pArray.join(', ')}</div>
            </div>`;

        marker.bindPopup(popupContent);
        markers.push({ marker, data: row });
        if (row.site_id) markersDict[row.site_id] = marker;
    });
}

function loadArdennesOutline() {
    fetch('ardennes.geojson').then(r => r.json()).then(geojson => {
        L.geoJSON(geojson, { style: { color: '#ffffff', weight: 5, opacity: 1, fillOpacity: 0, interactive: false } }).addTo(ardennesLayerGroup);
        L.geoJSON(geojson, { style: { color: '#422d58', weight: 2, opacity: 1, fillOpacity: 0, interactive: false } }).addTo(ardennesLayerGroup);
    });
}

function loadGeoJsonData() {
    fetch('friches.geojson').then(r => r.json()).then(geojson => {
        L.geoJSON(geojson, {
            style: (f) => {
                const row = allData.find(d => d.site_id === f.properties.site_id);
                return { color: row ? getColorForStatus(row.site_statut) : '#3388ff', weight: 2, opacity: 1, fillOpacity: 0.3 };
            },
            onEachFeature: (f, layer) => {
                const id = f.properties.site_id;
                if (id) {
                    polygonsDict[id] = layer;
                    layer.on('click', (e) => { L.DomEvent.stopPropagation(e); if(markersDict[id]) markersDict[id].openPopup(); });
                }
            }
        });
        updateMap(false);
    });
}

// 3. Mécanique des filtres (Restaurée)
function getFilteredData() {
    const sMin = parseFloat(document.getElementById('surface-min').value) || 0;
    const sMax = parseFloat(document.getElementById('surface-max').value) || Infinity;
    const allowed = Array.from(document.querySelectorAll('.checkbox-list input:checked')).map(cb => cb.value);

    return allData.filter(d => {
        if (!allowed.includes(d.site_statut)) return false;
        const s = d.unite_fonciere_surface || 0;
        return (s >= sMin && s <= sMax);
    });
}

function updateMap(shouldFit = false) {
    const baseFiltered = getFilteredData();
    const showPolygons = map.getZoom() >= ZOOM_THRESHOLD;
    polygonsLayerGroup.clearLayers();

    markers.forEach(item => {
        const d = item.data;
        let visible = baseFiltered.includes(d);
        if (visible && selEpci.value && d.epci_nom !== selEpci.value) visible = false;
        if (visible && selCommune.value && d.comm_nom !== selCommune.value) visible = false;
        if (visible && selFriche.value && d.site_nom !== selFriche.value) visible = false;

        if (visible) {
            if (!map.hasLayer(item.marker)) item.marker.addTo(map);
            if (showPolygons && d.site_id && polygonsDict[d.site_id]) polygonsLayerGroup.addLayer(polygonsDict[d.site_id]);
        } else {
            map.removeLayer(item.marker);
        }
    });
    if (shouldFit) fitMap();
}

function fitMap() {
    const coords = markers.filter(i => map.hasLayer(i.marker)).map(i => i.marker.getLatLng());
    if (coords.length > 0) map.fitBounds(L.latLngBounds(coords), { padding: [40, 40], maxZoom: 15 });
}

function initCascadingFilters() {
    const filters = ['.checkbox-list input', '#surface-min', '#surface-max'];
    filters.forEach(s => document.querySelectorAll(s).forEach(el => el.addEventListener('change', updateFilterOptions)));
    
    selEpci.addEventListener('change', updateFilterOptions);
    selCommune.addEventListener('change', updateFilterOptions);
    selFriche.addEventListener('change', () => updateMap(true));
    map.on('zoomend', () => updateMap(false));
}

function updateFilterOptions() {
    const data = getFilteredData();
    populateSelect(selEpci, data, 'epci_nom', '- Tous les EPCI -');
    let fComm = data;
    if (selEpci.value) fComm = fComm.filter(d => d.epci_nom === selEpci.value);
    populateSelect(selCommune, fComm, 'comm_nom', '- Toutes les communes -');
    let fFriche = fComm;
    if (selCommune.value) fFriche = fFriche.filter(d => d.comm_nom === selCommune.value);
    populateSelect(selFriche, fFriche, 'site_nom', '- Toutes les friches -');
    updateMap(true);
}

function populateSelect(s, d, k, t) {
    const val = s.value;
    s.innerHTML = `<option value="">${t}</option>`;
    const opts = [...new Set(d.map(i => i[k]))].filter(Boolean).sort();
    opts.forEach(o => { const opt = document.createElement('option'); opt.value = o; opt.textContent = o; s.appendChild(opt); });
    if ([...s.options].some(o => o.value === val)) s.value = val;
}

const panel = document.getElementById('filters-panel');
document.getElementById('toggle-filters').addEventListener('click', (e) => { e.stopPropagation(); panel.classList.add('open'); });
document.getElementById('close-filters').addEventListener('click', () => panel.classList.remove('open'));
map.on('click', () => panel.classList.remove('open'));
