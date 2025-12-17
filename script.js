/* =========================================================================
   CARTE DE L'OBSERVATOIRE DES FRICHES DES ARDENNES
   ========================================================================= */

/* 1. CONFIGURATION ET INITIALISATION
   ------------------------------------------------------------------------- */
const southWest = L.latLng(48, 1);
const northEast = L.latLng(52, 8);
const bounds = L.latLngBounds(southWest, northEast);

const map = L.map('map', {
    minZoom: 8,
    maxZoom: 18,
    maxBounds: bounds,
    maxBoundsViscosity: 1.0
}).setView([49.7, 4.7], 9);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

/* 2. VARIABLES GLOBALES
   ------------------------------------------------------------------------- */
let allData = [];
let markers = [];
let markersDict = {};
let polygonsDict = {};
let polygonsLayerGroup = L.layerGroup().addTo(map);

const ZOOM_THRESHOLD = 13;

/* 3. CHARGEMENT DES DONNÉES
   ------------------------------------------------------------------------- */
Papa.parse('data.csv', {
    download: true,
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    complete: function (results) {
        allData = results.data;
        
        addMarkers(allData);
        initFilters(allData);
        loadGeoJsonData();
        loadArdennesBoundary();
        
        // Premier affichage + centrage sur les points (true)
        updateVisibility(true);

        // Quand on zoome manuellement, on met juste à jour les polygones (false)
        map.on('zoomend', () => updateVisibility(false));
    }
});

/* 4. FONCTION : CONTOUR DÉPARTEMENTAL
   ------------------------------------------------------------------------- */
function loadArdennesBoundary() {
    fetch('ardennes.geojson')
        .then(resp => resp.json())
        .then(geojson => {
            L.geoJSON(geojson, { style: { color: '#ffffff', weight: 5, fill: false, interactive: false } }).addTo(map);
            L.geoJSON(geojson, { style: { color: '#422d58', weight: 2, fill: false, interactive: false } }).addTo(map);
        })
        .catch(err => console.error("Erreur ardennes.geojson", err));
}

/* 5. FONCTION : CRÉATION DES MARQUEURS
   ------------------------------------------------------------------------- */
