const bounds = L.latLngBounds([48, 1], [52, 8]);
const ZOOM_THRESHOLD = 13;
const CADASTRE_ZOOM_THRESHOLD = 15;

const statusColors = {
    "friche potentielle": "#aea397",
    "friche sans projet": "#745b47",
    "friche avec projet": "#2b7756",
    "friche reconvertie": "#99c221"
};

function getColorForStatus(s) {
    return statusColors[s] || "#777";
}

// Fonds de carte
const osmHot = L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', { attribution: '&copy; OSM' });
const osmStandard = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM' });
const ignCarte = L.tileLayer('https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image%2Fpng', { attribution: '&copy; IGN' });
const ignOrtho = L.tileLayer('https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image%2Fjpeg', { attribution: '&copy; IGN' });

const cadastreLayer = L.tileLayer('https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=CADASTRALPARCELS.PARCELS&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image%2Fpng', {
    minZoom: CADASTRE_ZOOM_THRESHOLD, maxZoom: 19, opacity: 0.7, attribution: '&copy; IGN-DGFiP'
});

let isCadastreChecked = false;
const map = L.map('map', {
    minZoom: 8, maxZoom: 18, maxBounds: bounds, maxBoundsViscosity: 1.0, layers: [osmHot]
}).setView([49.7, 4.7], 9);

// Contrôles Leaflet
const baseMaps = { "OSM Humanitarian": osmHot, "OSM Standard": osmStandard, "Plan IGN": ignCarte, "Vue aérienne": ignOrtho };
const overlayMaps = { "Cadastre": cadastreLayer };
const layerControl = L.control.layers(baseMaps, overlayMaps, { collapsed: true, position: 'bottomleft' }).addTo(map);

// Injection SVG Couches
const layerBtn = document.querySelector('.leaflet-control-layers-toggle');
layerBtn.innerHTML = `<svg viewBox="0 0 30 30" fill="none" stroke-width="2" xmlns="http://www.w3.org/2000/svg"><path d="M7 10.5 L15 5.5 L23 10.5 L15 15.5 Z"/><path d="M24.34 14.16 L15 20 L5.66 14.16"/><path d="M24.34 18.66 L15 24.5 L5.66 18.66"/></svg>`;

// Légende Dynamique
let legendContent, legendButton;
const LegendControl = L.Control.extend({
    options: { position: 'bottomleft' },
    onAdd: function() {
        const container = L.DomUtil.create('div', 'leaflet-control custom-legend-block');
        legendButton = L.DomUtil.create('a', 'legend-toggle-btn', container);
        legendButton.href = '#';
        legendButton.innerHTML = `<svg viewBox="0 0 30 30" fill="none" stroke-width="2" xmlns="http://www.w3.org/2000/svg"><rect x="7.15" y="8" width="5" height="5"/><circle cx="9.65" cy="19.8" r="2.8"/><path d="M16.15 8 H24.15"/><path d="M16.15 15 H24.15"/><path d="M16.15 22 H24.15"/></svg>`;
        
        legendContent = L.DomUtil.create('div', 'legend-content', container);
        legendContent.style.display = 'none';
        let html = '<div class="legend-title">Statut des friches</div>';
        for (const [s, c] of Object.entries(statusColors)) {
            html += `<div class="legend-item"><span class="legend-swatch" style="background:${c}"></span><span class="legend-label">${s}</span></div>`;
        }
        legendContent.innerHTML = html;

        L.DomEvent.on(legendButton, 'click', function(e) {
            L.DomEvent.stop(e);
            if (legendContent.style.display === 'none') {
                document.querySelector('.leaflet-control-layers').classList.remove('leaflet-control-layers-expanded');
                legendContent.style.display = 'block'; legendButton.classList.add('active');
            } else { closeLegend(); }
        });
        L.DomEvent.disableClickPropagation(container);
        return container;
    }
});
map.addControl(new LegendControl());

function closeLegend() { if(legendContent) { legendContent.style.display = 'none'; legendButton.classList.remove('active'); } }
document.querySelector('.leaflet-control-layers').addEventListener('mouseenter', closeLegend);
map.on('click', closeLegend);

// Logique de zoom et picto
function createSvgPicto(pictocol) {
    return `<svg width="19.2" height="19.2" version="1.1" xmlns="http://www.w3.org/2000/svg"><rect x="3.6" y="3.6" width="12" height="12" rx="3" fill="${pictocol}" stroke="#ffffff" stroke-width="1.6"/></svg>`;
}

let allData = [], markers = [], markersDict = {}, polygonsDict = {};
const polygonsLayerGroup = L.layerGroup().addTo(map);
const ardennesLayerGroup = L.layerGroup().addTo(map);

Papa.parse('data.csv', {
    download: true, header: true, dynamicTyping: true, skipEmptyLines: true,
    complete: function (results) {
        allData = results.data;
        document.getElementById('surface-max').value = Math.ceil(Math.max(...allData.map(d => d.unite_fonciere_surface || 0)) / 1000) * 1000;
        loadArdennesOutline(); loadGeoJsonData(); addMarkers(allData); initCascadingFilters(); updateFilterOptions();
    }
});

