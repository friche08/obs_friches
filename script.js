const bounds = L.latLngBounds([48, 1], [52, 8]);
const ZOOM_THRESHOLD = 13;
const CADASTRE_ZOOM_THRESHOLD = 15;

const statusColors = {
    "friche avec projet": "#2b7756",
    "friche sans projet": "#745b47",
    "friche reconvertie": "#99c221",
    "friche potentielle": "#aea397"
};

function getColorForStatus(s) {
    return statusColors[s] || "#777";
}

// 1. Fonctions de création des pictogrammes animés
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

// Configuration des couches
const osmHot = L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', { attribution: '&copy; OSM' });
const osmStandard = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM' });
const ignCarte = L.tileLayer('https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image%2Fpng', { attribution: '&copy; IGN' });
const ignOrtho = L.tileLayer('https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image%2Fjpeg', { attribution: '&copy; IGN' });

const cadastreLayer = L.tileLayer('https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=CADASTRALPARCELS.PARCELS&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image%2Fpng', {
    minZoom: CADASTRE_ZOOM_THRESHOLD, maxZoom: 19, opacity: 0.7, attribution: '&copy; IGN-DGFiP'
});

let isCadastreChecked = false;
const map = L.map('map', {
    minZoom: 8, maxZoom: 18, maxBounds: bounds, maxBoundsViscosity: 1.0, layers: [osmHot],
    zoomControl: false 
}).setView([49.7, 4.7], 9);

L.control.zoom({ position: 'bottomright' }).addTo(map);

// --- GESTION DES COUCHES ---
const baseMaps = { "OSM Humanitarian": osmHot, "OSM Standard": osmStandard, "Plan IGN": ignCarte, "Vue aérienne": ignOrtho };
const overlayMaps = { "Cadastre": cadastreLayer };

const layerControl = L.control.layers(baseMaps, overlayMaps, { collapsed: true, position: 'bottomleft' }).addTo(map);

const layerControlContainer = document.querySelector('.leaflet-control-layers');
const layerBtn = document.querySelector('.leaflet-control-layers-toggle');
layerBtn.innerHTML = `<svg viewBox="0 0 30 30" fill="none" stroke-width="2" xmlns="http://www.w3.org/2000/svg"><path d="M7 10.5 L15 5.5 L23 10.5 L15 15.5 Z" stroke="currentColor"/><path d="M24.34 14.16 L15 20 L5.66 14.16" stroke="currentColor"/><path d="M24.34 18.66 L15 24.5 L5.66 18.66" stroke="currentColor"/></svg>`;

// --- LÉGENDE DYNAMIQUE ---
const LegendControl = L.Control.extend({
    options: { position: 'bottomleft' },
    onAdd: function() {
        const container = L.DomUtil.create('div', 'leaflet-control custom-legend-container');
        const button = L.DomUtil.create('a', 'legend-toggle-btn', container);
        button.href = '#';
        button.innerHTML = `<svg viewBox="0 0 30 30" fill="none" stroke-width="2" xmlns="http://www.w3.org/2000/svg"><rect x="7" y="7" width="5" height="5" stroke="currentColor"/><circle cx="9.5" cy="20" r="2.5" stroke="currentColor"/><path d="M16 8 H24 M16 15 H24 M16 22 H24" stroke="currentColor"/></svg>`;
        const content = L.DomUtil.create('div', 'legend-content', container);
        content.id = 'legend-dynamic-content';
        L.DomEvent.on(container, 'mouseenter', () => {
            L.DomUtil.addClass(container, 'legend-expanded');
            layerControlContainer.classList.remove('leaflet-control-layers-expanded');
        });
        L.DomEvent.on(container, 'mouseleave', () => L.DomUtil.removeClass(container, 'legend-expanded'));
        L.DomEvent.disableClickPropagation(container);
        return container;
    }
});
map.addControl(new LegendControl());

function updateLegend() {
    const contentDiv = document.getElementById('legend-dynamic-content');
    if(!contentDiv) return;
    contentDiv.innerHTML = '';
    const order = ["friche avec projet", "friche sans projet", "friche reconvertie", "friche potentielle"];
    const checkedStatuses = Array.from(document.querySelectorAll('.checkbox-list input:checked')).map(cb => cb.value);
    order.forEach(status => {
        if(checkedStatuses.includes(status)) {
            const item = L.DomUtil.create('div', 'legend-item', contentDiv);
            item.innerHTML = `<span class="legend-swatch" style="background:${statusColors[status]}"></span><span class="legend-label">${status}</span>`;
        }
    });
}

