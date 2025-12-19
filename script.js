/* ------------------------------------------------------------------------- */
/* 1. Initialisation de la carte                                             */
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
/* 3. Chargement des données CSV                                             */
/* ------------------------------------------------------------------------- */
Papa.parse('data.csv', {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: function(results) {
        allData = results.data.filter(d => d.lat && d.lon);
        initFilters();
        updateMap();
    }
});

/* ------------------------------------------------------------------------- */
/* 4. Gestion des filtres                                                    */
/* ------------------------------------------------------------------------- */
function initFilters() {
    const epcis = [...new Set(allData.map(d => d.epci_nom))].sort();
    epcis.forEach(e => {
        const opt = document.createElement('option');
        opt.value = e;
        opt.textContent = e;
        selEpci.appendChild(opt);
    });

    [selEpci, selCommune, selFriche].forEach(s => s.addEventListener('change', updateMap));
    document.querySelectorAll('#filters-panel input').forEach(i => i.addEventListener('input', updateMap));
    
    // Pour les checkboxes de statut
    document.querySelectorAll('#filters-panel input[type="checkbox"]').forEach(c => {
        c.addEventListener('change', updateMap);
    });
}

function updateMap() {
    const epci = selEpci.value;
    const commune = selCommune.value;
    const friche = selFriche.value;
    const minS = parseFloat(document.getElementById('surface-min').value) || 0;
    const maxS = parseFloat(document.getElementById('surface-max').value) || Infinity;

    const checkedStatuts = Array.from(document.querySelectorAll('#filters-panel input[type="checkbox"]:checked'))
                                .map(c => c.value);

    const filtered = allData.filter(d => {
        const s = parseFloat(d.site_surface_m2) || 0;
        return (epci === '' || d.epci_nom === epci) &&
               (commune === '' || d.commune_nom === commune) &&
               (friche === '' || d.site_nom === friche) &&
               (s >= minS && s <= maxS) &&
               (checkedStatuts.includes(d.site_statut));
    });

    createMarkers(filtered);
}

/* ------------------------------------------------------------------------- */
/* 5. Création des Marqueurs & Popups (Style Marianne via CSS)               */
/* ------------------------------------------------------------------------- */
function createMarkers(data) {
    markers.forEach(m => map.removeLayer(m.marker));
    markers = [];

    data.forEach(row => {
        const colorMap = {
            'friche potentielle': '#7a5a3a', // Marron
            'friche sans projet': '#e1000f', // Rouge Marianne
            'friche avec projet': '#000091', // Bleu France
            'friche reconvertie': '#00ac8c'  // Vert
        };
        const color = colorMap[row.site_statut] || '#333';

        const customIcon = L.divIcon({
            className: 'custom-div-icon',
            html: `<svg width="30" height="30" viewBox="0 0 30 30"><circle cx="15" cy="15" r="10" fill="${color}" stroke="white" stroke-width="2"/></svg>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        });

        const marker = L.marker([row.lat, row.lon], { icon: customIcon });

        // Données pour le popup
        const imagePath = `photos/${row.site_id}.jpg`;
        const surf = row.site_surface_m2 ? `${parseInt(row.site_surface_m2).toLocaleString()} m²` : 'Inconnue';
        const valPollution = row.site_pollution === 'oui' ? 'Avérée' : (row.site_pollution === 'non' ? 'Néant' : 'Non renseigné');
        const valProprio = row.site_proprio_nom || 'Non renseigné';
        const labelProprio = row.site_proprio_public === 'oui' ? 'Propriétaire public' : 'Propriétaire privé';

        // Le contenu HTML du popup (la police est gérée par le CSS via .leaflet-popup-content)
        const popupContent = `
            <div class="popup-container">
                <div class="popup-title" style="margin-bottom: 4px;"><strong>${row.site_nom || 'Sans nom'}</strong></div>
                <div class="popup-subtitle" style="font-size: 0.9em; margin-bottom: 8px; color: #666;">${row.commune_nom} (${row.epci_nom})</div>
                <hr style="border: 0; border-top: 1px solid #ccc; margin: 8px 0;">
                <div style="text-align: center;">
                    <img src="${imagePath}" style="max-width: 100%; border-radius: 4px;" 
                         onerror="this.style.display='none'">
                </div>
                <div style="margin-top: 12px; line-height: 1.5;">
                    <div><strong>Statut :</strong> ${row.site_statut}</div>
                    <div><strong>Surface :</strong> ${surf}</div>
                    <div><strong>Pollution :</strong> ${valPollution}</div>
                    <div><strong>${labelProprio} :</strong> ${valProprio}</div>
                </div>
            </div>`;

        marker.bindPopup(popupContent, { minWidth: 300 });
        marker.addTo(map);
        markers.push({ marker, data: row });
    });
}

/* ------------------------------------------------------------------------- */
/* 6. UI Panneau Filtres                                                     */
/* ------------------------------------------------------------------------- */
const panel = document.getElementById('filters-panel');
const btnOpen = document.getElementById('toggle-filters');
const btnClose = document.getElementById('close-filters');

btnOpen?.addEventListener('click', (e) => {
    e.stopPropagation(); // Empêche la propagation pour ne pas déclencher map.on('click')
    panel.classList.add('open');
});

btnClose?.addEventListener('click', () => {
    panel.classList.remove('open');
});

// Fermer le panneau si on clique n'importe où sur la carte
map.on('click', () => {
    panel.classList.remove('open');
});