function addMarkers(rows) {
    rows.forEach(row => {
        const lat = parseFloat(row.site_lat);
        const lon = parseFloat(row.site_lon);
        if (isNaN(lat) || isNaN(lon)) return;

        let pictocol = '#999';
        if (row.site_statut === 'friche potentielle') pictocol = '#f1c40f';
        if (row.site_statut === 'friche sans projet') pictocol = '#e67e22';
        if (row.site_statut === 'friche avec projet') pictocol = '#2ecc71';
        if (row.site_statut === 'friche reconvertie') pictocol = '#3498db';

        const picto = L.divIcon({
            className: 'custom-div-icon',
            html: `<div style="background-color:${pictocol};" class="marker-pin"></div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });

        const marker = L.marker([lat, lon], { icon: picto, title: row.site_nom });

        // --- Construction Popup (ÉPURÉE) ---
        const imagePath = `photos/${row.site_id}.webp`;
        // Texte alternatif pour l'accessibilité seulement (non affiché)
        const safeSite = (row.site_nom || 'Friche sans nom').replace(/"/g, '&quot;');
        const safeComm = (row.comm_nom || '').replace(/"/g, '&quot;');
        const altText = `Photo ${safeSite}`;

        let valProprio = 'Non renseigné';
        let labelProprio = 'Propriétaire';
        if (row.proprio_nom) {
            const list = String(row.proprio_nom).split('|').map(p => p.trim() === '_X_' ? '(anonymisé)' : p.trim());
            labelProprio = list.length > 1 ? 'Propriétaires' : 'Propriétaire';
            valProprio = list.join(', ');
        }

        let valPollution = (row.sol_pollution_existe || 'Non renseignée').replace(/pollution/gi, '').trim();
        valPollution = valPollution.charAt(0).toUpperCase() + valPollution.slice(1);

        const popupHTML = `
            <div class="popup-container">
                <div class="popup-header">
                    <div class="popup-title">${safeSite}</div>
                    <div class="popup-subtitle">${safeComm}</div>
                </div>
                <hr class="popup-separator">
                <div class="img-container">
                    <img src="${imagePath}" alt="${altText}" class="popup-img" onerror="this.parentElement.style.display='none'">
                </div>
                <div class="popup-details">
                    <p><strong>Statut :</strong> ${row.site_statut}</p>
                    <p><strong>Surface :</strong> ${row.unite_fonciere_surface ? row.unite_fonciere_surface + ' m²' : 'Non connue'}</p>
                    <p><strong>Pollution :</strong> ${valPollution}</p>
                    <p><strong>${labelProprio} :</strong> ${valProprio}</p>
                </div>
            </div>
        `;

        marker.bindPopup(popupHTML);
        marker.addTo(map);

        markers.push({ marker: marker, data: row });
        if (row.site_id) markersDict[row.site_id] = marker;
    });
}

/* 6. CHARGEMENT GEOJSON
   ------------------------------------------------------------------------- */
function loadGeoJsonData() {
    fetch('data.geojson')
        .then(r => r.json())
        .then(geojson => {
            L.geoJSON(geojson, {
                style: { color: '#e74c3c', weight: 2, fillOpacity: 0.2 },
                onEachFeature: (feature, layer) => {
                    const id = feature.properties.site_id;
                    if (id) {
                        polygonsDict[id] = layer;
                        layer.on('click', () => {
                            if (markersDict[id]) markersDict[id].openPopup();
                        });
                    }
                }
            });
            // Pas d'appel updateVisibility ici pour éviter conflit au démarrage
        });
}

/* 7. FILTRES INTELLIGENTS AVEC ZOOM AUTO
   ------------------------------------------------------------------------- */
/**
 * @param {boolean} fitMap - Si true, zoome sur les résultats filtrés
 */
function updateVisibility(fitMap = false) {
    const zoom = map.getZoom();
    const showPolygons = zoom >= ZOOM_THRESHOLD;

    // Récupération des filtres
    const checkedStatuts = Array.from(document.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
    const valEpci = document.getElementById('filter-epci').value;
    const valCommune = document.getElementById('filter-commune').value;
    const valFriche = document.getElementById('filter-friche').value;
    const surfMin = parseFloat(document.getElementById('surface-min').value) || 0;
    const surfMax = parseFloat(document.getElementById('surface-max').value) || Infinity;

    polygonsLayerGroup.clearLayers();
    
    // Groupe pour stocker les marqueurs visibles afin de calculer le zoom
    let visibleMarkersGroup = L.featureGroup();
    let visibleCount = 0;

    markers.forEach(item => {
        const d = item.data;
        let visible = true;

        if (!checkedStatuts.includes(d.site_statut)) visible = false;
        if (visible && valEpci && d.epci_nom !== valEpci) visible = false;
        if (visible && valCommune && d.comm_nom !== valCommune) visible = false;
        if (visible && valFriche && d.site_nom !== valFriche) visible = false;
        
        const surf = d.unite_fonciere_surface || 0;
        if (visible && (surf < surfMin || surf > surfMax)) visible = false;

        if (visible) {
            if (!map.hasLayer(item.marker)) item.marker.addTo(map);
            if (showPolygons && d.site_id && polygonsDict[d.site_id]) {
                polygonsLayerGroup.addLayer(polygonsDict[d.site_id]);
            }
            // On ajoute au groupe de visibilité
            visibleMarkersGroup.addLayer(item.marker);
            visibleCount++;
        } else {
            if (map.hasLayer(item.marker)) map.removeLayer(item.marker);
        }
    });

    // --- LOGIQUE DE ZOOM ---
    if (fitMap && visibleCount > 0) {
        // On récupère les limites de tous les points visibles
        const bounds = visibleMarkersGroup.getBounds();
        
        // On zoome pour englober les points, avec une marge (padding)
        // maxZoom: 15 empêche de zoomer trop fort si c'est un seul point
        map.fitBounds(bounds, { 
            padding: [50, 50], 
            maxZoom: 15 
        });
    }
}

function initFilters(data) {
    const epcis = [...new Set(data.map(d => d.epci_nom))].sort();
    const selectEpci = document.getElementById('filter-epci');
    epcis.forEach(e => { if(e) selectEpci.add(new Option(e, e)); });

    const selectCommune = document.getElementById('filter-commune');
    const selectFriche = document.getElementById('filter-friche');

    const updateLists = () => {
        const currentEpci = selectEpci.value;
        const currentCommune = selectCommune.value;
        let filtered = data;
        if (currentEpci) filtered = filtered.filter(d => d.epci_nom === currentEpci);
        if (currentCommune) filtered = filtered.filter(d => d.comm_nom === currentCommune);

        const oldCommune = selectCommune.value;
        selectCommune.innerHTML = '<option value="">- Toutes les communes -</option>';
        const communes = [...new Set(filtered.map(d => d.comm_nom))].sort();
        communes.forEach(c => { if(c) selectCommune.add(new Option(c, c)); });
        if (communes.includes(oldCommune)) selectCommune.value = oldCommune;

        selectFriche.innerHTML = '<option value="">- Toutes les friches -</option>';
        const friches = [...new Set(filtered.map(d => d.site_nom))].sort();
        friches.forEach(f => { if(f) selectFriche.add(new Option(f, f)); });
    };

    // On crée une petite fonction helper pour "Filtrer ET Zoomer"
    const filterAndZoom = () => {
        updateLists();
        updateVisibility(true); // true = active le zoom
    };

    selectEpci.addEventListener('change', () => { 
        selectCommune.value = ""; 
        filterAndZoom(); 
    });
    selectCommune.addEventListener('change', filterAndZoom);
    selectFriche.addEventListener('change', () => updateVisibility(true)); // Pas besoin updateLists pour friche

    document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.addEventListener('change', () => updateVisibility(true)));
    document.getElementById('surface-min').addEventListener('change', () => updateVisibility(true)); // Change au lieu de input pour éviter zoom constant pendant la frappe
    document.getElementById('surface-max').addEventListener('change', () => updateVisibility(true));

    updateLists();
}

/* 8. UI PANEL
   ------------------------------------------------------------------------- */
const btnOpen = document.getElementById('toggle-filters');
const btnClose = document.getElementById('close-filters');
const panel = document.getElementById('filters-panel');

btnOpen?.addEventListener('click', (e) => { e.stopPropagation(); panel.classList.add('open'); });
btnClose?.addEventListener('click', () => panel.classList.remove('open'));
document.addEventListener('click', (e) => { if (panel && !panel.contains(e.target)) panel.classList.remove('open'); });