function addMarkers(rows) {
    rows.forEach(row => {
        const lat = parseFloat(row.latitude), lon = parseFloat(row.longitude);
        if (isNaN(lat)) return;
        const marker = L.marker([lat, lon], {
            icon: L.divIcon({ className: "picto", html: createSvgPicto(getColorForStatus(row.site_statut)), iconSize: [19.2, 19.2], iconAnchor: [9.6, 9.6], popupAnchor: [0, -10] })
        });
        const imagePath = `photos/${row.site_id}.webp`;
        marker.bindPopup(`<div class="popup-header-site">${row.site_nom || 'Friche'}</div><span class="popup-commune">${row.comm_nom || ''}</span><hr class="popup-sep"><div class="img-container"><img src="${imagePath}" class="popup-img" onerror="this.parentElement.style.display='none'"/></div><div class="popup-details"><div><strong>Statut :</strong> ${row.site_statut}</div><div><strong>Surface :</strong> ${row.unite_fonciere_surface ? row.unite_fonciere_surface.toLocaleString('fr-FR') + ' m²' : 'Inconnue'}</div></div>`);
        marker.bindTooltip(row.site_nom || 'Friche', { direction: 'top', offset: [0, -15] });
        markers.push({ marker, data: row });
        if (row.site_id) markersDict[row.site_id] = marker;
    });
}

function updateMap(shouldFit = false) {
    const baseFiltered = getFilteredData();
    const currentZoom = map.getZoom();
    if (isCadastreChecked && currentZoom >= CADASTRE_ZOOM_THRESHOLD) { if (!map.hasLayer(cadastreLayer)) cadastreLayer.addTo(map); }
    else { if (map.hasLayer(cadastreLayer)) map.removeLayer(cadastreLayer); }

    polygonsLayerGroup.clearLayers();
    markers.forEach(item => {
        const d = item.data;
        let visible = baseFiltered.includes(d);
        if (visible && document.getElementById('filter-epci').value && d.epci_nom !== document.getElementById('filter-epci').value) visible = false;
        if (visible && document.getElementById('filter-commune').value && d.comm_nom !== document.getElementById('filter-commune').value) visible = false;
        if (visible && document.getElementById('filter-friche').value && d.site_nom !== document.getElementById('filter-friche').value) visible = false;

        if (visible) {
            if (!map.hasLayer(item.marker)) item.marker.addTo(map);
            if (currentZoom >= ZOOM_THRESHOLD && d.site_id && polygonsDict[d.site_id]) polygonsLayerGroup.addLayer(polygonsDict[d.site_id]);
        } else { map.removeLayer(item.marker); }
    });
    if (shouldFit) fitMap();
}

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
    populateSelect(document.getElementById('filter-epci'), data, 'epci_nom', '- Tous les EPCI -');
    let fComm = data;
    if (document.getElementById('filter-epci').value) fComm = fComm.filter(d => d.epci_nom === document.getElementById('filter-epci').value);
    populateSelect(document.getElementById('filter-commune'), fComm, 'comm_nom', '- Toutes les communes -');
    let fFriche = fComm;
    if (document.getElementById('filter-commune').value) fFriche = fFriche.filter(d => d.comm_nom === document.getElementById('filter-commune').value);
    populateSelect(document.getElementById('filter-friche'), fFriche, 'site_nom', '- Toutes les friches -');
    updateMap(true);
}

function populateSelect(s, d, k, t) {
    const val = s.value;
    s.innerHTML = `<option value="">${t}</option>`;
    const opts = [...new Set(d.map(i => i[k]))].filter(Boolean).sort();
    opts.forEach(o => { const opt = document.createElement('option'); opt.value = o; opt.textContent = o; s.appendChild(opt); });
    if ([...s.options].some(o => o.value === val)) s.value = val;
}

function fitMap() {
    const visibleCoords = markers.filter(item => map.hasLayer(item.marker)).map(item => item.marker.getLatLng());
    if (visibleCoords.length > 0) map.fitBounds(L.latLngBounds(visibleCoords), { padding: [50, 50], maxZoom: 15 });
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
            style: (f) => { const row = allData.find(d => d.site_id === f.properties.site_id); return { color: row ? getColorForStatus(row.site_statut) : '#3388ff', weight: 2, opacity: 1, fillOpacity: 0.3 }; },
            onEachFeature: (f, layer) => { if (f.properties.site_id) { polygonsDict[f.properties.site_id] = layer; layer.on('click', (e) => { L.DomEvent.stopPropagation(e); if(markersDict[f.properties.site_id]) markersDict[f.properties.site_id].openPopup(); }); } }
        });
        updateMap(false);
    });
}

// UI Panel
const panel = document.getElementById('filters-panel');
document.getElementById('toggle-filters').addEventListener('click', (e) => { e.stopPropagation(); panel.classList.add('open'); });
document.getElementById('close-filters').addEventListener('click', () => panel.classList.remove('open'));
map.on('click', () => panel.classList.remove('open'));
map.on('overlayadd', (e) => { if (e.layer === cadastreLayer) isCadastreChecked = true; updateMap(); });
map.on('overlayremove', (e) => { if (e.layer === cadastreLayer) isCadastreChecked = false; updateMap(); });