const filterBtn = document.getElementById('toggle-filters');
filterBtn.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg><span class="btn-text">Filtres</span>`;

// --- DONNÉES ET MARQUEURS ---
let allData = [], markers = [], markersDict = {}, polygonsDict = {};
const polygonsLayerGroup = L.layerGroup().addTo(map);
const ardennesLayerGroup = L.layerGroup().addTo(map);

Papa.parse('data.csv', {
    download: true, header: true, dynamicTyping: true, skipEmptyLines: true,
    complete: function (results) {
        allData = results.data;
        const maxS = Math.max(...allData.map(d => d.unite_fonciere_surface || 0));
        document.getElementById('surface-max').value = Math.ceil(maxS / 1000) * 1000;
        loadArdennesOutline(); loadGeoJsonData(); addMarkers(allData); initCascadingFilters(); updateFilterOptions();
    }
});

function addMarkers(rows) {
    rows.forEach(row => {
        const lat = parseFloat(row.latitude), lon = parseFloat(row.longitude);
        if (isNaN(lat)) return;

        // Préparation des données complexes (Récupéré de ton script précédent)
        const pollutionClean = (row.sol_pollution_existe || "").replace(/pollution /gi, "").trim();
        const pRaw = row.proprio_nom || "";
        const pArray = pRaw.split('|').map(p => p.trim() === "_X_" ? "(anonymisé)" : p.trim());
        const labelProprio = pArray.length > 1 ? "Propriétaires" : "Propriétaire";
        const imagePath = `photos/${row.site_id}.webp`;

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

        // Contenu de la popup (Version Complète)
        const popupContent = `
            <div class="popup-header-site">${row.site_nom || 'Friche'}</div>
            <span class="popup-commune">${row.comm_nom || ''}</span>
            <hr class="popup-sep">
            <div class="img-container">
                <img src="${imagePath}" class="popup-img" onerror="this.parentElement.style.display='none'"/>
            </div>
            <div class="popup-details">
                <div><strong>Statut :</strong> ${row.site_statut}</div>
                <div><strong>Surface :</strong> ${row.unite_fonciere_surface ? row.unite_fonciere_surface.toLocaleString('fr-FR') + ' m²' : 'Inconnue'}</div>
                <div><strong>Pollution :</strong> ${pollutionClean || 'Inconnue'}</div>
                <div><strong>${labelProprio} :</strong> ${pArray.join(', ')}</div>
            </div>`;

        marker.bindPopup(popupContent, { minWidth: 300, maxWidth: 300 });
        marker.bindTooltip(row.site_nom || 'Friche', { direction: 'top', offset: [0, -15] });

        markers.push({ marker, data: row });
        if (row.site_id) markersDict[row.site_id] = marker;
    });
}

function updateMap(shouldFit = false) {
    const data = getFilteredData();
    updateLegend();
    const zoom = map.getZoom();
    const epciVal = document.getElementById('filter-epci').value;
    const commVal = document.getElementById('filter-commune').value;
    const fricheVal = document.getElementById('filter-friche').value;

    if (isCadastreChecked && zoom >= CADASTRE_ZOOM_THRESHOLD) { if(!map.hasLayer(cadastreLayer)) cadastreLayer.addTo(map); }
    else { if(map.hasLayer(cadastreLayer)) map.removeLayer(cadastreLayer); }
    
    polygonsLayerGroup.clearLayers();
    markers.forEach(item => {
        const d = item.data;
        let vis = data.includes(d);
        if (vis && epciVal && d.epci_nom !== epciVal) vis = false;
        if (vis && commVal && d.comm_nom !== commVal) vis = false;
        if (vis && fricheVal && d.site_nom !== fricheVal) vis = false;
        
        if (vis) {
            if (!map.hasLayer(item.marker)) item.marker.addTo(map);
            if (zoom >= ZOOM_THRESHOLD && d.site_id && polygonsDict[d.site_id]) polygonsLayerGroup.addLayer(polygonsDict[d.site_id]);
        } else map.removeLayer(item.marker);
    });
    if (shouldFit) fitMap();
}

// --- FILTRES ---
function getFilteredData() {
    const sMin = parseFloat(document.getElementById('surface-min').value) || 0;
    const sMax = parseFloat(document.getElementById('surface-max').value) || Infinity;
    const allowed = Array.from(document.querySelectorAll('.checkbox-list input:checked')).map(cb => cb.value);
    return allData.filter(d => allowed.includes(d.site_statut) && (d.unite_fonciere_surface || 0) >= sMin && (d.unite_fonciere_surface || 0) <= sMax);
}

function initCascadingFilters() {
    ['.checkbox-list input', '#surface-min', '#surface-max', '#filter-epci', '#filter-commune'].forEach(s => {
        document.querySelectorAll(s).forEach(el => el.addEventListener('change', updateFilterOptions));
    });
    document.getElementById('filter-friche').addEventListener('change', () => updateMap(true));
    map.on('zoomend', () => updateMap(false));
}

function updateFilterOptions() {
    const data = getFilteredData();
    const epci = document.getElementById('filter-epci');
    const com = document.getElementById('filter-commune');
    const fri = document.getElementById('filter-friche');
    populateSelect(epci, data, 'epci_nom', '- Tous les EPCI -');
    let dC = data; if (epci.value) dC = dC.filter(d => d.epci_nom === epci.value);
    populateSelect(com, dC, 'comm_nom', '- Toutes les communes -');
    let dF = dC; if (com.value) dF = dF.filter(d => d.comm_nom === com.value);
    populateSelect(fri, dF, 'site_nom', '- Toutes les friches -');
    updateMap(true);
}

function populateSelect(s, d, k, t) {
    const v = s.value; s.innerHTML = `<option value="">${t}</option>`;
    const o = [...new Set(d.map(i => i[k]))].filter(Boolean).sort();
    o.forEach(x => { const opt = document.createElement('option'); opt.value = x; opt.textContent = x; s.appendChild(opt); });
    if ([...s.options].some(x => x.value === v)) s.value = v;
}

function fitMap() {
    const coords = markers.filter(i => map.hasLayer(i.marker)).map(i => i.marker.getLatLng());
    if (coords.length > 0) map.fitBounds(L.latLngBounds(coords), { padding: [50, 50], maxZoom: 15 });
}

// --- GÉOMÉTRIE ---
function loadArdennesOutline() {
    fetch('ardennes.geojson').then(r => r.json()).then(g => {
        L.geoJSON(g, { style: { color: '#ffffff', weight: 5, opacity: 1, fillOpacity: 0, interactive: false } }).addTo(ardennesLayerGroup);
        L.geoJSON(g, { style: { color: '#422d58', weight: 2, opacity: 1, fillOpacity: 0, interactive: false } }).addTo(ardennesLayerGroup);
    });
}

function loadGeoJsonData() {
    fetch('friches.geojson').then(r => r.json()).then(g => {
        L.geoJSON(g, {
            style: (f) => { const r = allData.find(d => d.site_id === f.properties.site_id); return { color: r ? getColorForStatus(r.site_statut) : '#3388ff', weight: 2, opacity: 1, fillOpacity: 0.3 }; },
            onEachFeature: (f, l) => { if (f.properties.site_id) { polygonsDict[f.properties.site_id] = l; l.on('click', (e) => { L.DomEvent.stopPropagation(e); if(markersDict[f.properties.site_id]) markersDict[f.properties.site_id].openPopup(); }); } }
        });
        updateMap(false);
    });
}

// UI
const panel = document.getElementById('filters-panel');
document.getElementById('toggle-filters').addEventListener('click', (e) => { e.stopPropagation(); panel.classList.add('open'); });
document.getElementById('close-filters').addEventListener('click', () => panel.classList.remove('open'));
map.on('click', () => { panel.classList.remove('open'); });
map.on('overlayadd', (e) => { if (e.layer === cadastreLayer) isCadastreChecked = true; updateMap(); });
map.on('overlayremove', (e) => { if (e.layer === cadastreLayer) isCadastreChecked = false; updateMap(); });
